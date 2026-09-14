import { describe, it, expect } from 'vitest';
import {
  swayDeltas, sampleGaze, headFollowDelta, pickGazeOffset, pickWorkGazeOffset,
  gazeJitter, breathChain, breathPhase,
  weightShiftDeltas,
} from './aliveness.js';
import {
  GESTURES, IDLE_GESTURE_NAMES, HOLD_POINT, sampleGesture, gestureNeedsHomePose,
  gestureStagingPose, posePlacesHands,
} from './gestures.js';
import { CONTRAPPOSTO, mirrorLimb } from './poses.js';
import {
  relaxedHandPose, overlayFor, statePoseFor, STATE_OVERLAYS, CONVERSATION_STATES,
} from './postures.js';
import { addPoses, blendPoseSubset } from './composite.js';
import { HUMANOID_BONES, FINGER_BONES } from './vrmIntrospect.js';

// Deliberately thin. Most of what makes this module good or bad is a judgement
// call about how a body looks, which no assertion can make. What IS worth
// pinning down is the small set of things that could silently do nothing at
// all — a misspelled bone name writes to no node and throws no error, which is
// the exact failure mode this project's docs warn about repeatedly.

describe('relaxedHandPose', () => {
  it('only emits real VRM humanoid bone names', () => {
    // The whole point. getNormalizedBoneNode returns null for an unknown name
    // and the frame loop skips it, so a typo here is invisible: the hands just
    // never curl and nothing anywhere reports a problem.
    const valid = new Set(FINGER_BONES);
    for (const bone of Object.keys(relaxedHandPose(0.3))) {
      expect(valid.has(bone), `unknown bone: ${bone}`).toBe(true);
    }
  });

  it('covers every finger bone, so no digit is left sticking out straight', () => {
    const pose = relaxedHandPose(0.3);
    for (const bone of FINGER_BONES) {
      expect(pose[bone], `missing bone: ${bone}`).toBeDefined();
    }
  });

  it('mirrors the two hands', () => {
    const pose = relaxedHandPose(0.3);
    expect(pose.leftIndexProximal.z).toBeCloseTo(-pose.rightIndexProximal.z);
  });

  it('curls the knuckle more than the fingertip', () => {
    const pose = relaxedHandPose(0.3);
    expect(pose.leftIndexProximal.z).toBeGreaterThan(pose.leftIndexDistal.z);
  });

  it('emits nothing at zero, so the layer costs nothing when off', () => {
    expect(relaxedHandPose(0)).toEqual({});
  });
});

describe('swayDeltas', () => {
  it('counter-rotates the spine against the hips', () => {
    // The load-bearing claim of the whole module. Same sign on both means the
    // torso tips like a felled tree instead of balancing.
    const d = swayDeltas(3.7, 0.03, 0.22);
    expect(Math.sign(d.spine.z)).toBe(-Math.sign(d.hips.z));
  });

  it('drives the arms from a later phase than the hips', () => {
    // If the lag were dropped the arms would track the hips exactly, which is
    // the lockstep look this exists to avoid.
    const d = swayDeltas(3.7, 0.03, 0.22);
    expect(d.leftUpperArm.z).not.toBeCloseTo(d.hips.z);
  });

  it('emits nothing at zero amplitude', () => {
    expect(swayDeltas(3.7, 0, 0.22)).toEqual({});
  });
});

describe('gaze', () => {
  it('lands exactly on the target when the saccade completes', () => {
    const to = { yaw: 0.1, pitch: -0.05 };
    expect(sampleGaze({ yaw: 0, pitch: 0 }, to, 999, 90)).toEqual(to);
  });

  it('averts further than it wanders', () => {
    const rng = () => 0.5;
    const wander = pickGazeOffset(false, 0.06, rng);
    const avert = pickGazeOffset(true, 0.06, rng);
    expect(Math.abs(avert.yaw)).toBeGreaterThan(Math.abs(wander.yaw));
  });

  it('moves the head only part of the way toward the eyes', () => {
    const head = headFollowDelta({ yaw: 0.4, pitch: 0 }, 0.28);
    expect(head.y).toBeGreaterThan(0);
    expect(head.y).toBeLessThan(0.4);
  });
});

describe('addPoses', () => {
  it('sums bones present in several layers', () => {
    const out = addPoses({ head: { x: 1, y: 0, z: 0 } }, { head: { x: 0.5, y: 2, z: 0 } });
    expect(out.head).toEqual({ x: 1.5, y: 2, z: 0 });
  });

  it('keeps bones that only one layer mentions', () => {
    const out = addPoses({ head: { x: 1, y: 0, z: 0 } }, { hips: { x: 0, y: 3, z: 0 } });
    expect(out.hips.y).toBe(3);
    expect(out.head.x).toBe(1);
  });

  it('does not mutate its inputs', () => {
    const a = { head: { x: 1, y: 0, z: 0 } };
    addPoses(a, { head: { x: 5, y: 0, z: 0 } });
    expect(a.head.x).toBe(1);
  });
});

describe('state overlays', () => {
  it('only reference real VRM humanoid bone names', () => {
    const valid = new Set(HUMANOID_BONES);
    for (const [state, overlay] of Object.entries(STATE_OVERLAYS)) {
      for (const bone of Object.keys(overlay)) {
        expect(valid.has(bone), `${state} references unknown bone: ${bone}`).toBe(true);
      }
    }
  });

  it('never touches a bone that places the hands', () => {
    // This is the real rule the old 0.2rad ceiling was reaching for. An overlay
    // ADDS to the selected preset, so touching an arm bone would drag whatever
    // the preset did with the hands — the reason `thinking` is a full pose and
    // not an overlay. Torso lean can be large without that problem.
    const armish = /(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/;
    for (const [state, overlay] of Object.entries(STATE_OVERLAYS)) {
      for (const bone of Object.keys(overlay)) {
        expect(armish.test(bone), `${state} overlay moves the arm: ${bone}`).toBe(false);
      }
    }
  });

  it('stays small enough to read as a lean rather than a new pose', () => {
    // Ceiling raised from 0.2 when `listening` was re-measured in the Pose tab:
    // the lean it actually wanted is 24deg at the hips, which the old bound was
    // calibrated well below because every overlay was a few degrees of torso
    // shading at the time.
    for (const [state, overlay] of Object.entries(STATE_OVERLAYS)) {
      for (const [bone, rot] of Object.entries(overlay)) {
        for (const axis of ['x', 'y', 'z']) {
          expect(Math.abs(rot[axis]), `${state}.${bone}.${axis}`).toBeLessThan(0.6);
        }
      }
    }
  });

  it('makes every overlay large enough to actually see', () => {
    // The bug that shipped. These were first authored at half a degree to two
    // degrees, and the four states were distinguishable only by reading the
    // store. An upper bound alone could never catch that — "too subtle to
    // perceive" passes every check that asks whether a value is small.
    //
    // 0.05rad is about three degrees, which is roughly where a postural change
    // stops being deniable as idle drift.
    for (const [state, overlay] of Object.entries(STATE_OVERLAYS)) {
      if (Object.keys(overlay).length === 0) continue; // idle is the reference
      const biggest = Math.max(
        ...Object.values(overlay).flatMap((r) => [r.x, r.y, r.z].map(Math.abs)),
      );
      expect(biggest, `${state} is too subtle to perceive`).toBeGreaterThan(0.05);
    }
  });

  it('gives speaking no posture at all', () => {
    // The state is carried entirely by the head: eyes locked to the camera for
    // the utterance, and `speechEmphasis` moving the head at 1-3Hz. From the
    // neck down she stands exactly as she does at idle.
    //
    // This replaced an opposition assertion — listening pitched forward,
    // speaking extended back — which stopped being true twice over. First when
    // `listening` was measured and turned out to settle BACK at the hips, then
    // when speaking's posture was removed outright. Both are recorded in
    // 12-conversational-states.md rather than quietly dropped.
    expect(STATE_OVERLAYS.speaking).toEqual({});
  });

  it('still distinguishes listening from idle by posture', () => {
    // Bounded from the other side. With speaking reduced to an empty overlay,
    // a change that emptied `listening` too would pass every remaining check
    // here — and the two states would become indistinguishable while standing
    // still, which is the failure this whole file exists to prevent.
    expect(Object.keys(STATE_OVERLAYS.listening).length).toBeGreaterThan(0);
    expect(Object.keys(STATE_OVERLAYS.idle).length).toBe(0);
  });

  it('carries listening on the hips and neck, as measured', () => {
    // Dragged out in the Pose tab, then expressed as the delta from
    // `companion`. Pinned because these three numbers ARE the state: a tidy-up
    // that redistributes them across spine and chest is authoring a new pose,
    // not refactoring this one.
    expect(STATE_OVERLAYS.listening.hips.x).toBeCloseTo(-0.42, 3);
    expect(STATE_OVERLAYS.listening.neck.x).toBeCloseTo(0.36, 3);
    expect(STATE_OVERLAYS.listening.upperChest.y).toBeCloseTo(-0.11, 3);
  });

  it('returns an empty overlay for an unknown state', () => {
    expect(overlayFor('nonsense')).toEqual({});
  });
});

describe('weightShiftDeltas', () => {
  it('is a no-op on the side the pose was authored for', () => {
    expect(weightShiftDeltas(1, CONTRAPPOSTO)).toEqual({});
  });

  it('exactly mirrors the contrapposto at the far side', () => {
    // The load-bearing claim: standing on the other leg is the authored shape
    // negated. base + delta must equal -base.
    const d = weightShiftDeltas(-1, CONTRAPPOSTO);
    for (const [bone, rot] of Object.entries(CONTRAPPOSTO)) {
      expect(rot.z + d[bone].z, `${bone}.z`).toBeCloseTo(-rot.z);
      expect(rot.y + d[bone].y, `${bone}.y`).toBeCloseTo(-rot.y);
    }
  });

  it('never touches pitch, so a forward lean survives the shift', () => {
    // Flipping x would rock her backwards every time she changed feet.
    for (const rot of Object.values(weightShiftDeltas(-1, CONTRAPPOSTO))) {
      expect(rot.x).toBe(0);
    }
  });
});

describe('gestures', () => {
  it('has exactly the expected gesture roster', () => {
    // A regression test with a real cause: a text-slice deletion of one gesture
    // silently took two neighbouring ones with it, and every other test still
    // passed because they all iterate whatever GESTURES happens to contain.
    // Iterating a collection can never tell you something has fallen out of it.
    expect(Object.keys(GESTURES).sort()).toEqual([
      'neck-stretch',
      'neck-stretch-vertical',
      'roll-shoulders',
      'scratch-head',
    ]);
  });

  it('keeps the idle rotation to gestures flagged for it', () => {
    expect(IDLE_GESTURE_NAMES).toEqual(
      Object.keys(GESTURES).filter((n) => GESTURES[n].idle),
    );
    // `wave` used to be the one gesture excluded from the rotation and has
    // been removed from the project. Every gesture on the roster is idle now,
    // so this asserts the FILTER still works rather than naming a survivor —
    // an equality against the whole list would pass with the filter deleted.
    expect(IDLE_GESTURE_NAMES).not.toContain('nonsense');
    expect(IDLE_GESTURE_NAMES.every((n) => GESTURES[n].idle)).toBe(true);
  });

  it('keeps every key in a gesture on the same bone set', () => {
    // Interpolation treats a bone missing from a key as zero rotation, so a
    // bone named in only some keys would snap toward the T-pose mid-gesture.
    for (const [name, g] of Object.entries(GESTURES)) {
      const expected = Object.keys(g.keys[0].pose).sort().join(',');
      for (const [i, key] of g.keys.entries()) {
        expect(Object.keys(key.pose).sort().join(','), `${name} key ${i}`).toBe(expected);
      }
    }
  });

  it('only references real VRM humanoid bone names', () => {
    // Gestures may name finger bones too — scratch-head closes its hand.
    const valid = new Set([...HUMANOID_BONES, ...FINGER_BONES]);
    for (const [name, g] of Object.entries(GESTURES)) {
      for (const bone of Object.keys(g.keys[0].pose)) {
        expect(valid.has(bone), `${name} references unknown bone: ${bone}`).toBe(true);
      }
    }
  });

  it('starts and ends at zero weight, so it blends in and out of any pose', () => {
    for (const [name, g] of Object.entries(GESTURES)) {
      expect(sampleGesture(g, 0).weight, `${name} start`).toBe(0);
      expect(sampleGesture(g, g.duration).weight, `${name} end`).toBe(0);
      expect(sampleGesture(g, g.duration / 2).weight, `${name} middle`).toBeGreaterThan(0.9);
    }
  });

  it('runs its keys in ascending time order from 0 to 1', () => {
    for (const [name, g] of Object.entries(GESTURES)) {
      expect(g.keys[0].t, `${name} first`).toBe(0);
      expect(g.keys.at(-1).t, `${name} last`).toBe(1);
      for (let i = 1; i < g.keys.length; i += 1) {
        expect(g.keys[i].t, `${name} key ${i}`).toBeGreaterThan(g.keys[i - 1].t);
      }
    }
  });
});

describe('blendPoseSubset', () => {
  it('leaves bones the target does not name completely alone', () => {
    // The entire reason this exists rather than lerpPoses: a five-bone gesture
    // must not drag the other bones toward zero.
    const base = { head: { x: 1, y: 0, z: 0 }, hips: { x: 0.5, y: 0, z: 0 } };
    const out = blendPoseSubset(base, { head: { x: 0, y: 0, z: 0 } }, 1);
    expect(out.hips).toEqual({ x: 0.5, y: 0, z: 0 });
    expect(out.head.x).toBe(0);
  });

  it('returns the base untouched at zero weight', () => {
    const base = { head: { x: 1, y: 0, z: 0 } };
    expect(blendPoseSubset(base, { head: { x: 9, y: 0, z: 0 } }, 0)).toBe(base);
  });
});

describe('mirrorLimb', () => {
  it('renames left bones to their right counterparts', () => {
    const out = mirrorLimb({ leftUpperArm: { x: 0, y: 1, z: 2 } });
    expect(Object.keys(out)).toEqual(['rightUpperArm']);
  });

  it('negates y and z but KEEPS x', () => {
    // Reflection is improper, so a rotation vector maps to (x, -y, -z) — the
    // component along the mirror normal survives. "Negate everything" is the
    // obvious guess and would twist the mirrored limb the wrong way.
    const out = mirrorLimb({ leftHand: { x: 0.47, y: -0.33, z: -0.13 } });
    expect(out.rightHand).toEqual({ x: 0.47, y: 0.33, z: 0.13 });
  });

  it('agrees with a mirror that was written out by hand', () => {
    // These are the arms of the former `relaxed` preset, which was authored
    // symmetrically by hand long before this helper existed. Kept here as an
    // independent check on the rule rather than in poses.js, where the preset
    // itself is no longer wanted.
    const hand = {
      leftUpperArm: { x: 0, y: 0, z: 1.25 },
      leftLowerArm: { x: 0, y: -0.15, z: 0.15 },
    };
    expect(mirrorLimb(hand)).toEqual({
      rightUpperArm: { x: 0, y: 0, z: -1.25 },
      rightLowerArm: { x: 0, y: 0.15, z: -0.15 },
    });
  });

  it('ignores bones that are not left-sided', () => {
    expect(mirrorLimb({ head: { x: 1, y: 1, z: 1 } })).toEqual({});
  });
});

describe('held gestures', () => {
  it('puts every gesture at full weight at the hold point', () => {
    // The contract `hold: true` depends on. Asserted for all gestures rather
    // than only the ones currently holding, so it cannot pass vacuously when
    // none are — which is the state it is in right now.
    //
    // Zeroing a gesture's motion is NOT enough to make it hold: the envelope
    // still fades it out and the player still expires it at its duration.
    // That is exactly how the first attempt at holding failed.
    for (const [name, g] of Object.entries(GESTURES)) {
      expect(sampleGesture(g, g.duration * HOLD_POINT).weight, name).toBe(1);
    }
  });

  it('reaches the hold point before the envelope starts falling', () => {
    // Guards the pairing rather than the number: move HOLD_POINT past the
    // ease-out, or lengthen the ease-out past HOLD_POINT, and a held gesture
    // would quietly start sagging out of its pose.
    const probe = GESTURES['scratch-head'];
    expect(sampleGesture(probe, probe.duration * (HOLD_POINT + 0.01)).weight).toBe(1);
  });
});

describe('scratch-head sweep', () => {
  it('sweeps the axis the elbow actually folds on', () => {
    // The forearm's fold moved from y to z between two measurements of this
    // pose. A sweep left on the old axis would have kept producing plausible
    // numbers while swinging the arm somewhere unrelated, so this pins the
    // sweep to whichever axis carries the fold.
    const keys = GESTURES['scratch-head'].keys;
    const mid = keys.find((k) => k.t === 0.38).pose.rightLowerArm;
    const centre = keys.find((k) => k.t === 0.26).pose.rightLowerArm;

    const fold = ['x', 'y', 'z'].reduce(
      (a, b) => (Math.abs(centre[a]) > Math.abs(centre[b]) ? a : b),
    );
    expect(mid[fold]).not.toBeCloseTo(centre[fold], 4);
  });
});

describe('work gaze', () => {
  it('always looks below the horizon', () => {
    // The whole distinction between working and thinking. `thinking` averts
    // UPWARD and briefly; this must go down and stay down, for every roll of
    // the dice rather than on average.
    for (let i = 0; i < 200; i += 1) {
      expect(pickWorkGazeOffset(0.06).pitch).toBeLessThan(0);
    }
  });

  it('looks further away than an idle wander does', () => {
    const rng = () => 0.5;
    const idle = pickGazeOffset(false, 0.06, rng);
    const work = pickWorkGazeOffset(0.06, rng);
    expect(Math.abs(work.pitch)).toBeGreaterThan(Math.abs(idle.pitch));
  });

  it('points the opposite way to a thinking avert', () => {
    const rng = () => 0.5;
    const think = pickGazeOffset(true, 0.06, rng).pitch;
    const work = pickWorkGazeOffset(0.06, rng).pitch;
    expect(Math.sign(work)).toBe(-Math.sign(think));
  });
});

describe('conversation states', () => {
  it('lists every state exactly once, in conversational order', () => {
    expect(CONVERSATION_STATES).toEqual([
      'idle', 'listening', 'thinking', 'working', 'speaking',
    ]);
  });

  it('gives every state that is expressed in BONES either an overlay or a pose', () => {
    // A state with neither would silently do nothing, which is the worst
    // possible failure here: the host app sets it, nothing changes, and there
    // is no error to chase.
    //
    // Two states are exempt, and for opposite reasons. `idle` is the reference
    // the others are measured against, so having nothing IS its content.
    // `speaking` is expressed entirely above the neck — the eyes lock to the
    // camera and the head moves at 1-3Hz — so it has no bone layer by design.
    // Both exemptions are named rather than inferred, because "this state does
    // nothing" and "this state deliberately does nothing to the skeleton" look
    // identical from in here.
    const EXPRESSED_ELSEWHERE = ['idle', 'speaking'];
    for (const state of CONVERSATION_STATES) {
      if (EXPRESSED_ELSEWHERE.includes(state)) continue;
      const has = Object.keys(overlayFor(state)).length > 0 || statePoseFor(state) !== null;
      expect(has, `${state} does nothing`).toBe(true);
    }
  });
});

describe('gazeJitter', () => {
  // Microsaccades. Between the big flicks the eyes were previously PERFECTLY
  // still for one to two seconds at a time, which is the one thing real eyes
  // never are.

  it('stays within the requested amplitude', () => {
    for (let t = 0; t < 120; t += 0.29) {
      const j = gazeJitter(t, 0.01);
      expect(Math.abs(j.yaw)).toBeLessThanOrEqual(0.01 + 1e-9);
      expect(Math.abs(j.pitch)).toBeLessThanOrEqual(0.01 + 1e-9);
    }
  });

  it('returns zeros at zero amplitude', () => {
    expect(gazeJitter(5, 0)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('moves the two axes independently, so it is not a rigid diagonal', () => {
    const j = gazeJitter(3.3, 0.01);
    expect(j.yaw).not.toBeCloseTo(j.pitch, 4);
  });

  it('runs far faster than breathing, which is what makes it a micro-movement', () => {
    // Verify a DIFFERENCE, not a magnitude: a jitter tuned slow is just a
    // second head drift, and nothing that checks its amplitude would notice.
    const window = 20;
    const jitterTurns = directionChanges((t) => gazeJitter(t, 0.01).yaw, window);
    const breathTurns = directionChanges((t) => breathChain(t, 0.046, 0.25).chest.x, window);
    expect(jitterTurns).toBeGreaterThan(breathTurns * 3);
  });
});

describe('breathChain', () => {
  it('never pulls the chest below its resting rotation', () => {
    // Quiet breathing runs from rest UPWARD. The old symmetric sine spent half
    // of every cycle compressing the chest below the pose, which is not a thing
    // a resting body does.
    for (let t = 0; t < 60; t += 0.13) {
      expect(breathChain(t, 0.046, 0.25).chest.x).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('reaches full amplitude at the top of the breath', () => {
    const peak = maxOver((t) => breathChain(t, 0.046, 0.25).chest.x, 8);
    expect(peak).toBeCloseTo(0.046, 3);
  });

  it('keeps the shoulders lagging the chest rather than moving with it', () => {
    // The coupling claim the module exists for: the ribcage leads, the
    // shoulders ride. Identical phase would read as one rigid block.
    const t = 1.3;
    const a = breathChain(t, 0.046, 0.25);
    const b = breathChain(t - 0.18, 0.046, 0.25);
    expect(Math.abs(a.leftShoulder.z)).toBeCloseTo(Math.abs(b.chest.x) * 0.5, 4);
  });

  it('returns nothing at zero amplitude', () => {
    expect(breathChain(3, 0, 0.25)).toEqual({});
  });
});

describe('breathPhase', () => {
  it('runs 0 to 1 across one breath and wraps', () => {
    expect(breathPhase(0, 0.25)).toBeCloseTo(0, 4);
    expect(breathPhase(2, 0.25)).toBeCloseTo(0.5, 4);
    expect(breathPhase(4, 0.25)).toBeCloseTo(0, 4);
  });

  it('stays inside 0..1', () => {
    for (let t = 0; t < 50; t += 0.17) {
      const p = breathPhase(t, 0.25);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});

/** How many times a signal reverses direction over `seconds`. */
function directionChanges(fn, seconds) {
  let turns = 0;
  let prev = fn(0.02) - fn(0);
  for (let t = 0.02; t < seconds; t += 0.02) {
    const d = fn(t + 0.02) - fn(t);
    if (d !== 0 && prev !== 0 && Math.sign(d) !== Math.sign(prev)) turns += 1;
    if (d !== 0) prev = d;
  }
  return turns;
}

function maxOver(fn, seconds) {
  let peak = -Infinity;
  for (let t = 0; t < seconds; t += 0.005) peak = Math.max(peak, fn(t));
  return peak;
}

describe('staging a gesture', () => {
  it('counts the shoulder as a bone that places a hand', () => {
    // The correction that made the neck stretches stage. `arms-behind` holds
    // her hands there with a 50-degree roll AT THE SHOULDER, so a gesture that
    // writes the shoulders takes the hands out from behind her back without
    // naming a single arm bone.
    expect(posePlacesHands({ leftShoulder: { x: 0, y: 0, z: 0 } })).toBe(true);
  });

  it('leaves a head, neck and chest gesture alone', () => {
    // Bounded from the other side: a predicate that always returns true would
    // pass every other test here. No gesture on the roster is currently this
    // shape, which is why the case is made explicitly rather than by example.
    expect(posePlacesHands({
      head: { x: 0, y: 0, z: 0 },
      neck: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: 0, z: 0 },
    })).toBe(false);
  });

  it('needs the home pose for every gesture on the roster', () => {
    // A fact about today's roster, not a rule. Named individually so a gesture
    // dropping out of the set is visible — iterating GESTURES here would pass
    // happily on a smaller collection.
    for (const name of [
      'scratch-head', 'neck-stretch', 'neck-stretch-vertical', 'roll-shoulders',
    ]) {
      expect(gestureNeedsHomePose(name), name).toBe(true);
    }
  });

  it('is false for a gesture that does not exist', () => {
    expect(gestureNeedsHomePose('nonsense')).toBe(false);
  });

  it('sends her back to companion before an arm gesture', () => {
    // The arm gestures start and end at ARM_DOWN — the arm hanging at her side,
    // exactly where `companion` has it. Fired from `arms-behind` they yank the
    // hand from behind her back to a position the keyframes assume it already
    // occupies, which is the weird pose this staging exists to prevent.
    expect(gestureStagingPose('scratch-head', 'arms-behind')).toBe('companion');
    expect(gestureStagingPose('scratch-head', 'arm-behind-left')).toBe('companion');
  });

  it('does not move her when she is already there', () => {
    expect(gestureStagingPose('scratch-head', 'companion')).toBe(null);
  });

  it('stages the neck stretches too, despite them touching no arm bone', () => {
    // They write the shoulders back toward neutral, which in `arms-behind` is
    // exactly what was holding the hands behind her.
    expect(gestureStagingPose('neck-stretch', 'arms-behind')).toBe('companion');
    expect(gestureStagingPose('neck-stretch-vertical', 'arms-behind')).toBe('companion');
  });
});
