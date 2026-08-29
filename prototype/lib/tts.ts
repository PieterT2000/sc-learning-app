export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
}

/**
 * Some browsers (notably Chrome) load the voice list asynchronously on first
 * use. Call this once, from the same user-gesture handler that starts the
 * hands-free session, to warm the cache before the first `speak()` call.
 *
 * iOS Safari note: speechSynthesis.speak() must be triggered from (or very
 * shortly after) a user gesture the first time on a page, or it silently
 * no-ops. The "Start Hands-Free Session" button tap satisfies this for the
 * rest of the session - every subsequent speak() call in this same flow is
 * triggered by the app itself (not a fresh user gesture), which is fine
 * because it's a continuation of the same permitted session.
 */
export function primeVoices(): void {
  if (!isSpeechSynthesisSupported()) return;
  cachedVoice = pickVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickVoice();
  };
}

/**
 * Speaks text aloud, resolving once speech finishes. Resolves immediately
 * (without throwing) if speech synthesis isn't supported at all, so callers
 * can proceed - hands-free mode still works, just silently, since the
 * question is always shown on screen too.
 */
export function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve();

  return new Promise((resolve) => {
    window.speechSynthesis.cancel(); // clear any stuck/queued utterance first

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = opts.rate ?? 0.95;
    const voice = cachedVoice ?? pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // never let a TTS glitch hang the loop

    window.speechSynthesis.speak(utterance);
  });
}
