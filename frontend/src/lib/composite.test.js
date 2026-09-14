import { describe, it, expect } from 'vitest';
import { compositeBones, lerpPoses, scalePose } from './composite.js';
import {
  POSES, POSE_NAMES, DEFAULT_POSE, IDLE_POSE_ROTATION, ARM_BEHIND_LEFT,
} from './poses.js';
import { HUMANOID_BONES } from './vrmIntrospect.js';

const base = {
  pose: { head: { x: 0, y: 0, z: 0 }, chest: { x: 0.1, y: 0, z: 0 } },
  idleDeltas: {},
  manualOverrides: {},
  speaking: false,
  attenuation: 0.4,
};

describe('poses', () => {
  it('keeps the default pose in the preset list', () => {
    expect(POSES[DEFAULT_POSE], `missing default pose: ${DEFAULT_POSE}`).toBeDefined();
  });

  it('leaves the default pose asymmetric', () => {
    // The one property that matters most about the resting pose, and the one a
    // future tidy-up is most likely to undo. Mirrored arms are THE mannequin
    // tell; an earlier symmetry test asserted the OPPOSITE of this and passed
    // happily while the avatar stood like a shop dummy.
    const { leftUpperArm, rightUpperArm } = POSES[DEFAULT_POSE];
    expect(leftUpperArm.z).not.toBeCloseTo(-rightUpperArm.z, 3);
  });

  it('gives every pose rotation all three axes', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      for (const [bone, rot] of Object.entries(pose)) {
        expect(Object.keys(rot).sort(), `${name}.${bone}`).toEqual(['x', 'y', 'z']);
      }
    }
  });

  it('defines exactly the expected presets, by name', () => {
    // Named rather than counted, because iterating a collection can never tell
    // you something has fallen OUT of it — the lesson a text-range deletion
    // taught this project once already, in gestures.js.
    expect(POSE_NAMES).toEqual([
      'companion', 'arms-behind', 'arm-behind-left', 'arm-behind-right',
      'thinking',
    ]);
  });

  it('drifts between companion and arms-behind, and nothing else', () => {
    // The single-arm variants are selectable but out of the automatic rotation,
    // which is the one place a pose appears without being asked for: the drift
    // should read as a decision, and four shapes cycling reads as fidgeting.
    expect(IDLE_POSE_ROTATION).toEqual(['companion', 'arms-behind']);
  });

  it('only references real VRM humanoid bone names', () => {
    const valid = new Set(HUMANOID_BONES);
    for (const [name, pose] of Object.entries(POSES)) {
      for (const bone of Object.keys(pose)) {
        expect(valid.has(bone), `${name} references unknown bone: ${bone}`).toBe(true);
      }
    }
  });

  it('keeps every rotation within one full turn', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      for (const [bone, rot] of Object.entries(pose)) {
        for (const axis of ['x', 'y', 'z']) {
          expect(Math.abs(rot[axis]), `${name}.${bone}.${axis}`).toBeLessThan(Math.PI * 2);
        }
      }
    }
  });
});

describe('arms behind the back', () => {
  const ARM_CHAIN = ['Shoulder', 'UpperArm', 'LowerArm'];

  it('mirrors the measured left arm exactly onto the right', () => {
    // Only the left arm was dragged out in the Pose tab. The right is
    // mirrorLimb's (x, -y, -z), not a second measurement by eye.
    for (const part of ARM_CHAIN) {
      const left = POSES['arm-behind-left'][`left${part}`];
      const right = POSES['arm-behind-right'][`right${part}`];
      expect(right.x, part).toBeCloseTo(left.x, 6);
      expect(right.y, part).toBeCloseTo(-left.y, 6);
      expect(right.z, part).toBeCloseTo(-left.z, 6);
    }
  });

  it('leaves the idle arm where companion has it', () => {
    // A one-armed variant must not silently drop the other arm to the T-pose.
    expect(POSES['arm-behind-left'].rightUpperArm).toEqual(POSES.companion.rightUpperArm);
    expect(POSES['arm-behind-right'].leftUpperArm).toEqual(POSES.companion.leftUpperArm);
  });

  it('actually moves the arm off its resting position', () => {
    // A difference, not a direction. The shoulder roll reorients the whole
    // chain, so the axis table's "y is azimuth" does not apply naively here and
    // asserting which way is back would be deriving, not measuring.
    const rest = POSES.companion.leftUpperArm;
    const behind = POSES['arm-behind-left'].leftUpperArm;
    expect(Math.abs(behind.y - rest.y)).toBeGreaterThan(1);
  });

  it('involves the shoulder, not just the arm', () => {
    // Nothing on a body moves alone. Putting a hand behind your back pulls the
    // shoulder back with it, and an arm swung from a level shoulder is the
    // exact failure this project has hit repeatedly.
    expect(Math.abs(POSES['arm-behind-left'].leftShoulder.x)).toBeGreaterThan(0.3);
  });

  it('staggers the two arms rather than mirroring them', () => {
    // Both hands behind the back land at the same point if the pose is a
    // perfect mirror, which is the same collision that made arms-crossed bad —
    // just hidden behind her. The forearms must fold by different amounts.
    const { leftLowerArm, rightLowerArm } = POSES['arms-behind'];
    expect(leftLowerArm.y).not.toBeCloseTo(-rightLowerArm.y, 3);
  });

  it('keeps the stagger small enough to still read as both arms behind', () => {
    // Bounded from both sides: a stagger of zero is the collision, and a large
    // one is one arm behind and one arm somewhere else.
    const { leftLowerArm, rightLowerArm } = POSES['arms-behind'];
    const gap = Math.abs(Math.abs(leftLowerArm.y) - Math.abs(rightLowerArm.y));
    expect(gap).toBeGreaterThan(0.05);
    expect(gap).toBeLessThan(0.4);
  });

  it('builds all three from the one measured chain', () => {
    // If the measurement is retuned, every variant has to follow. Exported for
    // exactly this assertion.
    expect(POSES['arm-behind-left'].leftUpperArm).toEqual(ARM_BEHIND_LEFT.leftUpperArm);
    expect(POSES['arms-behind'].leftUpperArm).toEqual(ARM_BEHIND_LEFT.leftUpperArm);
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

describe('lerpPoses', () => {
  const a = { head: { x: 0, y: 0, z: 0 }, chest: { x: 0, y: 0, z: 0 } };
  const b = { head: { x: 1, y: 2, z: 4 }, chest: { x: 1, y: 1, z: 1 } };

  it('returns the first pose at t=0', () => {
    expect(lerpPoses(a, b, 0)).toEqual(a);
  });

  it('returns the second pose at t=1', () => {
    expect(lerpPoses(a, b, 1)).toEqual(b);
  });

  it('interpolates every axis at the midpoint', () => {
    expect(lerpPoses(a, b, 0.5).head).toEqual({ x: 0.5, y: 1, z: 2 });
  });

  it('clamps t outside 0..1', () => {
    expect(lerpPoses(a, b, -3)).toEqual(a);
    expect(lerpPoses(a, b, 7)).toEqual(b);
  });

  it('treats a bone missing from one pose as zero rotation', () => {
    const out = lerpPoses({ head: { x: 1, y: 0, z: 0 } }, {}, 0.5);
    expect(out.head).toEqual({ x: 0.5, y: 0, z: 0 });
  });

  it('includes bones present in only one pose', () => {
    const out = lerpPoses({ head: { x: 1, y: 0, z: 0 } }, { jaw: { x: 2, y: 0, z: 0 } }, 0.5);
    expect(out.head).toBeDefined();
    expect(out.jaw).toBeDefined();
  });

  it('does not mutate its inputs', () => {
    lerpPoses(a, b, 0.5);
    expect(a.head.x).toBe(0);
    expect(b.head.x).toBe(1);
  });

  it('tolerates two empty poses', () => {
    expect(lerpPoses({}, {}, 0.5)).toEqual({});
  });
});

describe('scalePose', () => {
  const pose = { hips: { x: 1, y: -2, z: 0.5 }, head: { x: 0, y: 0.25, z: -1 } };

  it('scales every axis of every bone', () => {
    expect(scalePose(pose, 0.5)).toEqual({
      hips: { x: 0.5, y: -1, z: 0.25 },
      head: { x: 0, y: 0.125, z: -0.5 },
    });
  });

  // THE CASE IT EXISTS FOR. A clip at full weight owns the body, so the
  // additive layers must contribute exactly nothing. Measured reason in the
  // function's own comment: near gimbal, adding a constant delta to an
  // ill-conditioned Euler triple is not a constant amount of motion, and that
  // was a visible jerk at the same moment in a clip every time.
  it('silences a layer completely at zero', () => {
    for (const rot of Object.values(scalePose(pose, 0))) {
      expect(Math.abs(rot.x)).toBe(0);
      expect(Math.abs(rot.y)).toBe(0);
      expect(Math.abs(rot.z)).toBe(0);
    }
  });

  it('returns the pose untouched at full strength', () => {
    expect(scalePose(pose, 1)).toBe(pose);
  });

  it('passes null through, so an absent layer needs no special case', () => {
    expect(scalePose(null, 0.5)).toBeNull();
  });

  it('does not mutate its input', () => {
    scalePose(pose, 0.5);
    expect(pose.hips).toEqual({ x: 1, y: -2, z: 0.5 });
  });
});
