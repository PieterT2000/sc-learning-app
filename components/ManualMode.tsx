'use client';

import { useCallback, useRef, useState } from 'react';
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

const primaryButton =
  'w-full cursor-pointer rounded-[10px] border-0 bg-[#1a1a2e] px-6 py-4 text-base font-semibold text-white';
const secondaryButton =
  'flex-1 cursor-pointer rounded-[10px] border border-[#ccc] bg-transparent px-6 py-4 text-base font-semibold text-[#1a1a2e]';

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
      <p className="mb-1.5 text-[13px] tracking-[0.4px] text-muted">
        Question {index + 1} of {seedQuestions.length}
      </p>

      <div className="mb-[18px] mt-2.5 flex gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={phase === 'recording' || phase === 'transcribing'}
            className={`flex-1 cursor-pointer rounded-lg border bg-transparent py-2 text-[13px] font-semibold ${
              m.id === mode
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-[#ccc] text-[#555]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <h1 className="mb-7 text-[21px] leading-[1.4]">{question.question}</h1>

      {error && <p className="mb-4 text-sm text-diff-bad">{error}</p>}

      {phase === 'idle' && (
        <button onClick={startRecording} className={primaryButton}>
          Start Recording
        </button>
      )}

      {phase === 'recording' && (
        <div>
          <button
            onClick={stopRecording}
            className="w-full cursor-pointer rounded-[10px] border-0 bg-diff-bad px-6 py-4 text-base font-semibold text-white"
          >
            Stop Recording
          </button>
          <div className="mt-4 min-h-[24px] rounded-xl bg-card p-4 text-[15px] italic leading-relaxed text-[#555]">
            {captionStatus === 'unsupported'
              ? 'Live captions aren’t supported in this browser (try Chrome).'
              : captionStatus === 'error'
                ? 'Live captions hit an error — check the browser console for details.'
                : liveCaption
                  ? `"${liveCaption}…"`
                  : 'Listening for captions…'}
          </div>
        </div>
      )}

      {phase === 'transcribing' && <p className="text-[15px] text-[#555]">Transcribing…</p>}

      {phase === 'result' && result && (
        <div>
          <DiffResult transcript={transcript} result={result} />
          <div className="mt-6 flex gap-3">
            <button onClick={retry} className={secondaryButton}>
              Retry
            </button>
            {index < seedQuestions.length - 1 && (
              <button onClick={nextQuestion} className={primaryButton}>
                Next Question
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
