'use client';

import { useEffect, useState } from 'react';
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
    <div className="flex flex-col">
      <div className="flex items-center justify-between pb-4 pt-3 text-xs text-muted">
        <button
          onClick={onBack}
          className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-accent"
        >
          &larr; Home
        </button>
        <span>Choose questions</span>
      </div>

      <p className="mb-5 text-[13px] leading-normal text-muted">
        Pick what a session draws from &mdash; the whole catechism, a block of ten, or
        one of the standard themes and topics. The session runs the whole set.
      </p>

      {GROUPS.map(({ key, layout }) => {
        const sets = QUESTION_SETS.filter((s) => s.group === key);
        if (sets.length === 0) return null;

        return (
          <div key={key} className="mb-6">
            <div className="mb-2 text-xs font-semibold tracking-[1px] text-muted">
              {key.toUpperCase()}
            </div>

            {layout === 'chips' ? (
              <div className="flex flex-wrap gap-2">
                {sets.map((s) => {
                  const active = s.id === selected;
                  return (
                    <button
                      key={s.id}
                      onClick={() => choose(s.id)}
                      className={`cursor-pointer rounded-full border-2 px-3 py-2 text-[13px] font-semibold ${
                        active
                          ? 'border-accent bg-accent text-white'
                          : 'border-line bg-white text-ink'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sets.map((s) => {
                  const active = s.id === selected;
                  return (
                    <button
                      key={s.id}
                      onClick={() => choose(s.id)}
                      className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 text-left px-3.5 ${
                        layout === 'compact' ? 'py-2.5' : 'py-3'
                      } ${active ? 'border-accent bg-accent-soft' : 'border-line bg-white'}`}
                    >
                      <span className="flex items-baseline justify-between gap-2.5">
                        <span className="text-sm font-semibold leading-[1.35] text-ink">
                          {active ? '✓ ' : ''}
                          {s.label}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {questionSetSize(s.id)}
                        </span>
                      </span>
                      {layout === 'card' && s.blurb && (
                        <span className="text-xs leading-normal text-muted">{s.blurb}</span>
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
