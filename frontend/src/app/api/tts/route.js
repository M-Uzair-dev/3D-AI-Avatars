import { TTS_CONFIG } from '@/lib/ttsConfig.js';
import { parseVoiceId, formatVoiceId } from '@/lib/voiceId.js';
import { voiceFallbackFor } from '@/lib/constants.js';
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

  const options = {
    rate,
    clausePauseMs,
    // Bounded here as well as by the caller: an API that never answers would
    // otherwise hold this route open until the platform's own timeout, which
    // is a worse failure than a fast one the client can fall back from.
    //
    // ONE signal for both attempts, deliberately: it bounds the route rather
    // than each call, so a retry cannot double how long the client waits. It
    // cannot have fired before the retry either — a fallback only happens
    // after a real HTTP status came back.
    signal: AbortSignal.timeout(TTS_CONFIG.timeoutMs),
  };

  let result;
  let spokenProvider = providerName;
  let spokenVoice = parsed ? formatVoiceId(providerName, parsed.id) : null;
  let fellBackFrom = null;

  try {
    result = await provider.synthesize(text, { ...options, voice: parsed?.id ?? null });
  } catch (err) {
    // ------------------------------------------------------------------
    // One retry, on the model's premade voice.
    //
    // Three characters speak in Voice Library voices, which depend on the
    // account's plan and on the voice still being published; the other five
    // use premade voices, which work on any plan. When a Library voice goes
    // away the symptom is a mute avatar, and it has happened here before:
    // every one of the three returned `402 paid_plan_required` on the free
    // plan while appearing perfectly normal in /v1/voices.
    //
    // NARROW ON PURPOSE. Only statuses that mean *this voice is not available
    // to you* retry. A bad key, a spent quota and a timeout are not fixed by
    // a different voice, and retrying them would double the latency of every
    // real failure before reporting the same thing.
    // ------------------------------------------------------------------
    // Looked up on the re-formatted id rather than the raw request value, so
    // stray whitespace around a voice id cannot cost a character its spare.
    const fallbackId = isVoiceUnavailable(err) ? voiceFallbackFor(spokenVoice) : null;
    const fallback = fallbackId ? parseVoiceId(fallbackId) : null;
    const fallbackProviderName = fallback?.provider ?? TTS_CONFIG.defaultProvider;
    const fallbackProvider = PROVIDER_IMPLS[fallbackProviderName];

    if (!fallback || !fallbackProvider?.configured()) return errorResponse(err);

    try {
      result = await fallbackProvider.synthesize(text, { ...options, voice: fallback.id });
      fellBackFrom = spokenVoice;
      spokenProvider = fallbackProviderName;
      spokenVoice = formatVoiceId(fallbackProviderName, fallback.id);
      console.warn(
        `[tts] ${spokenVoice} substituted for ${fellBackFrom}: ${err.message}`,
      );
    } catch {
      // The ORIGINAL error, not the fallback's. The first one says why the
      // chosen voice is unavailable, which is the fix; the second only says
      // that the spare did not save it.
      return errorResponse(err);
    }
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
    provider: spokenProvider,
    // Who actually spoke, and who was asked for. Equal on the ordinary path;
    // `fallbackFrom` is non-null only when a Library voice was unavailable and
    // the premade spare answered instead. Surfaced rather than logged because
    // this is a degradation that sounds fine — a different woman says the
    // sentence perfectly — and a silent substitution is one nobody ever fixes.
    voice: spokenVoice,
    fallbackFrom: fellBackFrom,
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

/**
 * Does this error mean *that voice is not available to you*?
 *
 * The three statuses each provider uses to say so, and nothing wider. 402 is
 * ElevenLabs' `paid_plan_required` — the one that has actually happened here.
 * 404 and 400 cover `voice_not_found`, which is what a voice withdrawn from the
 * Library looks like.
 *
 * A key problem (401), a spent quota (429) and a timeout are deliberately absent:
 * a different voice does not fix any of them, and retrying would double the
 * latency of every real failure before reporting the same thing.
 */
function isVoiceUnavailable(err) {
  return err?.status === 402 || err?.status === 404 || err?.status === 400;
}

/** A provider failure, as the response the client knows how to degrade from. */
function errorResponse(err) {
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

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
