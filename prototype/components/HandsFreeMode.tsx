'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { speak, primeVoices } from '@/lib/tts';
import { startVoiceActivityMonitor, type VoiceActivityHandle } from '@/lib/voiceActivity';
import { startLiveCaption, type LiveCaptionHandle, type LiveCaptionStatus } from '@/lib/liveCaption';
import { startSkipListener, type SkipListenerHandle } from '@/lib/skipListener';
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
  const skipRef = useRef<SkipListenerHandle | null>(null);

  const activeRef = useRef(false); // false once the session has been torn down
  const currentIndexRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const listenStartRef = useRef(0);
  const silenceStartRef = useRef<number | null>(null);
  const captureFinishedRef = useRef(false); // guards against double-firing finishCapture
  const skipRequestedRef = useRef(false); // set while reading a result aloud, when the user says "next question"

  const question = questions[index];
  const isListening = phase === 'listening' || phase === 'capturing' || phase === 'stalled';
  const selectedFeedback =
    FEEDBACK_LEVELS.find((f) => f.id === feedbackLevel) ?? FEEDBACK_LEVELS[1];

  const teardownAudio = useCallback(() => {
    vadRef.current?.stop();
    vadRef.current = null;
    captionRef.current?.stop();
    captionRef.current = null;
    skipRef.current?.stop();
    skipRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  }, []);

  // Cuts short whatever result is being read aloud and lets the loop advance.
  const requestSkip = useCallback(() => {
    if (skipRequestedRef.current) return;
    skipRequestedRef.current = true;
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
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
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      teardownAudio();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPhase('off');
      setMicLevel(0);
      setLiveCaption('');
      if (reason) setError(reason);
      onExit(completed);
    },
    [teardownAudio, onExit]
  );

  // Safety net if the user navigates away or switches modes mid-session.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      vadRef.current?.stop();
      captionRef.current?.stop();
      skipRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
      skipRef.current?.stop();
      skipRef.current = null;
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
      // by the user saying "next question" (or tapping Next).
      skipRequestedRef.current = false;
      skipRef.current = startSkipListener(requestSkip);

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

      skipRef.current?.stop();
      skipRef.current = null;
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
  }, [goToQuestion, endSession, startCapture, questions, mode, feedbackLevel, requestSkip, sleepUnlessSkipped]);

  const startSession = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      activeRef.current = true;
      primeVoices(); // must be called from this user-gesture handler for iOS
      await goToQuestion(0);
    } catch (err) {
      console.error(err);
      setError(
        'Could not access the microphone. Hands-free mode needs mic access - on phones this also requires HTTPS, see README.'
      );
    }
  }, [goToQuestion]);

  const iAmDone = useCallback(() => {
    if (phase === 'listening' || phase === 'stalled' || phase === 'capturing') {
      finishCapture(hasSpokenRef.current ? 'answered' : 'no-answer');
    }
  }, [phase, finishCapture]);

  const repeatQuestion = useCallback(() => {
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

  if (!question && phase === 'off') {
    return (
      <div>
        <p style={styles.status}>No questions available for this session.</p>
        <button onClick={() => onExit(false)} style={styles.backLink}>
          ← Back to Home
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <p style={styles.error}>{error}</p>}

      {phase === 'off' && (
        <div>
          <div style={styles.statusBar}>
            <span>This session</span>
            <span>
              {questions.length} question{questions.length === 1 ? '' : 's'} · ~
              {Math.max(1, Math.round(questions.length * 0.6))} min
            </span>
          </div>

          <div style={styles.overviewCard}>
            <div style={styles.overviewRow}>
              <span style={styles.overviewKey}>DIFFICULTY</span>
              <span style={styles.overviewVal}>
                {MODE_META[mode].icon} {MODE_LABELS[mode]} — {MODE_META[mode].blurb}
              </span>
            </div>
            <div style={{ ...styles.overviewRow, marginBottom: 0 }}>
              <span style={styles.overviewKey}>FEEDBACK</span>
              <span style={styles.overviewVal}>
                {selectedFeedback.label} — {selectedFeedback.blurb.toLowerCase()}
                {'. Say "next question" to skip it.'}
              </span>
            </div>
          </div>

          <div style={styles.questionNum}>QUESTIONS</div>
          <ol style={styles.qList}>
            {questions.map((q, i) => (
              <li
                key={q.id}
                style={{
                  ...styles.qItem,
                  borderBottom: i === questions.length - 1 ? 'none' : '1px solid #ececec',
                }}
              >
                <span style={styles.qId}>Q{q.id}</span>
                <span>{q.question}</span>
              </li>
            ))}
          </ol>

          <p style={styles.overviewHint}>
            Hands-free from here: each question is read aloud, you answer, and it moves on by
            itself once you stop talking.
          </p>

          <button onClick={startSession} style={styles.primaryButton}>
            Start Listening
          </button>
          <button onClick={() => onExit(false)} style={styles.backLink}>
            ← Back to Home
          </button>
        </div>
      )}

      {phase !== 'off' && (
        <div>
          <div style={styles.statusBar}>
            <span>
              Question {index + 1} of {questions.length}
            </span>
            <span>{MODE_LABELS[mode]}</span>
          </div>
          <div style={styles.questionNum}>QUESTION {question.id}</div>
          <h1 style={styles.question}>{question.question}</h1>

          {isListening && (
            <div style={styles.listeningIndicator}>
              <div style={styles.pulseRing}>
                <div
                  style={{
                    ...styles.micIcon,
                    transform: `scale(${1 + Math.min(micLevel * 3, 0.6)})`,
                  }}
                >
                  🎙️
                </div>
              </div>
              <div style={styles.listeningText}>{statusText[phase] || 'Listening…'}</div>
            </div>
          )}

          {!isListening && statusText[phase] && (
            <p style={styles.status}>{statusText[phase]}</p>
          )}

          {isListening && (
            <div style={styles.liveCaption}>
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
            <div style={styles.hintRow}>
              <span style={styles.hint}>
                Tap &ldquo;I&rsquo;m done&rdquo; to stop &middot; or just pause a moment
              </span>
            </div>
          )}

          {phase === 'result' && result && <DiffResult transcript={transcript} result={result} />}

          {phase === 'result' && (
            <button onClick={requestSkip} style={styles.primaryButton}>
              Next question &rarr;
            </button>
          )}

          <div style={styles.buttonRow}>
            {isListening && (
              <button onClick={iAmDone} style={styles.secondaryButton}>
                I&rsquo;m done — check it
              </button>
            )}
            {phase !== 'complete' && (
              <button onClick={repeatQuestion} style={styles.secondaryButton}>
                Repeat Question
              </button>
            )}
            <button onClick={() => endSession()} style={styles.exitButton}>
              Exit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  error: { color: '#c0392b', fontSize: 14, marginBottom: 16 },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#888',
    padding: '12px 0 16px',
  },
  questionNum: { fontSize: 13, color: '#888', letterSpacing: 1, marginBottom: 8 },
  overviewCard: { background: '#faf9f6', borderRadius: 12, padding: 16, margin: '4px 0 20px' },
  overviewRow: { display: 'flex', gap: 12, marginBottom: 10 },
  overviewKey: {
    flex: '0 0 76px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#3d5a80',
    paddingTop: 2,
  },
  overviewVal: { flex: 1, fontSize: 14, lineHeight: 1.5, color: '#2a2a2a' },
  qList: { listStyle: 'none', padding: 0, margin: '4px 0 0' },
  qItem: {
    display: 'flex',
    gap: 10,
    padding: '10px 0',
    fontSize: 15,
    lineHeight: 1.45,
    color: '#2a2a2a',
  },
  qId: {
    flex: '0 0 32px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: '#3d5a80',
    paddingTop: 3,
  },
  overviewHint: { fontSize: 12, color: '#888', lineHeight: 1.5, margin: '18px 0 20px' },
  question: { fontSize: 20, fontWeight: 600, lineHeight: 1.5, marginBottom: 24, color: '#2a2a2a' },
  status: { fontSize: 15, color: '#555', marginBottom: 12 },
  listeningIndicator: { textAlign: 'center', margin: '40px 0' },
  pulseRing: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    border: '3px solid #3d5a80',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'pulse 2s infinite',
  },
  micIcon: { fontSize: 40, transition: 'transform 100ms ease-out' },
  listeningText: { marginTop: 16, fontSize: 14, color: '#3d5a80', fontWeight: 500 },
  liveCaption: {
    marginTop: 24,
    padding: 16,
    background: '#faf9f6',
    borderRadius: 12,
    fontSize: 15,
    lineHeight: 1.6,
    color: '#555',
    minHeight: 60,
    fontStyle: 'italic',
  },
  hintRow: { marginTop: 24, textAlign: 'center' },
  hint: { fontSize: 12, color: '#888' },
  buttonRow: { display: 'flex', gap: 10, marginTop: 16 },
  primaryButton: {
    width: '100%',
    padding: 16,
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 16,
    border: 'none',
    background: '#3d5a80',
    color: '#fff',
    cursor: 'pointer',
    marginTop: 16,
  },
  secondaryButton: {
    flex: 1,
    padding: '14px 12px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 12,
    border: '1px solid #d0cec8',
    background: 'transparent',
    color: '#3d5a80',
    cursor: 'pointer',
  },
  exitButton: {
    flex: 1,
    padding: '14px 12px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 12,
    border: '1px solid #c0392b',
    background: 'transparent',
    color: '#c0392b',
    cursor: 'pointer',
  },
  backLink: {
    width: '100%',
    padding: '12px 0',
    fontSize: 14,
    border: 'none',
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    marginTop: 12,
  },
};
