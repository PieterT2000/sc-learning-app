import { NextRequest, NextResponse } from 'next/server';

// Using the Node.js runtime (not Edge) for this prototype: it has the most
// reliable FormData/Blob handling across environments. Swap to `edge` later
// if you want the lower cold-start latency the design doc calls for -
// the logic below doesn't depend on the runtime.
export const runtime = 'nodejs';

const ARCHAIC_PROMPT =
  'Westminster Shorter Catechism. Archaic English: thou shalt, doth, maketh, ' +
  'continueth, applieth, effectual calling, sanctification, justification, ' +
  'imputed, pardoneth, accepteth, requireth, communicateth, teacheth, thine, ' +
  'therein, thereof, whereby, wherein, unto.';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  try {
    const incoming = await req.formData();
    const audio = incoming.get('audio');

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
    }

    // Important for cross-browser support: iOS Safari's MediaRecorder emits
    // audio/mp4 (sometimes audio/aac), not audio/webm;codecs=opus like
    // Chrome/Firefox. We don't assume a container here - we forward whatever
    // Blob the client captured, using its own type/filename. Groq's
    // Whisper endpoint accepts common containers (webm, mp4, m4a, ogg, wav, mp3).
    const filename = (audio as File).name || 'audio.webm';

    const forwardForm = new FormData();
    forwardForm.append('file', audio, filename);
    forwardForm.append('model', 'whisper-large-v3');
    forwardForm.append('prompt', ARCHAIC_PROMPT);
    forwardForm.append('response_format', 'json');
    forwardForm.append('language', 'en');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: forwardForm,
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errText);
      return NextResponse.json(
        { error: `Groq API error (${groqRes.status}): ${errText}` },
        { status: groqRes.status }
      );
    }

    const data = await groqRes.json();
    return NextResponse.json({ transcript: data.text ?? '' });
  } catch (err) {
    console.error('Transcription route failed:', err);
    return NextResponse.json({ error: 'Transcription failed. See server logs.' }, { status: 500 });
  }
}
