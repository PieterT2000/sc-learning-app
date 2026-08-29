export interface LiveCaptionHandle {
  stop: () => void;
}

export function isLiveCaptionSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export type LiveCaptionStatus = 'unsupported' | 'active' | 'error';

/**
 * Live, on-device captions shown WHILE the user is talking - purely a UI
 * nicety (matches the wireframe's live-transcript box). This is completely
 * separate from the transcript actually used for scoring: that one comes
 * from Groq's Whisper large-v3 (lib/transcribeAudio.ts), chosen specifically
 * for its accuracy on archaic vocabulary. The browser's built-in
 * SpeechRecognition here is often noticeably worse on words like
 * "sanctification" or "effectual calling" - fine for a live caption nobody
 * re-reads closely, not fine as the actual scoring source.
 *
 * Browser support caveat: SpeechRecognition doesn't accept a MediaStream
 * parameter in the standard API - it manages its own mic access internally,
 * separate from the getUserMedia stream MediaRecorder is using. Running both
 * at once works in the browsers this was built against, but hasn't been
 * verified across every iOS Safari version, and Safari's implementation is
 * known to be less reliable than Chrome's generally. Firefox doesn't support
 * this API at all as of this writing.
 *
 * onStatus reports what happened so the caller can show *something* instead
 * of a permanently blank box - a fully silent failure here looks identical
 * to "nothing being said" and is impossible to debug from the UI alone.
 */
export function startLiveCaption(
  onUpdate: (text: string) => void,
  onStatus?: (status: LiveCaptionStatus) => void
): LiveCaptionHandle | null {
  if (!isLiveCaptionSupported()) {
    onStatus?.('unsupported');
    return null;
  }

  const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    onStatus?.('unsupported');
    return null;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let finalText = '';
  let stoppedByUs = false;
  let reportedActive = false;

  recognition.onresult = (event) => {
    if (!reportedActive) {
      reportedActive = true;
      onStatus?.('active');
    }
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += piece + ' ';
      else interim += piece;
    }
    onUpdate((finalText + interim).trim());
  };

  recognition.onerror = (event) => {
    // Log the actual reason - this is exactly the kind of failure that's
    // otherwise silent and impossible to diagnose from the UI. Common
    // values: 'not-allowed' (mic permission/gesture issue), 'no-speech',
    // 'network', 'service-not-allowed', 'audio-capture'.
    const errorCode = (event as unknown as { error?: string }).error;
    console.error('Live caption (SpeechRecognition) error:', errorCode ?? event);
    onStatus?.('error');
  };

  recognition.onend = () => {
    // Some browsers stop recognition after a pause even with continuous=true.
    if (!stoppedByUs) {
      try {
        recognition.start();
      } catch (err) {
        console.error('Live caption failed to restart:', err);
        /* unrecoverable - caption box just stops updating */
      }
    }
  };

  try {
    recognition.start();
  } catch (err) {
    console.error('Live caption failed to start:', err);
    onStatus?.('error');
    return null;
  }

  return {
    stop: () => {
      stoppedByUs = true;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
