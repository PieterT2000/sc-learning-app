/**
 * Deterministic checks for the easy / medium / hard grading logic in
 * scoring.ts. No test framework in the prototype - run it directly:
 *
 *   npm run test:scoring
 *
 * The hybrid LLM feedback layer (app/api/feedback) is deliberately not
 * exercised here; only the local, authoritative judgment is.
 */
import { scoreAnswer, type Mode, type ProseScore, type HardScore } from './scoring';

const Q1 = 'Man’s chief end is to glorify God, and to enjoy him for ever.';
const Q4 =
  'God is a Spirit, infinite, eternal, and unchangeable, in his being, wisdom, power, holiness, justice, goodness, and truth.';
const Q6 =
  'There are three persons in the Godhead; the Father, the Son, and the Holy Ghost; and these three are one God, the same in substance, equal in power and glory.';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`);
    if (detail !== undefined) console.log('       ', JSON.stringify(detail));
  }
}

function prose(mode: Extract<Mode, 'easy' | 'medium'>, ref: string, hyp: string): ProseScore {
  return scoreAnswer(mode, ref, hyp) as ProseScore;
}
function hard(ref: string, hyp: string): HardScore {
  return scoreAnswer('hard', ref, hyp) as HardScore;
}

console.log('hard mode');
{
  // "for ever" (answer key) vs "forever" (Whisper) must be a full match,
  // as must dropped punctuation and casing.
  const r = hard(Q1, 'Mans chief end is to glorify God and to enjoy him forever');
  check('Q1 "forever" == "for ever", punctuation ignored -> 100 / exact', r.exact && r.scorePercent === 100, r);
}
{
  const r = hard(Q1, 'Man’s chief end is to glorify God and enjoy him for ever');
  check('Q1 dropped "to" -> not exact, < 100, names the missing word', !r.exact && r.scorePercent < 100 && r.breakdown.toLowerCase().includes('to'), r);
}
{
  // digits -> number words, "Holy Spirit" -> "Holy Ghost"
  const spoken =
    'There are 3 persons in the Godhead, the Father, the Son, and the Holy Spirit, and these 3 are one God, the same in substance, equal in power and glory';
  const r = hard(Q6, spoken);
  check('Q6 "3"->"three" and "Holy Spirit"->"Holy Ghost" normalised -> exact', r.exact, r);
}

console.log('easy mode');
{
  // every key word, any order, small words missing -> pass
  const shuffled = 'truth goodness justice holiness power wisdom being unchangeable eternal infinite Spirit God';
  const r = prose('easy', Q4, shuffled);
  check('Q4 all key words, reversed order -> pass, nothing missing', r.passed && r.missingKeyWords.length === 0, r);
}
{
  const partial = 'God is a Spirit, infinite, eternal, in his being, wisdom, power';
  const r = prose('easy', Q4, partial);
  check(
    'Q4 missing unchangeable/holiness/justice/goodness/truth -> fail, all five listed',
    !r.passed &&
      ['unchangeable', 'holiness', 'justice', 'goodness', 'truth'].every((w) =>
        r.missingKeyWords.map((m) => m.toLowerCase()).includes(w)
      ),
    r
  );
}
{
  // small connecting words missing/wrong must never fail easy
  const r = prose('easy', Q1, 'chief end Man’s glorify God enjoy him forever');
  check('Q1 no function words at all -> still a pass in easy', r.passed, r);
}
{
  // exact recitation -> credited as word perfect even in easy
  const r = prose('easy', Q1, 'Mans chief end is to glorify God and to enjoy him forever');
  check('Q1 recited exactly -> easy pass, wordPerfect, orderCorrect', r.passed && r.wordPerfect && r.orderCorrect, r);
}
{
  // every key word in the answer's order, only a small word dropped
  const r = prose('easy', Q1, 'Man’s chief end to glorify God and to enjoy him forever');
  check('Q1 key words in order, "is" dropped -> easy pass, not wordPerfect, orderCorrect', r.passed && !r.wordPerfect && r.orderCorrect, r);
}

console.log('medium mode');
{
  const inOrder = 'God Spirit infinite eternal unchangeable being wisdom power holiness justice goodness truth';
  const r = prose('medium', Q4, inOrder);
  check('Q4 key words in answer order, function words dropped -> pass', r.passed && !r.outOfOrder, r);
}
{
  const shuffled = 'truth goodness justice holiness power wisdom being unchangeable eternal infinite Spirit God';
  const r = prose('medium', Q4, shuffled);
  check('Q4 all key words but reversed -> fail, flagged out of order', !r.passed && r.outOfOrder && r.missingKeyWords.length === 0, r);
}
{
  const r = prose('medium', Q1, 'Man’s chief end glorify God enjoy him forever');
  check('Q1 key words in order, only small words missing -> pass', r.passed, r);
}
{
  const r = prose('medium', Q1, 'Mans chief end is to glorify God and to enjoy him forever');
  check('Q1 recited exactly -> medium pass, wordPerfect', r.passed && r.wordPerfect, r);
}
{
  const r = prose('medium', Q4, 'truth goodness justice holiness power wisdom being unchangeable eternal infinite Spirit God');
  check('Q4 all key words reversed -> medium: not wordPerfect, not orderCorrect', !r.wordPerfect && !r.orderCorrect, r);
}

console.log(failures === 0 ? '\nall scoring checks passed' : `\n${failures} scoring check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
