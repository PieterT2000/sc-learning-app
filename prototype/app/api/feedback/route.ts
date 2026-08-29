import { NextRequest, NextResponse } from 'next/server';
import { FEEDBACK_MODEL } from '@/lib/scoringConfig';

// Node runtime to match /api/transcribe - same reasoning (reliable fetch +
// FormData, and the design doc's Edge migration can happen later for both).
export const runtime = 'nodejs';

const SYSTEM_PROMPT =
  'You give a learner brief, warm feedback on their spoken recitation of a ' +
  'Westminster Shorter Catechism answer. The verdict (pass / not yet) and the ' +
  'lists of missing, extra, and out-of-order words have ALREADY been decided by ' +
  'an exact checker and are authoritative: never contradict them, never re-grade, ' +
  'never state a percentage or score. Do not add theological commentary or ' +
  'explain doctrine. In 1-2 plain sentences, tell them how what they said lines ' +
  'up with the answer and what to fix. If they recited it word for word, lead ' +
  'by telling them it was word perfect. If they got every key idea in the right ' +
  'order, give them credit for the order too. Address them as "you". Write plain ' +
  'prose only - no markdown, bold, bullet points, or headings. This will be read ' +
  'aloud, so no lists or symbols.';

/**
 * Phrases the deterministic easy/medium result as natural feedback.
 * Every failure path returns 200 with `{ feedback: null }` so the client
 * falls back to its own template rather than surfacing an error.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ feedback: null });

  try {
    const body = await req.json();
    const {
      mode,
      reference,
      transcript,
      passed,
      wordPerfect,
      orderCorrect,
      missingKeyWords = [],
      extraKeyWords = [],
      outOfOrder,
    } = body ?? {};

    if ((mode !== 'easy' && mode !== 'medium') || !reference || typeof transcript !== 'string') {
      return NextResponse.json({ feedback: null });
    }

    const rubric =
      mode === 'easy'
        ? 'Easy mode: only checks that every key idea word is present. Word order and small connecting words do not matter.'
        : 'Medium mode: checks that every key idea word is present AND in the same order as the answer. Small connecting words do not matter.';

    const facts = [
      rubric,
      `Canonical answer: "${reference}"`,
      `What the learner said: "${transcript || '(nothing was captured)'}"`,
      `Verdict already decided: ${passed ? 'PASS' : 'NOT YET'}.`,
      wordPerfect ? 'They recited it word for word, exactly as written.' : null,
      !wordPerfect && missingKeyWords.length
        ? `Key words they did not say: ${missingKeyWords.join(', ')}.`
        : !wordPerfect
          ? 'They said every key word.'
          : null,
      !wordPerfect && extraKeyWords.length
        ? `Words they added that are not in the answer: ${extraKeyWords.join(', ')}.`
        : null,
      !wordPerfect && mode === 'medium'
        ? outOfOrder
          ? 'Their key words came in a different order from the answer.'
          : 'Their key words were in the right order.'
        : null,
      !wordPerfect && mode === 'easy' && orderCorrect
        ? 'They also had the key words in the answer’s order (Easy mode does not require this).'
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: FEEDBACK_MODEL,
        temperature: 0.3,
        // gpt-oss models spend "reasoning" tokens before the reply; keep that
        // minimal (we've already done the thinking) and leave generous room
        // for the answer so it never truncates mid-sentence.
        reasoning_effort: 'low',
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: facts },
        ],
      }),
    });

    if (!groqRes.ok) {
      console.error('Feedback LLM error:', groqRes.status, await groqRes.text());
      return NextResponse.json({ feedback: null });
    }

    const data = await groqRes.json();
    const feedback: string | null = data?.choices?.[0]?.message?.content?.trim() || null;
    return NextResponse.json({ feedback });
  } catch (err) {
    console.error('Feedback route failed:', err);
    return NextResponse.json({ feedback: null });
  }
}
