import { describe, it, expect } from 'vitest';
import {
  listExpressions, listBones, CLIP_BONES, HUMANOID_BONES, FINGER_BONES,
} from './vrmIntrospect.js';

const fakeVrm = {
  expressionManager: {
    expressions: [
      { expressionName: 'happy' },
      { expressionName: 'aa' },
      { expressionName: 'blink' },
    ],
  },
  humanoid: {
    getNormalizedBoneNode: (name) =>
      ['head', 'chest', 'leftUpperArm'].includes(name) ? { name } : null,
  },
};

describe('listExpressions', () => {
  it('returns every expression name the model actually defines', () => {
    expect(listExpressions(fakeVrm)).toEqual(['happy', 'aa', 'blink']);
  });

  it('returns an empty array when there is no expression manager', () => {
    expect(listExpressions({})).toEqual([]);
    expect(listExpressions(null)).toEqual([]);
  });
});

describe('listBones', () => {
  it('returns only the humanoid bones present on the model', () => {
    const bones = listBones(fakeVrm);
    expect(bones).toContain('head');
    expect(bones).toContain('leftUpperArm');
    expect(bones).not.toContain('leftToes');
  });

  it('returns an empty array when there is no humanoid', () => {
    expect(listBones({})).toEqual([]);
    expect(listBones(null)).toEqual([]);
  });
});

describe('CLIP_BONES', () => {
  it('covers the entire VRM humanoid vocabulary', () => {
    // What a .vrma animates is not up to us — a clip carries whatever its
    // author recorded, and the pixiv pack records all 55 humanoid bones. The
    // read-back list has to be at least that wide or the difference is silently
    // discarded.
    expect(CLIP_BONES).toHaveLength(HUMANOID_BONES.length + FINGER_BONES.length);
    expect(new Set(CLIP_BONES).size).toBe(CLIP_BONES.length);
  });

  it('includes the fingers, which HUMANOID_BONES deliberately does not', () => {
    // THE BUG THIS EXISTS FOR. The read-back looped HUMANOID_BONES, which omits
    // fingers on purpose (thirty extra sliders would drown the Pose tab). So
    // the mixer wrote the clip's finger rotations, nothing read them back, and
    // the compositor painted the resting hand curl straight over them — every
    // clip played with idle hands. `Peace sign` made no peace sign.
    for (const bone of FINGER_BONES) {
      expect(CLIP_BONES, `missing ${bone}`).toContain(bone);
    }
  });

  it('includes the bones a preset would never name', () => {
    // The same failure one iteration earlier, kept as a reminder: the read-back
    // once used the active preset's key set and dropped the legs, so `Squat`
    // moved everything except the part that squats.
    for (const bone of ['leftUpperLeg', 'rightFoot', 'leftToes', 'jaw']) {
      expect(CLIP_BONES).toContain(bone);
    }
  });
});
