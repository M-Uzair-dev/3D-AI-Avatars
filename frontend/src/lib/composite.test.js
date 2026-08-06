import { describe, it, expect } from 'vitest';
import { compositeBones } from './composite.js';
import { POSES, POSE_NAMES } from './poses.js';

const base = {
  pose: { head: { x: 0, y: 0, z: 0 }, chest: { x: 0.1, y: 0, z: 0 } },
  idleDeltas: {},
  manualOverrides: {},
  speaking: false,
  attenuation: 0.4,
};

describe('poses', () => {
  it('defines t-pose and relaxed', () => {
    expect(POSES['t-pose']).toBeDefined();
    expect(POSES.relaxed).toBeDefined();
    expect(POSE_NAMES).toContain('relaxed');
  });

  it('gives t-pose no rotations, since that is the VRM rest pose', () => {
    for (const rot of Object.values(POSES['t-pose'])) {
      expect(rot).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('mirrors left and right arms in the relaxed pose', () => {
    const { leftUpperArm, rightUpperArm } = POSES.relaxed;
    expect(leftUpperArm.z).toBeCloseTo(-rightUpperArm.z, 5);
  });

  it('gives every pose rotation all three axes', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      for (const [bone, rot] of Object.entries(pose)) {
        expect(Object.keys(rot).sort(), `${name}.${bone}`).toEqual(['x', 'y', 'z']);
      }
    }
  });
});

describe('compositeBones', () => {
  it('returns the pose unchanged when nothing else is active', () => {
    expect(compositeBones(base)).toEqual(base.pose);
  });

  it('adds idle deltas on top of the pose rather than replacing it', () => {
    const out = compositeBones({
      ...base,
      idleDeltas: { head: { x: 0.05, y: 0, z: 0 } },
    });
    expect(out.head.x).toBeCloseTo(0.05, 6);
    expect(out.chest.x).toBeCloseTo(0.1, 6); // untouched bone keeps its pose value
  });

  it('attenuates idle deltas while speaking', () => {
    const idleDeltas = { head: { x: 0.1, y: 0, z: 0 } };
    const idle = compositeBones({ ...base, idleDeltas });
    const talking = compositeBones({ ...base, idleDeltas, speaking: true });
    expect(talking.head.x).toBeCloseTo(0.04, 6); // 0.1 * 0.4
    expect(talking.head.x).toBeLessThan(idle.head.x);
  });

  it('lets a manual override replace the pose value for that bone only', () => {
    const out = compositeBones({
      ...base,
      manualOverrides: { head: { x: 0.9, y: 0, z: 0 } },
    });
    expect(out.head.x).toBe(0.9);
    expect(out.chest.x).toBeCloseTo(0.1, 6);
  });

  it('lets a manual override win over idle motion', () => {
    const out = compositeBones({
      ...base,
      idleDeltas: { head: { x: 0.05, y: 0, z: 0 } },
      manualOverrides: { head: { x: 0.9, y: 0, z: 0 } },
    });
    expect(out.head.x).toBe(0.9);
  });

  it('includes bones that appear only in idle or overrides', () => {
    const out = compositeBones({
      ...base,
      idleDeltas: { leftHand: { x: 0.2, y: 0, z: 0 } },
      manualOverrides: { rightHand: { x: 0.3, y: 0, z: 0 } },
    });
    expect(out.leftHand.x).toBeCloseTo(0.2, 6);
    expect(out.rightHand.x).toBe(0.3);
  });

  it('produces the same result regardless of input key order', () => {
    const a = compositeBones({
      ...base,
      pose: { head: { x: 1, y: 0, z: 0 }, chest: { x: 2, y: 0, z: 0 } },
    });
    const b = compositeBones({
      ...base,
      pose: { chest: { x: 2, y: 0, z: 0 }, head: { x: 1, y: 0, z: 0 } },
    });
    expect(a).toEqual(b);
  });

  it('does not mutate its inputs', () => {
    const pose = { head: { x: 0, y: 0, z: 0 } };
    const idleDeltas = { head: { x: 0.05, y: 0, z: 0 } };
    compositeBones({ ...base, pose, idleDeltas });
    expect(pose.head.x).toBe(0);
    expect(idleDeltas.head.x).toBe(0.05);
  });

  it('tolerates empty inputs', () => {
    expect(() =>
      compositeBones({
        pose: {},
        idleDeltas: {},
        manualOverrides: {},
        speaking: false,
        attenuation: 0.4,
      }),
    ).not.toThrow();
  });
});
