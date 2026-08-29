import { NextRequest, NextResponse } from 'next/server';

// Node runtime for parity with /api/transcribe and reliable fetch of a binary
// response body. The logic doesn't depend on the runtime - swap to `edge`
// later if the cold-start latency matters.
export const runtime = 'nodejs';

// Microsoft Azure AI Speech. The F0 (free) tier covers 500,000 characters per
// month of neural TTS, with no expiry - far more than a single learner needs
// (the whole catechism is ~45k characters). en-GB-SoniaNeural is Microsoft's
// flagship smooth British voice; en-GB-RyanNeural is the male equivalent.
const DEFAULT_VOICE = 'en-GB-SoniaNeural';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
// Azure rejects very long SSML; the app never sends anything near this.
const MAX_TEXT_LEN = 3000;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Percentage points added to every utterance's <prosody rate>. Azure's neural
// voices default a touch slow for this use; +18 reads briskly without sounding
// rushed. Override with AZURE_SPEECH_RATE_BOOST (e.g. 0 for verbatim, 30 for fast).
const DEFAULT_RATE_BOOST = 18;

/**
 * The client speaks in Web Speech `rate` units (a multiplier, 1 = normal
 * speed). Azure's <prosody rate> wants a relative percentage. Map, clamp, then
 * add the configured boost: rate 0.9 with boost 18 -> "+8%".
 */
function ratePercent(rate: unknown): string {
  const r = typeof rate === 'number' && Number.isFinite(rate) ? rate : 0.95;
  const clamped = Math.min(1.5, Math.max(0.5, r));
  const parsedBoost = Number.parseInt(process.env.AZURE_SPEECH_RATE_BOOST ?? '', 10);
  const boost = Number.isFinite(parsedBoost) ? parsedBoost : DEFAULT_RATE_BOOST;
  const pct = Math.round((clamped - 1) * 100) + boost;
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/**
 * Work out the TTS endpoint from whatever the user pasted:
 *  - AZURE_SPEECH_REGION=uksouth            -> https://uksouth.tts.speech.microsoft.com/...
 *  - AZURE_SPEECH_ENDPOINT=https://foo.cognitiveservices.azure.com/  (Foundry/custom
 *    subdomain) -> used as-is with the /cognitiveservices/v1 path appended
 *  - AZURE_SPEECH_ENDPOINT=https://uksouth.api.cognitive.microsoft.com/  -> region
 *    extracted from the host, mapped to the tts.speech.microsoft.com host
 */
function resolveTtsUrl(region?: string, endpoint?: string): string | null {
  if (region && /^[a-z0-9-]+$/i.test(region)) {
    return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }
  if (endpoint) {
    try {
      const u = new URL(endpoint);
      const regionalHost = u.hostname.match(/^([a-z0-9-]+)\.(?:api\.cognitive\.microsoft\.com|tts\.speech\.microsoft\.com|cognitiveservices\.azure\.com)$/i);
      if (regionalHost && !u.hostname.endsWith('cognitiveservices.azure.com')) {
        return `https://${regionalHost[1]}.tts.speech.microsoft.com/cognitiveservices/v1`;
      }
      // Custom subdomain (…cognitiveservices.azure.com) - call it directly.
      return `${u.origin}/cognitiveservices/v1`;
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT;
  const voice = process.env.AZURE_SPEECH_VOICE || DEFAULT_VOICE;
  const ttsUrl = resolveTtsUrl(region, endpoint);

  // Not configured -> 501 tells the client to use the browser's built-in
  // speech synthesis instead. The app stays fully usable with no Azure account.
  if (!key || !ttsUrl) {
    return NextResponse.json(
      {
        error:
          'Azure Speech is not configured (set AZURE_SPEECH_KEY and either AZURE_SPEECH_REGION or AZURE_SPEECH_ENDPOINT).',
      },
      { status: 501 }
    );
  }

  let text = '';
  let rate: unknown;
  try {
    const body = await req.json();
    text = typeof body?.text === 'string' ? body.text.trim() : '';
    rate = body?.rate;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'No text provided.' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN);

  // Derive the SSML language tag from the voice id (e.g. "en-GB-SoniaNeural").
  const lang = voice.match(/^[a-z]{2}-[A-Z]{2}/)?.[0] ?? 'en-GB';

  const ssml =
    `<speak version="1.0" xml:lang="${lang}">` +
    `<voice xml:lang="${lang}" name="${voice}">` +
    `<prosody rate="${ratePercent(rate)}">${xmlEscape(text)}</prosody>` +
    `</voice></speak>`;

  try {
    const azureRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
        'User-Agent': 'catechism-voice-prototype',
      },
      body: ssml,
    });

    if (!azureRes.ok) {
      const errText = await azureRes.text().catch(() => '');
      console.error('Azure TTS error:', azureRes.status, errText);
      // 502: upstream failed. Client falls back to browser speech for this call.
      return NextResponse.json({ error: `Azure TTS error (${azureRes.status}).` }, { status: 502 });
    }

    const audio = await azureRes.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('TTS route failed:', err);
    return NextResponse.json({ error: 'TTS failed. See server logs.' }, { status: 500 });
  }
}
