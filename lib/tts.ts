/**
 * Text-to-speech for the hands-free loop.
 *
 * Primary path: POST the text to `/api/tts`, which renders it with Microsoft
 * Azure AI Speech (a smooth en-GB neural voice) and returns an MP3 we play
 * through a single reused <audio> element.
 *
 * Fallback path: the browser's built-in `speechSynthesis`. Used automatically
 * whenever the server route is unconfigured (HTTP 501), errors, or the audio
 * fails to play (e.g. an iOS autoplay block). Callers don't need to know which
 * path ran - `speak()` resolves when the utterance finishes either way, and
 * resolves silently if neither path can produce sound (the question is always
 * on screen too).
 */

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// --- Web Speech fallback ------------------------------------------------

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    voices[0]
  );
}

function speakWithWebSpeech(text: string, rate: number): Promise<void> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve();

  return new Promise((resolve) => {
    window.speechSynthesis.cancel(); // clear any stuck/queued utterance first

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    const voice = cachedVoice ?? pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // never let a TTS glitch hang the loop

    window.speechSynthesis.speak(utterance);
  });
}

// --- Azure server path ------------------------------------------------

// Once the route reports it's unconfigured (501) there's no point asking again
// this session - go straight to the browser voice.
let serverTtsDisabled = false;

// One <audio> element, reused for every utterance. Reusing a single element
// that was first played from a user gesture keeps iOS Safari happy for the
// rest of the session (see primeVoices).
let sharedAudio: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

// Small LRU of rendered clips, keyed by rate + text. Phrases like the
// "I didn't catch that" retry line and repeated questions across sessions
// then cost nothing after the first render.
const audioCache = new Map<string, string>(); // key -> object URL
const AUDIO_CACHE_MAX = 40;

function cacheKey(text: string, rate: number): string {
  return `${rate.toFixed(2)}|${text}`;
}

async function fetchServerAudioUrl(text: string, rate: number): Promise<string | null> {
  if (serverTtsDisabled || typeof window === 'undefined') return null;

  const key = cacheKey(text, rate);
  const cached = audioCache.get(key);
  if (cached) {
    audioCache.delete(key);
    audioCache.set(key, cached); // bump to most-recently-used
    return cached;
  }

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rate }),
    });

    if (res.status === 501) {
      serverTtsDisabled = true; // not configured - stop trying
      return null;
    }
    if (!res.ok) return null; // transient upstream error - retry next call

    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return null;

    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
    audioCache.set(key, url);
    if (audioCache.size > AUDIO_CACHE_MAX) {
      const oldest = audioCache.keys().next().value as string | undefined;
      if (oldest !== undefined) {
        const stale = audioCache.get(oldest);
        if (stale) URL.revokeObjectURL(stale);
        audioCache.delete(oldest);
      }
    }
    return url;
  } catch {
    return null;
  }
}

function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const audio = getSharedAudio();
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.src = url;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => finish(false));
    } catch {
      finish(false);
    }
  });
}

/**
 * A ~50ms silent WAV, built at call time. Playing this from the start-session
 * user gesture "unlocks" the shared <audio> element so later app-initiated
 * playback isn't blocked by iOS Safari's autoplay policy.
 */
function silentWavUrl(): string {
  const numSamples = 400; // 8kHz, 8-bit mono -> 0.05s
  const buf = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128); // 8-bit silence
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function primeAudioUnlock(): void {
  if (typeof window === 'undefined' || sharedAudio) return;
  try {
    const audio = new Audio();
    audio.src = silentWavUrl();
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    sharedAudio = audio;
  } catch {
    /* non-fatal - falls back to a fresh element / Web Speech */
  }
}

// --- public API ------------------------------------------------

/**
 * Warm both TTS paths from a user-gesture handler (the "Start" button), once
 * per session:
 *  - unlocks the shared <audio> element for iOS autoplay, and
 *  - primes the Web Speech voice list (Chrome loads it asynchronously).
 *
 * Every later `speak()` call in the same flow is app-initiated rather than a
 * fresh gesture, which both paths tolerate as a continuation of the session.
 */
export function primeVoices(): void {
  primeAudioUnlock();
  if (!isSpeechSynthesisSupported()) return;
  cachedVoice = pickVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickVoice();
  };
}

/**
 * Speaks text aloud, resolving once speech finishes. Tries the Azure route
 * first, then the browser voice. Resolves immediately (without throwing) if
 * nothing can produce sound.
 */
export async function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  const rate = opts.rate ?? 0.95;
  const trimmed = text?.trim();
  if (!trimmed) return;

  if (typeof window !== 'undefined' && !serverTtsDisabled) {
    const url = await fetchServerAudioUrl(trimmed, rate);
    if (url && (await playUrl(url))) return;
    // no url, or playback was blocked/failed -> fall through
  }

  return speakWithWebSpeech(trimmed, rate);
}
