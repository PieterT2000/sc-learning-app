/**
 * Tunable knobs for the three grading modes. Same spirit as
 * handsFreeConfig.ts: these are deliberate starting points, not values
 * validated against real recitations. Adjust as you watch people use it.
 *
 * The three modes (see lib/scoring.ts for the implementation):
 *
 *   easy   - every *key* word must be present; order, grammar, and the
 *            small connecting words below don't matter. Missing a key word
 *            means you've missed part of the idea.
 *   medium - every key word must be present *and in the same order*; the
 *            small connecting words still don't matter.
 *   hard   - every word must match exactly, in order, after the light STT
 *            normalisation below (so "for ever" vs "forever" isn't a miss).
 */

/**
 * "Small words" - articles, conjunctions, copulas, auxiliaries, prepositions
 * and bare pronouns. In easy/medium these are stripped from both the
 * reference answer and the spoken answer before anything is compared, so
 * dropping or fumbling them never counts against you. Everything NOT in this
 * set is treated as a "key word" that carries an idea.
 *
 * Kept deliberately conservative: a word only belongs here if losing it
 * from a catechism answer wouldn't change the meaning. "God", "Spirit",
 * "infinite" etc. must never be in here.
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  // articles
  'a', 'an', 'the',
  // coordinating / common conjunctions
  'and', 'or', 'nor', 'but', 'so', 'yet', 'as', 'than',
  // copula + auxiliaries / "to be"
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'has', 'have', 'had',
  'shall', 'will', 'may', 'might', 'can', 'could', 'would', 'should', 'must',
  // "to" (infinitive marker) + very common prepositions
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with',
  'into', 'unto', 'upon', 'out', 'up',
  // bare pronouns / determiners that don't carry a catechism idea on their own
  'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
  'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my',
  'this', 'that', 'these', 'those', 'there', 'here', 'which', 'who', 'whom',
  // filler adverbs that show up in speech but not in the answer key
  'also', 'then', 'thus',
]);

/**
 * Phrase-level rewrites applied to BOTH the reference answer and the
 * transcript before hard-mode's exact comparison (and before tokenising in
 * every mode). Purpose: absorb the handful of ways Groq Whisper writes
 * something differently from the 1647 text without any change in meaning.
 *
 * Matching is case-insensitive and whole-word. Order matters - earlier
 * entries run first. Keep this list short; it's an equivalence list, not a
 * spellchecker.
 */
export const NORMALISE_RULES: ReadonlyArray<{ pattern: RegExp; replace: string }> = [
  // The WSC answer key writes "for ever" as two words (Q1, Q107...).
  // Whisper almost always transcribes "forever".
  { pattern: /\bfor ever\b/gi, replace: 'forever' },
  { pattern: /\bfor evermore\b/gi, replace: 'forevermore' },
  // "cannot" vs "can not"
  { pattern: /\bcan not\b/gi, replace: 'cannot' },
  // Ampersand, if it ever shows up
  { pattern: /\s*&\s*/g, replace: ' and ' },
  // Digit forms of the small numbers that appear in answers (Q5, Q6...).
  { pattern: /\b1\b/g, replace: 'one' },
  { pattern: /\b2\b/g, replace: 'two' },
  { pattern: /\b3\b/g, replace: 'three' },
  { pattern: /\b4\b/g, replace: 'four' },
  { pattern: /\b10\b/g, replace: 'ten' },
  // Whisper sometimes spells the third Person "Holy Spirit"; the WSC text
  // says "Holy Ghost". Treat them as the same in every mode.
  { pattern: /\bHoly Spirit\b/gi, replace: 'Holy Ghost' },
];

/**
 * Groq LLM used to phrase easy/medium feedback (see app/api/feedback/route.ts).
 * The deterministic engine has already decided pass/fail and exactly what's
 * missing/extra/reordered - the model only turns that into a sentence, so a
 * small fast model is the right call. Check the current catalogue at
 * https://console.groq.com/docs/models if this 404s.
 */
export const FEEDBACK_MODEL = 'openai/gpt-oss-20b';
