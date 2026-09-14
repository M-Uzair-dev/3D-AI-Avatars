import { describe, it, expect } from 'vitest';
import {
  BLINK_PHASES,
  DOUBLE_BLINK_CHANCE,
  SACCADE_BLINK_CHANCE,
  SACCADE_BLINK_MIN_RAD,
  blinkSpanMs,
  blinkEnvelope,
  blinkCount,
  saccadeTriggersBlink,
} from '@/lib/blink.js';

describe('blinkEnvelope', () => {
  it('closes faster than it opens', () => {
    // The whole point of replacing the symmetric sine. A real eyelid snaps shut
    // and drifts back open; the reverse reads as a slow, sleepy blink.
    expect(BLINK_PHASES.closeMs).toBeLessThan(BLINK_PHASES.openMs);

    // Measured off the curve rather than off the constants, so the assertion
    // survives a change of easing: how long the lid takes to get halfway shut,
    // against how long it takes to get halfway back open.
    const holdEnd = BLINK_PHASES.closeMs + BLINK_PHASES.holdMs;
    const halfClosing = firstTime(0, holdEnd, (v) => v >= 0.5);
    const halfOpening = firstTime(holdEnd, blinkSpanMs(1), (v) => v <= 0.5) - holdEnd;
    expect(halfClosing).toBeLessThan(halfOpening);
  });

  it('is fully closed through the hold phase', () => {
    const { closeMs, holdMs } = BLINK_PHASES;
    expect(blinkEnvelope(closeMs)).toBeCloseTo(1, 3);
    expect(blinkEnvelope(closeMs + holdMs / 2)).toBeCloseTo(1, 3);
    expect(blinkEnvelope(closeMs + holdMs)).toBeCloseTo(1, 3);
  });

  it('is open at the start and at the end of the span', () => {
    expect(blinkEnvelope(0)).toBeCloseTo(0, 3);
    expect(blinkEnvelope(blinkSpanMs(1))).toBeCloseTo(0, 3);
  });

  it('is open outside the span', () => {
    expect(blinkEnvelope(-10)).toBe(0);
    expect(blinkEnvelope(blinkSpanMs(1) + 500)).toBe(0);
  });

  it('never leaves the 0..1 range', () => {
    for (let t = -50; t <= blinkSpanMs(2) + 50; t += 1) {
      const v = blinkEnvelope(t, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('reopens fully between the two halves of a double blink', () => {
    // A double blink that never reopens is one long blink. The seam is the
    // whole behaviour.
    expect(blinkEnvelope(blinkSpanMs(1), 2)).toBeCloseTo(0, 3);
    expect(blinkEnvelope(blinkSpanMs(1) + BLINK_PHASES.closeMs, 2)).toBeCloseTo(1, 3);
  });

  it('spans exactly twice as long for a double blink', () => {
    expect(blinkSpanMs(2)).toBe(blinkSpanMs(1) * 2);
  });
});

describe('blinkCount', () => {
  it('doubles when the draw falls under the chance, and not when it is over', () => {
    // Bounded from both sides: a constant 1 passes any "is it ever double?"
    // check that only looks one way.
    expect(blinkCount(() => DOUBLE_BLINK_CHANCE / 2)).toBe(2);
    expect(blinkCount(() => DOUBLE_BLINK_CHANCE + 0.01)).toBe(1);
  });

  it('keeps doubles rare', () => {
    expect(DOUBLE_BLINK_CHANCE).toBeGreaterThan(0);
    expect(DOUBLE_BLINK_CHANCE).toBeLessThanOrEqual(0.25);
  });
});

describe('saccadeTriggersBlink', () => {
  const big = { yaw: 0.2, pitch: 0.1 };
  const near = { yaw: 0.01, pitch: 0 };
  const origin = { yaw: 0, pitch: 0 };

  it('fires on a large gaze shift when the draw passes', () => {
    expect(saccadeTriggersBlink(origin, big, () => 0)).toBe(true);
  });

  it('does not fire on a small gaze shift, however the draw falls', () => {
    // The magnitude gate is what stops every idle wander dragging a blink with
    // it, which would read as a twitch rather than as coupling.
    expect(saccadeTriggersBlink(origin, near, () => 0)).toBe(false);
  });

  it('does not fire when the draw fails, so not every big shift blinks', () => {
    expect(saccadeTriggersBlink(origin, big, () => SACCADE_BLINK_CHANCE + 0.01)).toBe(false);
  });

  it('measures the distance travelled, not the distance from centre', () => {
    // Two far-apart points both far from origin still count as a big move.
    const a = { yaw: -0.2, pitch: 0 };
    const b = { yaw: 0.2, pitch: 0 };
    expect(saccadeTriggersBlink(a, b, () => 0)).toBe(true);
    // ...and two near-identical points do not, wherever they sit.
    expect(saccadeTriggersBlink(a, { yaw: -0.205, pitch: 0 }, () => 0)).toBe(false);
  });

  it('uses a threshold larger than an ordinary wander and smaller than an avert', () => {
    // Guards the gate from both sides against a retune of gazeAmount (0.06):
    // a wander lands inside +/-0.06, an avert at 1.6-2.8x that.
    expect(SACCADE_BLINK_MIN_RAD).toBeGreaterThan(0.06);
    expect(SACCADE_BLINK_MIN_RAD).toBeLessThan(0.06 * 1.6);
  });
});

/** First time in [from, to] at which the envelope satisfies `pred`. */
function firstTime(from, to, pred) {
  for (let t = from; t <= to; t += 0.5) {
    if (pred(blinkEnvelope(t))) return t;
  }
  return Infinity;
}
