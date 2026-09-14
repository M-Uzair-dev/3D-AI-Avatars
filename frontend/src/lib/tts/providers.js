/**
 * The two synthesis providers, behind one shape.
 *
 * Each exports the same pair: `listVoices()` and `synthesize()`. The route
 * dispatches on the provider carried in the voice id and otherwise knows
 * nothing about either API — which is what let Piper be swapped out for a
 * hosted service without touching a line of client code, and what would let a
 * third be added the same way.
 *
 * `synthesize` returns `{ bytes, mimeType }`. Duration is deliberately NOT its
 * job: the browser's decoded buffer is the authority on how long the audio
 * actually is, because that is what will be played, and the mouth is laid out
 * against playback rather than against a file.
 *
 * Server-only — both read API keys from the environment.
 */

import { TTS_CONFIG } from '@/lib/ttsConfig.js';
import { withClausePauses } from '@/lib/chunkText.js';

/** Thrown when the provider has no key, which is a setup state, not a crash. */
export class NotConfiguredError extends Error {}

// ---------------------------------------------------------------- OpenAI

export const openai = {
  configured: () => TTS_CONFIG.openai.apiKey !== null,

  /**
   * A static list — there is no endpoint that enumerates them.
   */
  async listVoices() {
    const { OPENAI_VOICES } = await import('@/lib/ttsConfig.js');
    return OPENAI_VOICES.map((id) => ({ id, name: id }));
  },

  defaultVoice: () => TTS_CONFIG.openai.voice,

  async synthesize(text, { voice, rate = 1, signal }) {
    const cfg = TTS_CONFIG.openai;
    if (!cfg.apiKey) throw new NotConfiguredError('OPENAI_API_KEY is not set.');

    const response = await fetch(`${cfg.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        voice: voice || cfg.voice,
        input: text,
        response_format: 'wav',
        // The API's `speed` means what ours does: a multiplier where 2 is twice
        // as fast. Passing it through rather than resampling afterwards is what
        // keeps the pitch correct.
        speed: clamp(rate, 0.25, 4),
        // Only the gpt-4o-mini-tts family reads this; older models ignore it
        // rather than erroring, so it is safe to send unconditionally.
        ...(cfg.instructions ? { instructions: cfg.instructions } : {}),
      }),
      signal,
    });

    if (!response.ok) throw await apiError(response, 'OpenAI');

    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: 'audio/wav' };
  },
};

// ------------------------------------------------------------ ElevenLabs

export const elevenlabs = {
  configured: () => TTS_CONFIG.elevenlabs.apiKey !== null,

  /**
   * The voices on the account — the library ones that have been added, plus any
   * cloned or designed ones. Unlike OpenAI's fixed set this is genuinely
   * per-account, which is the entire reason this provider is here.
   */
  async listVoices() {
    const cfg = TTS_CONFIG.elevenlabs;
    if (!cfg.apiKey) return [];

    const response = await fetch(`${cfg.baseUrl}/voices`, {
      headers: { 'xi-api-key': cfg.apiKey },
      signal: AbortSignal.timeout(TTS_CONFIG.timeoutMs),
    });
    if (!response.ok) throw await apiError(response, 'ElevenLabs');

    const data = await response.json();
    return (data.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      // `labels` carries the descriptors the voice was published with — accent,
      // age, gender, use case. Passed through rather than invented, which is
      // the whole difference between this and writing blurbs from impression.
      description: describeLabels(v.labels),
      previewUrl: v.preview_url ?? null,
      category: v.category ?? null,
    }));
  },

  defaultVoice: () => TTS_CONFIG.elevenlabs.voice,

  async synthesize(text, { voice, clausePauseMs = 0, signal }) {
    const cfg = TTS_CONFIG.elevenlabs;
    if (!cfg.apiKey) throw new NotConfiguredError('ELEVENLABS_API_KEY is not set.');

    const voiceId = voice || cfg.voice;
    if (!voiceId) {
      throw new NotConfiguredError(
        'No ElevenLabs voice selected, and ELEVENLABS_VOICE is not set.',
      );
    }

    // mp3 rather than pcm: every tier can return it, and the browser decodes it
    // natively. The pcm formats would save a decode step and are gated behind
    // higher plans, which would turn a free-tier audition into a confusing 400.
    const response = await fetch(
      `${cfg.baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': cfg.apiKey,
        },
        body: JSON.stringify({
          // Break tags for the commas. The sentence stays in one request so it
          // keeps its intonation; only the silence inside it is ours. This is
          // ElevenLabs syntax and must never reach a provider that would read
          // it aloud — which is why it is applied here and not in the route.
          text: withClausePauses(text, clausePauseMs),
          model_id: cfg.model,
          voice_settings: {
            stability: cfg.stability,
            similarity_boost: cfg.similarityBoost,
          },
          // NOTE: `rate` is deliberately not sent. Speed control here lives
          // inside voice_settings, is model-dependent and narrowly bounded, and
          // an unsupported field fails the whole request rather than being
          // ignored — which would take the voice down instead of degrading. The
          // mouth stays in sync regardless, because it is laid out against the
          // measured duration of whatever comes back.
        }),
        signal,
      },
    );

    if (!response.ok) throw await apiError(response, 'ElevenLabs');

    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: 'audio/mpeg' };
  },
};

export const PROVIDER_IMPLS = { openai, elevenlabs };

/**
 * Turn a failed response into an error carrying the API's own message.
 *
 * A wrong key, an unknown voice and a spent quota are three completely
 * different fixes, and only the provider's message distinguishes them. Both
 * APIs report errors as JSON but not in the same shape, so both shapes are
 * tried before falling back to the status code.
 */
async function apiError(response, label) {
  const body = await response.json().catch(() => null);
  const message =
    body?.error?.message                      // OpenAI
    ?? body?.detail?.message                  // ElevenLabs
    ?? (typeof body?.detail === 'string' ? body.detail : null)
    ?? `${label} returned ${response.status}.`;

  return Object.assign(new Error(message), { status: response.status });
}

/** "American · young · calm" from the labels a published voice carries. */
function describeLabels(labels) {
  if (!labels || typeof labels !== 'object') return null;
  const parts = ['accent', 'age', 'gender', 'description', 'use_case']
    .map((key) => labels[key])
    .filter((v) => typeof v === 'string' && v.trim() !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
