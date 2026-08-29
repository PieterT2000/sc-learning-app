'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import seedQuestions from '@/lib/seed.json';
import { wordLevelDiff, type WordDiffResult } from '@/lib/wordDiff';
import { getSupportedMimeType, extensionForMimeType } from '@/lib/audioFormat';
import { transcribeAudio } from '@/lib/transcribeAudio';
import { startLiveCaption, type LiveCaptionHandle, type LiveCaptionStatus } from '@/lib/liveCaption';
import { DiffResult } from './DiffResult';

type Phase = 'idle' | 'recording' | 'transcribing' | 'result';

export function ManualMode() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [diffResult, setDiffResult] = useState<WordDiffResult | null>(null);
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
      setDiffResult(wordLevelDiff(question.answer, text));
      setPhase('result');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('idle');
    }
  }, [question]);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setDiffResult(null);
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
    setDiffResult(null);
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

      {phase === 'result' && diffResult && (
        <div>
          <DiffResult transcript={transcript} diffResult={diffResult} />
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
