'use client';

import { useEffect, useState } from 'react';
import {
  loadProgress,
  loadSettings,
  getMasteredCount,
  getTotalQuestions,
  getBadges,
  type ProgressState,
} from '@/lib/progressStore';
import { DEFAULT_FEEDBACK_LEVEL, type FeedbackLevel } from '@/lib/feedbackLevels';
import { questionSetById, questionSetSize, ALL_SET_ID } from '@/lib/questionSets';

export type StudyMode = 'easy' | 'medium' | 'hard';

const MODES: Array<{ id: StudyMode; icon: string; label: string; description: string }> = [
  { id: 'easy', icon: '📖', label: 'Easy', description: 'Key ideas' },
  { id: 'medium', icon: '📚', label: 'Medium', description: 'Ideas, in order' },
  { id: 'hard', icon: '⚔️', label: 'Hard', description: 'Every word' },
];

const sectionLabel = 'mb-1.5 text-xs font-semibold tracking-[1px] text-muted';

export function HomeScreen({
  onBeginSession,
  onOpenSettings,
  onOpenPicker,
}: {
  onBeginSession: (mode: StudyMode, feedbackLevel: FeedbackLevel, questionSetId: string) => void;
  onOpenSettings: () => void;
  onOpenPicker: () => void;
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

  const mastered = progress ? getMasteredCount(progress) : 0;
  const total = getTotalQuestions();
  const progressPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const badges = progress ? getBadges(progress) : [];
  const nextBadge = badges.find((b) => !b.earned);

  const chosenSet = questionSetById(questionSetId);
  const setSize = questionSetSize(questionSetId);
  const estimatedMinutes = Math.max(1, Math.round(setSize * 0.6));

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex justify-end">
        <button
          onClick={onOpenSettings}
          className="cursor-pointer border-0 bg-transparent p-1 text-[13px] text-muted"
        >
          ⚙ Settings
        </button>
      </div>

      <div className="mb-2 text-center">
        <div className="text-2xl font-bold text-accent">Catechism Voice</div>
        <div className="mt-1 text-xs text-muted">Westminster Shorter Catechism</div>
      </div>

      <div className={sectionLabel}>MODE</div>
      <div className="mb-4 mt-2 flex gap-2">
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 cursor-pointer rounded-xl border-2 p-3 text-center ${
                active ? 'border-accent bg-accent-soft' : 'border-line bg-white'
              }`}
            >
              <div className="text-xl">{m.icon}</div>
              <div className="mt-0.5 text-sm font-semibold">{m.label}</div>
              <div className="mt-1 text-[11px] text-muted">{m.description}</div>
            </button>
          );
        })}
      </div>

      <div className={sectionLabel}>QUESTIONS</div>
      <button
        onClick={onOpenPicker}
        className="my-2 flex w-full cursor-pointer flex-col gap-1 rounded-xl border-2 border-line bg-card px-3.5 py-3 text-left"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-ink">{chosenSet.label}</span>
          <span className="shrink-0 text-xs font-semibold text-accent">Change ›</span>
        </div>
        <span className="text-xs text-muted">
          {setSize} question{setSize === 1 ? '' : 's'} · the whole set each session
        </span>
        {chosenSet.blurb && (
          <span className="mt-0.5 text-xs leading-normal text-muted">{chosenSet.blurb}</span>
        )}
      </button>

      <div className="my-4 flex items-center gap-3 rounded-xl bg-card p-4">
        <div className="text-[28px] font-bold text-accent">{progress?.streak ?? 0}</div>
        <div>
          <div className="text-[13px] font-semibold text-[#333]">Day streak</div>
          <div className="text-[13px] text-[#666]">
            {nextBadge ? `Keep going for the ${nextBadge.emoji} badge` : 'All badges earned!'}
          </div>
        </div>
      </div>

      <div className={sectionLabel}>BADGES</div>
      <div className="flex gap-2">
        {badges.map((b) => (
          <div
            key={b.label}
            title={b.label}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
              b.earned ? 'bg-badge-earned' : 'bg-badge-empty'
            }`}
          >
            {b.emoji}
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className={sectionLabel}>PROGRESS</div>
        <div className="h-2 overflow-hidden rounded bg-[#eee]">
          <div
            className="h-full rounded bg-accent transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-muted">
          {mastered} of {total} mastered
        </div>
      </div>

      <button
        onClick={() => onBeginSession(mode, feedbackLevel, questionSetId)}
        className="mt-8 w-full cursor-pointer rounded-2xl border-0 bg-accent py-[18px] text-[17px] font-semibold tracking-[0.3px] text-white"
      >
        Begin Session
      </button>
      <div className="mt-3 text-center text-[13px] text-muted">
        {setSize} question{setSize === 1 ? '' : 's'} · ~{estimatedMinutes} minute
        {estimatedMinutes === 1 ? '' : 's'}
      </div>
    </div>
  );
}
