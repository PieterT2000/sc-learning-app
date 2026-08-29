import type { ReactNode } from 'react';
import type { HardScore, ScoreResult, WordOp } from '@/lib/scoring';

const CHIP_BASE = 'mr-1 inline-block rounded px-1 py-0.5';

// op  0 -> matched                 (green chip)
// op  1 -> extra word the user said (red chip, struck through)
// op -1 -> word the user missed     (faded red chip, bracketed)
function DiffLine({ diffs }: { diffs: Array<{ op: WordOp; word: string }> }) {
  return (
    <p className="mb-3 rounded-xl bg-card p-5 text-base leading-[1.8]">
      {diffs.map((d, i) => {
        if (d.op === 0) {
          return (
            <span key={i} className={`${CHIP_BASE} bg-diff-ok-bg text-diff-ok`}>
              {d.word}
            </span>
          );
        }
        if (d.op === 1) {
          return (
            <span key={i} className={`${CHIP_BASE} bg-diff-bad-bg text-diff-bad line-through`}>
              {d.word}
            </span>
          );
        }
        return (
          <span key={i} className={`${CHIP_BASE} bg-diff-bad-bg italic text-diff-bad opacity-60`}>
            [{d.word}]
          </span>
        );
      })}
    </p>
  );
}

function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="my-4 rounded-r-xl border-l-[3px] border-accent bg-accent-soft p-4 text-sm leading-relaxed text-[#444]">
      <div className="mb-1.5 text-[11px] font-semibold tracking-[1px] text-accent">{label}</div>
      {children}
    </div>
  );
}

// Score-band colour, as Tailwind classes so the content scanner keeps them.
const BAND = {
  good: { text: 'text-band-good', border: 'border-band-good' },
  mid: { text: 'text-band-mid', border: 'border-band-mid' },
  bad: { text: 'text-band-bad', border: 'border-band-bad' },
} as const;

function hardBand(result: HardScore): { key: keyof typeof BAND; label: string } {
  if (result.exact || result.scorePercent >= 100) {
    return { key: 'good', label: 'Word perfect!' };
  }
  if (result.scorePercent >= 85) {
    return { key: 'good', label: 'Great — you captured the meaning!' };
  }
  if (result.scorePercent >= 60) {
    return { key: 'mid', label: 'Getting there — keep working on the wording.' };
  }
  return { key: 'bad', label: 'Not yet — relearn this one.' };
}

export function DiffResult({
  transcript,
  result,
}: {
  transcript: string;
  result: ScoreResult;
}) {
  const said = (
    <p className="mb-2 text-[13px] text-muted">
      You said: “{transcript || '(nothing captured)'}”
    </p>
  );
  const answerDiff = (
    <>
      <div className="mb-1.5 text-xs font-semibold tracking-[1px] text-muted">YOUR ANSWER</div>
      <DiffLine diffs={result.diffs} />
      {said}
    </>
  );

  // Easy / Medium: a spoken-language explanation, no percentage - but still
  // the green/red word comparison underneath.
  if (result.mode !== 'hard') {
    const good = result.passed || result.wordPerfect;
    const verdict = result.wordPerfect
      ? 'Word perfect'
      : result.passed
        ? result.mode === 'medium' || result.orderCorrect
          ? 'Key ideas — all there, in order'
          : 'Key ideas — all there'
        : 'Not quite';

    return (
      <div>
        <p
          className={`mb-6 mt-2 text-center text-2xl font-bold ${
            good ? 'text-band-good' : 'text-band-mid'
          }`}
        >
          {verdict}
        </p>
        <Callout label="FEEDBACK">{result.feedback}</Callout>
        {answerDiff}
      </div>
    );
  }

  // Hard: score circle + word-level diff + one-line breakdown.
  const band = hardBand(result);
  return (
    <div>
      <div
        className={`mx-auto mb-4 flex h-[100px] w-[100px] items-center justify-center rounded-full border-4 ${BAND[band.key].border}`}
      >
        <div className={`text-[32px] font-bold ${BAND[band.key].text}`}>{result.scorePercent}%</div>
      </div>
      <div className="mb-6 text-center text-sm text-muted">{band.label}</div>
      {answerDiff}
      {result.breakdown && <Callout label="WHAT DIFFERED">{result.breakdown}</Callout>}
    </div>
  );
}
