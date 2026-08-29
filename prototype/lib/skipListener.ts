/**
 * Listens for the user saying "next question" (or "skip" / "move on") while
 * the app is reading a result aloud in hands-free mode, so they can cut it
 * short without touching the phone.
 *
 * Same on-device SpeechRecognition API as lib/liveCaption.ts, with the same
 * caveats: Chrome/Android solid, iOS Safari patchy, Firefox unsupported. If
 * it can't start, `startSkipListener` returns null and the spoken result
 * simply plays to the end (the on-screen "Next" button still works).
 *
 * It only runs during the result playback - never while the user is actually
 * answering - so it isn't competing with the live-caption recogniser.
 */
export interface SkipListenerHandle {
  stop: () => void;
}

const SKIP_PHRASES = ['next question', 'next one', 'move on', 'skip', 'next'];

export function startSkipListener(onSkip: () => void): SkipListenerHandle | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let stoppedByUs = false;
  let fired = false;

  const stop = () => {
    stoppedByUs = true;
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
  };

  recognition.onresult = (event) => {
    if (fired) return;
    let heard = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      heard += event.results[i][0].transcript + ' ';
    }
    const normalised = heard.toLowerCase().replace(/[^a-z\s]/g, ' ');
    if (SKIP_PHRASES.some((phrase) => normalised.includes(phrase))) {
      fired = true;
      stop();
      onSkip();
    }
  };

  recognition.onerror = (event) => {
    const code = (event as unknown as { error?: string }).error;
    // 'no-speech' / 'aborted' are expected and noisy; only log the rest.
    if (code !== 'no-speech' && code !== 'aborted') {
      console.warn('Skip listener (SpeechRecognition) error:', code ?? event);
    }
  };

  recognition.onend = () => {
    if (!stoppedByUs && !fired) {
      try {
        recognition.start();
      } catch {
        /* unrecoverable - result just plays to the end */
      }
    }
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return { stop };
}
