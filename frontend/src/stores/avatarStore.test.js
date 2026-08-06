import { describe, it, expect, beforeEach } from 'vitest';
import { useAvatarStore } from './avatarStore.js';
import { DEFAULT_POSE } from '@/lib/poses.js';

const reset = () => useAvatarStore.getState().resetAll();
const s = () => useAvatarStore.getState();

describe('avatarStore', () => {
  beforeEach(reset);

  it('starts not speaking with an empty timeline', () => {
    expect(s().timeline).toEqual([]);
    expect(s().speechStartedAt).toBeNull();
  });

  it('starts on the default pose with no manual bone edits', () => {
    expect(s().poseName).toBe(DEFAULT_POSE);
    expect(s().manualBones).toEqual({});
  });

  it('records a start timestamp when speaking begins', () => {
    s().speak([{ viseme: 'aa', weight: 1, start: 0, dur: 100 }]);
    expect(s().timeline).toHaveLength(1);
    expect(typeof s().speechStartedAt).toBe('number');
  });

  it('clears the start timestamp when speaking stops', () => {
    s().speak([{ viseme: 'aa', weight: 1, start: 0, dur: 100 }]);
    s().stopSpeaking();
    expect(s().speechStartedAt).toBeNull();
  });

  it('sets and resets individual expressions', () => {
    s().setExpression('happy', 0.7);
    expect(s().expressions.happy).toBe(0.7);
    s().resetExpressions();
    expect(s().expressions).toEqual({});
  });

  it('sets a single bone axis without disturbing the others', () => {
    s().setBone('head', 'x', 0.5);
    s().setBone('head', 'y', 0.2);
    expect(s().manualBones.head).toEqual({ x: 0.5, y: 0.2, z: 0 });
  });

  it('clears one bone without clearing the rest', () => {
    s().setBone('head', 'x', 0.5);
    s().setBone('chest', 'x', 0.3);
    s().clearBone('head');
    expect(s().manualBones.head).toBeUndefined();
    expect(s().manualBones.chest).toBeDefined();
  });

  it('clears every bone at once', () => {
    s().setBone('head', 'x', 0.5);
    s().setBone('chest', 'x', 0.3);
    s().clearAllBones();
    expect(s().manualBones).toEqual({});
  });

  it('toggles idle behaviours independently', () => {
    expect(s().idle.blink).toBe(true);
    s().setIdle('blink', false);
    expect(s().idle.blink).toBe(false);
    expect(s().idle.breathe).toBe(true);
  });

  it('exposes a tunable parameter for every idle behaviour', () => {
    const { idle } = s();
    for (const key of [
      'blinkIntervalMin', 'blinkIntervalMax',
      'breathAmplitude', 'breathRate',
      'driftAmplitude', 'driftSpeed',
    ]) {
      expect(typeof idle[key], `missing idle param: ${key}`).toBe('number');
    }
  });

  it('sets idle parameters through the same action as the toggles', () => {
    s().setIdle('driftAmplitude', 0.2);
    expect(s().idle.driftAmplitude).toBe(0.2);
    expect(s().idle.drift).toBe(true); // unrelated keys untouched
  });

  it('updates tuning values', () => {
    s().setStiffness(30);
    s().setRate(1.5);
    expect(s().stiffness).toBe(30);
    expect(s().rate).toBe(1.5);
  });
});
