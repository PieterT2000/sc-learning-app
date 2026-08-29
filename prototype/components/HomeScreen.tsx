'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  loadProgress,
  getMasteredCount,
  getTotalQuestions,
  getBadges,
  type ProgressState,
} from '@/lib/progressStore';

export type StudyMode = 'learning' | 'easy' | 'hard';

const SESSION_SIZE = 5;

const MODES: Array<{ id: StudyMode; icon: string; label: string; description: string }> = [
  { id: 'learning', icon: '🌱', label: 'Learning', description: 'Prompts help you' },
  { id: 'easy', icon: '📖', label: 'Easy', description: 'Get the gist' },
  { id: 'hard', icon: '⚔️', label: 'Hard', description: 'Every word' },
];

export function HomeScreen({ onBeginSession }: { onBeginSession: (mode: StudyMode) => void }) {
  const [mode, setMode] = useState<StudyMode>('easy');
  const [progress, setProgress] = useState<ProgressState | null>(null);

  // Read from localStorage only on the client, after mount, to avoid an
  // SSR/client markup mismatch (Next.js prerenders this page; localStorage
  // doesn't exist during that pass).
  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const mastered = progress ? getMasteredCount(progress) : 0;
  const total = getTotalQuestions();
  const progressPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const badges = progress ? getBadges(progress) : [];
  const nextBadge = badges.find((b) => !b.earned);

  const sessionCount = Math.min(SESSION_SIZE, total);
  const estimatedMinutes = Math.max(1, Math.round(sessionCount * 0.6));

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.title}>Catechism Voice</div>
        <div style={styles.subtitle}>Westminster Shorter Catechism</div>
      </div>

      <div style={styles.sectionLabel}>MODE</div>
      <div style={styles.modeSelector}>
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{ ...styles.modeBtn, ...(active ? styles.modeBtnActive : {}) }}
            >
              <div style={{ fontSize: 20 }}>{m.icon}</div>
              <div style={styles.modeBtnLabel}>{m.label}</div>
              <div style={styles.modeBtnDesc}>{m.description}</div>
            </button>
          );
        })}
      </div>

      <div style={styles.streakBar}>
        <div style={styles.streakNum}>{progress?.streak ?? 0}</div>
        <div>
          <div style={{ ...styles.streakText, fontWeight: 600, color: '#333' }}>Day streak</div>
          <div style={styles.streakText}>
            {nextBadge ? `Keep going for the ${nextBadge.emoji} badge` : 'All badges earned!'}
          </div>
        </div>
      </div>

      <div style={styles.sectionLabel}>BADGES</div>
      <div style={styles.badgeRow}>
        {badges.map((b) => (
          <div
            key={b.label}
            title={b.label}
            style={{ ...styles.badge, ...(b.earned ? styles.badgeEarned : {}) }}
          >
            {b.emoji}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={styles.sectionLabel}>PROGRESS</div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
        </div>
        <div style={styles.progressCaption}>
          {mastered} of {total} mastered
        </div>
      </div>

      <button onClick={() => onBeginSession(mode)} style={styles.startBtn}>
        Begin Session
      </button>
      <div style={styles.sessionCaption}>
        {sessionCount} question{sessionCount === 1 ? '' : 's'} · ~{estimatedMinutes} minute
        {estimatedMinutes === 1 ? '' : 's'}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column' },
  header: { textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 700, color: '#3d5a80' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 4 },
  sectionLabel: { fontSize: 12, color: '#888', marginBottom: 6, letterSpacing: 1, fontWeight: 600 },
  modeSelector: { display: 'flex', gap: 8, margin: '8px 0 16px' },
  modeBtn: {
    flex: 1,
    padding: 12,
    border: '2px solid #d0cec8',
    borderRadius: 12,
    textAlign: 'center',
    background: '#fff',
    cursor: 'pointer',
  },
  modeBtnActive: { borderColor: '#3d5a80', background: '#f0f4f8' },
  modeBtnLabel: { fontWeight: 600, fontSize: 14, marginTop: 2 },
  modeBtnDesc: { fontSize: 11, color: '#888', marginTop: 4 },
  streakBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    background: '#faf9f6',
    borderRadius: 12,
    margin: '4px 0 16px',
  },
  streakNum: { fontSize: 28, fontWeight: 700, color: '#3d5a80' },
  streakText: { fontSize: 13, color: '#666' },
  badgeRow: { display: 'flex', gap: 8 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#e8dfd0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
  },
  badgeEarned: { background: '#d4a853' },
  progressTrack: { background: '#eee', height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { background: '#3d5a80', height: '100%', borderRadius: 4, transition: 'width 300ms ease' },
  progressCaption: { fontSize: 12, color: '#888', marginTop: 4 },
  startBtn: {
    width: '100%',
    padding: 18,
    background: '#3d5a80',
    color: '#fff',
    border: 'none',
    borderRadius: 16,
    fontSize: 17,
    fontWeight: 600,
    marginTop: 32,
    cursor: 'pointer',
    letterSpacing: 0.3,
  },
  sessionCaption: { textAlign: 'center', color: '#888', fontSize: 13, marginTop: 12 },
};
