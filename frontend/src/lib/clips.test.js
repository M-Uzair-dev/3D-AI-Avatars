import { describe, it, expect } from 'vitest';
import { clipEnvelope, clipDispatch, arrivalHidesModel } from '@/lib/clips.js';

const DUR = 4000;
const FADE = 600;
const env = (t) => clipEnvelope(t, DUR, FADE, FADE);

describe('clipEnvelope', () => {
  it('is zero at both ends', () => {
    expect(env(0)).toBe(0);
    expect(env(DUR)).toBe(0);
  });

  it('is zero outside the clip entirely', () => {
    expect(env(-100)).toBe(0);
    expect(env(DUR + 100)).toBe(0);
  });

  // THE BUG THIS FILE EXISTS FOR. The clip used to be applied at full weight on
  // the first frame its action existed, which cut from the standing pose to the
  // clip's first frame in one frame. A lower bound on the first frames is the
  // only assertion that catches that — an upper bound of 1 passed the whole
  // time it was broken.
  it('eases in rather than cutting in', () => {
    expect(env(1)).toBeLessThan(0.05);
    expect(env(FADE / 2)).toBeGreaterThan(0.1);
    expect(env(FADE / 2)).toBeLessThan(0.9);
    expect(env(FADE)).toBeCloseTo(1, 5);
  });

  it('eases out rather than cutting out', () => {
    expect(env(DUR - 1)).toBeLessThan(0.05);
    expect(env(DUR - FADE / 2)).toBeGreaterThan(0.1);
    expect(env(DUR - FADE / 2)).toBeLessThan(0.9);
    expect(env(DUR - FADE)).toBeCloseTo(1, 5);
  });

  it('holds full weight through the middle', () => {
    expect(env(DUR / 2)).toBe(1);
    expect(env(FADE + 1)).toBeCloseTo(1, 3);
  });

  it('rises monotonically and falls monotonically', () => {
    for (let t = 0; t < FADE; t += 25) {
      expect(env(t + 25)).toBeGreaterThanOrEqual(env(t));
    }
    for (let t = DUR - FADE; t < DUR; t += 25) {
      expect(env(t + 25)).toBeLessThanOrEqual(env(t));
    }
  });

  // No frame may move the blend far enough to read as a step. At 60fps a 600ms
  // fade advances ~2.8% per frame; anything above ~10% would be visible as a
  // pop, which is the failure being guarded rather than a hypothetical.
  it('never steps by more than a tenth between adjacent frames', () => {
    const dt = 1000 / 60;
    let prev = env(0);
    for (let t = dt; t <= DUR; t += dt) {
      const cur = env(t);
      expect(Math.abs(cur - prev)).toBeLessThan(0.1);
      prev = cur;
    }
  });

  it('stays in range and never peaks above 1 when the clip is shorter than its fades', () => {
    for (let t = 0; t <= 300; t += 5) {
      const w = clipEnvelope(t, 300, FADE, FADE);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('treats a zero or negative duration as nothing to play', () => {
    expect(clipEnvelope(10, 0, FADE, FADE)).toBe(0);
    expect(clipEnvelope(10, -5, FADE, FADE)).toBe(0);
  });

  it('treats a zero-length fade as already fully in', () => {
    expect(clipEnvelope(1, DUR, 0, 0)).toBe(1);
  });
});

describe('clipDispatch', () => {
  const d = (requested, current, ready) => clipDispatch({ requested, current, ready });

  it('does nothing when the selection has not changed', () => {
    expect(d('/a.vrma', '/a.vrma', true)).toBe('none');
    expect(d(null, null, true)).toBe('none');
    // Even mid-startup: an unchanged selection is not something to retry.
    expect(d('/a.vrma', '/a.vrma', false)).toBe('none');
  });

  it('loads a newly selected clip once it can', () => {
    expect(d('/a.vrma', null, true)).toBe('load');
    expect(d('/b.vrma', '/a.vrma', true)).toBe('load');
  });

  it('releases when the selection is cleared', () => {
    expect(d(null, '/a.vrma', true)).toBe('release');
  });

  // Releasing must not depend on being ready. The mixer going away is exactly
  // when a clip most needs letting go of.
  it('releases even when nothing is ready', () => {
    expect(d(null, '/a.vrma', false)).toBe('release');
  });

  // THE BUG THIS FUNCTION EXISTS FOR.
  //
  // The old code claimed the selection and then asked the mixer to play it. If
  // the mixer was not there yet the play was skipped silently — but the claim
  // had happened, so the frame loop believed a clip was running that had never
  // started. The menu said "playing", she stood still, and nothing retried.
  //
  // Not a rare race: the greeting dispatches in the same tick the model lands,
  // and the mixer is built in a passive effect React can run after the next
  // frame. It hit every time, while a clip clicked by hand never did.
  it('waits rather than claiming a clip it cannot start', () => {
    expect(d('/a.vrma', null, false)).toBe('wait');
  });

  it('keeps waiting for as long as it takes, then loads', () => {
    expect(d('/a.vrma', null, false)).toBe('wait');
    expect(d('/a.vrma', null, false)).toBe('wait');
    expect(d('/a.vrma', null, true)).toBe('load');
  });

  // 'wait' is only ever correct because the caller leaves its ref untouched.
  // If waiting ever came to mean the same thing as doing nothing, the retry
  // would stop and the original bug would be back.
  it('distinguishes waiting from having nothing to do', () => {
    expect(d('/a.vrma', null, false)).not.toBe('none');
  });
});

describe('arrivalHidesModel', () => {
  const h = (arriving, clipSelected, clipBlend) =>
    arrivalHidesModel({ arriving, clipSelected, clipBlend });

  // THE BUG THIS EXISTS FOR. The greeting clip opens in a crouch and springs
  // up. Played the ordinary way she appeared standing in her idle pose, sank
  // into the crouch across the 600ms fade, then leapt — three movements where
  // the point was one, and the first two read as a glitch.
  it('hides her while the entrance clip has not started driving her', () => {
    expect(h(true, true, 0)).toBe(true);
  });

  it('reveals her the moment the clip takes hold', () => {
    expect(h(true, true, 1)).toBe(false);
    expect(h(true, true, 0.01)).toBe(false);
  });

  it('never hides her once the entrance is over', () => {
    expect(h(false, true, 0)).toBe(false);
    expect(h(false, false, 0)).toBe(false);
  });

  // EVERY ONE OF THESE IS A GUARD AGAINST AN AVATAR NOBODY CAN SEE, which is a
  // far worse bug than the one being fixed. Hiding requires something to be
  // coming that will reveal her.
  it('reveals her when no clip is pending to reveal her', () => {
    expect(h(true, false, 0)).toBe(false);
  });

  it('reveals her when a failed clip clears the selection', () => {
    // The load rejects, the store's clipUrl goes null, and this is what lets
    // her through on the next frame without anything else having to notice.
    expect(h(true, true, 0)).toBe(true);
    expect(h(true, false, 0)).toBe(false);
  });

  it('is not fooled by a missing or odd blend', () => {
    expect(h(true, true, undefined)).toBe(true);
    expect(h(true, true, NaN)).toBe(true);
    expect(h(true, true, -1)).toBe(true);
  });
});
