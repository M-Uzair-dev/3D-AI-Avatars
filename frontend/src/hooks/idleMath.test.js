import { describe, it, expect } from 'vitest';
import { driftDeltas, breathDelta } from '@/lib/idleMath.js';

describe('driftDeltas', () => {
  it('stays within the requested amplitude on every axis', () => {
    for (let t = 0; t < 200; t += 0.37) {
      const d = driftDeltas(t, 0.05, 0.35);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });

  it('produces different values on different axes, so motion is not a rigid tilt', () => {
    const d = driftDeltas(3.3, 0.05, 0.35);
    expect(d.x).not.toBeCloseTo(d.y, 4);
  });

  it('is deterministic for a given time', () => {
    expect(driftDeltas(7, 0.05, 0.35)).toEqual(driftDeltas(7, 0.05, 0.35));
  });

  it('returns zeros at zero amplitude', () => {
    expect(driftDeltas(5, 0, 0.35)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('breathDelta', () => {
  it('oscillates within amplitude on x only', () => {
    for (let t = 0; t < 60; t += 0.21) {
      const d = breathDelta(t, 0.02, 0.25);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(0.02 + 1e-9);
      expect(d.y).toBe(0);
      expect(d.z).toBe(0);
    }
  });

  it('actually varies over time', () => {
    // NOTE: deviates from the brief's literal t=2 sample. At rate=0.25, t=2 is
    // exactly half a breath cycle (sin argument = pi), which returns to ~0 —
    // the same value as t=0 — by mathematical coincidence, not by a bug in
    // breathDelta. t=1 (a quarter cycle, sin argument = pi/2) is the peak and
    // is unambiguously different from t=0, which is what this test intends to
    // check.
    const a = breathDelta(0, 0.02, 0.25).x;
    const b = breathDelta(1, 0.02, 0.25).x;
    expect(a).not.toBeCloseTo(b, 4);
  });
});
