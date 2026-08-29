import type { CSSProperties } from 'react';
import type { ScoreResult, WordOp } from '@/lib/scoring';

function DiffLine({ diffs }: { diffs: Array<{ op: WordOp; word: string }> }) {
  return (
    <p style={styles.diffLine}>
      {diffs.map((d, i) => (
        <span
          key={i}
          style={{
            color: d.op === -1 ? '#c0392b' : d.op === 1 ? '#999' : '#1e8449',
            textDecoration: d.op === -1 ? 'line-through' : 'none',
            marginRight: 5,
          }}
        >
          {d.word}
        </span>
      ))}
    </p>
  );
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
        <p style={{ ...styles.verdict, color: good ? '#1e8449' : '#b9770e' }}>{verdict}</p>
        <p style={styles.feedback}>{result.feedback}</p>
        {said}
        <DiffLine diffs={result.diffs} />
      </div>
    );
  }

  // Hard: percentage + word-level diff + one-line breakdown.
  return (
    <div>
      <p style={styles.score}>{result.scorePercent}%</p>
      {said}
      <DiffLine diffs={result.diffs} />
      {result.breakdown && <p style={styles.breakdown}>{result.breakdown}</p>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  score: { fontSize: 40, fontWeight: 700, marginBottom: 6 },
  verdict: { fontSize: 22, fontWeight: 700, marginBottom: 10 },
  feedback: { fontSize: 16, lineHeight: 1.6, color: '#2a2a2a', marginBottom: 16 },
  transcriptLabel: { fontSize: 13, color: '#888', marginBottom: 20 },
  diffLine: { fontSize: 17, lineHeight: 1.9 },
  breakdown: { fontSize: 14, color: '#c0392b', marginTop: 12, lineHeight: 1.5 },
};
