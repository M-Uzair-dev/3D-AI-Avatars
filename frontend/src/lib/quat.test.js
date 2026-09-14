import { describe, it, expect } from 'vitest';
import { eulerToQuat, quatToEuler, slerp, blendPosesShortest } from './quat.js';

const TAU = Math.PI * 2;
const deg = (d) => (d * Math.PI) / 180;

/** The angle between two rotations, in degrees. Spelling-blind by construction. */
function angleBetween(ea, eb) {
  const a = eulerToQuat(ea);
  const b = eulerToQuat(eb);
  const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

describe('euler and quaternion conversion', () => {
  it('round-trips a rotation back to itself', () => {
    const e = { x: 0.3, y: -0.7, z: 1.1 };
    const back = quatToEuler(eulerToQuat(e));
    expect(back.x).toBeCloseTo(e.x, 12);
    expect(back.y).toBeCloseTo(e.y, 12);
    expect(back.z).toBeCloseTo(e.z, 12);
  });

  it('produces a unit quaternion', () => {
    const q = eulerToQuat({ x: 2.2, y: -1.4, z: 0.9 });
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
  });

  // The property the whole fix rests on: a wound-up spelling and a plain one
  // are the SAME rotation, so they must convert to the same quaternion (up to
  // sign, which is the same orientation).
  it('maps every spelling of one rotation to the same orientation', () => {
    const plain = { x: 0.2, y: -0.3, z: 0.4 };
    const wound = { x: 0.2 + TAU, y: -0.3, z: 0.4 - TAU * 2 };
    // The other exact XYZ solution, which is what unwrapEuler picks near gimbal.
    const flipped = { x: 0.2 + Math.PI, y: Math.PI - -0.3, z: 0.4 + Math.PI };

    expect(angleBetween(plain, wound)).toBeCloseTo(0, 9);
    expect(angleBetween(plain, flipped)).toBeCloseTo(0, 9);
  });

  it('handles the gimbal branch without producing NaN', () => {
    for (const y of [Math.PI / 2, -Math.PI / 2]) {
      const back = quatToEuler(eulerToQuat({ x: 0.5, y, z: 0.9 }));
      expect(Number.isFinite(back.x)).toBe(true);
      expect(Number.isFinite(back.y)).toBe(true);
      expect(Number.isFinite(back.z)).toBe(true);
      // Exactly at the singularity the round trip loses precision: measured at
      // 1.7e-6 degrees of error, the same order as the 3.4e-6 that unwrapEuler
      // records for the branch-swap identity. That is the conversion's floor
      // here, not a defect, and it is far below anything a rig can show.
      expect(angleBetween({ x: 0.5, y, z: 0.9 }, back)).toBeLessThan(1e-4);
    }
  });
});

describe('slerp', () => {
  it('returns its endpoints exactly', () => {
    const a = eulerToQuat({ x: 0.1, y: 0.2, z: 0.3 });
    const b = eulerToQuat({ x: 1.1, y: -0.4, z: 0.8 });
    expect(slerp(a, b, 0)).toEqual(a);
    expect(slerp(a, b, 1)).toEqual(b);
  });

  it('lands halfway at half the angle', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: deg(80) };
    const mid = quatToEuler(slerp(eulerToQuat(a), eulerToQuat(b), 0.5));
    expect(angleBetween(a, mid)).toBeCloseTo(40, 6);
    expect(angleBetween(b, mid)).toBeCloseTo(40, 6);
  });

  // The sign flip. Without it the interpolation is free to take the long way
  // round, which is the same 360-degree sweep in quaternion clothing.
  it('takes the short way round when the inputs face opposite ways', () => {
    const a = eulerToQuat({ x: 0, y: 0, z: deg(170) });
    const b = eulerToQuat({ x: 0, y: 0, z: deg(-170) });
    // 20 degrees apart the short way, 340 the long way.
    const mid = quatToEuler(slerp(a, b, 0.5));
    expect(angleBetween(quatToEuler(a), mid)).toBeLessThan(11);
  });

  it('stays finite when the two rotations are identical', () => {
    const a = eulerToQuat({ x: 0.4, y: 0.4, z: 0.4 });
    const mid = slerp(a, { ...a }, 0.5);
    expect(Math.hypot(mid.x, mid.y, mid.z, mid.w)).toBeCloseTo(1, 9);
  });
});

describe('blendPosesShortest', () => {
  it('returns each side untouched at the ends', () => {
    const a = { hips: { x: 0.1, y: 0, z: 0 } };
    const b = { hips: { x: 0.9, y: 0, z: 0 } };
    expect(blendPosesShortest(a, b, 0).hips).toEqual(a.hips);
    expect(blendPosesShortest(a, b, 1).hips).toEqual(b.hips);
  });

  it('clamps t outside 0..1', () => {
    const a = { hips: { x: 0.1, y: 0, z: 0 } };
    const b = { hips: { x: 0.9, y: 0, z: 0 } };
    expect(blendPosesShortest(a, b, -5).hips).toEqual(a.hips);
    expect(blendPosesShortest(a, b, 5).hips).toEqual(b.hips);
  });

  it('blends a bone present on only one side against no rotation', () => {
    const out = blendPosesShortest({}, { head: { x: deg(40), y: 0, z: 0 } }, 0.5);
    expect(angleBetween({ x: 0, y: 0, z: 0 }, out.head)).toBeCloseTo(20, 6);
  });

  it('covers the union of both bone sets', () => {
    const out = blendPosesShortest(
      { hips: { x: 0.1, y: 0, z: 0 } },
      { head: { x: 0.2, y: 0, z: 0 } },
      0.5,
    );
    expect(Object.keys(out).sort()).toEqual(['head', 'hips']);
  });

  // ------------------------------------------------------------------
  // THE REGRESSION. This is the bug, in the shape it actually shipped in.
  //
  // `hips.z` ended VRMA_01 at 360.6 degrees — the same rotation as 0.6, spelled
  // a full turn out, because unwrapPose accumulates the spelling it picks. The
  // Euler lerp walked that number down to the static pose over the 600ms
  // fade-out, which is 360 degrees of real motion: the whole body cartwheeling
  // sideways at the end of the clip.
  //
  // Bounded from BOTH sides, per the habit in docs/09: a blend that returned a
  // constant pose would also travel zero degrees and would be just as wrong.
  // ------------------------------------------------------------------
  it('does not travel a full turn to unwind an angle spelled past 360', () => {
    const settled = { hips: { x: 0, y: 0, z: deg(0.6) } };
    const wound = { hips: { x: 0, y: 0, z: deg(360.6) } };

    let travelled = 0;
    let last = blendPosesShortest(settled, wound, 1).hips;
    for (let i = 35; i >= 0; i -= 1) {
      const next = blendPosesShortest(settled, wound, i / 36).hips;
      travelled += angleBetween(last, next);
      last = next;
    }

    // The two ends describe the same rotation, so an honest blend barely moves.
    expect(travelled).toBeLessThan(5);
  });

  it('still travels the real distance when the two poses genuinely differ', () => {
    const from = { hips: { x: 0, y: 0, z: 0 } };
    const to = { hips: { x: 0, y: 0, z: deg(90) } };

    let travelled = 0;
    let last = blendPosesShortest(from, to, 1).hips;
    for (let i = 35; i >= 0; i -= 1) {
      const next = blendPosesShortest(from, to, i / 36).hips;
      travelled += angleBetween(last, next);
      last = next;
    }

    // 90 degrees apart, and it must actually cover them — the failure this
    // guards against is a "fix" that flattens real motion along with the wind-up.
    expect(travelled).toBeGreaterThan(89);
    expect(travelled).toBeLessThan(91);
  });

  // The arms wound up differently from the hips: not whole turns but the other
  // XYZ solution, which no amount of turn-shifting removes. Pinned separately
  // because a whole-turn-only repair passes the hips test and fails this one.
  it('does not travel to unwind the second XYZ solution either', () => {
    const settled = { leftLowerArm: { x: 0.2, y: -0.3, z: 0.4 } };
    const flipped = {
      leftLowerArm: { x: 0.2 + Math.PI, y: Math.PI + 0.3, z: 0.4 + Math.PI },
    };

    let travelled = 0;
    let last = blendPosesShortest(settled, flipped, 1).leftLowerArm;
    for (let i = 35; i >= 0; i -= 1) {
      const next = blendPosesShortest(settled, flipped, i / 36).leftLowerArm;
      travelled += angleBetween(last, next);
      last = next;
    }

    expect(travelled).toBeLessThan(5);
  });
});
