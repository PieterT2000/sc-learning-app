'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { scoreAnswer, briefVerdict, type ScoreResult } from '@/lib/scoring';
import { fetchFeedbackText } from '@/lib/feedbackClient';
import {
  FEEDBACK_LEVELS,
  feedbackLevelIsFull,
  feedbackLevelReadsAnswer,
  type FeedbackLevel,
} from '@/lib/feedbackLevels';
import { getSupportedMimeType, extensionForMimeType } from '@/lib/audioFormat';
import { transcribeAudio } from '@/lib/transcribeAudio';
import { speak, primeVoices, abortSpeech } from '@/lib/tts';
import { startVoiceActivityMonitor, type VoiceActivityHandle } from '@/lib/voiceActivity';
import { startLiveCaption, type LiveCaptionHandle, type LiveCaptionStatus } from '@/lib/liveCaption';
import { HANDS_FREE_CONFIG as CFG } from '@/lib/handsFreeConfig';
import { recordAnswer, recordSessionComplete, type CatechismQuestion } from '@/lib/progressStore';
import { DiffResult } from './DiffResult';
import type { StudyMode } from './HomeScreen';

const MODE_LABELS: Record<StudyMode, string> = {
  easy: 'Easy Mode',
  medium: 'Medium Mode',
  hard: 'Hard Mode',
};

const MODE_META: Record<StudyMode, { icon: string; blurb: string }> = {
  easy: { icon: '📖', blurb: 'key ideas, any order' },
  medium: { icon: '📚', blurb: 'key ideas, in order' },
  hard: { icon: '⚔️', blurb: 'every word, exactly' },
};

// How many questions to spell out on the start-screen overview before
// collapsing the rest into a "+ N more" line.
const OVERVIEW_PREVIEW = 8;

// Minimal shape of a Screen Wake Lock sentinel - avoids depending on the
// lib.dom typings, which aren't present in every toolchain.
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type Phase =
  | 'off'
  | 'asking'
  | 'listening'
  | 'stalled'
  | 'capturing'
  | 'transcribing'
  | 'no-answer'
  | 'result'
  | 'complete';

export function HandsFreeMode({
  mode,
  feedbackLevel,
  questions,
  onExit,
}: {
  mode: StudyMode;
  feedbackLevel: FeedbackLevel;
  questions: CatechismQuestion[];
  onExit: (completed: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>('off');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [liveCaption, setLiveCaption] = useState('');
  const [captionStatus, setCaptionStatus] = useState<LiveCaptionStatus | null>(null);

  // Refs, not state, drive the control flow below. This whole loop runs
  // across several `await`s (speak -> listen -> transcribe -> speak again),
  // and React state read inside those closures would go stale between
  // renders. Refs always read the current value regardless of when the
  // closure fires.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef('');
  const vadRef = useRef<VoiceActivityHandle | null>(null);
  const captionRef = useRef<LiveCaptionHandle | null>(null);

  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const activeRef = useRef(false); // false once the session has been torn down
  const currentIndexRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const listenStartRef = useRef(0);
  const silenceStartRef = useRef<number | null>(null);
  const captureFinishedRef = useRef(false); // guards against double-firing finishCapture
  const skipRequestedRef = useRef(false); // set while reading a result aloud, when the user taps "Next question"

  const question = questions[index];
  const isListening = phase === 'listening' || phase === 'capturing' || phase === 'stalled';
  const selectedFeedback =
    FEEDBACK_LEVELS.find((f) => f.id === feedbackLevel) ?? FEEDBACK_LEVELS[1];

  // Keep the screen on for the duration of a hands-free session so a slow
  // recitation doesn't get cut off by the display sleeping. The lock is
  // dropped automatically when the tab is hidden, so we re-request it on
  // visibilitychange (below) while the session is still active.
  const acquireWakeLock = useCallback(async () => {
    if (wakeLockRef.current) return;
    try {
      const wl = (
        navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        }
      ).wakeLock;
      if (!wl) return;
      const sentinel = await wl.request('screen');
      wakeLockRef.current = sentinel;
      sentinel.addEventListener?.('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      // Not fatal - the OS may still dim the screen (battery saver, no
      // permission, not visible). Nothing more we can do.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const teardownAudio = useCallback(() => {
    vadRef.current?.stop();
    vadRef.current = null;
    captionRef.current?.stop();
    captionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  }, []);

  // Cuts short whatever result is being read aloud (the "Next question" button)
  // and lets the loop advance.
  const requestSkip = useCallback(() => {
    if (skipRequestedRef.current) return;
    skipRequestedRef.current = true;
    abortSpeech();
  }, []);

  // A pause that also ends early if the user asks to skip (or the session ends).
  const sleepUnlessSkipped = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = () => {
        if (!activeRef.current || skipRequestedRef.current || performance.now() - start >= ms) {
          resolve();
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  }, []);

  const endSession = useCallback(
    (reason?: string, completed = false) => {
      activeRef.current = false;
      abortSpeech();
      releaseWakeLock();
      teardownAudio();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPhase('off');
      setMicLevel(0);
      setLiveCaption('');
      if (reason) setError(reason);
      onExit(completed);
    },
    [teardownAudio, releaseWakeLock, onExit]
  );

  // Safety net if the user navigates away or switches modes mid-session.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      abortSpeech();
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      vadRef.current?.stop();
      captionRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // The wake lock drops when the tab is backgrounded; take it again on return
  // if we're still mid-session.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && activeRef.current) void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [acquireWakeLock]);

  const finishCapture = useCallback((outcome: 'answered' | 'no-answer') => {
    if (captureFinishedRef.current) return;
    captureFinishedRef.current = true;

    vadRef.current?.stop();
    vadRef.current = null;
    captionRef.current?.stop();
    captionRef.current = null;

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.onstop = () => {
      if (!activeRef.current) return;
      if (outcome === 'no-answer') void handleNoAnswer();
      else void handleAnswer();
    };
    recorder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCapture = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = getSupportedMimeType();
    mimeTypeRef.current = mimeType;
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    captureFinishedRef.current = false;
    hasSpokenRef.current = false;
    silenceStartRef.current = null;
    listenStartRef.current = performance.now();
    setLiveCaption('');
    setCaptionStatus(null);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start();
    setPhase('listening');

    // Live captions: purely a display nicety, decoupled from the actual
    // Groq-based scoring transcript. Reports status so the UI can say why,
    // instead of just staying blank if it's unsupported or errors out.
    captionRef.current = startLiveCaption(
      (text) => setLiveCaption(text),
      (status) => setCaptionStatus(status)
    );

    vadRef.current = startVoiceActivityMonitor(stream, (rms) => {
      if (!activeRef.current || captureFinishedRef.current) return;
      setMicLevel(rms);

      const now = performance.now();
      const speaking = rms > CFG.speechRmsThreshold;

      if (speaking) {
        if (!hasSpokenRef.current) {
          hasSpokenRef.current = true;
          setPhase('capturing');
        }
        silenceStartRef.current = null;
      } else if (hasSpokenRef.current) {
        // They've spoken at least once - watch for them trailing off.
        if (silenceStartRef.current === null) silenceStartRef.current = now;
        else if (now - silenceStartRef.current > CFG.trailingSilenceMs) {
          finishCapture('answered');
          return;
        }
      } else {
        // Nobody's said anything yet.
        if (now - listenStartRef.current > CFG.stallMs) setPhase('stalled');
        if (now - listenStartRef.current > CFG.hardStopNoSpeechMs) {
          finishCapture('no-answer');
          return;
        }
      }

      if (now - listenStartRef.current > CFG.maxRecordingMs) {
        finishCapture(hasSpokenRef.current ? 'answered' : 'no-answer');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishCapture]);

  const goToQuestion = useCallback(
    async (qIndex: number) => {
      currentIndexRef.current = qIndex;
      setIndex(qIndex);
      setError(null);
      setTranscript('');
      setResult(null);
      skipRequestedRef.current = false;
      setPhase('asking');

      await speak(questions[qIndex].question);
      if (!activeRef.current) return;
      startCapture();
    },
    [startCapture, questions]
  );

  const handleNoAnswer = useCallback(async () => {
    setPhase('no-answer');
    await speak("I didn't catch that. Let's try again.");
    if (!activeRef.current) return;
    await goToQuestion(currentIndexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToQuestion]);

  const handleAnswer = useCallback(async () => {
    const q = questions[currentIndexRef.current];
    setPhase('transcribing');
    try {
      const mimeType = mimeTypeRef.current || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = extensionForMimeType(mimeType);

      const text = await transcribeAudio(blob, `answer.${ext}`);
      if (!activeRef.current) return;

      setTranscript(text);
      const scored = scoreAnswer(mode, q.answer, text);
      setResult(scored);
      setPhase('result');

      // Progress is still a single 0-100 track (see progressStore.ts). Map the
      // prose modes onto it: a pass is a mastery-worthy 100, a near-miss is
      // held just below the mastery threshold so it never counts as mastered.
      const pct =
        scored.mode === 'hard'
          ? scored.scorePercent
          : scored.passed
            ? 100
            : Math.min(
                89,
                Math.round((scored.keyWordsMatched / Math.max(1, scored.keyWordsTotal)) * 100)
              );
      recordAnswer(q.id, pct);

      // Read the result aloud (hands-free is meant to work with the screen
      // off), following the chosen feedback level. Any of it can be cut short
      // by the user tapping "Next question".
      skipRequestedRef.current = false;

      const full = feedbackLevelIsFull(feedbackLevel);
      const utterances: Array<{ text: string; rate?: number }> = [];

      if (scored.mode === 'hard') {
        if (scored.exact) {
          utterances.push({ text: 'Word perfect. One hundred percent.' });
        } else if (full) {
          utterances.push({ text: `${scored.scorePercent} percent. ${scored.breakdown}` });
        } else {
          utterances.push({ text: briefVerdict(scored) });
        }
      } else if (full) {
        // Comprehensive: wait for the LLM-phrased feedback (falls back to the
        // deterministic template on failure or timeout), show it, then speak it.
        const feedback = await fetchFeedbackText(scored, q.answer, text);
        if (!activeRef.current) return;
        setResult((cur) => (cur && cur.mode !== 'hard' ? { ...cur, feedback } : cur));
        utterances.push({ text: feedback });
      } else {
        utterances.push({ text: briefVerdict(scored) });
      }

      if (feedbackLevelReadsAnswer(feedbackLevel)) {
        utterances.push({ text: `The answer is. ${q.answer}`, rate: 0.9 });
      }

      for (const u of utterances) {
        if (!activeRef.current || skipRequestedRef.current) break;
        await speak(u.text, u.rate ? { rate: u.rate } : undefined);
      }
      if (activeRef.current && !skipRequestedRef.current) {
        await sleepUnlessSkipped(CFG.resultPauseMs);
      }

      const wasSkipped = skipRequestedRef.current;
      skipRequestedRef.current = false;
      if (!activeRef.current) return;

      if (currentIndexRef.current < questions.length - 1) {
        await goToQuestion(currentIndexRef.current + 1);
      } else {
        setPhase('complete');
        recordSessionComplete();
        if (!wasSkipped) await speak("That's this session's questions done. Nicely done.");
        endSession(undefined, true);
      }
    } catch (err) {
      console.error(err);
      if (!activeRef.current) return;
      setError(err instanceof Error ? err.message : 'Transcription failed.');
      // Drop back into listening on the same question rather than killing the session.
      startCapture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToQuestion, endSession, startCapture, questions, mode, feedbackLevel, sleepUnlessSkipped]);

  const startSession = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      activeRef.current = true;
      void acquireWakeLock(); // keep the screen on for the whole session
      primeVoices(); // must be called from this user-gesture handler for iOS
      await goToQuestion(0);
    } catch (err) {
      console.error(err);
      setError(
        'Could not access the microphone. Hands-free mode needs mic access - on phones this also requires HTTPS, see README.'
      );
    }
  }, [goToQuestion, acquireWakeLock]);

  const iAmDone = useCallback(() => {
    if (phase === 'listening' || phase === 'stalled' || phase === 'capturing') {
      finishCapture(hasSpokenRef.current ? 'answered' : 'no-answer');
    }
  }, [phase, finishCapture]);

  const repeatQuestion = useCallback(() => {
    abortSpeech();
    teardownAudio();
    void goToQuestion(currentIndexRef.current);
  }, [goToQuestion, teardownAudio]);

  const statusText: Record<Phase, string> = {
    off: '',
    asking: 'Reading the question…',
    listening: 'Waiting for you to start…',
    stalled: 'Still there? Take your time.',
    capturing: 'Listening — go ahead…',
    transcribing: 'Checking your answer…',
    'no-answer': "Didn't catch that…",
    result: '',
    complete: 'Session complete 🎉',
  };

  const cls = {
    statusBar: 'flex justify-between pb-4 pt-3 text-xs text-muted',
    sectionLabel: 'mb-2 text-[13px] tracking-[1px] text-muted',
    status: 'mb-3 text-[15px] text-[#555]',
    primaryButton:
      'mt-4 w-full cursor-pointer rounded-2xl border-0 bg-accent py-4 text-base font-semibold text-white',
    secondaryButton:
      'flex-1 cursor-pointer rounded-xl border border-line bg-transparent px-3 py-3.5 text-sm font-semibold text-accent',
    exitButton:
      'flex-1 cursor-pointer rounded-xl border border-diff-bad bg-transparent px-3 py-3.5 text-sm font-semibold text-diff-bad',
    backLink: 'mt-3 w-full cursor-pointer border-0 bg-transparent py-3 text-sm text-muted',
    overviewKey:
      'shrink-0 grow-0 basis-[76px] pt-0.5 text-[11px] font-semibold tracking-[1px] text-accent',
    overviewVal: 'flex-1 text-sm leading-normal text-ink',
    qItem: 'flex gap-2.5 py-2.5 text-[15px] leading-[1.45] text-ink',
    qId: 'shrink-0 grow-0 basis-8 pt-[3px] text-xs font-bold tracking-[0.5px] text-accent',
  };

  if (!question && phase === 'off') {
    return (
      <div>
        <p className={cls.status}>No questions available for this session.</p>
        <button onClick={() => onExit(false)} className={cls.backLink}>
          ← Back to Home
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-4 text-sm text-diff-bad">{error}</p>}

      {phase === 'off' && (
        <div>
          <div className={cls.statusBar}>
            <span>This session</span>
            <span>
              {questions.length} question{questions.length === 1 ? '' : 's'} · ~
              {Math.max(1, Math.round(questions.length * 0.6))} min
            </span>
          </div>

          <div className="mb-5 mt-1 rounded-xl bg-card p-4">
            <div className="mb-2.5 flex gap-3">
              <span className={cls.overviewKey}>DIFFICULTY</span>
              <span className={cls.overviewVal}>
                {MODE_META[mode].icon} {MODE_LABELS[mode]} — {MODE_META[mode].blurb}
              </span>
            </div>
            <div className="flex gap-3">
              <span className={cls.overviewKey}>FEEDBACK</span>
              <span className={cls.overviewVal}>
                {selectedFeedback.label} — {selectedFeedback.blurb.toLowerCase()}
                {'. Say "next question" to skip it.'}
              </span>
            </div>
          </div>

          <div className={cls.sectionLabel}>QUESTIONS</div>
          <ol className="mt-1 list-none p-0">
            {questions.slice(0, OVERVIEW_PREVIEW).map((q, i, shown) => {
              const noBorder = i === shown.length - 1 && questions.length <= OVERVIEW_PREVIEW;
              return (
                <li
                  key={q.id}
                  className={`${cls.qItem} ${noBorder ? 'border-b-0' : 'border-b border-b-[#ececec]'}`}
                >
                  <span className={cls.qId}>Q{q.id}</span>
                  <span>{q.question}</span>
                </li>
              );
            })}
            {questions.length > OVERVIEW_PREVIEW && (
              <li className={`${cls.qItem} border-b-0 !text-muted`}>
                <span className={cls.qId} />
                <span>+ {questions.length - OVERVIEW_PREVIEW} more</span>
              </li>
            )}
          </ol>

          <p className="mb-5 mt-[18px] text-xs leading-normal text-muted">
            Hands-free from here: each question is read aloud, you answer, and it moves on by
            itself once you stop talking.
          </p>

          <button onClick={startSession} className={cls.primaryButton}>
            Start Listening
          </button>
          <button onClick={() => onExit(false)} className={cls.backLink}>
            ← Back to Home
          </button>
        </div>
      )}

      {phase !== 'off' && (
        <div>
          <div className={cls.statusBar}>
            <span>
              Question {index + 1} of {questions.length}
            </span>
            <span>{MODE_LABELS[mode]}</span>
          </div>
          <div className={cls.sectionLabel}>QUESTION {question.id}</div>
          <h1 className="mb-6 text-xl font-semibold leading-normal text-ink">{question.question}</h1>

          {isListening && (
            <div className="my-10 text-center">
              <div className="mx-auto flex h-[120px] w-[120px] animate-micpulse items-center justify-center rounded-full border-[3px] border-accent">
                <div
                  className="text-[40px] transition-transform duration-100 ease-out"
                  style={{ transform: `scale(${1 + Math.min(micLevel * 3, 0.6)})` }}
                >
                  🎙️
                </div>
              </div>
              <div className="mt-4 text-sm font-medium text-accent">
                {statusText[phase] || 'Listening…'}
              </div>
            </div>
          )}

          {!isListening && statusText[phase] && (
            <p className={cls.status}>{statusText[phase]}</p>
          )}

          {isListening && (
            <div className="mt-6 min-h-[60px] rounded-xl bg-card p-4 text-[15px] italic leading-relaxed text-[#555]">
              {captionStatus === 'unsupported'
                ? 'Live captions aren\u2019t supported in this browser (try Chrome).'
                : captionStatus === 'error'
                  ? 'Live captions hit an error \u2014 check the browser console for details.'
                  : liveCaption
                    ? `"${liveCaption}\u2026"`
                    : 'Listening for captions\u2026'}
            </div>
          )}

          {isListening && (
            <div className="mt-6 text-center">
              <span className="text-xs text-muted">
                Tap &ldquo;I&rsquo;m done&rdquo; to stop &middot; or just pause a moment
              </span>
            </div>
          )}

          {phase === 'result' && result && <DiffResult transcript={transcript} result={result} />}

          {phase === 'result' && (
            <button onClick={requestSkip} className={cls.primaryButton}>
              Next question &rarr;
            </button>
          )}

          <div className="mt-4 flex gap-2.5">
            {isListening && (
              <button onClick={iAmDone} className={cls.secondaryButton}>
                I&rsquo;m done — check it
              </button>
            )}
            {phase !== 'complete' && (
              <button onClick={repeatQuestion} className={cls.secondaryButton}>
                Repeat Question
              </button>
            )}
            <button onClick={() => endSession()} className={cls.exitButton}>
              Exit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
