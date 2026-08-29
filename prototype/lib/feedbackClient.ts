import type { ProseScore } from './scoring';

/**
 * Hybrid feedback: the deterministic engine has already decided pass/fail and
 * exactly what's missing / extra / out of order. This asks the server to
 * phrase those same facts as a natural sentence or two via a Groq LLM.
 *
 * Any failure (no API key, network, rate limit, malformed response) falls
 * back to `score.feedback`, the deterministic template - the caller always
 * gets usable text.
 */
export async function fetchFeedbackText(
  score: ProseScore,
  reference: string,
  transcript: string
): Promise<string> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: score.mode,
        reference,
        transcript,
        passed: score.passed,
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
  }
}
