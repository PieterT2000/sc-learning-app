import type { CSSProperties, ReactNode } from 'react';
import type { HardScore, ScoreResult, WordOp } from '@/lib/scoring';

const CHIP_BASE: CSSProperties = {
  padding: '2px 4px',
  borderRadius: 4,
  marginRight: 4,
  display: 'inline-block',
};

// op  0 -> matched                 (green chip)
// op  1 -> extra word the user said (red chip, struck through)
// op -1 -> word the user missed     (faded red chip, bracketed)
function DiffLine({ diffs }: { diffs: Array<{ op: WordOp; word: string }> }) {
  return (
    <p style={styles.diffContainer}>
      {diffs.map((d, i) => {
        if (d.op === 0) {
          return (
            <span key={i} style={{ ...CHIP_BASE, color: '#2d8a5e', background: '#e6f5ed' }}>
              {d.word}
            </span>
          );
        }
        if (d.op === 1) {
          return (
            <span
              key={i}
              style={{
                ...CHIP_BASE,
                color: '#c0392b',
                background: '#fde8e6',
                textDecoration: 'line-through',
              }}
            >
              {d.word}
            </span>
          );
        }
        return (
          <span
            key={i}
            style={{
              ...CHIP_BASE,
              color: '#c0392b',
              background: '#fde8e6',
              opacity: 0.6,
              fontStyle: 'italic',
            }}
          >
            [{d.word}]
          </span>
        );
      })}
    </p>
  );
}

function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={styles.feedbackCallout}>
      <div style={styles.calloutLabel}>{label}</div>
      {children}
    </div>
  );
}

function hardBand(result: HardScore): { color: string; label: string } {
  if (result.exact || result.scorePercent >= 100) {
    return { color: '#44aa99', label: 'Word perfect!' };
  }
  if (result.scorePercent >= 85) {
    return { color: '#44aa99', label: 'Great — you captured the meaning!' };
  }
  if (result.scorePercent >= 60) {
    return { color: '#b9770e', label: 'Getting there — keep working on the wording.' };
  }
  return { color: '#c0392b', label: 'Not yet — relearn this one.' };
}

export function DiffResult({
  transcript,
  result,
}: {
  transcript: string;
  result: ScoreResult;
}) {
  const said = (
    <p style={styles.transcriptLabel}>You said: “{transcript || '(nothing captured)'}”</p>
  );
  const answerDiff = (
    <>
      <div style={styles.answerLabel}>YOUR ANSWER</div>
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
        <p style={{ ...styles.verdictBig, color: good ? '#44aa99' : '#b9770e' }}>{verdict}</p>
        <Callout label="FEEDBACK">{result.feedback}</Callout>
        {answerDiff}
      </div>
    );
  }

  // Hard: score circle + word-level diff + one-line breakdown.
  const band = hardBand(result);
  return (
    <div>
      <div style={{ ...styles.scoreCircle, border: `4px solid ${band.color}` }}>
        <div style={{ ...styles.scoreNum, color: band.color }}>{result.scorePercent}%</div>
      </div>
      <div style={styles.scoreLabel}>{band.label}</div>
      {answerDiff}
      {result.breakdown && <Callout label="WHAT DIFFERED">{result.breakdown}</Callout>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  scoreNum: { fontSize: 32, fontWeight: 700 },
  scoreLabel: { textAlign: 'center', fontSize: 14, color: '#888', marginBottom: 24 },
  verdictBig: { fontSize: 24, fontWeight: 700, textAlign: 'center', margin: '8px 0 24px' },
  feedbackCallout: {
    padding: 16,
    background: '#f0f4f8',
    borderLeft: '3px solid #3d5a80',
    borderRadius: '0 12px 12px 0',
    margin: '16px 0',
    fontSize: 14,
    lineHeight: 1.6,
    color: '#444',
  },
  calloutLabel: {
    fontSize: 11,
    color: '#3d5a80',
    fontWeight: 600,
    letterSpacing: 1,
    marginBottom: 6,
  },
  answerLabel: {
    fontSize: 12,
    color: '#888',
    letterSpacing: 1,
    fontWeight: 600,
    marginBottom: 6,
  },
  diffContainer: {
    padding: 20,
    background: '#faf9f6',
    borderRadius: 12,
    lineHeight: 1.8,
    fontSize: 16,
    marginBottom: 12,
  },
  transcriptLabel: { fontSize: 13, color: '#888', marginBottom: 8 },
};
