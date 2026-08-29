'use client';

import { useState, type CSSProperties } from 'react';
import { HomeScreen, type StudyMode } from '@/components/HomeScreen';
import { HandsFreeMode } from '@/components/HandsFreeMode';
import { ManualMode } from '@/components/ManualMode';
import { getSessionQuestions, type CatechismQuestion } from '@/lib/progressStore';
import { DEFAULT_FEEDBACK_LEVEL, type FeedbackLevel } from '@/lib/feedbackLevels';

type View = 'home' | 'hands-free' | 'manual';

const SESSION_SIZE = 5;

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [mode, setMode] = useState<StudyMode>('easy');
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>(DEFAULT_FEEDBACK_LEVEL);
  const [sessionQuestions, setSessionQuestions] = useState<CatechismQuestion[]>([]);

  const beginSession = (chosenMode: StudyMode, chosenFeedbackLevel: FeedbackLevel) => {
    setMode(chosenMode);
    setFeedbackLevel(chosenFeedbackLevel);
    setSessionQuestions(getSessionQuestions(SESSION_SIZE));
    setView('hands-free');
  };

  return (
    <main style={styles.main}>
      {view === 'home' && <HomeScreen onBeginSession={beginSession} />}

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
        <button onClick={() => setView('manual')} style={styles.devLink}>
          Manual mode (dev/testing)
        </button>
      )}
      {view === 'manual' && (
        <button onClick={() => setView('home')} style={styles.devLink}>
          ← Back to Home
        </button>
      )}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    maxWidth: 420,
    margin: '0 auto',
    padding: '2.5rem 1.5rem',
    // Font comes from Noto Serif on <body> (app/layout.tsx) via next/font.
    background: '#f8f7f4',
    minHeight: '100vh',
  },
  devLink: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    padding: '12px 0',
    marginTop: 24,
    fontSize: 12,
    color: '#aaa',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
};
