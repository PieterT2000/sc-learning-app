'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  loadProgress,
  loadSettings,
  saveSettings,
  getMasteredCount,
  getTotalQuestions,
  getBadges,
  type ProgressState,
} from '@/lib/progressStore';
import { DEFAULT_FEEDBACK_LEVEL, type FeedbackLevel } from '@/lib/feedbackLevels';
import {
  QUESTION_SETS,
  QUESTION_SET_GROUPS,
  questionSetById,
  questionSetSize,
  ALL_SET_ID,
} from '@/lib/questionSets';

export type StudyMode = 'easy' | 'medium' | 'hard';

const SESSION_SIZE = 5;

const MODES: Array<{ id: StudyMode; icon: string; label: string; description: string }> = [
  { id: 'easy', icon: '📖', label: 'Easy', description: 'Key ideas' },
  { id: 'medium', icon: '📚', label: 'Medium', description: 'Ideas, in order' },
  { id: 'hard', icon: '⚔️', label: 'Hard', description: 'Every word' },
];

export function HomeScreen({
  onBeginSession,
  onOpenSettings,
}: {
  onBeginSession: (mode: StudyMode, feedbackLevel: FeedbackLevel, questionSetId: string) => void;
  onOpenSettings: () => void;
}) {
  const [mode, setMode] = useState<StudyMode>('easy');
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>(DEFAULT_FEEDBACK_LEVEL);
  const [questionSetId, setQuestionSetId] = useState<string>(ALL_SET_ID);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  // Read from localStorage only on the client, after mount, to avoid an
  // SSR/client markup mismatch (Next.js prerenders this page; localStorage
  // doesn't exist during that pass).
  useEffect(() => {
    setProgress(loadProgress());
    const s = loadSettings();
    setFeedbackLevel(s.feedbackLevel);
    setQuestionSetId(s.questionSetId);
  }, []);

  const chooseQuestionSet = (id: string) => {
    setQuestionSetId(id);
    saveSettings({ questionSetId: id });
  };

  const mastered = progress ? getMasteredCount(progress) : 0;
  const total = getTotalQuestions();
  const progressPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const badges = progress ? getBadges(progress) : [];
  const nextBadge = badges.find((b) => !b.earned);

  const chosenSet = questionSetById(questionSetId);
  const setSize = questionSetSize(questionSetId);
  const sessionCount = Math.min(SESSION_SIZE, setSize);
  const estimatedMinutes = Math.max(1, Math.round(sessionCount * 0.6));

  return (
    <div style={styles.wrap}>
      <div style={styles.topBar}>
        <button onClick={onOpenSettings} style={styles.settingsLink}>
          ⚙ Settings
        </button>
      </div>

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

      <div style={styles.sectionLabel}>QUESTIONS</div>
      <select
        value={questionSetId}
        onChange={(e) => chooseQuestionSet(e.target.value)}
        style={styles.questionSelect}
      >
        {QUESTION_SET_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {QUESTION_SETS.filter((s) => s.group === group).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div style={styles.questionCaption}>
        {setSize} question{setSize === 1 ? '' : 's'} in this set · a session draws up to{' '}
        {SESSION_SIZE}
      </div>
      {chosenSet.blurb && <div style={styles.questionBlurb}>{chosenSet.blurb}</div>}

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

      <button
        onClick={() => onBeginSession(mode, feedbackLevel, questionSetId)}
        style={styles.startBtn}
      >
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
  topBar: { display: 'flex', justifyContent: 'flex-end', marginBottom: 4 },
  settingsLink: {
    border: 'none',
    background: 'transparent',
    color: '#888',
    fontSize: 13,
    cursor: 'pointer',
    padding: 4,
  },
  header: { textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 700, color: '#3d5a80' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 4 },
  sectionLabel: { fontSize: 12, color: '#888', marginBottom: 6, letterSpacing: 1, fontWeight: 600 },
  modeSelector: { display: 'flex', gap: 8, margin: '8px 0 16px' },
  modeBtn: {
    flex: 1,
    padding: 12,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#d0cec8',
    borderRadius: 12,
    textAlign: 'center',
    background: '#fff',
    cursor: 'pointer',
  },
  modeBtnActive: { borderColor: '#3d5a80', background: '#f0f4f8' },
  modeBtnLabel: { fontWeight: 600, fontSize: 14, marginTop: 2 },
  modeBtnDesc: { fontSize: 11, color: '#888', marginTop: 4 },
  questionSelect: {
    width: '100%',
    padding: '11px 12px',
    fontSize: 14,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#d0cec8',
    borderRadius: 12,
    background: '#fff',
    color: '#2a2a2a',
    cursor: 'pointer',
    margin: '8px 0 8px',
  },
  questionCaption: { fontSize: 12, color: '#888' },
  questionBlurb: { fontSize: 12, color: '#888', lineHeight: 1.5, marginTop: 6 },
  streakBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    background: '#faf9f6',
    borderRadius: 12,
    margin: '16px 0',
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
