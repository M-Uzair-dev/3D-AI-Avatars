import { TTS_CONFIG } from '@/lib/ttsConfig.js';
import { parseVoiceId } from '@/lib/voiceId.js';
import { PROVIDER_IMPLS, NotConfiguredError } from '@/lib/tts/providers.js';

export const runtime = 'nodejs';

/**
 * Synthesise one chunk of text.
 *
 * A thin, authenticated proxy in front of whichever provider the selected voice
 * belongs to. It exists for three reasons rather than as ceremony:
 *
 *   1. API keys stay on the server. Calling either provider from the browser
 *      would ship the key to every visitor.
 *   2. It bounds the request — length, timeout — so one call cannot run up a
 *      bill or hang the page.
 *   3. It keeps the client's contract stable. speechEngine.js sends text and
 *      receives { audio, mimeType, phonemes }; what produced them is behind this
 *      seam. A local engine lived here first, then one hosted API, now two —
 *      and nothing on the other side of this boundary has changed once.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (text === '') {
    return Response.json({ error: 'Nothing to say: `text` is required.' }, { status: 400 });
  }
  if (text.length > TTS_CONFIG.maxChars) {
    return Response.json(
      { error: `Text is ${text.length} characters; the limit is ${TTS_CONFIG.maxChars}. Chunk it client-side.` },
      { status: 413 },
    );
  }

  // The provider travels with the voice id, so there is no second setting that
  // can disagree with it about who is speaking. An unprefixed id falls back to
  // the configured default provider, which is what makes a bare
  // OPENAI_TTS_VOICE=nova keep working.
  const parsed = parseVoiceId(body?.voice);
  const providerName = parsed?.provider ?? TTS_CONFIG.defaultProvider;
  const provider = PROVIDER_IMPLS[providerName];

  if (!provider) {
    return Response.json({ error: `Unknown speech provider "${providerName}".` }, { status: 400 });
  }
  if (!provider.configured()) {
    return Response.json(
      {
        error: `No API key configured for ${providerName}, so there is no voice.`,
        hint: providerName === 'elevenlabs'
          ? 'Set ELEVENLABS_API_KEY in frontend/.env.local and restart the dev server.'
          : 'Set OPENAI_API_KEY in frontend/.env.local and restart the dev server.',
        docs: 'docs/15-voice-and-tts.md',
      },
      { status: 503 },
    );
  }

  const rate = clamp(Number(body?.rate) || 1, 0.25, 4);
  // Bounded: a break long enough to read as a fault is worse than none, and an
  // unbounded value reaches the provider's own parser.
  const clausePauseMs = clamp(Number(body?.clausePauseMs) || 0, 0, 2000);

  let result;
  try {
    result = await provider.synthesize(text, {
      voice: parsed?.id ?? null,
      rate,
      clausePauseMs,
      // Bounded here as well as by the caller: an API that never answers would
      // otherwise hold this route open until the platform's own timeout, which
      // is a worse failure than a fast one the client can fall back from.
      signal: AbortSignal.timeout(TTS_CONFIG.timeoutMs),
    });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return Response.json({ error: err.message, docs: 'docs/15-voice-and-tts.md' }, { status: 503 });
    }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return Response.json(
        { error: `Speech synthesis timed out after ${TTS_CONFIG.timeoutMs}ms.` },
        { status: 504 },
      );
    }
    return Response.json(
      {
        error: err.message,
        hint: err.status === 401
          ? 'Check the API key in .env.local, and restart the dev server after changing it.'
          : undefined,
      },
      // 401 is reported as 503 because to the client it means the same thing a
      // missing key does: no voice available, fall back to mouthing.
      { status: err.status === 401 ? 503 : 502 },
    );
  }

  if (result.bytes.byteLength === 0) {
    return Response.json({ error: 'The speech API returned no audio.' }, { status: 502 });
  }

  return Response.json({
    // Base64 rather than a binary body so metadata can travel alongside it. One
    // sentence is tens of kilobytes; the ~33% encoding overhead costs less than
    // a second round trip would.
    audio: Buffer.from(result.bytes).toString('base64'),
    mimeType: result.mimeType,
    provider: providerName,
    /**
     * Always empty, and the client knows what to do about it.
     *
     * This is the standing cost of a hosted synthesiser: it returns audio and
     * nothing about how it was pronounced. A local engine could be asked for
     * the exact phoneme sequence it was about to speak, which drove the mouth
     * off real phonetics. Without it the client infers mouth shapes from
     * spelling and stretches them across the measured duration — so she starts
     * and stops with the voice, and the shapes between are guesses. The field
     * stays in the contract because the fix restores it rather than replacing
     * it. See docs/15-voice-and-tts.md.
     */
    phonemes: [],
  });
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
