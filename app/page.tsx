'use client';

import { useState } from 'react';
import { HomeScreen, type StudyMode } from '@/components/HomeScreen';
import { HandsFreeMode } from '@/components/HandsFreeMode';
import { ManualMode } from '@/components/ManualMode';
import { SettingsScreen } from '@/components/SettingsScreen';
import { QuestionSetPicker } from '@/components/QuestionSetPicker';
import { getSessionQuestions, type CatechismQuestion } from '@/lib/progressStore';
import { idsForQuestionSet } from '@/lib/questionSets';
import { DEFAULT_FEEDBACK_LEVEL, type FeedbackLevel } from '@/lib/feedbackLevels';

type View = 'home' | 'hands-free' | 'manual' | 'settings' | 'picker';

const devLinkClass =
  'mt-6 block w-full cursor-pointer border-0 bg-transparent py-3 text-center text-xs text-[#aaa]';

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [mode, setMode] = useState<StudyMode>('easy');
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>(DEFAULT_FEEDBACK_LEVEL);
  const [sessionQuestions, setSessionQuestions] = useState<CatechismQuestion[]>([]);

  const beginSession = (
    chosenMode: StudyMode,
    chosenFeedbackLevel: FeedbackLevel,
    chosenQuestionSetId: string
  ) => {
    setMode(chosenMode);
    setFeedbackLevel(chosenFeedbackLevel);
    setSessionQuestions(getSessionQuestions(idsForQuestionSet(chosenQuestionSetId)));
    setView('hands-free');
  };

  return (
    <main className="mx-auto min-h-screen max-w-[420px] bg-page px-6 py-10">
      {view === 'home' && (
        <HomeScreen
          onBeginSession={beginSession}
          onOpenSettings={() => setView('settings')}
          onOpenPicker={() => setView('picker')}
        />
      )}

      {view === 'settings' && <SettingsScreen onBack={() => setView('home')} />}

      {view === 'picker' && <QuestionSetPicker onBack={() => setView('home')} />}

      {view === 'hands-free' && (
        <HandsFreeMode
          mode={mode}
          feedbackLevel={feedbackLevel}
          questions={sessionQuestions}
          onExit={() => setView('home')}
        />
      )}

      {view === 'manual' && <ManualMode />}

      {/* Small dev-only link to the manual tap-to-record flow, useful for
          isolating mic/Groq/diff issues from the hands-free VAD logic. */}
      {view === 'home' && (
        <button onClick={() => setView('manual')} className={devLinkClass}>
          Manual mode (dev/testing)
        </button>
      )}
      {view === 'manual' && (
        <button onClick={() => setView('home')} className={devLinkClass}>
          ← Back to Home
        </button>
      )}
    </main>
  );
}
