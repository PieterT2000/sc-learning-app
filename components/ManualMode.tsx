'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import seedQuestions from '@/lib/seed.json';
import { scoreAnswer, type ScoreResult, type Mode } from '@/lib/scoring';
import { fetchFeedbackText } from '@/lib/feedbackClient';
import { getSupportedMimeType, extensionForMimeType } from '@/lib/audioFormat';
import { transcribeAudio } from '@/lib/transcribeAudio';
import { startLiveCaption, type LiveCaptionHandle, type LiveCaptionStatus } from '@/lib/liveCaption';
import { DiffResult } from './DiffResult';

type Phase = 'idle' | 'recording' | 'transcribing' | 'result';

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

export function ManualMode() {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('hard');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [liveCaption, setLiveCaption] = useState('');
  const [captionStatus, setCaptionStatus] = useState<LiveCaptionStatus | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef('');
  const captionRef = useRef<LiveCaptionHandle | null>(null);

  const question = seedQuestions[index];

  const handleRecordingComplete = useCallback(async () => {
    captionRef.current?.stop();
    captionRef.current = null;
    try {
      const mimeType = mimeTypeRef.current || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = extensionForMimeType(mimeType);

      const text = await transcribeAudio(blob, `answer.${ext}`);
      setTranscript(text);
      const scored = scoreAnswer(mode, question.answer, text);
      setResult(scored);
      setPhase('result');

      // Hybrid feedback for easy/medium: template shows immediately, the
      // LLM-phrased version swaps in when it lands.
      if (scored.mode !== 'hard') {
        void fetchFeedbackText(scored, question.answer, text).then((fb) => {
          setResult((cur) => (cur && cur.mode !== 'hard' ? { ...cur, feedback: fb } : cur));
        });
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('idle');
    }
  }, [question, mode]);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setResult(null);
    setLiveCaption('');
    setCaptionStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase('transcribing');
        void handleRecordingComplete();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setPhase('recording');
      // Live caption is purely a display nicety - the real scoring transcript
      // still comes from Groq via handleRecordingComplete above.
      captionRef.current = startLiveCaption(
        (text) => setLiveCaption(text),
        (status) => setCaptionStatus(status)
      );
    } catch (err) {
      console.error(err);
      setError('Could not access the microphone. On iOS this requires HTTPS (or localhost) - see README.');
    }
  }, [handleRecordingComplete]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const retry = () => {
    setPhase('idle');
    setTranscript('');
    setResult(null);
    setError(null);
  };

  const nextQuestion = () => {
    setIndex((i) => Math.min(i + 1, seedQuestions.length - 1));
    retry();
  };

  return (
    <div>
      <p style={styles.eyebrow}>
        Question {index + 1} of {seedQuestions.length}
      </p>

      <div style={styles.modeRow}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={phase === 'recording' || phase === 'transcribing'}
            style={{ ...styles.modeBtn, ...(m.id === mode ? styles.modeBtnActive : {}) }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <h1 style={styles.question}>{question.question}</h1>

      {error && <p style={styles.error}>{error}</p>}

      {phase === 'idle' && (
        <button onClick={startRecording} style={styles.primaryButton}>
          Start Recording
        </button>
      )}

      {phase === 'recording' && (
        <div>
          <button onClick={stopRecording} style={{ ...styles.primaryButton, background: '#c0392b' }}>
            Stop Recording
          </button>
          <div style={styles.liveCaption}>
            {captionStatus === 'unsupported'
              ? 'Live captions aren\u2019t supported in this browser (try Chrome).'
              : captionStatus === 'error'
                ? 'Live captions hit an error \u2014 check the browser console for details.'
                : liveCaption
                  ? `"${liveCaption}\u2026"`
                  : 'Listening for captions\u2026'}
          </div>
        </div>
      )}

      {phase === 'transcribing' && <p style={styles.status}>Transcribing…</p>}

      {phase === 'result' && result && (
        <div>
          <DiffResult transcript={transcript} result={result} />
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={retry} style={styles.secondaryButton}>
              Retry
            </button>
            {index < seedQuestions.length - 1 && (
              <button onClick={nextQuestion} style={styles.primaryButton}>
                Next Question
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  eyebrow: { fontSize: 13, color: '#888', marginBottom: 6, letterSpacing: 0.4 },
  modeRow: { display: 'flex', gap: 6, margin: '10px 0 18px' },
  modeBtn: {
    flex: 1,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: '1px solid #ccc',
    background: 'transparent',
    color: '#555',
    cursor: 'pointer',
  },
  modeBtnActive: { borderColor: '#3d5a80', background: '#f0f4f8', color: '#3d5a80' },
  question: { fontSize: 21, lineHeight: 1.4, marginBottom: 28 },
  error: { color: '#c0392b', fontSize: 14, marginBottom: 16 },
  status: { fontSize: 15, color: '#555' },
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
    padding: '16px 24px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 10,
    border: '1px solid #ccc',
    background: 'transparent',
    color: '#1a1a2e',
    cursor: 'pointer',
  },
};
