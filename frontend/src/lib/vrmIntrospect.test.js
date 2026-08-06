import { describe, it, expect } from 'vitest';
import { listExpressions, listBones } from './vrmIntrospect.js';

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
