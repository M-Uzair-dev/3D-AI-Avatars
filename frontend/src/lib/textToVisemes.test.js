import { describe, it, expect } from 'vitest';
import { textToVisemes } from './textToVisemes.js';
import { DURATION } from './visemeMap.js';

// Deterministic rng: always the midpoint of any min..max range.
const mid = () => 0.5;
const total = (tl) => tl.reduce((sum, s) => sum + s.dur, 0);

describe('textToVisemes', () => {
  it('returns an empty timeline for empty or whitespace input', () => {
    expect(textToVisemes('', { rng: mid })).toEqual([]);
    expect(textToVisemes('   ', { rng: mid })).toEqual([]);
    expect(textToVisemes('\n\t', { rng: mid })).toEqual([]);
  });

  it('produces a contiguous timeline starting at zero', () => {
    const tl = textToVisemes('hello there, friend.', { rng: mid });
    expect(tl.length).toBeGreaterThan(0);
    expect(tl[0].start).toBe(0);
    for (let i = 1; i < tl.length; i++) {
      expect(tl[i].start).toBe(tl[i - 1].start + tl[i - 1].dur);
    }
  });

  it('uses integer timings so contiguity is exact', () => {
    const tl = textToVisemes('testing one two three', { rate: 0.77, rng: mid });
    for (const s of tl) {
      expect(Number.isInteger(s.start)).toBe(true);
      expect(Number.isInteger(s.dur)).toBe(true);
    }
  });

  it('matches digraphs before single letters', () => {
    // "the" must be [th][e], not [t][h][e].
    const tl = textToVisemes('the', { rng: mid });
    expect(tl).toHaveLength(2);
    expect(tl[0]).toMatchObject({ viseme: 'ih', weight: 0.3 });
    expect(tl[1]).toMatchObject({ viseme: 'ee', weight: 1 });
  });

  it('closes the lips on bilabials', () => {
    const tl = textToVisemes('mob', { rng: mid });
    const closedSegments = tl.filter((s) => s.viseme === null);
    // m and b both close; o does not.
    expect(closedSegments).toHaveLength(2);
    expect(tl[0].viseme).toBeNull();
    expect(tl[1].viseme).toBe('oh');
    expect(tl[2].viseme).toBeNull();
  });

  it('inserts a closed pause of the right length at a word boundary', () => {
    const tl = textToVisemes('a a', { rng: mid });
    expect(tl).toHaveLength(3);
    expect(tl[1]).toMatchObject({ viseme: null, dur: DURATION.word });
  });

  it('inserts longer pauses for commas than for spaces', () => {
    const tl = textToVisemes('a, a', { rng: mid });
    const pause = tl.find((s) => s.dur === DURATION.comma);
    expect(pause).toBeDefined();
    expect(pause.viseme).toBeNull();
  });

  it('inserts the longest pause at a sentence end', () => {
    const tl = textToVisemes('a. a', { rng: mid });
    const pause = tl.find((s) => s.dur === DURATION.sentence);
    expect(pause).toBeDefined();
    expect(pause.viseme).toBeNull();
  });

  it('does not emit a duplicate pause for punctuation followed by a space', () => {
    const withSpace = textToVisemes('a. a', { rng: mid });
    const pauses = withSpace.filter((s) => s.viseme === null);
    // Exactly one pause between the two vowels, not a sentence pause AND a word pause.
    expect(pauses).toHaveLength(1);
  });

  it('gives vowels longer durations than consonants', () => {
    const tl = textToVisemes('at', { rng: mid });
    expect(tl[0].dur).toBeGreaterThan(tl[1].dur);
  });

  it('scales total duration by the rate multiplier', () => {
    const base = total(textToVisemes('the quick brown fox', { rate: 1, rng: mid }));
    const fast = total(textToVisemes('the quick brown fox', { rate: 2, rng: mid }));
    const slow = total(textToVisemes('the quick brown fox', { rate: 0.5, rng: mid }));
    // Rounding makes this approximate, not exact.
    expect(fast).toBeCloseTo(base / 2, -1);
    expect(slow).toBeCloseTo(base * 2, -1);
  });

  it('is case insensitive', () => {
    const lower = textToVisemes('hello', { rng: mid });
    const upper = textToVisemes('HELLO', { rng: mid });
    expect(upper).toEqual(lower);
  });

  it('skips unknown characters without throwing', () => {
    expect(() => textToVisemes('a€b¥c', { rng: mid })).not.toThrow();
    const tl = textToVisemes('a€b¥c', { rng: mid });
    expect(tl.length).toBeGreaterThan(0);
  });

  it('handles digits without throwing', () => {
    expect(() => textToVisemes('room 101', { rng: mid })).not.toThrow();
  });

  it('never emits a zero or negative duration', () => {
    const tl = textToVisemes('the quick brown fox, jumped! over 7 dogs.', { rng: mid });
    for (const s of tl) {
      expect(s.dur).toBeGreaterThan(0);
    }
  });
});
