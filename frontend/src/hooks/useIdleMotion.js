'use client';

import { useRef } from 'react';
import { DEFAULTS } from '@/lib/constants.js';
import { driftDeltas } from '@/lib/idleMath.js';
import {
  blinkEnvelope, blinkSpanMs, blinkCount, saccadeTriggersBlink, BLINK_COOLDOWN_MS,
} from '@/lib/blink.js';
import {
  swayDeltas,
  breathChain,
  pickGazeOffset,
  sampleGaze,
  headFollowDelta,
  pickWorkGazeOffset,
  gazeJitter,
  speechEmphasis,
  weightShiftDeltas,
  smootherstep,
} from '@/lib/aliveness.js';
import { addPoses } from '@/lib/composite.js';
import { CONTRAPPOSTO, IDLE_POSE_ROTATION, DEFAULT_POSE } from '@/lib/poses.js';
import {
  GESTURES, IDLE_GESTURE_NAMES, HOLD_POINT, sampleGesture, gestureStagingPose,
} from '@/lib/gestures.js';

const randomInterval = (min, max) => min + Math.random() * (Math.max(min, max) - min);

const ORIGIN = { yaw: 0, pitch: 0 };

/**
 * Blink and gaze scheduling, plus the procedural bone deltas.
 *
 * The MATH all lives in lib/ as pure functions. What lives here is the part
 * that genuinely needs to persist between frames: when the next blink is due,
 * which way the eyes are currently pointed, and when they last moved. That
 * split is the same one the rest of the codebase uses, and it is why the
 * interesting behaviour is testable without a browser.
 *
 * Every tuning value comes from the `idle` store slice rather than from
 * DEFAULTS, so the Idle tab's sliders are live — DEFAULTS only seeds the
 * store's initial state.
 *
 * Returns { blink, deltas, gaze } where deltas is a bone-name -> rotation map
 * ready to hand to compositeBones as the additive idle layer, and gaze is a
 * yaw/pitch offset in radians for the caller to apply to the lookAt target.
 */
export function useIdleMotion() {
  const nextBlinkAt = useRef(null);
  const blinkStartedAt = useRef(null);
  const blinkBlinks = useRef(1);
  // When the last blink finished, so a burst of saccades cannot produce a
  // burst of blinks.
  const blinkEndedAt = useRef(-Infinity);

  const gazeFrom = useRef(ORIGIN);
  const gazeTo = useRef(ORIGIN);
  const gazeStartedAt = useRef(0);
  const nextGazeAt = useRef(null);

  // Weight shift. `side` is where she is now, `from` where she came from, so a
  // shift interrupted partway still eases from wherever it had got to.
  const weightSide = useRef(1);
  const weightFrom = useRef(1);
  const shiftStartedAt = useRef(-Infinity);
  const nextShiftAt = useRef(null);

  const gesture = useRef(null);
  const nextGestureAt = useRef(null);
  const lastRequestAt = useRef(0);

  // Where to put her back after something that needs her arms — an arm gesture,
  // or a full-pose conversational state — has borrowed `companion`.
  const poseRestore = useRef(null);
  const wasBusy = useRef(false);
  // So the eyes come back to the lens the instant she starts talking, rather
  // than whenever the next wander happened to be due.
  const wasSpeaking = useRef(false);

  const nextPoseShiftAt = useRef(null);

  // The working check-in: looking up from the task and back down again.
  const checkingIn = useRef(false);
  const checkInUntil = useRef(0);
  const nextCheckInAt = useRef(null);

  return function step({
    nowMs, tSec, idle, thinking = false, working = false, listening = false,
    speaking = false, busy = false, gestureRequest = null, poseName = null,
  }) {
    // `working` runs for minutes rather than seconds, so the whole system paces
    // differently in it rather than merely adopting a different shape. Scales
    // are applied to the store's values rather than replacing them, so the Idle
    // tab's sliders stay meaningful in every state.
    const pace = DEFAULTS.workingPace;
    const gestureMin = working ? idle.gestureIntervalMin * pace.gestureScale
      : idle.gestureIntervalMin;
    const gestureMax = working ? idle.gestureIntervalMax * pace.gestureScale
      : idle.gestureIntervalMax;
    const weightMin = working ? idle.weightIntervalMin * pace.weightScale
      : idle.weightIntervalMin;
    const weightMax = working ? idle.weightIntervalMax * pace.weightScale
      : idle.weightIntervalMax;
    // --- gaze scheduling ---
    //
    // The eyes hold a point for a second or two, then flick to another in under
    // a tenth of a second. Both halves matter: without the hold it looks
    // twitchy, and without the flick it looks sedated. While thinking, most
    // shifts break contact entirely, which is what makes a silent pause read as
    // pondering rather than as staring.
    //
    // While working the eyes sit DOWN on the task and stay there, except for a
    // periodic glance up at the viewer. `forceTarget` is how that glance
    // overrides the ordinary wander schedule in both directions.
    let gazeBase = ORIGIN;
    let forceTarget = null;
    // Raised on the frame a saccade starts, and read by the blink scheduler
    // below. Only a big enough shift counts — the gate is in blink.js.
    let saccadeFired = false;
    if (working && idle.gaze) {
      if (nextCheckInAt.current === null) {
        nextCheckInAt.current = nowMs
          + randomInterval(idle.checkInIntervalMin, idle.checkInIntervalMax);
      }
      if (checkingIn.current) {
        if (nowMs >= checkInUntil.current) {
          checkingIn.current = false;
          forceTarget = pickWorkGazeOffset(gazeAmount);
          nextCheckInAt.current = nowMs
            + randomInterval(idle.checkInIntervalMin, idle.checkInIntervalMax);
        }
      } else if (nowMs >= nextCheckInAt.current) {
        checkingIn.current = true;
        checkInUntil.current = nowMs + DEFAULTS.checkInDuration;
        forceTarget = ORIGIN;
      }
    } else {
      checkingIn.current = false;
      nextCheckInAt.current = null;
    }


    // Listening narrows the wander and lengthens the hold, so the eyes settle
    // on the viewer instead of roaming. Attention is the entire content of that
    // state and roaming eyes contradict the lean.
    const gazeAmount = listening
      ? idle.gazeAmount * DEFAULTS.listeningGazeScale : idle.gazeAmount;
    const gazeMin = listening
      ? idle.gazeIntervalMin * DEFAULTS.listeningHoldScale : idle.gazeIntervalMin;
    const gazeMax = listening
      ? idle.gazeIntervalMax * DEFAULTS.listeningHoldScale : idle.gazeIntervalMax;

    // SPEAKING LOOKS AT THE CAMERA AND NOWHERE ELSE.
    //
    // This is the ENTIRE content of the speaking state now — there is no
    // postural overlay at all, so she stands exactly as she does at idle and
    // only her head behaves differently. That split exists because the idle
    // layer got good enough to cause the problem: between the gaze wander and
    // the head drift she is rarely looking straight down the lens, which is
    // fine for a character standing there and wrong for one talking to you.
    //
    // The general rule in this file is that eyes must not lock — a fixed stare
    // is the most unsettling thing an avatar can do, and naive camera tracking
    // is how you get one. Speaking is the exception, and it is an exception for
    // a reason rather than a contradiction: delivering a line while your eyes
    // wander off the listener's face reads as distracted or evasive, which is
    // the worst thing the one state that IS addressing you could read as.
    //
    // What keeps it from being a stare is that everything else carries on. She
    // blinks, the microsaccades run, the head drifts, and `speechEmphasis`
    // moves her head at 1-3Hz underneath. The eyes hold the lens; nothing else
    // holds still.
    if (idle.gaze && speaking !== wasSpeaking.current) {
      // Snapped on the EDGE in both directions rather than waiting for the next
      // scheduled saccade, which can be four seconds away — long enough to
      // spend half a sentence looking elsewhere, or to sit locked on the lens
      // well after she has stopped talking.
      forceTarget = speaking ? ORIGIN : pickGazeOffset(false, gazeAmount);
    }
    wasSpeaking.current = speaking;

    if (idle.gaze) {
      if (nextGazeAt.current === null) {
        nextGazeAt.current = nowMs + randomInterval(gazeMin, gazeMax);
      }
      // The wander schedule must not retarget mid-glance, or the check-in gets
      // cut short by an ordinary saccade a fraction of a second after it starts.
      const holdForCheckIn = checkingIn.current && !forceTarget;
      if (forceTarget || (!holdForCheckIn && nowMs >= nextGazeAt.current)) {
        const averted = thinking && Math.random() < DEFAULTS.gazeAvertChance;
        gazeFrom.current = gazeTo.current;
        if (forceTarget) gazeTo.current = forceTarget;
        // Every scheduled saccade while speaking re-targets the lens, so she
        // holds it for the whole utterance rather than drifting off it once.
        else if (speaking) gazeTo.current = ORIGIN;
        else if (working) gazeTo.current = pickWorkGazeOffset(gazeAmount);
        else gazeTo.current = pickGazeOffset(averted, gazeAmount);
        saccadeFired = saccadeTriggersBlink(gazeFrom.current, gazeTo.current);
        gazeStartedAt.current = nowMs;
        nextGazeAt.current = nowMs + randomInterval(gazeMin, gazeMax);
      }
      gazeBase = sampleGaze(
        gazeFrom.current,
        gazeTo.current,
        nowMs - gazeStartedAt.current,
        DEFAULTS.gazeDuration,
      );
    } else {
      gazeFrom.current = ORIGIN;
      gazeTo.current = ORIGIN;
      nextGazeAt.current = null;
    }

    // The tremor of a fixating eye, on top of wherever the saccade left it.
    // `gazeBase` stays clean because the HEAD follows that one — a head that
    // tracks microsaccades is a head with a tremor.
    const jitter = idle.gaze ? gazeJitter(tSec, idle.gazeJitterAmount) : ORIGIN;
    const gaze = {
      yaw: gazeBase.yaw + jitter.yaw,
      pitch: gazeBase.pitch + jitter.pitch,
    };

    // --- blink scheduling ---
    //
    // Runs AFTER gaze on purpose, because a blink is not only a timer here: a
    // large enough saccade drags one along with it, the way a real blink lands
    // on the eyes changing target rather than on its own schedule. Scheduling
    // blink first would put that coupling a frame late.
    //
    // The blink itself is 1 or 2 flicks of an asymmetric envelope — see
    // blink.js for why neither of those is the obvious choice.
    if (nextBlinkAt.current === null) {
      nextBlinkAt.current = nowMs + randomInterval(idle.blinkIntervalMin, idle.blinkIntervalMax);
    }

    let blink = 0;
    if (idle.blink) {
      const idleEyes = blinkStartedAt.current === null;
      const cooledDown = nowMs - blinkEndedAt.current >= BLINK_COOLDOWN_MS;
      if (idleEyes && (nowMs >= nextBlinkAt.current || (saccadeFired && cooledDown))) {
        blinkStartedAt.current = nowMs;
        blinkBlinks.current = blinkCount();
      }
      if (blinkStartedAt.current !== null) {
        const elapsed = nowMs - blinkStartedAt.current;
        blink = blinkEnvelope(elapsed, blinkBlinks.current);
        if (elapsed > blinkSpanMs(blinkBlinks.current)) {
          blinkStartedAt.current = null;
          blinkEndedAt.current = nowMs;
          nextBlinkAt.current = nowMs
            + randomInterval(idle.blinkIntervalMin, idle.blinkIntervalMax);
        }
      }
    } else {
      blinkStartedAt.current = null;
      nextBlinkAt.current = nowMs + randomInterval(idle.blinkIntervalMin, idle.blinkIntervalMax);
    }

    // --- weight shift ---
    //
    // Slow and rare by design. This is the longest-period thing in the system:
    // if you can predict when it is coming, it is firing too often.
    let weight = weightSide.current;
    if (idle.weightShift) {
      if (nextShiftAt.current === null) {
        nextShiftAt.current = nowMs
          + randomInterval(weightMin, weightMax);
      }
      if (nowMs >= nextShiftAt.current) {
        weightFrom.current = weight;
        weightSide.current = -weightSide.current;
        shiftStartedAt.current = nowMs;
        nextShiftAt.current = nowMs
          + randomInterval(weightMin, weightMax);
      }
      const k = smootherstep((nowMs - shiftStartedAt.current) / DEFAULTS.weightShiftMs);
      weight = weightFrom.current + (weightSide.current - weightFrom.current) * k;
    } else {
      // Ease back to the authored side rather than snapping when switched off.
      weightSide.current = 1;
      weightFrom.current = weight;
      nextShiftAt.current = null;
      weight = 1;
    }

    // --- gestures ---
    //
    // Suppressed while speaking, because a hand going to the face competes with
    // the mouth for attention at precisely the moment the mouth is the point.
    // Allowed while idle or thinking, which is where game idles live.
    const gesturesAllowed = idle.gestures && !speaking && !busy;

    // The loop's one write to the store, declared up here because staging a
    // gesture drives the pose as well as the gesture.
    let poseRequest = null;

    /**
     * Start a gesture, or send her back to `companion` first if it places a
     * hand and she is not standing where the keyframes assume.
     */
    const begin = (name) => {
      const staging = gestureStagingPose(name, poseName);
      if (staging && !poseRestore.current) {
        poseRestore.current = poseName;
        poseRequest = staging;
      }
      // Started in the SAME frame as the pose request, not after it. Waiting
      // for the pose to land first put a dead second in front of every gesture
      // — she visibly stopped in `companion` and then began. Both eases run
      // together instead: the base pose travels out of `arms-behind` while the
      // gesture envelope fades in over it, which reads as one movement.
      gesture.current = { name, startedAt: nowMs };
    };

    /** Put her back in whatever she was standing in before the gesture. */
    const restorePose = () => {
      if (!poseRestore.current) return;
      poseRequest = poseRestore.current;
      poseRestore.current = null;
    };

    if (gestureRequest && gestureRequest.at !== lastRequestAt.current) {
      // A manual trigger from the panel always wins, even over a running
      // gesture — otherwise the buttons feel broken while one is playing.
      lastRequestAt.current = gestureRequest.at;
      // A request naming nothing recognisable is a release — it is how the
      // panel clears a held gesture.
      gesture.current = null;
      if (GESTURES[gestureRequest.name]) begin(gestureRequest.name);
      else restorePose();
    } else if (gesturesAllowed && !gesture.current) {
      if (nextGestureAt.current === null) {
        nextGestureAt.current = nowMs
          + randomInterval(gestureMin, gestureMax);
      }
      if (nowMs >= nextGestureAt.current) {
        begin(IDLE_GESTURE_NAMES[Math.floor(Math.random() * IDLE_GESTURE_NAMES.length)]);
        nextGestureAt.current = null;
      }
    }


    let gesturePose = null;
    let gestureWeight = 0;
    if (gesture.current) {
      const def = GESTURES[gesture.current.name];
      const elapsed = nowMs - gesture.current.startedAt;
      if (def.hold) {
        // Plays its approach normally, then parks at the plateau and stays
        // there until something else is triggered or the panel releases it.
        // Clamping rather than jumping straight to the hold point is what keeps
        // the arm easing up into position instead of snapping into it.
        const sampled = sampleGesture(def, Math.min(elapsed, def.duration * HOLD_POINT));
        gesturePose = sampled.pose;
        gestureWeight = sampled.weight;
      } else if (elapsed >= def.duration) {
        gesture.current = null;
        restorePose();
        nextGestureAt.current = nowMs
          + randomInterval(gestureMin, gestureMax);
      } else {
        const sampled = sampleGesture(def, elapsed);
        gesturePose = sampled.pose;
        gestureWeight = sampled.weight;
      }
    }

    // --- resting pose drift ---
    //
    // Occasionally fold or unfold her arms. Returned as a request rather than
    // applied here, because the pose lives in the store where the Pose tab can
    // see it — the panel should show what she is actually doing.
    //
    // Held off whenever she is already committed to something: mid-gesture,
    // mid-sentence, or in a state that owns the arms. Changing the base pose
    // underneath a running gesture would not break anything (the gesture blends
    // over the top) but it would produce a drift the gesture then snaps out of.
    // A full-pose conversational state — `thinking` — owns the arms, and its
    // pose was authored over `companion`. Held while her hands are behind her
    // back it only blends the bones it NAMES, so the shoulder it does not name
    // keeps the 50-degree roll that put the hand back there and the free arm
    // hangs off a twisted shoulder. Borrowing `companion` for the duration is
    // the same trade the arm gestures make, for the same reason.
    if (busy && !wasBusy.current && poseName !== DEFAULT_POSE && !poseRestore.current) {
      poseRestore.current = poseName;
      poseRequest = DEFAULT_POSE;
    } else if (!busy && wasBusy.current && !gesture.current) {
      restorePose();
    }
    wasBusy.current = busy;

    const poseShiftAllowed = idle.poseShift && !speaking && !busy
      && !gesture.current && !poseRestore.current;
    if (poseShiftAllowed) {
      if (nextPoseShiftAt.current === null) {
        nextPoseShiftAt.current = nowMs
          + randomInterval(idle.poseIntervalMin, idle.poseIntervalMax);
      }
      if (nowMs >= nextPoseShiftAt.current) {
        nextPoseShiftAt.current = nowMs
          + randomInterval(idle.poseIntervalMin, idle.poseIntervalMax);
        // Move to a DIFFERENT entry than the current one. If the panel has her
        // in something outside the rotation, this pulls her into it.
        const options = IDLE_POSE_ROTATION.filter((n) => n !== poseName);
        if (options.length) {
          poseRequest = options[Math.floor(Math.random() * options.length)];
        }
      }
    } else if (!idle.poseShift) {
      nextPoseShiftAt.current = null;
    }

    // --- procedural bone deltas ---
    //
    // Summed rather than assigned, because several behaviours legitimately want
    // the same bone: breath and sway both touch the chest, and drift, breath
    // and gaze-follow all touch the head. Assigning would silently let whichever
    // ran last win.
    const layers = [];

    if (idle.drift) layers.push({ head: driftDeltas(tSec, idle.driftAmplitude, idle.driftSpeed) });
    if (idle.breathe) {
      layers.push(breathChain(
        tSec,
        working ? idle.breathAmplitude * pace.breathAmplitudeScale : idle.breathAmplitude,
        working ? idle.breathRate * pace.breathRateScale : idle.breathRate,
      ));
    }
    if (idle.sway) {
      layers.push(swayDeltas(tSec, idle.swayAmplitude, idle.swaySpeed, DEFAULTS.swayLag));
    }
    if (idle.gaze && idle.gazeHeadFollow) {
      layers.push({ head: headFollowDelta(gazeBase, idle.gazeHeadFollow) });
    }
    return {
      blink,
      deltas: addPoses(...layers),
      gaze,
      // Speech emphasis is returned outside `deltas` for the same reason as the
      // weight shift: `deltas` is attenuated while speaking, and attenuating
      // the one layer that only EXISTS while speaking would cancel it out.
      speechDeltas: speaking && idle.speechEmphasis
        ? speechEmphasis(tSec, idle.speechEmphasisAmplitude)
        : {},
      // Returned separately from `deltas` rather than folded into it, because
      // `deltas` is attenuated while speaking. Scaling the weight shift down
      // mid-sentence would partly un-shift her — a lurch toward the other foot
      // the moment she starts talking and back again when she stops.
      weightDeltas: weightShiftDeltas(weight, CONTRAPPOSTO),
      gesturePose,
      gestureWeight,
      gestureName: gesture.current?.name ?? null,
      poseRequest,
      weightSide: weight,
    };
  };
}
