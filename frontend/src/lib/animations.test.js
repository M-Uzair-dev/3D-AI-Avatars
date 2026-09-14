import { describe, it, expect } from 'vitest';
import { buildAnimationList, PROMOTED_GESTURES } from '@/lib/animations.js';
import { GESTURES } from '@/lib/gestures.js';

const FILES = ['VRMA_01.vrma', 'VRMA_03.vrma'];

describe('PROMOTED_GESTURES', () => {
  it('names only gestures that actually exist', () => {
    for (const name of PROMOTED_GESTURES) {
      expect(GESTURES[name], `${name} is not a real gesture`).toBeDefined();
    }
  });

  // The whole point of promoting one: a gesture in the production list is
  // triggered by the user, so it must not ALSO be firing itself on the idle
  // timer. The list is empty today, so this guards the next entry rather than
  // the current ones.
  it('names only gestures excluded from the idle rotation', () => {
    for (const name of PROMOTED_GESTURES) {
      expect(GESTURES[name].idle, `${name} still fires on the idle timer`).toBe(false);
    }
  });
});

describe('buildAnimationList', () => {
  it('returns the promoted gestures even with no clip files', () => {
    const list = buildAnimationList([]);
    expect(list).toHaveLength(PROMOTED_GESTURES.length);
    expect(list.every((r) => r.kind === 'gesture')).toBe(true);
  });

  it('puts the promoted gestures before the recorded clips', () => {
    const list = buildAnimationList(FILES);
    const firstClip = list.findIndex((r) => r.kind === 'clip');
    const lastGesture = list.map((r) => r.kind).lastIndexOf('gesture');
    expect(lastGesture).toBeLessThan(firstClip);
  });

  it('gives a clip row the url the store needs', () => {
    const row = buildAnimationList(FILES).find((r) => r.id === 'VRMA_01.vrma');
    expect(row.kind).toBe('clip');
    expect(row.url).toBe('/animations/VRMA_01.vrma');
  });

  // Vacuous while PROMOTED_GESTURES is empty, and kept for the entry after
  // `wave`: the component dispatches on `kind`, and a gesture row that somehow
  // carried a url would be a clip wearing a gesture's label. Written over every
  // gesture row rather than the first one so it starts asserting the moment a
  // gesture is promoted, without anyone having to remember this test exists.
  it('gives gesture rows no url, because they are not fetched', () => {
    for (const row of buildAnimationList(FILES).filter((r) => r.kind === 'gesture')) {
      expect(row.url, `${row.id} carries a url`).toBeUndefined();
    }
  });

  it('labels clips by their human name, not their filename', () => {
    const row = buildAnimationList(FILES).find((r) => r.id === 'VRMA_03.vrma');
    expect(row.label).toBe('Peace sign');
  });

  it('falls back to the filename stem for an unknown clip', () => {
    const row = buildAnimationList(['mystery.vrma']).find((r) => r.kind === 'clip');
    expect(row.label).toBe('mystery');
  });

  // The menu is clips only now that `wave` is gone. Pinned because an empty
  // PROMOTED_GESTURES is a deliberate state rather than a broken one, and the
  // difference should be visible if someone adds a row without meaning to.
  it('offers no gestures while none is promoted', () => {
    expect(PROMOTED_GESTURES).toEqual([]);
    expect(buildAnimationList(FILES).some((r) => r.kind === 'gesture')).toBe(false);
  });

  // Every row is dispatched by switching on `kind`, so a row carrying anything
  // else would silently do nothing when clicked.
  it('marks every row as exactly one of the two kinds', () => {
    for (const row of buildAnimationList(FILES)) {
      expect(['clip', 'gesture']).toContain(row.kind);
    }
  });

  it('gives every row a unique id', () => {
    const ids = buildAnimationList(FILES).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ignores files that are not .vrma', () => {
    const list = buildAnimationList(['notes.txt', 'LICENCE-pixiv-VRoid.txt', 'VRMA_01.vrma']);
    expect(list.filter((r) => r.kind === 'clip')).toHaveLength(1);
  });

  it('survives a missing argument, because the fetch can fail', () => {
    expect(() => buildAnimationList(undefined)).not.toThrow();
    expect(buildAnimationList(undefined).length).toBe(PROMOTED_GESTURES.length);
  });
});
