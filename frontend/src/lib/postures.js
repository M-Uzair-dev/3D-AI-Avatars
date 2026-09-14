/**
 * Conversational-state postures and relaxed hands.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * A pose preset alone cannot read as alive, for two reasons that have nothing
 * to do with how well it was authored:
 *
 *   1. It is perfectly symmetric. Mirrored limbs are THE mannequin tell — no
 *      human stands with both shoulders level and both arms at identical
 *      angles. See the `companion` preset in poses.js for the fix.
 *   2. It never changes with context. A body that holds one shape whether you
 *      are talking to it or not reads as a display object, not a participant.
 *
 * This module solves (2). Each conversational state contributes a small
 * ADDITIVE overlay on top of whatever pose preset is selected, so the Pose tab
 * keeps working exactly as before — `waving` still waves, it just waves from a
 * body that is leaning in or settled back depending on what is happening.
 *
 * ---------------------------------------------------------------------------
 * ON MAGNITUDE — the mistake this file made first time round
 * ---------------------------------------------------------------------------
 * These overlays were originally authored at half a degree to two degrees,
 * with a comment approving of how subtle they were. They were invisible. The
 * four states were distinguishable only by reading the store.
 *
 * The error was applying the right rule to the wrong thing. Subtlety IS correct
 * for idle motion — sway, breath, drift — because that runs continuously, and
 * anything large enough to notice moment-to-moment becomes unbearable over an
 * hour. Conversational states are the opposite kind of thing: discrete signals,
 * shown once, that the viewer has to READ. A state change nobody can see is not
 * a subtle state change, it is a no-op.
 *
 * So these run to roughly five to nine degrees of accumulated lean, and the
 * three that are held simultaneously with nothing else going on are shaped to
 * be opposites rather than variations:
 *
 *   listening   folds FORWARD and tilts
 *   speaking    opens BACKWARD and squares up
 *   working     folds forward and DOWN, rounded and turned away
 *
 * Opposition is what makes them readable. Three slightly different amounts of
 * the same lean would not be, at any magnitude.
 *
 * Axis conventions are the ones measured in poses.js. Restated for the torso
 * and head, since this module uses them heavily:
 *
 *   x  pitch. POSITIVE tips forward / chin down.
 *   y  yaw.   POSITIVE turns to HER left, negative to her right.
 *   z  roll.  POSITIVE tilts the head toward her RIGHT shoulder.
 *
 * For arms the poses.js conventions hold: z is elevation (positive lowers the
 * left arm), y is azimuth (negative swings the left arm forward), and the right
 * arm mirrors all three.
 */

import { POSES } from './poses.js';

const ZERO = { x: 0, y: 0, z: 0 };

/**
 * The listening lean, measured in the Pose tab: ~24 degrees at the pelvis.
 *
 * Named because it is used three times — once to pitch the hips and twice to
 * cancel that pitch at the femurs — and those three uses have to move together.
 * See the note in the `listening` overlay for why the legs need cancelling.
 */
const LISTEN_HIP_PITCH = -0.42;

/**
 * Additive overlays, one per conversational state.
 *
 * `idle` is intentionally all-zero rather than absent: it is the reference the
 * other three are described against, and having it present means the crossfade
 * out of any state has somewhere to land.
 */
export const STATE_OVERLAYS = {
  // Resting. The `companion` preset already carries the asymmetry; this state
  // adds nothing on top of it.
  idle: {},

  // Attending to you. The largest overlay by a distance, and the only one that
  // was measured rather than written.
  listening: {
    // MEASURED in the Pose tab, then expressed as the delta from `companion`
    // so it stays an overlay and keeps colouring whatever pose is selected.
    // The hand-authored version this replaced spread a small forward lean
    // across spine, chest and both shoulders; the measured one puts nearly all
    // of it in one joint and is four times the size.
    //
    // Three numbers carry the whole state:
    //
    //   hips x -0.42   the lean itself, ~24deg, whole body
    //   neck x  0.36   the head brought back toward the viewer over that lean
    //   upperChest y   the torso turned slightly off-square
    //
    // The neck counter-pitch is the part worth preserving through any retune:
    // a body that pitches at the hips and leaves the head riding along is a
    // plank. The head has to come back or she is looking somewhere else.
    hips: { x: LISTEN_HIP_PITCH, y: 0, z: 0 },
    upperChest: { x: 0, y: -0.11, z: 0 },
    neck: { x: 0.36, y: 0.32, z: 0 },

    // THE LEGS MUST NOT COME WITH THE PELVIS.
    //
    // `hips` is the root of the VRM humanoid skeleton, so rotating it carries
    // the femurs, shins and feet along with the torso. The result is a body
    // that tips as one rigid plank from the ankles — the Michael Jackson lean —
    // rather than a person leaning in. It was reported exactly that way, and it
    // is the whole reason these two lines exist.
    //
    // The measured hip value is NOT the thing that was wrong, so it is not
    // touched. Cancelling the same rotation at both femurs leaves the torso
    // shape precisely as it was dragged out in the Pose tab and converts the
    // whole-body tip into a hinge at the hip joint, which is what a standing
    // forward lean actually is: pelvis rotates, legs stay under you.
    //
    // Keyed off the constant rather than written as 0.42, so retuning the lean
    // cannot leave the legs behind at the old value — the failure here is
    // silent, and a test pins the sum at zero.
    leftUpperLeg: { x: -LISTEN_HIP_PITCH, y: 0, z: 0 },
    rightUpperLeg: { x: -LISTEN_HIP_PITCH, y: 0, z: 0 },
  },

  // `thinking` has no overlay. It is driven by a FULL pose instead — see
  // STATE_POSES below.

  // Occupied with a long-running task. Compact and self-contained: weight
  // settled, shoulders rounded forward, body turned further off-square, and the
  // head down.
  //
  // WHY THIS IS AN OVERLAY AND NOT A POSE, unlike `thinking`. The two states
  // differ in DURATION more than in shape, and duration decides everything
  // about what works. `thinking` lasts seconds, so a held shape is fine.
  // `working` lasts minutes — a held shape over that long stops reading as
  // concentration and starts reading as a hung process, which is the one thing
  // this state must never suggest. So it keeps every idle behaviour running
  // underneath instead of overriding the arms, and leans on gaze and tempo.
  //
  // The pitch is deliberately spread across spine, chest, neck and head rather
  // than loaded onto the head alone. Four small bends compound to about eleven
  // degrees of head-down while no single joint does anything sharp — and a neck
  // bending on a straight back reads as a broken doll, not as someone working.
  working: {
    spine: { x: 0.03, y: 0.05, z: 0 },
    chest: { x: 0.03, y: 0.04, z: 0.01 },
    // Rounded forward. Positive y is forward on the left shoulder, negative on
    // the right — the signs `roll-shoulders` established.
    leftShoulder: { x: 0, y: 0.05, z: -0.015 },
    rightShoulder: { x: 0, y: -0.05, z: 0.015 },
    neck: { x: 0.05, y: 0.02, z: -0.01 },
    head: { x: 0.08, y: 0.03, z: -0.02 },
  },

  // Talking. IDENTICAL TO IDLE FROM THE NECK DOWN, on purpose.
  //
  // This used to open the chest backward and draw the shoulders with it — the
  // physical opposite of listening, so the two read as a contrast. That was the
  // right call when the idle layer was thinner. It is not now: between the gaze
  // wander, the head drift and the microsaccades she is rarely looking straight
  // down the lens, and THAT is what makes a talking avatar look wrong, not her
  // posture. Fixing the eyes and leaving the body alone turned out to read far
  // better than a postural change ever did.
  //
  // So the state's whole content lives elsewhere, and both halves are head:
  //
  //   - the eyes lock to the camera for the utterance and are released the
  //     moment it ends, in useIdleMotion
  //   - `speechEmphasis` moves the head at 1-3Hz against sway's 0.2, which is a
  //     TEMPO gap rather than a shape, and is what actually reads as talking
  //
  // An empty overlay is a real answer here, not a gap. If a posture ever goes
  // back in, it goes in knowing the eyes were doing the work all along.
  speaking: {},
};

/**
 * States driven by a FULL pose rather than a small overlay.
 *
 * `thinking` earns one. The other three states are shadings of standing still —
 * a lean, a lift, a settle — and an overlay of a few degrees is exactly the
 * right tool. Considering something is not a shading of standing still: it has
 * a recognisable shape, hand to chin, and there is no amount of spine tilt that
 * substitutes for it.
 *
 * The overlay version that used to live above was the subtlest thing in the
 * system and, for that reason, the least legible — a viewer cannot tell
 * three degrees of lean-back from ordinary idle drift.
 *
 * These are ABSOLUTE poses, blended over the base the same way a gesture is, so
 * only the bones they name are affected. That is also why they are kept out of
 * STATE_OVERLAYS rather than living alongside it: the two are combined in
 * different ways, and a map whose entries mean different things depending on
 * which key you read is a trap.
 */
export const STATE_POSES = {
  thinking: POSES.thinking,
};

export const CONVERSATION_STATES = [
  'idle', 'listening', 'thinking', 'working', 'speaking',
];

export const DEFAULT_CONVERSATION_STATE = 'idle';

/** The overlay for a state, or an empty map for an unknown one. */
export function overlayFor(state) {
  return STATE_OVERLAYS[state] ?? {};
}

/** The full pose for a state, or null if it is overlay-driven. */
export function statePoseFor(state) {
  return STATE_POSES[state] ?? null;
}

// ---------------------------------------------------------------------------
// RELAXED HANDS
// ---------------------------------------------------------------------------

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'];

// Curl distributed across the three segments. A real relaxed hand bends most at
// the knuckle and least at the fingertip, and the ratio matters more than the
// absolute amount — equal curl on all three gives a claw.
const SEGMENT_WEIGHT = { Proximal: 1, Intermediate: 0.85, Distal: 0.55 };

// The little finger curls most and the index least. This spread is small but it
// is the difference between a hand and a glove.
const FINGER_WEIGHT = { Index: 0.72, Middle: 0.88, Ring: 1, Little: 1.1 };

/**
 * A relaxed, slightly curled hand for both hands.
 *
 * Straight splayed fingers are a mannequin tell of exactly the same kind as
 * mirrored arms, and it is the one most visible in a waist-up framing where the
 * hands sit near the bottom of frame. At rest a human hand holds a soft curl;
 * it never fully extends unless it is doing something.
 *
 * > **Sign caveat, in the spirit of this project's axis rules.** The curl
 * > direction here is *derived*, not measured: finger bones lie along X in the
 * > normalized rest pose with the palm facing down, so a positive Z rotation
 * > should close the left hand toward its palm, with the right mirroring. Every
 * > other time an axis was derived rather than measured in this codebase it was
 * > wrong. The Idle tab slider therefore spans NEGATIVE to positive — if the
 * > fingers bend backwards, drag it past zero and the sign flips. Once you have
 * > confirmed it by eye, record the answer here and narrow the range.
 *
 * @param {number} amount curl in radians at the proximal knuckle. ~0.25 is a
 *   soft natural rest, ~0.75 roughly halfway to a fist, 0 a flat hand, and
 *   negative bends the other way.
 * @param {string[]} sides which hands to emit. Gestures that use one hand pass
 *   just that one, so the idle curl on the other hand keeps running underneath.
 * @returns {Record<string, {x:number,y:number,z:number}>}
 */
export function relaxedHandPose(amount, sides = ['left', 'right']) {
  const out = {};
  if (!amount) return out;

  for (const side of sides) {
    // The right hand mirrors the left, exactly as the arms do.
    const sign = side === 'left' ? 1 : -1;

    for (const finger of FINGERS) {
      for (const segment of SEGMENTS) {
        const curl = amount * FINGER_WEIGHT[finger] * SEGMENT_WEIGHT[segment];
        out[`${side}${finger}${segment}`] = { x: 0, y: 0, z: curl * sign };
      }
    }

    // The thumb does not fold into the palm like the fingers do — it rotates
    // across it. Less curl, plus a yaw that brings it toward the index finger,
    // otherwise it sticks out at an angle no resting hand holds.
    const thumbCurl = amount * 0.45;
    out[`${side}ThumbMetacarpal`] = { x: 0, y: -0.35 * amount * sign, z: thumbCurl * sign };
    out[`${side}ThumbProximal`] = { x: 0, y: -0.2 * amount * sign, z: thumbCurl * 0.8 * sign };
    out[`${side}ThumbDistal`] = { x: 0, y: 0, z: thumbCurl * 0.6 * sign };
  }

  return out;
}

export { ZERO };
