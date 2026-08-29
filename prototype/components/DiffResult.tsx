import type { CSSProperties } from 'react';
import type { WordDiffResult } from '@/lib/wordDiff';

export function DiffResult({
  transcript,
  diffResult,
}: {
  transcript: string;
  diffResult: WordDiffResult;
}) {
  return (
    <div>
      <p style={styles.score}>{diffResult.scorePercent}%</p>
      <p style={styles.transcriptLabel}>You said: “{transcript || '(nothing captured)'}”</p>
      <p style={styles.diffLine}>
        {diffResult.diffs.map((d, i) => (
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
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  score: { fontSize: 40, fontWeight: 700, marginBottom: 6 },
  transcriptLabel: { fontSize: 13, color: '#888', marginBottom: 20 },
  diffLine: { fontSize: 17, lineHeight: 1.9 },
};
