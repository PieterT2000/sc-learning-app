import { wordLevelDiff } from './wordDiff';
import { FUNCTION_WORDS, NORMALISE_RULES } from './scoringConfig';

export type Mode = 'easy' | 'medium' | 'hard';

export type WordOp = -1 | 0 | 1; // -1 missing, 0 correct, 1 extra

/** Easy / Medium: no percentage, just a spoken-language explanation. */
export interface ProseScore {
  mode: 'easy' | 'medium';
  passed: boolean;
  /** Reference key words not spoken at all (display form, de-duplicated). */
  missingKeyWords: string[];
  /** Content words the speaker added that aren't in the answer. */
  extraKeyWords: string[];
  /** Medium only: key words were all present but not in the answer's order. */
  outOfOrder: boolean;
  keyWordsTotal: number;
  keyWordsMatched: number;
  /**
   * Human-readable explanation. `scoreAnswer` fills this with a deterministic
   * template; the hybrid feedback layer (lib/feedbackClient.ts) may replace it
   * with an LLM-phrased version built from the same facts.
   */
  feedback: string;
}

/** Hard: exact word-for-word, with a percentage and a short breakdown. */
export interface HardScore {
  mode: 'hard';
  scorePercent: number;
  exact: boolean;
  diffs: Array<{ op: WordOp; word: string }>;
  correctWords: number;
  totalWords: number;
  /** One line naming the missing / incorrect words. Empty when exact. */
  breakdown: string;
}

export type ScoreResult = ProseScore | HardScore;

// --- shared helpers -------------------------------------------------------

/** Phrase-level rewrites that absorb harmless Groq Whisper spelling choices. */
export function normalise(text: string): string {
  let out = text ?? '';
  for (const { pattern, replace } of NORMALISE_RULES) out = out.replace(pattern, replace);
  return out.replace(/\s+/g, ' ').trim();
}

function tokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Lowercased, punctuation-stripped form used for matching. */
function matchKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Trim edge punctuation for display but keep internal apostrophes/hyphens. */
function displayWord(raw: string): string {
  return raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}

interface KeyWord {
  key: string;
  display: string;
}

/** Tokens that aren't in FUNCTION_WORDS, in order. */
function contentWords(text: string): KeyWord[] {
  const out: KeyWord[] = [];
  for (const t of tokens(text)) {
    const key = matchKey(t);
    if (!key || FUNCTION_WORDS.has(key)) continue;
    out.push({ key, display: displayWord(t) });
  }
  return out;
}

function dedupeByKey(words: KeyWord[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (seen.has(w.key)) continue;
    seen.add(w.key);
    out.push(w.display);
  }
  return out;
}

function quoteList(words: string[]): string {
  return words.map((w) => `"${w}"`).join(', ');
}

/** How many of refKeys appear in hypKeys as an in-order (not necessarily contiguous) subsequence. */
function inOrderMatchCount(refKeys: string[], hypKeys: string[]): number {
  let i = 0;
  for (const h of hypKeys) {
    if (i < refKeys.length && h === refKeys[i]) i++;
  }
  return i;
}

// --- public API ---------------------------------------------------------

export function scoreAnswer(mode: Mode, reference: string, hypothesis: string): ScoreResult {
  const ref = normalise(reference);
  const hyp = normalise(hypothesis);
  return mode === 'hard' ? scoreHard(ref, hyp) : scoreProse(mode, ref, hyp);
}

function scoreHard(reference: string, hypothesis: string): HardScore {
  const { diffs, correctWords, totalWords, scorePercent } = wordLevelDiff(reference, hypothesis);
  const missing = diffs.filter((d) => d.op === -1).map((d) => displayWord(d.word));
  const extra = diffs.filter((d) => d.op === 1).map((d) => displayWord(d.word));
  const exact = missing.length === 0 && extra.length === 0;

  let breakdown = '';
  if (!exact) {
    const parts: string[] = [];
    if (missing.length) parts.push(`missing ${quoteList(missing)}`);
    if (extra.length) parts.push(`said ${quoteList(extra)} instead`);
    breakdown = `${parts.join('; ')}.`;
    breakdown = breakdown.charAt(0).toUpperCase() + breakdown.slice(1);
  }

  return {
    mode: 'hard',
    scorePercent: exact ? 100 : Math.min(scorePercent, 99),
    exact,
    diffs,
    correctWords,
    totalWords,
    breakdown,
  };
}

function scoreProse(mode: 'easy' | 'medium', reference: string, hypothesis: string): ProseScore {
  const refWords = contentWords(reference);
  const hypWords = contentWords(hypothesis);
  const refKeys = refWords.map((w) => w.key);
  const hypKeys = hypWords.map((w) => w.key);
  const refSet = new Set(refKeys);
  const hypSet = new Set(hypKeys);

  const missingKeyWords = dedupeByKey(refWords.filter((w) => !hypSet.has(w.key)));
  const extraKeyWords = dedupeByKey(hypWords.filter((w) => !refSet.has(w.key)));

  const uniqueRefKeys = Array.from(refSet);
  const keyWordsTotal = uniqueRefKeys.length;
  const keyWordsMatched = keyWordsTotal - missingKeyWords.length;

  // Order only matters once every key word is actually present.
  const presentRefKeys = refKeys.filter((k) => hypSet.has(k));
  const orderedMatches = inOrderMatchCount(presentRefKeys, hypKeys);
  const outOfOrder = missingKeyWords.length === 0 && orderedMatches < presentRefKeys.length;

  const passed = mode === 'easy'
    ? missingKeyWords.length === 0
    : missingKeyWords.length === 0 && !outOfOrder;

  return {
    mode,
    passed,
    missingKeyWords,
    extraKeyWords,
    outOfOrder,
    keyWordsTotal,
    keyWordsMatched,
    feedback: templateFeedback(mode, passed, missingKeyWords, extraKeyWords, outOfOrder),
  };
}

/**
 * Deterministic fallback wording. Always factually consistent with the
 * verdict above; the LLM layer only makes it read more naturally.
 */
export function templateFeedback(
  mode: 'easy' | 'medium',
  passed: boolean,
  missing: string[],
  extra: string[],
  outOfOrder: boolean
): string {
  const parts: string[] = [];

  if (passed) {
    parts.push(
      mode === 'easy'
        ? 'You had every key idea from the answer. Easy mode ignores word order and the small connecting words, so this is a full answer.'
        : 'You had every key idea, and in the answer’s order. Medium mode ignores the small connecting words.'
    );
  }

  if (missing.length) {
    const carry = missing.length === 1 ? 'that word carries' : 'those words carry';
    parts.push(`You didn’t say ${quoteList(missing)} — ${carry} part of what the answer means.`);
  }

  if (mode === 'medium' && outOfOrder) {
    parts.push(
      missing.length
        ? 'What you did say also came in a different order from the answer.'
        : 'You had the key ideas, but not in the order the answer gives them.'
    );
  }

  if (extra.length) {
    const tail = mode === 'easy' ? ' (not counted against you in Easy mode)' : '';
    parts.push(`You added ${quoteList(extra)}, which isn’t in the answer${tail}.`);
  }

  return parts.join(' ');
}
