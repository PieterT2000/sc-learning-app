'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { loadSettings, saveSettings } from '@/lib/progressStore';
import { FEEDBACK_LEVELS, DEFAULT_FEEDBACK_LEVEL, type FeedbackLevel } from '@/lib/feedbackLevels';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>(DEFAULT_FEEDBACK_LEVEL);

  // localStorage is client-only; read after mount to avoid an SSR mismatch.
  useEffect(() => {
    setFeedbackLevel(loadSettings().feedbackLevel);
  }, []);

  const choose = (level: FeedbackLevel) => {
    setFeedbackLevel(level);
    saveSettings({ feedbackLevel: level });
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.statusBar}>
        <button onClick={onBack} style={styles.back}>
          &larr; Home
        </button>
        <span>Settings</span>
      </div>

      <div style={styles.title}>Feedback</div>
      <p style={styles.sub}>
        How much the app says out loud after each attempt in hands-free mode. The
        on-screen result &mdash; verdict and green/red word comparison &mdash; is always
        shown regardless.
      </p>

      <div style={styles.selector}>
        {FEEDBACK_LEVELS.map((f) => {
          const active = f.id === feedbackLevel;
          return (
            <button
              key={f.id}
              onClick={() => choose(f.id)}
              style={{ ...styles.btn, ...(active ? styles.btnActive : {}) }}
            >
              <span style={styles.btnLabel}>{f.label}</span>
              <span style={styles.btnBlurb}>{f.blurb}</span>
            </button>
          );
        })}
      </div>
      <p style={styles.hint}>
        In hands-free mode, say &ldquo;next question&rdquo; while feedback is playing to
        skip the rest.
      </p>

      <button onClick={onBack} style={styles.doneBtn}>
        Done
      </button>
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
    padding: '12px 0 20px',
  },
  back: {
    border: 'none',
    background: 'transparent',
    color: '#3d5a80',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
  },
  title: { fontSize: 20, fontWeight: 600, color: '#2a2a2a', marginBottom: 6 },
  sub: { fontSize: 13, lineHeight: 1.5, color: '#888', marginBottom: 16 },
  selector: { display: 'flex', flexDirection: 'column', gap: 8 },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '12px 14px',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#d0cec8',
    borderRadius: 12,
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
  },
  btnActive: { borderColor: '#3d5a80', background: '#f0f4f8' },
  btnLabel: { fontWeight: 600, fontSize: 14, color: '#2a2a2a' },
  btnBlurb: { fontSize: 12, color: '#888' },
  hint: { fontSize: 12, color: '#aaa', lineHeight: 1.5, margin: '12px 0 0' },
  doneBtn: {
    width: '100%',
    padding: 16,
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 16,
    border: 'none',
    background: '#3d5a80',
    color: '#fff',
    cursor: 'pointer',
    marginTop: 32,
  },
};
