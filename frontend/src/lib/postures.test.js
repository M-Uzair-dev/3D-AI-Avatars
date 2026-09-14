import { describe, it, expect } from 'vitest';
import { STATE_OVERLAYS, STATE_POSES, CONVERSATION_STATES } from './postures.js';

/**
 * `hips` is the ROOT of the VRM humanoid skeleton, so a rotation there carries
 * the legs with it. That is the one thing a state overlay must never do by
 * accident: the body tips as a single rigid plank from the ankles, which is the
 * Michael Jackson lean and not a person leaning in to listen.
 *
 * The fix is not to abandon the measured hip value — it is to counter-rotate
 * the femurs by the same amount, which turns a whole-body tip into a hinge at
 * the hip joint while leaving the torso shape exactly as it was measured.
 */
describe('hips rotation never tips the legs', () => {
  for (const state of Object.keys(STATE_OVERLAYS)) {
    const overlay = STATE_OVERLAYS[state];
    const hips = overlay.hips;
    if (!hips) continue;

    it(`${state} keeps the femurs upright under its hip pitch`, () => {
      const left = overlay.leftUpperLeg;
      const right = overlay.rightUpperLeg;
      expect(left, `${state} pitches hips but never counters leftUpperLeg`).toBeDefined();
      expect(right, `${state} pitches hips but never counters rightUpperLeg`).toBeDefined();

      // Each axis of the hips must be cancelled at both femurs, or the legs
      // travel with the pelvis on that axis.
      for (const axis of ['x', 'y', 'z']) {
        expect((hips[axis] ?? 0) + (left[axis] ?? 0)).toBeCloseTo(0, 6);
        expect((hips[axis] ?? 0) + (right[axis] ?? 0)).toBeCloseTo(0, 6);
      }
    });
  }
});

describe('listening', () => {
  const listening = STATE_OVERLAYS.listening;

  // Bound from BOTH sides. "Too subtle to perceive" passes every check that
  // only asks whether a value is small, and that is exactly the bug that
  // shipped once already — see docs/12-conversational-states.md.
  it('leans far enough to read as a state', () => {
    expect(Math.abs(listening.hips.x)).toBeGreaterThan(0.25);
    expect(Math.abs(listening.hips.x)).toBeLessThan(0.6);
  });

  // A body that pitches at the hips and leaves the head riding along is a
  // plank. The neck has to bring the head back toward the viewer, which means
  // opposing the hips rather than matching them.
  it('brings the head back over the lean', () => {
    expect(Math.sign(listening.neck.x)).toBe(-Math.sign(listening.hips.x));
  });
});

describe('the state roster', () => {
  it('gives every conversational state an overlay or a full pose', () => {
    for (const state of CONVERSATION_STATES) {
      const has = state in STATE_OVERLAYS || state in STATE_POSES;
      expect(has, `${state} has neither an overlay nor a pose`).toBe(true);
    }
  });

  // The two maps are combined in different ways — overlays add, poses blend —
  // so a state appearing in both would be applied twice by two mechanisms.
  it('never defines a state as both an overlay and a pose', () => {
    for (const state of Object.keys(STATE_POSES)) {
      expect(STATE_OVERLAYS[state], `${state} is both`).toBeUndefined();
    }
  });
});
