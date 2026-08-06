import { describe, it, expect } from 'vitest';
import { DIGRAPHS, LETTERS, DURATION } from './visemeMap.js';
import { VISEMES } from './constants.js';

const isValidEntry = (e) => {
  const visemeOk = e.viseme === null || VISEMES.includes(e.viseme);
  const weightOk = e.weight >= 0 && e.weight <= 1;
  const typeOk = e.type === 'vowel' || e.type === 'consonant';
  return visemeOk && weightOk && typeOk;
};

describe('visemeMap', () => {
  it('maps the five vowels to their matching visemes at full weight', () => {
    expect(LETTERS.a).toMatchObject({ viseme: 'aa', weight: 1, type: 'vowel' });
    expect(LETTERS.e).toMatchObject({ viseme: 'ee', weight: 1, type: 'vowel' });
    expect(LETTERS.i).toMatchObject({ viseme: 'ih', weight: 1, type: 'vowel' });
    expect(LETTERS.o).toMatchObject({ viseme: 'oh', weight: 1, type: 'vowel' });
    expect(LETTERS.u).toMatchObject({ viseme: 'ou', weight: 1, type: 'vowel' });
  });

  it('closes the lips completely on every bilabial', () => {
    for (const letter of ['b', 'p', 'm']) {
      expect(LETTERS[letter].viseme).toBeNull();
      expect(LETTERS[letter].weight).toBe(0);
    }
  });

  it('gives consonants a reduced open shape', () => {
    for (const letter of ['s', 't', 'n', 'l']) {
      expect(LETTERS[letter].type).toBe('consonant');
      expect(LETTERS[letter].weight).toBeGreaterThan(0);
      expect(LETTERS[letter].weight).toBeLessThan(0.6);
    }
  });

  it('covers every letter of the alphabet', () => {
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      expect(LETTERS[c], `missing letter: ${c}`).toBeDefined();
    }
  });

  it('defines the digraphs that English spelling actually needs', () => {
    for (const d of ['th', 'sh', 'ch', 'ng', 'oo', 'ee', 'ou', 'ai', 'qu']) {
      expect(DIGRAPHS[d], `missing digraph: ${d}`).toBeDefined();
    }
  });

  it('every digraph key is exactly two characters', () => {
    for (const key of Object.keys(DIGRAPHS)) {
      expect(key.length, `bad digraph key: ${key}`).toBe(2);
    }
  });

  it('every entry is structurally valid', () => {
    for (const [k, e] of Object.entries({ ...LETTERS, ...DIGRAPHS })) {
      expect(isValidEntry(e), `invalid entry: ${k}`).toBe(true);
    }
  });

  it('orders durations so vowels outlast consonants and sentences outlast words', () => {
    expect(DURATION.vowelMin).toBeGreaterThan(DURATION.consonantMax);
    expect(DURATION.sentence).toBeGreaterThan(DURATION.comma);
    expect(DURATION.comma).toBeGreaterThan(DURATION.word);
  });
});
