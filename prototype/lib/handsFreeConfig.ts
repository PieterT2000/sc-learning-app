/**
 * Silence-detection thresholds for hands-free mode.
 *
 * The design doc names two thresholds - "5s stall, 10s stop" - but doesn't
 * spell out exactly what triggers each or how "done answering" gets
 * detected. Here's the interpretation this prototype uses; treat all of
 * these numbers as untested guesses to tune once you're on a real phone
 * in a real (probably noisy) room:
 *
 * - stallMs: if the user hasn't started speaking at all this long after we
 *   start listening, show a gentle "still there?" nudge, but keep listening.
 * - hardStopNoSpeechMs: if the user still hasn't said anything by this
 *   point, give up and treat it as "no answer" (repeats the question).
 * - trailingSilenceMs: once the user HAS started speaking, this much
 *   continuous silence is treated as "they've finished their answer" and
 *   triggers transcription. This is the one most likely to need retuning -
 *   too short cuts people off mid-sentence, too long feels laggy.
 * - maxRecordingMs: hard failsafe regardless of the above, in case VAD
 *   never detects silence (e.g. noisy room, someone rehearsing at length).
 * - speechRmsThreshold: the RMS amplitude (0..1) above which we consider
 *   the user to be "speaking" rather than silent/background noise. Ambient
 *   noise floor varies a lot by device and room - this is the first value
 *   to adjust if hands-free mode either never detects speech, or never
 *   detects silence.
 */
export const HANDS_FREE_CONFIG = {
  speechRmsThreshold: 0.02,
  stallMs: 5000,
  hardStopNoSpeechMs: 10000,
  trailingSilenceMs: 1500,
  maxRecordingMs: 20000,
  resultPauseMs: 3000,
};
