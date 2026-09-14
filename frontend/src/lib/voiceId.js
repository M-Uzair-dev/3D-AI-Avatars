/**
 * Voice identity across more than one provider.
 *
 * Two synthesis providers are configured at once on purpose: the only way to
 * settle which voice is right is to hear the same sentence in both, and making
 * that a redeploy rather than a dropdown means it never actually gets done.
 * This project has a standing example of what that costs — the default VRM
 * model is still the one picked by licence rather than by eye, months on,
 * because comparing them was never one click.
 *
 * So a voice is identified by `provider:id` rather than by id alone:
 *
 *   openai:nova
 *   elevenlabs:21m00Tcm4TlvDq8ikWAM
 *
 * The provider travels *with* the choice instead of sitting in a second piece
 * of state. One store key, one menu, and no way for the two to disagree about
 * who is speaking — which is the bug this shape exists to make impossible.
 *
 * Pure — no React, no three.js, no I/O.
 */

export const PROVIDERS = ['openai', 'elevenlabs'];

/**
 * Split a qualified voice id.
 *
 * A bare id with no prefix is returned with `provider: null`, meaning "whatever
 * the server considers default". That is not just leniency for old values: it
 * is how `OPENAI_TTS_VOICE=nova` in an environment file keeps working without
 * anyone having to learn this scheme to set a voice.
 *
 * @param {string|null|undefined} value
 * @returns {{provider: string|null, id: string}|null} null if there is no id
 */
export function parseVoiceId(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;

  const trimmed = value.trim();
  const colon = trimmed.indexOf(':');
  if (colon === -1) return { provider: null, id: trimmed };

  const provider = trimmed.slice(0, colon);
  const id = trimmed.slice(colon + 1);

  // An unknown prefix is far more likely to be part of the id itself than a
  // provider we have never heard of — ElevenLabs ids are opaque strings and
  // nothing stops one containing a colon. Treating it as an id keeps a valid
  // voice working; treating it as a provider would break it silently.
  if (!PROVIDERS.includes(provider) || id === '') return { provider: null, id: trimmed };

  return { provider, id };
}

/**
 * Build a qualified voice id.
 *
 * @param {string} provider
 * @param {string} id
 */
export function formatVoiceId(provider, id) {
  return `${provider}:${id}`;
}
