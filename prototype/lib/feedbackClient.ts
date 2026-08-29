import type { ProseScore } from './scoring';

const FEEDBACK_TIMEOUT_MS = 7000;

/**
 * Hybrid feedback: the deterministic engine has already decided pass/fail and
 * exactly what's missing / extra / out of order / word perfect. This asks the
 * server to phrase those same facts as a natural sentence or two via a Groq
 * LLM, so hands-free mode has something worth reading aloud.
 *
 * Any failure (no API key, network, rate limit, timeout, malformed response)
 * falls back to `score.feedback`, the deterministic template - the caller
 * always gets usable text, and the hands-free loop never stalls waiting.
 */
export async function fetchFeedbackText(
  score: ProseScore,
  reference: string,
  transcript: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEEDBACK_TIMEOUT_MS);

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        mode: score.mode,
        reference,
        transcript,
        passed: score.passed,
        wordPerfect: score.wordPerfect,
        orderCorrect: score.orderCorrect,
        missingKeyWords: score.missingKeyWords,
        extraKeyWords: score.extraKeyWords,
        outOfOrder: score.outOfOrder,
      }),
    });
    if (!res.ok) return score.feedback;

    const data = (await res.json()) as { feedback?: unknown };
    return typeof data.feedback === 'string' && data.feedback.trim()
      ? data.feedback.trim()
      : score.feedback;
  } catch {
    return score.feedback;
  } finally {
    clearTimeout(timer);
  }
}
