'use client';

import { useEffect, useState } from 'react';
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
    <div className="flex flex-col">
      <div className="flex items-center justify-between pb-5 pt-3 text-xs text-muted">
        <button
          onClick={onBack}
          className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-accent"
        >
          &larr; Home
        </button>
        <span>Settings</span>
      </div>

      <div className="mb-1.5 text-xl font-semibold text-ink">Feedback</div>
      <p className="mb-4 text-[13px] leading-normal text-muted">
        How much the app says out loud after each attempt in hands-free mode. The
        on-screen result &mdash; verdict and green/red word comparison &mdash; is always
        shown regardless.
      </p>

      <div className="flex flex-col gap-2">
        {FEEDBACK_LEVELS.map((f) => {
          const active = f.id === feedbackLevel;
          return (
            <button
              key={f.id}
              onClick={() => choose(f.id)}
              className={`flex cursor-pointer flex-col gap-[3px] rounded-xl border-2 px-3.5 py-3 text-left ${
                active ? 'border-accent bg-accent-soft' : 'border-line bg-white'
              }`}
            >
              <span className="text-sm font-semibold text-ink">{f.label}</span>
              <span className="text-xs text-muted">{f.blurb}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-normal text-[#aaa]">
        In hands-free mode, say &ldquo;next question&rdquo; while feedback is playing to
        skip the rest.
      </p>

      <button
        onClick={onBack}
        className="mt-8 w-full cursor-pointer rounded-2xl border-0 bg-accent py-4 text-base font-semibold text-white"
      >
        Done
      </button>
    </div>
  );
}
