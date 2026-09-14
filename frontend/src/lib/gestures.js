import { relaxedHandPose } from './postures.js';
import { DEFAULT_POSE } from './poses.js';

/**
 * Idle gestures: the occasional small actions that fill dead air.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE AND NOT AN ANIMATION CLIP
 * ---------------------------------------------------------------------------
 * This is the thing games have done for thirty years: leave a character alone
 * and eventually they scratch their head, roll a shoulder, check their weapon.
 * It works because it implies an inner life — something happened that the
 * player did not cause. Procedural sway says "this body is not a statue";
 * a gesture says "this person is bored".
 *
 * Authored as keyframes rather than loaded as .vrma because clip playback in
 * this project has never actually executed, and because keyframes here stay
 * pure data that the test suite can check without a GPU.
 *
 * ---------------------------------------------------------------------------
 * HOW A GESTURE IS SHAPED
 * ---------------------------------------------------------------------------
 * Each gesture is a list of keys at normalized times 0..1 holding ABSOLUTE bone
 * rotations — not deltas. Absolute is the right call here because a gesture is
 * a destination ("hand at the top of the head"), and expressing that as an
 * offset would make every value depend on whichever pose preset happened to be
 * selected.
 *
 * The blend back to the base pose is handled by a separate weight envelope, so
 * only the bones a gesture names are affected and everything else keeps doing
 * what it was doing. That is why she can scratch her head while still breathing
 * and swaying.
 *
 * INVARIANT: every key in a gesture must name the SAME bone set. Interpolation
 * between keys treats an unnamed bone as zero rotation, so a bone appearing in
 * only some keys would snap toward the T-pose partway through. There is a test
 * for this.
 *
 * Axis conventions are poses.js's. For the RIGHT arm, which most of these use:
 * positive z raises, positive y swings forward, and the elbow folds on the
 * lower arm's y. For the right HAND, confirmed by eye rather than derived:
 * positive z extends the wrist backward, negative flexes it toward the palm.
 *
 * ---------------------------------------------------------------------------
 * STATUS
 * ---------------------------------------------------------------------------
 * CONFIRMED GOOD, watched running: `neck-stretch`, `roll-shoulders`.
 *
 * REWORKED, untried: `neck-stretch-vertical`.
 *
 * REPAIRED and back in the rotation: `scratch-head`, on a second measurement
 * after the first put the hand inside the head.
 *
 * `hold: true` is still supported and no gesture uses it. It parks a gesture at
 * its peak so a pose can be corrected against a still target, which is what
 * that second measurement was taken against.
 *
 * DELETED: `scratch-neck` and `adjust-hair`. Neither earned its place, and a
 * broken gesture kept behind a flag is just dead code with a longer name. If
 * either is wanted later, build it the way the working ones were built: drag
 * the arm out in the Pose tab and paste the numbers in.
 *
 * THE LESSON, which should steer whatever gets authored next: every gesture
 * that worked first time stays on the spine and shoulders, and every one that
 * failed reaches down the arm. Arm axes on this rig have now produced a wrong
 * answer four times — twice before this module existed, per the warning at the
 * top of poses.js, and twice more here. Torso gestures can be written directly.
 * Anything that puts a hand at a specific point on the body should be MEASURED:
 * drag it in the Pose tab, press "Copy pose JSON", and paste the numbers in.
 */

/** Fraction of the duration spent easing in, and easing out. */
const ENVELOPE = { in: 0.18, out: 0.24 };

/** Degrees to radians. These values are dialled in by eye, and eyes think in degrees. */
const deg = (d) => (d * Math.PI) / 180;

/**
 * Scratch-head arm position — MEASURED, not reasoned about.
 *
 * Two attempts at deriving this from the axis conventions produced, in order, a
 * convincing wave and something worse. These numbers instead came out of the
 * Pose tab: the arm was dragged until the hand actually sat on the head, and
 * "Copy pose JSON" reported where it had ended up. That is the authoring loop
 * the Pose tab was built for, and the lesson is the one poses.js already states
 * at the top of the file in bold — do not derive rig axes, measure them.
 *
 * Note how far the derived guesses were off. The real elbow is at y 2.07 where
 * the guess had 1.42, and the real upper arm is at z 0.05 where the guess had
 * 0.30. Nothing about a small correction would have got there.
 */
const SCRATCH = {
  // Upper arm unchanged from the first measurement — the correction pass only
  // sent the forearm and hand.
  upperArm: { x: 0.14, y: 0.94, z: 0.05 },
  lowerArm: { x: -0.11, y: 0.22, z: 2.14 },
  hand: { x: 1.98, y: 0.36, z: 0.22 },
  fingerCurl: 0.75, // roughly halfway to a fist

  // THE RUB RIDES A NAMED AXIS PER JOINT, because which axis is the fold is a
  // property of the measured pose rather than a constant of the rig.
  //
  // The first measurement folded the elbow on y (2.07) with z near zero; the
  // corrected one folds it on z (2.14) with y near zero — the same hand
  // destination reached round the other side of the (z, y) parameterisation the
  // header warns about. The sweep therefore moved from the forearm's y to its
  // z. Left on y it would have swung the arm somewhere unrelated while the
  // numbers still looked plausible.
  //
  // Naming the axis rather than hard-coding y is what stops that from being a
  // silent failure the next time a pose is re-measured.
  //
  // Proportions are the ones settled earlier: the elbow drives, the shoulder
  // barely participates because nothing on a body moves alone, and the wrist
  // only follows through.
  rub: {
    upperArm: { axis: 'y', amount: deg(1.25) },
    lowerArm: { axis: 'z', amount: deg(5) },
    hand: { axis: 'z', amount: deg(1.5) },
  },
};
// Arm at her side. The start and end of the right-arm gesture, so the wrist
// rolls open on the way up and unrolls on the way down rather than snapping
// into place.
const ARM_DOWN = {
  rightUpperArm: { x: 0, y: 0.1, z: -1.275 },
  rightLowerArm: { x: 0, y: 0.3, z: -0.1 },
  rightHand: { x: 0, y: 0, z: 0 },
  head: { x: 0, y: 0, z: 0 },
  chest: { x: 0, y: 0, z: 0 },
};

/**
 * Vertical neck stretch: chin up, chin down.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FIRST VERSION READ AS "LOOKING AT THE SKY"
 * ---------------------------------------------------------------------------
 * Pitch is the gaze axis. Roll is not. That asymmetry is the whole problem:
 * tilting your head sideways has no meaning except "I am stretching", while
 * tilting it up or down is the same movement you make to LOOK at something, so
 * the viewer reads intent into it by default. The side-to-side stretch gets a
 * correct reading for free; this one has to earn it.
 *
 * Three changes take it back from looking to stretching:
 *
 *   1. SMALLER. The first pass used 14 degrees up and 19 down. Those are
 *      looking-at-things angles. Halved, they land in the range where the neck
 *      is clearly just being worked rather than aimed.
 *
 *   2. THE SHOULDERS JOIN IN. This matters more than the amplitude. A stretch
 *      is something you do TO a stiff body, so the body has to participate —
 *      the shoulders draw down and back as the chin lifts, and roll forward as
 *      it drops. A head that pitches on a completely static torso can only be
 *      looking, because that is the only time a real neck moves alone.
 *
 *   3. OFF-AXIS. A few degrees of yaw and roll, different at each end. Pure
 *      sagittal motion is a machine's idea of a stretch; a real one always
 *      wanders, and the asymmetry is what stops it reading as a nod.
 *
 * Down is larger than up because a neck flexes considerably further than it
 * extends. Matching them makes the up look overcooked and the down look timid.
 */
const NECK_NEUTRAL = {
  head: { x: 0, y: 0, z: 0 },
  neck: { x: 0, y: 0, z: 0 },
  chest: { x: 0, y: 0, z: 0 },
  leftShoulder: { x: 0, y: 0, z: 0 },
  rightShoulder: { x: 0, y: 0, z: 0 },
};

// Chin lifts, chest opens, shoulders settle down and back.
const NECK_UP = {
  head: { x: deg(-7), y: deg(3), z: deg(-2) },
  neck: { x: deg(-4.5), y: deg(2), z: deg(-1.5) },
  chest: { x: deg(-2.5), y: 0, z: 0 },
  leftShoulder: { x: 0, y: deg(-3), z: deg(2.5) },
  rightShoulder: { x: 0, y: deg(3), z: deg(-2.5) },
};

// Chin drops toward the chest, upper back rounds, shoulders roll forward.
const NECK_DOWN = {
  head: { x: deg(10), y: deg(-2), z: deg(2) },
  neck: { x: deg(6), y: deg(-1.5), z: deg(1) },
  chest: { x: deg(2.5), y: 0, z: 0 },
  leftShoulder: { x: 0, y: deg(4), z: deg(-2) },
  rightShoulder: { x: 0, y: deg(-4), z: deg(2) },
};

/** Resting curl for the right hand only, used as the scratch's start and end. */
const restRightHand = relaxedHandPose(0.26, ['right']);
/** Half-closed right hand, for the scratch itself. */
const curledRightHand = relaxedHandPose(SCRATCH.fingerCurl, ['right']);

// The scratch's arm at the head, with the rub distributed across all three
// joints rather than isolated at the wrist.
// @param {number} phase -1..+1 across the sweep.
const nudge = (base, { axis, amount }, phase) => ({
  ...base,
  [axis]: base[axis] + phase * amount,
});

const scratchAt = (phase) => ({
  rightUpperArm: nudge(SCRATCH.upperArm, SCRATCH.rub.upperArm, phase),
  rightLowerArm: nudge(SCRATCH.lowerArm, SCRATCH.rub.lowerArm, phase),
  rightHand: nudge(SCRATCH.hand, SCRATCH.rub.hand, phase),
  head: { x: 0.05, y: 0.03, z: 0.04 },
  chest: { x: 0, y: 0.02, z: 0 },
  ...curledRightHand,
});

// The scratch's neutral: arm at her side, plus the hand and fingers at their
// ordinary resting curl.
const scratchRest = {
  ...ARM_DOWN,
  ...restRightHand,
};

export const GESTURES = {
  // Right hand up onto the top of the head, fingers half closed, sweeping back
  // and forth. Arm position measured in the Pose tab rather than derived — see
  // SCRATCH above for why that matters.
  //
  // The rub is on the HAND's y. Earlier attempts wiggled the elbow, which swung
  // the whole forearm and read as waving; moving only the wrist keeps the arm
  // planted and drags the fingertips across the scalp, which is what scratching
  // actually is. Four half-strokes, then a beat at centre before the arm drops,
  // so it does not leave mid-sweep.
  'scratch-head': {
    label: 'Scratch head',
    idle: true,
    duration: 3600,
    keys: [
      { t: 0, pose: scratchRest },
      // Arm arrives, hand already closing on the way up.
      { t: 0.26, pose: scratchAt(0) },
      { t: 0.38, pose: scratchAt(1) },
      { t: 0.48, pose: scratchAt(-1) },
      { t: 0.58, pose: scratchAt(1) },
      { t: 0.68, pose: scratchAt(-1) },
      { t: 0.78, pose: scratchAt(0) },
      { t: 1, pose: scratchRest },
    ],
  },

  // Head rolls to one shoulder, holds, then the other. Confirmed good by eye.
  //
  // No arms at all, which is what makes it so reliable. The shoulder it rolls
  // toward lifts a little to meet it — the body participating is what separates
  // a stretch from a tilt.
  'neck-stretch': {
    label: 'Stretch neck (side)',
    idle: true,
    duration: 4200,
    keys: [
      {
        t: 0,
        pose: {
          head: { x: 0, y: 0, z: 0 },
          neck: { x: 0, y: 0, z: 0 },
          leftShoulder: { x: 0, y: 0, z: 0 },
          rightShoulder: { x: 0, y: 0, z: 0 },
        },
      },
      // Over toward her left shoulder, which also lifts a little to meet it.
      {
        t: 0.26,
        pose: {
          head: { x: 0.03, y: 0.05, z: -0.26 },
          neck: { x: 0.02, y: 0.03, z: -0.14 },
          leftShoulder: { x: 0, y: 0, z: -0.05 },
          rightShoulder: { x: 0, y: 0, z: 0.02 },
        },
      },
      {
        t: 0.42,
        pose: {
          head: { x: 0.03, y: 0.05, z: -0.28 },
          neck: { x: 0.02, y: 0.03, z: -0.15 },
          leftShoulder: { x: 0, y: 0, z: -0.05 },
          rightShoulder: { x: 0, y: 0, z: 0.02 },
        },
      },
      // Through neutral and over to the other side.
      {
        t: 0.68,
        pose: {
          head: { x: 0.02, y: -0.04, z: 0.24 },
          neck: { x: 0.01, y: -0.02, z: 0.13 },
          leftShoulder: { x: 0, y: 0, z: 0.02 },
          rightShoulder: { x: 0, y: 0, z: -0.05 },
        },
      },
      {
        t: 1,
        pose: {
          head: { x: 0, y: 0, z: 0 },
          neck: { x: 0, y: 0, z: 0 },
          leftShoulder: { x: 0, y: 0, z: 0 },
          rightShoulder: { x: 0, y: 0, z: 0 },
        },
      },
    ],
  },

  // The second neck stretch, in the other plane: chin up, hold, chin down,
  // hold, return. Where `neck-stretch` rolls side to side, this one nods.
  //
  // THE HOLDS ARE THE GESTURE. A head that travels up and straight back down is
  // a nod. Arriving, stopping dead, then moving on is what makes it read as a
  // stretch — the pause says this is being done deliberately to a stiff body.
  'neck-stretch-vertical': {
    label: 'Stretch neck (up/down)',
    idle: true,
    duration: 5400,
    keys: [
      { t: 0, pose: NECK_NEUTRAL },
      // Up, and stop. The hold is longer than the travel on purpose.
      { t: 0.16, pose: NECK_UP },
      { t: 0.4, pose: NECK_UP },
      // Down, and stop.
      { t: 0.56, pose: NECK_DOWN },
      { t: 0.82, pose: NECK_DOWN },
      { t: 1, pose: NECK_NEUTRAL },
    ],
  },

  // Shoulders up, back, and released. Also arms-free at the elbow, so it reads
  // over almost any pose.
  'roll-shoulders': {
    label: 'Roll shoulders',
    idle: true,
    duration: 3000,
    keys: [
      {
        t: 0,
        pose: {
          leftShoulder: { x: 0, y: 0, z: 0 },
          rightShoulder: { x: 0, y: 0, z: 0 },
          chest: { x: 0, y: 0, z: 0 },
          leftUpperArm: { x: 0, y: 0.05, z: 1.205 },
          rightUpperArm: { x: 0, y: 0.1, z: -1.275 },
        },
      },
      // Up.
      {
        t: 0.3,
        pose: {
          leftShoulder: { x: 0, y: 0, z: -0.12 },
          rightShoulder: { x: 0, y: 0, z: 0.12 },
          chest: { x: -0.01, y: 0, z: 0 },
          leftUpperArm: { x: 0, y: 0.05, z: 1.16 },
          rightUpperArm: { x: 0, y: 0.1, z: -1.23 },
        },
      },
      // Back — the chest opens, which is the part that reads as a stretch
      // rather than a shrug.
      {
        t: 0.55,
        pose: {
          leftShoulder: { x: 0, y: -0.06, z: -0.09 },
          rightShoulder: { x: 0, y: 0.06, z: 0.09 },
          chest: { x: -0.05, y: 0, z: 0 },
          leftUpperArm: { x: 0, y: 0.12, z: 1.19 },
          rightUpperArm: { x: 0, y: 0.03, z: -1.26 },
        },
      },
      {
        t: 1,
        pose: {
          leftShoulder: { x: 0, y: 0, z: 0 },
          rightShoulder: { x: 0, y: 0, z: 0 },
          chest: { x: 0, y: 0, z: 0 },
          leftUpperArm: { x: 0, y: 0.05, z: 1.205 },
          rightUpperArm: { x: 0, y: 0.1, z: -1.275 },
        },
      },
    ],
  },

};

/**
 * Bones that carry where a hand ends up.
 *
 * THE SHOULDER IS ONE OF THEM, and leaving it out was a mistake worth
 * recording. The first version of this excluded it, reasoning that shoulder
 * motion reads correctly over any pose — true of every pose that existed when
 * it was written, and false the moment `arms-behind` arrived. That pose holds
 * her hands behind her back with a 50-degree roll AT THE SHOULDER, so a gesture
 * that blends the shoulders toward neutral takes the hands out from behind her
 * and leaves the arms pointing at nothing.
 *
 * The neck stretches name the shoulders — a stretch that leaves them out of it
 * is a head on a post — so they need the home pose too, despite touching no arm
 * bone at all.
 */
const HAND_BEARING_BONE = /(Shoulder|UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/;

/** Whether a pose writes any bone that decides where a hand is. */
export function posePlacesHands(pose) {
  return Object.keys(pose).some((bone) => HAND_BEARING_BONE.test(bone));
}

/**
 * Whether a gesture assumes where the arms started, and therefore has to be
 * played from the pose it was authored against.
 *
 * Derived from the keyframes rather than declared as a flag, so a gesture that
 * grows an arm cannot forget to say so — the same reason expressions are
 * enumerated from the model instead of listed. That derivation has now caught
 * two gestures whose documentation said they were spine-only.
 *
 * Every gesture on the current roster needs it. That is a fact about the roster
 * rather than a rule: a gesture confined to head, neck and chest would play
 * anywhere, and the predicate is what would let it.
 */
export function gestureNeedsHomePose(name) {
  const def = GESTURES[name];
  if (!def) return false;
  return def.keys.some((key) => posePlacesHands(key.pose));
}

/**
 * The pose to pass through before playing a gesture, or null to play it where
 * she stands.
 *
 * Gesture keyframes are ABSOLUTE — "hand at the top of the head" — and they were
 * all authored against `companion`. The two arm gestures begin and end at
 * `ARM_DOWN`, the arm hanging at her side exactly where `companion` puts it;
 * the neck stretches and the shoulder roll write the shoulders back toward
 * neutral. Played while her hands are behind her back, either kind drags the
 * arms out of a position the keyframes assume they were never in, and the
 * result is a hand somewhere no arm would be.
 *
 * Rather than re-measure every gesture against every pose — a combinatorial
 * problem, and arms are the expensive thing to measure on this rig — she
 * returns to the pose the gestures were authored against, plays, and goes back.
 * The lead-in and lead-out are ordinary pose transitions, so the whole sequence
 * reads as her lowering her arms to do something and putting them back.
 */
export function gestureStagingPose(name, poseName) {
  if (!gestureNeedsHomePose(name)) return null;
  if (poseName === DEFAULT_POSE) return null;
  return DEFAULT_POSE;
}

/**
 * Where in its timeline a `hold: true` gesture parks.
 *
 * Halfway, which is inside the envelope's plateau — weight is a flat 1 there,
 * so the pose sits at full strength with nothing easing in or out. Any point
 * between the ease-in and ease-out would do; the middle is the one that stays
 * valid if the envelope is ever retuned.
 */
export const HOLD_POINT = 0.5;

export const GESTURE_NAMES = Object.keys(GESTURES);

/**
 * The gestures the idle scheduler is allowed to pick from.
 *
 * The filter stays even though every remaining gesture is currently `idle:
 * true`. `idle: false` is the flag for a gesture that is only ever triggered
 * deliberately — `wave` was the one that had it, as a greeting for the agent's
 * first appearance, and a greeting that fires on a timer stops being a
 * greeting. The next such gesture will want the same escape hatch.
 */
export const IDLE_GESTURE_NAMES = GESTURE_NAMES.filter((n) => GESTURES[n].idle);

/** Hermite smoothstep. Used everywhere a linear ramp would look mechanical. */
export function smoothstep(t) {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/**
 * The blend weight envelope: 0 at both ends, 1 through the middle.
 *
 * Having this separate from the keyframes is what lets a gesture leave every
 * bone it does not name completely alone, and what lets it be interrupted or
 * cross-faded without the pose snapping.
 */
export function gestureEnvelope(t, envelope = ENVELOPE) {
  if (t <= 0 || t >= 1) return 0;
  const rise = smoothstep(t / envelope.in);
  const fall = smoothstep((1 - t) / envelope.out);
  return Math.min(rise, fall);
}

/**
 * Sample a gesture at a point in its run.
 *
 * @param {object} gesture one of GESTURES
 * @param {number} elapsedMs since the gesture started
 * @returns {{pose: Record<string, {x:number,y:number,z:number}>, weight: number}}
 */
export function sampleGesture(gesture, elapsedMs) {
  const t = Math.max(0, Math.min(1, elapsedMs / gesture.duration));
  const weight = gestureEnvelope(t);
  const { keys } = gesture;

  // Find the segment this time falls in. Linear scan: there are at most a
  // handful of keys, and a binary search would be more code than it saves.
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t < t) i += 1;

  const a = keys[i];
  const b = keys[i + 1] ?? a;
  const span = b.t - a.t;
  const k = smoothstep(span > 0 ? (t - a.t) / span : 1);

  const pose = {};
  for (const bone of Object.keys(a.pose)) {
    const from = a.pose[bone];
    const to = b.pose[bone] ?? from;
    pose[bone] = {
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      z: from.z + (to.z - from.z) * k,
    };
  }

  return { pose, weight };
}
