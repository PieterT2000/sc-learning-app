'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { loadSettings, saveSettings } from '@/lib/progressStore';
import { QUESTION_SETS, questionSetSize } from '@/lib/questionSets';

const GROUPS: ReadonlyArray<{ key: string; layout: 'card' | 'chips' | 'compact' }> = [
  { key: 'Everything', layout: 'card' },
  { key: 'By number', layout: 'chips' },
  { key: 'By theme', layout: 'card' },
  { key: 'By topic', layout: 'compact' },
];

export function QuestionSetPicker({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<string>('all');

  useEffect(() => {
    setSelected(loadSettings().questionSetId);
  }, []);

  const choose = (id: string) => {
    saveSettings({ questionSetId: id });
    onBack();
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.statusBar}>
        <button onClick={onBack} style={styles.back}>
          &larr; Home
        </button>
        <span>Choose questions</span>
      </div>

      <p style={styles.intro}>
        Pick what a session draws from &mdash; the whole catechism, a block of ten, or
        one of the standard themes and topics. The session runs the whole set.
      </p>

      {GROUPS.map(({ key, layout }) => {
        const sets = QUESTION_SETS.filter((s) => s.group === key);
        if (sets.length === 0) return null;

        return (
          <div key={key} style={styles.group}>
            <div style={styles.groupLabel}>{key.toUpperCase()}</div>

            {layout === 'chips' ? (
              <div style={styles.chipWrap}>
                {sets.map((s) => {
                  const active = s.id === selected;
                  return (
                    <button
                      key={s.id}
                      onClick={() => choose(s.id)}
                      style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={styles.cardList}>
                {sets.map((s) => {
                  const active = s.id === selected;
                  return (
                    <button
                      key={s.id}
                      onClick={() => choose(s.id)}
                      style={{
                        ...styles.card,
                        ...(layout === 'compact' ? styles.cardCompact : {}),
                        ...(active ? styles.cardActive : {}),
                      }}
                    >
                      <span style={styles.cardTop}>
                        <span style={styles.cardLabel}>
                          {active ? '✓ ' : ''}
                          {s.label}
                        </span>
                        <span style={styles.cardCount}>{questionSetSize(s.id)}</span>
                      </span>
                      {layout === 'card' && s.blurb && (
                        <span style={styles.cardBlurb}>{s.blurb}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column' },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#888',
    padding: '12px 0 16px',
  },
  back: {
    border: 'none',
    background: 'transparent',
    color: '#3d5a80',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
  },
  intro: { fontSize: 13, lineHeight: 1.5, color: '#888', margin: '0 0 20px' },
  group: { marginBottom: 24 },
  groupLabel: {
    fontSize: 12,
    color: '#888',
    letterSpacing: 1,
    fontWeight: 600,
    marginBottom: 8,
  },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#d0cec8',
    borderRadius: 999,
    background: '#fff',
    color: '#2a2a2a',
    cursor: 'pointer',
  },
  chipActive: { borderColor: '#3d5a80', background: '#3d5a80', color: '#fff' },
  cardList: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#d0cec8',
    borderRadius: 12,
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
  },
  cardCompact: { padding: '10px 14px' },
  cardActive: { borderColor: '#3d5a80', background: '#f0f4f8' },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
  },
  cardLabel: { fontWeight: 600, fontSize: 14, color: '#2a2a2a', lineHeight: 1.35 },
  cardCount: { fontSize: 12, color: '#888', flexShrink: 0 },
  cardBlurb: { fontSize: 12, color: '#888', lineHeight: 1.5 },
};
