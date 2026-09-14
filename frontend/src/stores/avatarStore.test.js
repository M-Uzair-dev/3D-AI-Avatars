import { describe, it, expect, beforeEach } from 'vitest';
import { useAvatarStore } from './avatarStore.js';
import { DEFAULT_POSE, POSES } from '@/lib/poses.js';
import { modelVoiceForUrl } from '@/lib/constants.js';

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

  it('has her voice on by default', () => {
    expect(s().voiceEnabled).toBe(true);
  });

  // The voice is a property of the model rather than its own store key, so
  // there is nothing to select and nothing that can disagree with who is on
  // screen. This pins that there is no stray selector left behind.
  it('has no separate voice selection to fall out of sync with the model', () => {
    expect(s().voiceId).toBeUndefined();
    expect(s().setVoice).toBeUndefined();
    expect(modelVoiceForUrl(s().modelUrl)).toBeTruthy();
  });

  // Swapping the model mid-sentence must not leave the previous character's
  // voice finishing the line out of the new one's body.
  it('stops a running utterance when the model changes', () => {
    s().speak([{ viseme: 'aa', weight: 1, start: 0, dur: 100 }]);
    expect(s().speechStartedAt).not.toBeNull();

    s().setModel('/free-1.vrm');
    expect(s().speechStartedAt).toBeNull();
    expect(s().modelUrl).toBe('/free-1.vrm');
  });

  it('toggles the voice', () => {
    s().setVoiceEnabled(false);
    expect(s().voiceEnabled).toBe(false);
    s().setVoiceEnabled(true);
    expect(s().voiceEnabled).toBe(true);
  });

  // Muting mid-sentence has to actually stop her. Scheduled audio keeps playing
  // until something stops it, so a toggle that only flipped the flag would
  // leave the current utterance audible and mute the *next* one instead —
  // which reads as the button not working.
  it('stops a running utterance when the voice is switched off', () => {
    s().speak([{ viseme: 'aa', weight: 1, start: 0, dur: 100 }]);
    expect(s().speechStartedAt).not.toBeNull();

    s().setVoiceEnabled(false);
    expect(s().speechStartedAt).toBeNull();
  });

  it('leaves a silent avatar alone when the voice is switched off', () => {
    expect(s().speechStartedAt).toBeNull();
    s().setVoiceEnabled(false);
    expect(s().speechStartedAt).toBeNull();
    expect(s().voiceEnabled).toBe(false);
  });

  // Turning it back on must not start anything talking by itself.
  it('does not begin speaking when the voice is switched on', () => {
    s().setVoiceEnabled(false);
    s().setVoiceEnabled(true);
    expect(s().speechStartedAt).toBeNull();
  });

  it('sets and resets individual expressions', () => {
    s().setExpression('happy', 0.7);
    expect(s().expressions.happy).toBe(0.7);
    s().resetExpressions();
    expect(s().expressions).toEqual({});
  });

  it('sets a single bone axis without disturbing the others', () => {
    // Pinned to a named preset rather than the default, so the assertion is
    // about axis independence and not about whatever the default happens to be
    // that week. The untouched axis is asserted against the PRESET's value, not
    // against zero: every pose tilts the head a little, and a zero here would
    // only be testing that the seeding is broken.
    s().setPose('arms-behind');
    s().setBone('head', 'x', 0.5);
    s().setBone('head', 'y', 0.2);
    expect(s().manualBones.head).toEqual({
      x: 0.5,
      y: 0.2,
      z: POSES['arms-behind'].head.z,
    });
  });

  it('seeds a first-time bone edit from the active preset, not from zero', () => {
    // arms-behind puts leftUpperArm well off zero on both y and z. Nudging x
    // must not silently drop those, or the limb snaps to a different pose the
    // moment you touch a slider — which makes the Pose tab unusable for
    // authoring, and authoring is now how every pose in this project is made.
    s().setPose('arms-behind');
    s().setBone('leftUpperArm', 'x', 0.3);
    expect(s().manualBones.leftUpperArm).toEqual({
      x: 0.3,
      y: POSES['arms-behind'].leftUpperArm.y,
      z: POSES['arms-behind'].leftUpperArm.z,
    });
  });

  it('seeds from zero for a bone the active preset does not mention', () => {
    s().setPose('arms-behind');
    s().setBone('leftFoot', 'x', 0.4);
    expect(s().manualBones.leftFoot).toEqual({ x: 0.4, y: 0, z: 0 });
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

  describe('the entrance', () => {
    it('does not start out arriving', () => {
      expect(s().arriving).toBe(false);
    });

    it('is switched on and off through one action', () => {
      s().setArriving(true);
      expect(s().arriving).toBe(true);
      s().setArriving(false);
      expect(s().arriving).toBe(false);
    });

    // While `arriving` is true she may be hidden, so a path that leaves it set
    // forever is an avatar nobody can see. resetAll is one of those paths.
    it('is cleared by a full reset', () => {
      s().setArriving(true);
      s().resetAll();
      expect(s().arriving).toBe(false);
    });
  });

  describe('carousel', () => {
    it('starts settled, with no ring until something fetches one', () => {
      expect(s().carousel).toBeNull();
      expect(s().modelRing).toEqual([]);
    });

    // THE POINT OF THE WHOLE DESIGN. Pressing the button must not change who is
    // loaded — that happens at the midpoint, on an empty stage. Swapping on the
    // press tears the model out from under its own exit animation, which is the
    // pop the transition exists to hide.
    it('does not change the loaded model when a transition starts', () => {
      const before = s().modelUrl;
      s().startCarousel('/other.vrm', +1);
      expect(s().modelUrl).toBe(before);
      expect(s().carousel.targetUrl).toBe('/other.vrm');
    });

    it('records the direction it was asked for', () => {
      s().startCarousel('/other.vrm', -1);
      expect(s().carousel.direction).toBe(-1);
    });

    // A queued press fires at a moment the user has stopped expecting it, which
    // reads as the control being broken rather than busy. Dropping it is the
    // honest behaviour, and the button is visibly disabled meanwhile.
    it('ignores a second press while one is already running', () => {
      s().startCarousel('/a.vrm', +1);
      const first = s().carousel;
      s().startCarousel('/b.vrm', +1);
      expect(s().carousel).toBe(first);
    });

    it('accepts a new transition once the last one ends', () => {
      s().startCarousel('/a.vrm', +1);
      s().endCarousel();
      expect(s().carousel).toBeNull();
      s().startCarousel('/b.vrm', -1);
      expect(s().carousel.targetUrl).toBe('/b.vrm');
    });

    // The buttons resolve their target from the ring and pass null when there
    // is nowhere to go. Starting a transition toward nothing would disable both
    // buttons for the length of an animation that swaps in no model at all.
    it('refuses to start a transition with no target', () => {
      s().startCarousel(null, +1);
      expect(s().carousel).toBeNull();
    });

    it('publishes the ring for the avatar to prefetch against', () => {
      s().setModelRing(['/a.vrm', '/b.vrm']);
      expect(s().modelRing).toEqual(['/a.vrm', '/b.vrm']);
    });
  });
});
