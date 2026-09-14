import { describe, it, expect } from 'vitest';
// THE ONE PLACE A TEST UNDER lib/ IMPORTS THREE, and it is deliberate.
// Invariant 4 bars three.js from lib/ SOURCE, and unwrapEuler.js honours that —
// it imports nothing. The claim under test here is "these two Euler triples are
// the same rotation", and the only oracle worth checking that against is the
// exact converter the app runs on. Verifying three's behaviour with a
// reimplementation of three's behaviour would prove nothing. No jsdom, no GPU,
// and the file still runs in milliseconds.
import { Euler, Quaternion } from 'three';
import { unwrapAngle, nearestSpelling, unwrapPose } from '@/lib/unwrapEuler.js';

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

// Two Euler triples describe the same rotation if their quaternions match.
// Every claim in this file rests on that, so it is checked rather than assumed.
const sameRotation = (a, b) => {
  const qa = new Quaternion().setFromEuler(new Euler(a.x, a.y, a.z, 'XYZ'));
  const qb = new Quaternion().setFromEuler(new Euler(b.x, b.y, b.z, 'XYZ'));
  const flipped = qb.clone().set(-qb.x, -qb.y, -qb.z, -qb.w);
  return Math.min(qa.angleTo(qb), qa.angleTo(flipped)) * DEG;
};

describe('unwrapAngle', () => {
  it('leaves an angle already near the previous one alone', () => {
    expect(unwrapAngle(0.5, 0.6)).toBeCloseTo(0.6, 10);
  });

  // THE MEASURED BUG. A bone's Euler read-back gained or lost a full turn
  // mid-clip — the same rotation, spelled differently — and every layer that
  // interpolated or added to it jumped with it.
  it('removes a full turn gained', () => {
    expect(unwrapAngle(0.1, 0.1 + TAU)).toBeCloseTo(0.1, 10);
  });

  it('removes a full turn lost', () => {
    expect(unwrapAngle(0.1, 0.1 - TAU)).toBeCloseTo(0.1, 10);
  });

  it('removes several turns at once', () => {
    expect(unwrapAngle(0.1, 0.1 + 3 * TAU)).toBeCloseTo(0.1, 10);
  });

  it('never moves an angle by more than half a turn', () => {
    for (let i = 0; i < 200; i++) {
      const prev = (Math.random() * 2 - 1) * 10;
      const next = (Math.random() * 2 - 1) * 10;
      expect(Math.abs(unwrapAngle(prev, next) - prev)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('only ever shifts by whole turns, so the rotation is unchanged', () => {
    for (let i = 0; i < 200; i++) {
      const prev = (Math.random() * 2 - 1) * 10;
      const next = (Math.random() * 2 - 1) * 10;
      const shift = (unwrapAngle(prev, next) - next) / TAU;
      expect(Math.abs(shift - Math.round(shift))).toBeLessThan(1e-9);
    }
  });

  it('passes a non-finite value straight through rather than looping on it', () => {
    expect(unwrapAngle(NaN, 0.4)).toBe(0.4);
    expect(Number.isNaN(unwrapAngle(0.4, NaN))).toBe(true);
  });
});

describe('nearestSpelling', () => {
  it('has nothing to be continuous with on a first frame', () => {
    const rot = { x: 1, y: 2, z: 3 };
    expect(nearestSpelling(null, rot)).toBe(rot);
  });

  // The second exact XYZ solution. three's converter switches to it near
  // gimbal, which is where the worst measured jumps were.
  it('recognises the flipped spelling as the same rotation', () => {
    const rot = { x: 0.4, y: 0.2, z: -0.3 };
    const flipped = { x: rot.x + Math.PI, y: Math.PI - rot.y, z: rot.z + Math.PI };
    expect(sameRotation(rot, flipped)).toBeLessThan(1e-4);
  });

  it('undoes a flip when the previous frame was not flipped', () => {
    const prev = { x: 0.4, y: 0.2, z: -0.3 };
    const flipped = { x: prev.x + Math.PI, y: Math.PI - prev.y, z: prev.z + Math.PI };
    const out = nearestSpelling(prev, flipped);
    expect(out.x).toBeCloseTo(prev.x, 6);
    expect(out.y).toBeCloseTo(prev.y, 6);
    expect(out.z).toBeCloseTo(prev.z, 6);
  });

  // Whichever spelling it picks, it MUST be the same rotation — otherwise this
  // silently corrupts the pose rather than smoothing it, which would be far
  // worse than the bug it fixes.
  it('never changes the rotation it was given', () => {
    for (let i = 0; i < 300; i++) {
      const rot = {
        x: (Math.random() * 2 - 1) * Math.PI,
        y: (Math.random() - 0.5) * Math.PI,
        z: (Math.random() * 2 - 1) * Math.PI,
      };
      const prev = {
        x: (Math.random() * 2 - 1) * 8,
        y: (Math.random() * 2 - 1) * 8,
        z: (Math.random() * 2 - 1) * 8,
      };
      expect(sameRotation(rot, nearestSpelling(prev, rot))).toBeLessThan(1e-3);
    }
  });

  it('picks the spelling closer to the previous frame', () => {
    const rot = { x: 0.4, y: 0.2, z: -0.3 };
    const flipped = { x: rot.x + Math.PI, y: Math.PI - rot.y, z: rot.z + Math.PI };
    // Previous frame was itself flipped, so the flipped spelling should win.
    const out = nearestSpelling(flipped, rot);
    expect(Math.abs(out.x - flipped.x)).toBeLessThan(Math.abs(rot.x - flipped.x));
  });
});

describe('unwrapPose', () => {
  it('passes the first frame through untouched', () => {
    const pose = { hips: { x: 1, y: 2, z: 3 } };
    expect(unwrapPose(null, pose)).toBe(pose);
  });

  it('unwraps every bone it knows about', () => {
    const prev = { hips: { x: 0.1, y: 0, z: 0 }, head: { x: 0.2, y: 0, z: 0 } };
    const next = { hips: { x: 0.1 + TAU, y: 0, z: 0 }, head: { x: 0.2 - TAU, y: 0, z: 0 } };
    const out = unwrapPose(prev, next);
    expect(out.hips.x).toBeCloseTo(0.1, 8);
    expect(out.head.x).toBeCloseTo(0.2, 8);
  });

  it('passes a bone the previous frame did not have straight through', () => {
    const out = unwrapPose({}, { newBone: { x: 9, y: 0, z: 0 } });
    expect(out.newBone.x).toBe(9);
  });

  it('does not mutate either argument', () => {
    const prev = { hips: { x: 0.1, y: 0, z: 0 } };
    const next = { hips: { x: 0.1 + TAU, y: 0, z: 0 } };
    unwrapPose(prev, next);
    expect(prev.hips.x).toBe(0.1);
    expect(next.hips.x).toBe(0.1 + TAU);
  });

  // The whole point, stated as the property that matters: consecutive frames of
  // a smooth rotation must produce consecutive numbers.
  it('keeps a rotation sweeping through gimbal continuous in the numbers', () => {
    let prev = null;
    let worst = 0;
    // y sweeping through +90deg is where the read-back flips branches.
    for (let i = 0; i <= 400; i++) {
      const t = i / 400;
      const q = new Quaternion().setFromEuler(
        new Euler(0.3 + t * 0.2, -Math.PI / 2 + 0.28 * (t - 0.5) * 2, 0.4 + t * 0.2, 'XYZ'),
      );
      const e = new Euler().setFromQuaternion(q, 'XYZ');
      const pose = unwrapPose(prev, { bone: { x: e.x, y: e.y, z: e.z } });
      if (prev) {
        const d = Math.hypot(
          pose.bone.x - prev.bone.x, pose.bone.y - prev.bone.y, pose.bone.z - prev.bone.z,
        );
        if (d > worst) worst = d;
      }
      prev = pose;
    }
    // Without unwrapping this sweep produces jumps of a full turn. Bounded well
    // below half a turn, which no single step of this sweep can legitimately be.
    expect(worst).toBeLessThan(Math.PI / 2);
  });
});
