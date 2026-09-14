import { TTS_CONFIG } from '@/lib/ttsConfig.js';
import { formatVoiceId } from '@/lib/voiceId.js';
import { PROVIDER_IMPLS } from '@/lib/tts/providers.js';

export const runtime = 'nodejs';

/**
 * Every voice available, from every configured provider, in one list.
 *
 * One list rather than a provider switch plus a voice list, because the
 * decision being made here is "which voice" and not "which vendor" — and a
 * comparison that needs two controls to make is a comparison nobody makes. The
 * qualified ids carry the provider along so the client never has to track it.
 *
 * A provider with no key contributes nothing and is not an error: running with
 * only one configured is the normal case.
 */
export async function GET() {
  const entries = await Promise.all(
    Object.entries(PROVIDER_IMPLS).map(async ([name, provider]) => {
      if (!provider.configured()) return { name, configured: false, voices: [], error: null };

      try {
        const voices = await provider.listVoices();
        return {
          name,
          configured: true,
          error: null,
          voices: voices.map((v) => ({ ...v, id: formatVoiceId(name, v.id), provider: name })),
        };
      } catch (err) {
        // A provider that is configured but unreachable is worth reporting
        // rather than hiding: "no voices" and "your key is wrong" look
        // identical in a picker otherwise.
        return { name, configured: true, error: err.message, voices: [] };
      }
    }),
  );

  const providers = Object.fromEntries(
    entries.map(({ name, configured, error }) => [name, { configured, error }]),
  );

  const defaultProvider = TTS_CONFIG.defaultProvider;
  const defaultVoice = PROVIDER_IMPLS[defaultProvider]?.defaultVoice() ?? null;

  return Response.json({
    voices: entries.flatMap((e) => e.voices),
    providers,
    // What an unset `voiceId` resolves to, so the menu can name it rather than
    // showing a bare "Default" nobody can act on.
    current: defaultVoice ? formatVoiceId(defaultProvider, defaultVoice) : null,
    currentName: defaultVoice,
    defaultProvider,
    // True when at least one provider can actually speak.
    configured: entries.some((e) => e.configured),
  });
}
