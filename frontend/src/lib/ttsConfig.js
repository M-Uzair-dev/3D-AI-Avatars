/**
 * Speech synthesis configuration.
 *
 * Two providers can be configured at once, and both appear in the same voice
 * menu. That is deliberate: the only way to settle which voice is right is to
 * hear the same sentence in both, and if switching means editing env and
 * restarting, the comparison never gets made.
 *
 * Synthesis is a hosted API call rather than a local process, which is a
 * deployment constraint rather than a preference: the host application runs on
 * Vercel, and a serverless function cannot execute a native binary. A local
 * engine was built first and removed for exactly that reason — see
 * docs/15-voice-and-tts.md.
 *
 * Server-only: this reads process.env, so it must never be imported from a
 * client component. The API keys are why /api/tts exists as a server boundary
 * at all — a key that reaches a browser bundle is a public key.
 */

export const TTS_CONFIG = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? null,
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',

    /**
     * gpt-4o-mini-tts is the one that follows `instructions`. The older tts-1
     * and tts-1-hd ignore that field rather than erroring, so switching to them
     * costs tone control and nothing else.
     */
    model: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    voice: process.env.OPENAI_TTS_VOICE ?? 'nova',

    /**
     * Delivery direction, in plain language.
     *
     * Written against this project's register rather than left empty: she is a
     * companion, meant to read as warm and unhurried, and every other number in
     * the system is tuned that way — the settled weight, the 1800ms pose
     * transitions, the slow blink. A voice delivering the same words briskly is
     * a different character than the body saying them.
     */
    instructions: process.env.OPENAI_TTS_INSTRUCTIONS
      ?? 'Warm, calm and unhurried. Speak as a thoughtful companion rather than an announcer: '
       + 'natural pacing, gentle emphasis, no hard sell.',
  },

  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? null,
    baseUrl: process.env.ELEVENLABS_BASE_URL ?? 'https://api.elevenlabs.io/v1',

    /**
     * Flash rather than Multilingual v2, and it wins on both axes that matter
     * here: half the credit cost, and markedly lower latency. Latency is what
     * the whole chunking design exists to protect, so the cheaper model is also
     * the better one for a conversational avatar. Multilingual v2 is for
     * narration, where waiting is free.
     */
    model: process.env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5',

    /**
     * Default voice id. Unlike OpenAI's, these are opaque strings rather than
     * names, so there is no sensible built-in default — left null, which makes
     * the first voice on the account the default.
     */
    voice: process.env.ELEVENLABS_VOICE ?? null,

    /**
     * Voice settings. The defaults are the API's own middle ground; they are
     * exposed because they are judged by ear, which is the same reason the
     * lighting rig is live-tunable rather than hardcoded.
     */
    stability: numberOr(process.env.ELEVENLABS_STABILITY, 0.5),
    similarityBoost: numberOr(process.env.ELEVENLABS_SIMILARITY, 0.75),
  },

  /**
   * Which provider handles a voice whose id carries no prefix — an env-set
   * voice name, or a value stored before the prefix scheme existed.
   */
  defaultProvider: process.env.TTS_PROVIDER
    ?? (process.env.OPENAI_API_KEY ? 'openai' : 'elevenlabs'),

  /**
   * Hard ceiling on one synthesis call. A stalled request must not hold the
   * route open until the platform's own timeout; the client falls back to
   * silent mouthing well before a user would wait this long anyway.
   */
  timeoutMs: Number(process.env.TTS_TIMEOUT_MS ?? 20000),

  /**
   * Ceiling on the text one request may carry. The client chunks to ~240
   * characters, so anything approaching this is either a bug or a way to run up
   * a bill with a single request.
   */
  maxChars: Number(process.env.TTS_MAX_CHARS ?? 1000),
};

/**
 * The OpenAI voices.
 *
 * Hardcoded because there is no endpoint that lists them, which makes this a
 * snapshot rather than an authority — so nothing depends on it being complete.
 * A name the API does not recognise is rejected by the API with a clear
 * message, and this list only ever renders labels.
 *
 * Worth knowing: **these are the only ones.** OpenAI has no voice cloning and
 * no custom voices, which is the reason ElevenLabs is wired up beside it.
 */
export const OPENAI_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo',
  'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
];

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
