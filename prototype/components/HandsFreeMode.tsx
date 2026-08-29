'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { scoreAnswer, type ScoreResult } from '@/lib/scoring';
import { fetchFeedbackText } from '@/lib/feedbackClient';
import { getSupportedMimeType, extensionForMimeType } from '@/lib/audioFormat';
import { transcribeAudio } from '@/lib/transcribeAudio';
import { speak, primeVoices } from '@/lib/tts';
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
  questions,
  onExit,
}: {
  mode: StudyMode;
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

  const activeRef = useRef(false); // false once the session has been torn down
  const currentIndexRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const listenStartRef = useRef(0);
  const silenceStartRef = useRef<number | null>(null);
  const captureFinishedRef = useRef(false); // guards against double-firing finishCapture

  const question = questions[index];

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

      // Hybrid feedback for easy/medium: show the deterministic template now,
      // swap in the LLM-phrased version once it lands (never blocks the loop).
      if (scored.mode !== 'hard') {
        void fetchFeedbackText(scored, q.answer, text).then((fb) => {
          if (activeRef.current) {
            setResult((cur) => (cur && cur.mode !== 'hard' ? { ...cur, feedback: fb } : cur));
          }
        });
      }

      const spoken =
        scored.mode === 'hard'
          ? `${scored.scorePercent} percent.`
          : scored.passed
            ? scored.mode === 'easy'
              ? 'That’s the key ideas.'
              : 'Key ideas, in order. Nicely done.'
            : 'You missed part of the idea — have a look at the notes on screen.';
      await speak(spoken);
      if (!activeRef.current) return;

      const pause = scored.mode === 'hard' ? CFG.resultPauseMs : CFG.proseResultPauseMs;
      await new Promise((resolve) => setTimeout(resolve, pause));
      if (!activeRef.current) return;

      if (currentIndexRef.current < questions.length - 1) {
        await goToQuestion(currentIndexRef.current + 1);
      } else {
        setPhase('complete');
        recordSessionComplete();
        await speak("That's this session's questions done. Nicely done.");
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
  }, [goToQuestion, endSession, startCapture, questions, mode]);

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
          <p style={styles.eyebrow}>{MODE_LABELS[mode]}</p>
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
          <p style={styles.eyebrow}>
            Question {index + 1} of {questions.length} · {MODE_LABELS[mode]}
          </p>
          <h1 style={styles.question}>{question.question}</h1>

          {statusText[phase] && <p style={styles.status}>{statusText[phase]}</p>}

          {(phase === 'listening' || phase === 'capturing' || phase === 'stalled') && (
            <div style={styles.meterTrack}>
              <div style={{ ...styles.meterFill, width: `${Math.min(micLevel * 400, 100)}%` }} />
            </div>
          )}

          {(phase === 'listening' || phase === 'capturing' || phase === 'stalled') && (
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

          {phase === 'result' && result && <DiffResult transcript={transcript} result={result} />}

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {(phase === 'listening' || phase === 'capturing' || phase === 'stalled') && (
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
  eyebrow: { fontSize: 13, color: '#888', marginBottom: 6 },
  question: { fontSize: 21, lineHeight: 1.4, marginBottom: 20 },
  status: { fontSize: 15, color: '#555', marginBottom: 12 },
  meterTrack: { height: 8, background: '#e5e5e5', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  meterFill: { height: '100%', background: '#1a1a2e', transition: 'width 80ms linear' },
  liveCaption: {
    marginTop: 16,
    padding: 16,
    background: '#faf9f6',
    borderRadius: 12,
    fontSize: 15,
    lineHeight: 1.6,
    color: '#555',
    minHeight: 24,
    fontStyle: 'italic',
  },
  primaryButton: {
    width: '100%',
    padding: '16px 24px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    background: '#1a1a2e',
    color: 'white',
    cursor: 'pointer',
  },
  secondaryButton: {
    flex: 1,
    padding: '14px 12px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 10,
    border: '1px solid #ccc',
    background: 'transparent',
    color: '#1a1a2e',
    cursor: 'pointer',
  },
  exitButton: {
    flex: 1,
    padding: '14px 12px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 10,
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
