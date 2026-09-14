import { describe, it, expect } from 'vitest';
import { parseVoiceId, formatVoiceId, PROVIDERS } from '@/lib/voiceId.js';

describe('parseVoiceId', () => {
  it('is null for nothing', () => {
    expect(parseVoiceId(null)).toBeNull();
    expect(parseVoiceId(undefined)).toBeNull();
    expect(parseVoiceId('')).toBeNull();
    expect(parseVoiceId('   ')).toBeNull();
    expect(parseVoiceId(42)).toBeNull();
  });

  it('splits a qualified id', () => {
    expect(parseVoiceId('openai:nova')).toEqual({ provider: 'openai', id: 'nova' });
    expect(parseVoiceId('elevenlabs:21m00Tcm4TlvDq8ikWAM'))
      .toEqual({ provider: 'elevenlabs', id: '21m00Tcm4TlvDq8ikWAM' });
  });

  // A bare id is how an env-set voice name reaches this — nobody setting
  // OPENAI_TTS_VOICE=nova should have to learn the prefix scheme.
  it('treats a bare id as belonging to no particular provider', () => {
    expect(parseVoiceId('nova')).toEqual({ provider: null, id: 'nova' });
  });

  // An unknown prefix is far likelier to be part of an opaque provider id than
  // a provider nobody has heard of. Guessing "provider" there would silently
  // break a working voice; guessing "id" keeps it working.
  it('keeps an unknown prefix as part of the id', () => {
    expect(parseVoiceId('azure:en-GB-Sonia')).toEqual({ provider: null, id: 'azure:en-GB-Sonia' });
    expect(parseVoiceId('abc:def:ghi')).toEqual({ provider: null, id: 'abc:def:ghi' });
  });

  it('does not treat a provider name with an empty id as qualified', () => {
    expect(parseVoiceId('openai:')).toEqual({ provider: null, id: 'openai:' });
  });

  it('keeps colons that belong to the id itself', () => {
    expect(parseVoiceId('elevenlabs:aa:bb')).toEqual({ provider: 'elevenlabs', id: 'aa:bb' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseVoiceId('  openai:nova  ')).toEqual({ provider: 'openai', id: 'nova' });
  });
});

describe('formatVoiceId', () => {
  it('round-trips through parseVoiceId for every provider', () => {
    for (const provider of PROVIDERS) {
      const id = 'some-voice-id';
      expect(parseVoiceId(formatVoiceId(provider, id))).toEqual({ provider, id });
    }
  });

  it('round-trips an id containing a colon', () => {
    const round = parseVoiceId(formatVoiceId('elevenlabs', 'weird:id'));
    expect(round).toEqual({ provider: 'elevenlabs', id: 'weird:id' });
  });
});
