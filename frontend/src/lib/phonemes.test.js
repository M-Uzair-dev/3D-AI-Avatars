import { describe, it, expect } from 'vitest';
import { parseIpa, phonemesToTimeline, IPA_VISEMES } from '@/lib/phonemes.js';
import { VISEMES } from '@/lib/constants.js';

describe('parseIpa', () => {
  it('is empty for empty input', () => {
    expect(parseIpa('')).toEqual([]);
    expect(parseIpa('   ')).toEqual([]);
    expect(parseIpa(null)).toEqual([]);
  });

  it('splits a word on the underscores espeak puts between phonemes', () => {
    // "hello" as espeak-ng --ipa=3 renders it
    const phonemes = parseIpa('h_ə_l_əʊ');
    expect(phonemes.map((p) => p.viseme)).toEqual(['aa', 'ee', 'ih', 'oh']);
  });

  it('strips stress marks, which change prosody and not mouth shape', () => {
    expect(parseIpa('h_ə_l_ˈəʊ')).toEqual(parseIpa('h_ə_l_əʊ'));
    expect(parseIpa('ˌm_ˈɪ')).toEqual(parseIpa('m_ɪ'));
  });

  it('puts a gap between words but not before the first', () => {
    const one = parseIpa('m_ɪ');
    const two = parseIpa('m_ɪ m_ɪ');
    expect(two).toHaveLength(one.length * 2 + 1);
    expect(two[one.length].viseme).toBeNull();
  });

  // Longest-match-first. Getting this wrong reads 'aɪ' as 'a' then drops 'ɪ',
  // which silently flattens every diphthong in the language.
  it('matches a diphthong before the bare vowel that starts it', () => {
    const [diphthong] = parseIpa('aɪ');
    expect(diphthong.viseme).toBe('aa');
    expect(diphthong.units).toBe(IPA_VISEMES['aɪ'].units);
    expect(diphthong.units).toBeGreaterThan(IPA_VISEMES['a'].units);
  });

  it('matches a long vowel before its short form', () => {
    const [long] = parseIpa('iː');
    expect(long.units).toBe(IPA_VISEMES['iː'].units);
    expect(long.units).toBeGreaterThan(IPA_VISEMES['i'].units);
  });

  // espeak does not always separate every symbol, so a token may hold more than
  // one phoneme. Assuming one phoneme per token drops the rest of the token.
  it('consumes several symbols from one token when espeak ties them', () => {
    expect(parseIpa('mɪ').map((p) => p.viseme)).toEqual([null, 'ih']);
  });

  it('skips symbols it has no shape for rather than throwing', () => {
    expect(() => parseIpa('m_¤_ɪ')).not.toThrow();
    expect(parseIpa('m_¤_ɪ').map((p) => p.viseme)).toEqual([null, 'ih']);
  });

  // The load-bearing cue in the whole pipeline. Without visible closure on the
  // bilabials the mouth reads as a fish rather than as speech.
  it('closes the lips on every bilabial', () => {
    for (const symbol of ['p', 'b', 'm']) {
      const [phoneme] = parseIpa(symbol);
      expect(phoneme.viseme).toBeNull();
      expect(phoneme.weight).toBe(0);
    }
  });

  it('only ever names visemes the model actually has', () => {
    for (const entry of Object.values(IPA_VISEMES)) {
      if (entry.viseme !== null) expect(VISEMES).toContain(entry.viseme);
    }
  });

  it('holds vowels longer than consonants', () => {
    expect(IPA_VISEMES['ɑ'].units).toBeGreaterThan(IPA_VISEMES['t'].units);
    expect(IPA_VISEMES['iː'].units).toBeGreaterThan(IPA_VISEMES['s'].units);
  });

  it('gives consonants partial weight and vowels full weight', () => {
    expect(IPA_VISEMES['ɑ'].weight).toBe(1);
    expect(IPA_VISEMES['t'].weight).toBeGreaterThan(0);
    expect(IPA_VISEMES['t'].weight).toBeLessThan(1);
  });
});

describe('phonemesToTimeline', () => {
  const phonemes = parseIpa('h_ə_l_əʊ w_ɜː_l_d');

  it('is empty for degenerate input', () => {
    expect(phonemesToTimeline([], 1000)).toEqual([]);
    expect(phonemesToTimeline(phonemes, 0)).toEqual([]);
    expect(phonemesToTimeline(phonemes, -5)).toEqual([]);
    expect(phonemesToTimeline(null, 1000)).toEqual([]);
  });

  // The invariant textToVisemes already guarantees, restated here because the
  // frame loop's sampler assumes it: a gap between segments is a frame with a
  // closed mouth in the middle of a word.
  it('is contiguous with no drift', () => {
    const timeline = phonemesToTimeline(phonemes, 1234);
    for (let i = 1; i < timeline.length; i += 1) {
      expect(timeline[i].start).toBe(timeline[i - 1].start + timeline[i - 1].dur);
    }
  });

  it('ends exactly on the measured audio duration', () => {
    for (const totalMs of [137, 1000, 1234, 9999]) {
      const timeline = phonemesToTimeline(phonemes, totalMs);
      const last = timeline[timeline.length - 1];
      expect(last.start + last.dur).toBe(totalMs);
    }
  });

  it('offsets a later chunk without changing its length', () => {
    const first = phonemesToTimeline(phonemes, 1000);
    const second = phonemesToTimeline(phonemes, 1000, 5000);

    expect(second[0].start).toBe(5000);
    const last = second[second.length - 1];
    expect(last.start + last.dur).toBe(6000);
    expect(second).toHaveLength(first.length);
  });

  it('starts at zero when no offset is given', () => {
    expect(phonemesToTimeline(phonemes, 1000)[0].start).toBe(0);
  });

  it('gives a held vowel more time than a passing consonant', () => {
    const timeline = phonemesToTimeline(parseIpa('t_ɑː'), 1000);
    expect(timeline[1].dur).toBeGreaterThan(timeline[0].dur);
  });

  it('emits no zero-length segments even when the audio is very short', () => {
    for (const seg of phonemesToTimeline(phonemes, 20)) {
      expect(seg.dur).toBeGreaterThan(0);
    }
  });

  it('carries the viseme and weight through unchanged', () => {
    const timeline = phonemesToTimeline(parseIpa('m_ɑː'), 1000);
    expect(timeline[0].viseme).toBeNull();
    expect(timeline[1].viseme).toBe('aa');
    expect(timeline[1].weight).toBe(1);
  });
});
