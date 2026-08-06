import { describe, it, expect } from 'vitest';
import { zeroWeights, sampleTimeline, dampWeights } from './visemePlayback.js';
import { textToVisemes } from './textToVisemes.js';

const mid = () => 0.5;
const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);

describe('zeroWeights', () => {
  it('returns every viseme at zero', () => {
    expect(zeroWeights()).toEqual({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
  });

  it('returns a fresh object each call', () => {
    const a = zeroWeights();
    a.aa = 1;
    expect(zeroWeights().aa).toBe(0);
  });
});

describe('sampleTimeline', () => {
  const timeline = [
    { viseme: 'aa', weight: 1, start: 0, dur: 100 },
    { viseme: null, weight: 0, start: 100, dur: 50 },
    { viseme: 'oh', weight: 0.5, start: 150, dur: 100 },
  ];

  it('returns the active segment weight', () => {
    expect(sampleTimeline(timeline, 50).aa).toBe(1);
    expect(sampleTimeline(timeline, 200).oh).toBe(0.5);
  });

  it('zeroes every other viseme while one is active', () => {
    const w = sampleTimeline(timeline, 50);
    expect(w.oh).toBe(0);
    expect(w.ih).toBe(0);
    expect(sum(w)).toBe(1);
  });

  it('returns all zeros during a CLOSED segment', () => {
    expect(sum(sampleTimeline(timeline, 120))).toBe(0);
  });

  it('returns all zeros before the timeline starts', () => {
    expect(sum(sampleTimeline(timeline, -10))).toBe(0);
  });

  it('returns all zeros after the timeline ends', () => {
    expect(sum(sampleTimeline(timeline, 9999))).toBe(0);
  });

  it('returns all zeros for an empty timeline', () => {
    expect(sum(sampleTimeline([], 0))).toBe(0);
  });

  it('treats segment boundaries as start-inclusive and end-exclusive', () => {
    expect(sampleTimeline(timeline, 0).aa).toBe(1);
    expect(sampleTimeline(timeline, 100).aa).toBe(0);
  });

  it('never throws anywhere across a real generated timeline', () => {
    const tl = textToVisemes('the quick brown fox, jumped!', { rng: mid });
    const end = tl[tl.length - 1].start + tl[tl.length - 1].dur;
    for (let t = -50; t < end + 50; t += 7) {
      expect(() => sampleTimeline(tl, t)).not.toThrow();
    }
  });
});

describe('dampWeights', () => {
  it('moves current toward target without overshooting', () => {
    const out = dampWeights(zeroWeights(), { ...zeroWeights(), aa: 1 }, 1 / 60, 18);
    expect(out.aa).toBeGreaterThan(0);
    expect(out.aa).toBeLessThan(1);
  });

  it('converges to the target given enough time', () => {
    let w = zeroWeights();
    const target = { ...zeroWeights(), aa: 1 };
    for (let i = 0; i < 300; i++) w = dampWeights(w, target, 1 / 60, 18);
    expect(w.aa).toBeCloseTo(1, 3);
  });

  it('decays back to zero when the target is zero', () => {
    let w = { ...zeroWeights(), aa: 1 };
    for (let i = 0; i < 300; i++) w = dampWeights(w, zeroWeights(), 1 / 60, 18);
    expect(w.aa).toBeCloseTo(0, 3);
  });

  it('is frame-rate independent', () => {
    const target = { ...zeroWeights(), aa: 1 };
    // One 16ms step versus two 8ms steps must land in the same place.
    const oneBig = dampWeights(zeroWeights(), target, 0.016, 18);
    let twoSmall = zeroWeights();
    twoSmall = dampWeights(twoSmall, target, 0.008, 18);
    twoSmall = dampWeights(twoSmall, target, 0.008, 18);
    expect(oneBig.aa).toBeCloseTo(twoSmall.aa, 6);
  });

  it('reaches the target faster at higher stiffness', () => {
    const target = { ...zeroWeights(), aa: 1 };
    const soft = dampWeights(zeroWeights(), target, 1 / 60, 5);
    const hard = dampWeights(zeroWeights(), target, 1 / 60, 40);
    expect(hard.aa).toBeGreaterThan(soft.aa);
  });

  it('does not mutate its inputs', () => {
    const current = zeroWeights();
    const target = { ...zeroWeights(), aa: 1 };
    dampWeights(current, target, 1 / 60, 18);
    expect(current.aa).toBe(0);
    expect(target.aa).toBe(1);
  });

  it('survives a zero dt without producing NaN', () => {
    const out = dampWeights(zeroWeights(), { ...zeroWeights(), aa: 1 }, 0, 18);
    expect(Number.isNaN(out.aa)).toBe(false);
    expect(out.aa).toBe(0);
  });
});
