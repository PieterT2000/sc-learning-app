import type { CSSProperties } from 'react';
import type { ScoreResult } from '@/lib/scoring';

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

  // Easy / Medium: a spoken-language explanation, no percentage.
  if (result.mode !== 'hard') {
    const verdict = result.passed
      ? result.mode === 'easy'
        ? 'Key ideas — all there'
        : 'Key ideas — all there, in order'
      : 'Not quite';

    return (
      <div>
        <p style={{ ...styles.verdict, color: result.passed ? '#1e8449' : '#b9770e' }}>{verdict}</p>
        <p style={styles.feedback}>{result.feedback}</p>
        {said}
        {(result.missingKeyWords.length > 0 || result.extraKeyWords.length > 0) && (
          <p style={styles.chipRow}>
            {result.missingKeyWords.map((w) => (
              <span key={`m-${w}`} style={{ ...styles.chip, ...styles.chipMissing }}>
                {w}
              </span>
            ))}
            {result.extraKeyWords.map((w) => (
              <span key={`e-${w}`} style={{ ...styles.chip, ...styles.chipExtra }}>
                +{w}
              </span>
            ))}
          </p>
        )}
      </div>
    );
  }

  // Hard: percentage + word-level diff + one-line breakdown.
  return (
    <div>
      <p style={styles.score}>{result.scorePercent}%</p>
      {said}
      <p style={styles.diffLine}>
        {result.diffs.map((d, i) => (
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
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { fontSize: 13, padding: '3px 9px', borderRadius: 20, fontWeight: 600 },
  chipMissing: { background: '#fde8e6', color: '#c0392b' },
  chipExtra: { background: '#f0f0ee', color: '#888' },
};
