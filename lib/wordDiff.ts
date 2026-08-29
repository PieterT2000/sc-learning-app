import DiffMatchPatch from 'diff-match-patch';

export interface WordDiffResult {
  // op: -1 = missing from what the user said, 0 = correct, 1 = extra word the user added
  diffs: Array<{ op: -1 | 0 | 1; word: string }>;
  correctWords: number;
  totalWords: number;
  scorePercent: number;
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * diff-match-patch operates on characters, so a naive diff of two sentences
 * fragments mismatches mid-word (e.g. "glorify" vs "glorifying" diffs at the
 * "ing" character level instead of treating them as two whole words).
 *
 * The standard bridge: map every unique word to a single unicode code point,
 * diff the resulting "sentences" of code points (now word-level under the
 * hood), then map each code point back to its original word.
 */
export function wordLevelDiff(reference: string, hypothesis: string): WordDiffResult {
  const dmp = new DiffMatchPatch();
  const refWords = tokenize(reference);
  const hypWords = tokenize(hypothesis);

  const wordToChar = new Map<string, string>();
  const charToWord: string[] = [];
  let nextCode = 0;

  // Start well above common Latin/control ranges to avoid any collision
  // with characters diff-match-patch might treat specially.
  const BASE_CODE = 0x2000;

  function encode(words: string[]): string {
    let out = '';
    for (const w of words) {
      // Strip everything except letters/digits for matching purposes only
      // (the original `w`, punctuation and all, is still what gets displayed).
      // This deliberately normalizes away curly vs straight apostrophes
      // (source text has "God's" with a curly apostrophe; Groq's Whisper
      // output will almost always use a straight one) and any stray quote
      // marks from quoted phrases like "before me," in the commandments -
      // none of that should count as a wrong word.
      const key = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      let code = wordToChar.get(key);
      if (code === undefined) {
        code = String.fromCharCode(BASE_CODE + nextCode);
        wordToChar.set(key, code);
        charToWord[nextCode] = w;
        nextCode++;
      }
      out += code;
    }
    return out;
  }

  const refEncoded = encode(refWords);
  const hypEncoded = encode(hypWords);

  const diffs = dmp.diff_main(refEncoded, hypEncoded);
  dmp.diff_cleanupSemantic(diffs);

  const wordDiffs: Array<{ op: -1 | 0 | 1; word: string }> = [];
  let correctWords = 0;

  for (const [op, chars] of diffs) {
    for (const ch of chars) {
      const idx = ch.charCodeAt(0) - BASE_CODE;
      const word = charToWord[idx];
      if (word === undefined) continue;
      wordDiffs.push({ op: op as -1 | 0 | 1, word });
      if (op === 0) correctWords++;
    }
  }

  const totalWords = refWords.length;
  const scorePercent = totalWords === 0 ? 0 : Math.round((correctWords / totalWords) * 100);

  return { diffs: wordDiffs, correctWords, totalWords, scorePercent };
}
