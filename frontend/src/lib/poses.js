/**
 * Named pose presets: humanoid bone name -> Euler rotation in radians.
 *
 * Rotations are applied to VRM *normalized* bones, whose rest pose is a T-pose
 * with arms along the X axis. Normalized bones are what make a pose portable —
 * raw bone orientations differ between models, normalized ones do not.
 *
 * ---------------------------------------------------------------------------
 * AXIS CONVENTIONS — measured on the rig, not read off the spec
 * ---------------------------------------------------------------------------
 * Deriving these from the VRM spec produced two wrong answers in a row, so they
 * were established by rotating one bone at a time and reading the resulting
 * world-space hand position back out of `matrixWorld`. For the LEFT arm:
 *
 *   z  elevation. POSITIVE lowers the arm toward the body, negative raises it.
 *   y  azimuth.   NEGATIVE swings the arm forward, toward the camera.
 *   x  twist along the arm's own axis. Does not move the hand at all in the
 *      rest pose — it rolls the limb, which changes the plane the elbow bends in.
 *
 * The right arm mirrors all three.
 *
 * ORDER MATTERS, and it is the trap that made the old presets wrong. Euler order
 * is three.js's default XYZ, so the matrix is Rx·Ry·Rz and **z is applied
 * first**. That makes (z, y) behave like (latitude, longitude): z sets how far
 * the arm has dropped from horizontal, then y swings it around the vertical.
 * Near the poles longitude stops meaning much — so once z has put the arm near
 * vertical (|z| > ~1.2, arm at the side), y barely moves the hand forward at
 * all. That degeneracy is why the old `arms-crossed` read as "hands clasped at
 * the waist": it asked y to do work that only a smaller z could allow.
 *
 * ---------------------------------------------------------------------------
 * HOW THESE VALUES WERE PRODUCED — and why the method changed
 * ---------------------------------------------------------------------------
 * The arms were originally solved by inverse kinematics against anatomical
 * targets: "elbow here, wrist there", in world coordinates taken from the
 * model's own measurements (upper arm 0.213, forearm 0.199, shoulder at
 * y=1.293). Converged wrist error was under 25 mm.
 *
 * THAT WAS NOT ENOUGH, and understanding why is the most useful thing in this
 * file. Every solved arm hit its wrist target and still looked wrong, because
 * a solver scoring wrist POSITION is blind to everything that carries the read:
 *
 *   - the TWIST on the upper arm, which by definition does not move the wrist
 *     at all and so contributes nothing to the score — while deciding whether a
 *     folded forearm crosses the body or juts out of it
 *   - the SHOULDER, left level while a real one lifts with the arm
 *   - the WRIST'S OWN ROTATION, which decides whether a hand rests on a chin or
 *     presents a palm at it
 *
 * The surviving arm chains are therefore MEASURED: dragged out in the Pose tab
 * and read back with "Copy pose JSON". That is the authoring loop, it emits
 * exactly this shape, and it should be the first resort rather than the last.
 */

import { addPoses } from './composite.js';

/**
 * The weight-bearing half of the `companion` pose, as its own export.
 *
 * This is everything that would MIRROR if she shifted her weight to the other
 * foot: the pelvic tilt, the spinal counter-curve, the shoulder line, and the
 * head tilt riding on top of it. Pure roll and yaw — no pitch, because leaning
 * forward stays leaning forward no matter which leg you stand on.
 *
 * It lives apart from the preset so that `weightShiftDeltas` in aliveness.js
 * has exactly one definition of "the asymmetry" to negate. Duplicating these
 * numbers into the shifter would mean a retune of the pose silently stopped
 * matching the shift, and the mismatch would only show up as a lurch every
 * twenty seconds — which is a miserable thing to track down.
 *
 * Signs describe weight on her LEFT leg. See `companion` below.
 */
export const CONTRAPPOSTO = {
  hips: { x: 0, y: 0.105, z: 0.036 },
  spine: { x: 0, y: -0.042, z: -0.02 },
  chest: { x: 0, y: -0.05, z: -0.03 },
  leftShoulder: { x: 0, y: 0, z: 0.035 },
  rightShoulder: { x: 0, y: 0, z: -0.012 },
  neck: { x: 0, y: -0.03, z: 0.018 },
  head: { x: 0, y: -0.062, z: 0.045 },
};

/** The parts of `companion` that do NOT mirror: pitch, and the arms. */
const COMPANION_ASYMMETRY = {
  spine: { x: 0.022, y: 0, z: 0 },
  head: { x: 0.018, y: 0, z: 0 },

  // Body turned to her left brings her right side forward, so the right arm
  // sits slightly forward (+y mirrors to forward on the right) and the left
  // slightly back. Different elbow bends on purpose.
  leftUpperArm: { x: 0, y: 0.05, z: 1.205 },
  rightUpperArm: { x: 0, y: 0.1, z: -1.275 },
  leftLowerArm: { x: 0, y: -0.22, z: 0.12 },
  rightLowerArm: { x: 0, y: 0.3, z: -0.1 },
};

/**
 * Mirror a left-side limb pose onto the right side.
 *
 * Only one arm ever gets measured in the Pose tab — dragging out the second one
 * to match the first by eye is slow and never quite symmetric. This does it
 * exactly.
 *
 * THE RULE IS `(x, -y, -z)`, and the x is the part worth explaining, because
 * "negate everything" is the obvious guess and it is wrong.
 *
 * Reflection in the body's midplane is an improper transform: it reverses
 * handedness. A rotation vector is an axial vector, so under the mirror
 * M = diag(-1, 1, 1) it maps to -M·r, which is (x, -y, -z) — the component
 * along the mirror's normal keeps its sign, the other two flip.
 *
 * The z half is easy to sanity-check against the old symmetric `relaxed`
 * preset, which lowered the left arm with z +1.25 and the right with z -1.25:
 * z flips. (That preset has since been removed, but the check survives as a
 * test.) The rule is also correct for the twist, counter-intuitive as it looks:
 * normalized bones share the model's global axes, and the two arms point in
 * OPPOSITE directions along X, so the same rotation about world X twists each
 * limb the opposite way about its own axis — which is precisely mirrored twist.
 *
 * Bones must be named `left*`; anything else is ignored.
 */
export function mirrorLimb(pose) {
  // Plain negation turns 0 into -0, which is numerically harmless but leaks
  // into "Copy pose JSON" output and makes mirrored poses compare unequal to
  // hand-written ones.
  const neg = (v) => (v === 0 ? 0 : -v);

  const out = {};
  for (const [bone, rot] of Object.entries(pose)) {
    if (!bone.startsWith('left')) continue;
    out[`right${bone.slice(4)}`] = { x: rot.x, y: neg(rot.y), z: neg(rot.z) };
  }
  return out;
}

/** `companion`, named so the variants below can be built on top of it. */
const COMPANION = addPoses(CONTRAPPOSTO, COMPANION_ASYMMETRY);

/**
 * The left arm, taken behind the back. MEASURED in the Pose tab.
 *
 * This replaced `arms-crossed` as the second resting shape because crossed
 * forearms pass THROUGH the chest at some points in the sway cycle. Folding
 * the arms across the body puts both forearms exactly where the ribcage is,
 * and the rig has no collision — the only reliable fix is to put the hands
 * somewhere the body is not. Behind her is that place, and it reads as relaxed
 * and attentive rather than closed off, which the crossed version always
 * risked.
 *
 * THE SHOULDER IS THE LOAD-BEARING VALUE (x -0.87, ~50 degrees). Putting a hand
 * behind your back is a shoulder movement first; the arm follows. An arm swung
 * back from a level shoulder is the failure this project has now hit in four
 * separate poses.
 *
 * It also means **the axis table at the top of this file does not apply
 * naively here.** A 50-degree roll at the shoulder reorients the whole chain,
 * so the upper arm's `y` is no longer the plain azimuth it is from rest. Do not
 * reason about these numbers from the table — if they need changing, drag them
 * again.
 *
 * Exported so the three variants provably share one definition: retune this and
 * all of them follow. There is a test.
 */
export const ARM_BEHIND_LEFT = {
  leftShoulder: { x: -0.87, y: 0.02, z: 0.02 },
  leftUpperArm: { x: 0.18, y: -1.13, z: 1.05 },
  leftLowerArm: { x: 0, y: -0.64, z: 0.12 },
};

/** The same chain on the right, by the (x, -y, -z) rule rather than by eye. */
const ARM_BEHIND_RIGHT = mirrorLimb(ARM_BEHIND_LEFT);

/**
 * How much LESS the right forearm folds when both arms go behind, in radians.
 *
 * A perfect mirror puts both hands at the same point behind her spine, which is
 * the identical collision that made `arms-crossed` bad — merely hidden from the
 * camera. Reducing the fold on one side leaves that hand further out, so the
 * other passes in front of it: the same stagger trick the old `arms-crossed`
 * used to read as crossed rather than as hands touching.
 *
 * ESTIMATED, and the one number here that is. Larger separates them further;
 * at zero the hands intersect. ~8 degrees.
 */
const BEHIND_STAGGER = 0.14;

const ARMS_BEHIND = {
  ...ARM_BEHIND_LEFT,
  ...ARM_BEHIND_RIGHT,
  rightLowerArm: {
    ...ARM_BEHIND_RIGHT.rightLowerArm,
    y: ARM_BEHIND_RIGHT.rightLowerArm.y - BEHIND_STAGGER,
  },
};

export const POSES = {
  // THE DEFAULT. A resting posture built to read as a person rather than as a
  // display object, for use as an AI companion's at-rest shape.
  //
  // The preset this replaced was geometrically fine and still read as a
  // mannequin. The reason is that it was PERFECTLY SYMMETRIC — mirrored arms,
  // level shoulders, head at exactly zero. Nothing else about a pose matters
  // as much. A human
  // standing at rest is never mirrored; they put their weight on one leg, which
  // tips the pelvis, which the spine has to counter, which drops one shoulder.
  // Painters call the result contrapposto and have used it for six centuries
  // for exactly this reason: it is the difference between a figure and a statue.
  //
  // Three things are doing the work here, in order of how much they matter:
  //
  //   1. WEIGHT ON HER LEFT LEG. The hips roll so her left hip rides up
  //      (+z, ~2deg), the spine counters (-z), and the chest counters again.
  //      Opposition between the hip line and the shoulder line IS contrapposto.
  //      Note the shoulder line ends up tilted the OPPOSITE way to the hips.
  //
  //   2. THE BODY IS OFF-SQUARE. The hips turn ~6deg to her left and the head
  //      turns most of the way back toward the camera. A torso square to the
  //      lens is the second mannequin tell and the reason passport photos look
  //      lifeless; every portrait painter turns the body and keeps the face.
  //
  //   3. THE ARMS DIFFER FROM EACH OTHER. Not by much — a few degrees of
  //      elevation and a different elbow bend each — but the eye reads two
  //      identical limbs as manufactured almost instantly.
  //
  // A small head tilt (+z, toward her right shoulder) is included because a
  // lateral head tilt is read near-universally as warmth and attention. It is
  // the cheapest friendliness in the whole rig.
  //
  // Values are hand-authored rather than IK-solved, and the torso is the one
  // part of this file where that has held up — every arm in the project has
  // since had to be measured instead. Retune by dragging in the Pose tab and
  // pressing "Copy pose JSON".
  //
  // Composed from the two halves above rather than written out, so that the
  // weight shifter and the pose cannot drift apart. The result is a plain
  // object, so "Copy pose JSON" still emits the usual flat shape.
  companion: COMPANION,

  // Both hands behind the back. The default second shape, and what the idle
  // scheduler drifts into.
  //
  // Reads as at ease and still attentive — the posture of someone listening to
  // you with nothing in their hands. Crossed arms always carried a hint of
  // closed-off that a companion does not want, so losing them is not purely a
  // collision fix.
  //
  // Staggered rather than mirrored; see BEHIND_STAGGER.
  'arms-behind': { ...COMPANION, ...ARMS_BEHIND },

  // One arm behind, the other hanging as it does at rest.
  //
  // The asymmetric variants are the more useful ones for long sessions: they
  // keep the contrapposto reading from the free arm while still changing the
  // silhouette, and two of them means the drift has somewhere to go that is not
  // a straight there-and-back.
  'arm-behind-left': { ...COMPANION, ...ARM_BEHIND_LEFT },
  'arm-behind-right': { ...COMPANION, ...ARM_BEHIND_RIGHT },


  // Right forearm folded up so the hand rests just under the chin, head tipped
  // into it. Kept below the mouth rather than over it, since watching the
  // visemes is the whole point of the app.
  //
  // The right arm chain is MEASURED — dragged out in the Pose tab and read back
  // via "Copy pose JSON", not solved or estimated. It supersedes an IK solution
  // that satisfied its wrist target on paper and still looked wrong on the
  // model, which is the recurring lesson of this file.
  //
  // Two things the measured version has that the solved one did not, and both
  // are why it reads correctly:
  //
  //   - THE SHOULDER IS INVOLVED (z -0.29). Raising a hand to your own chin
  //     lifts the shoulder with it. Driving the arm alone from a level shoulder
  //     is what made the old one look like the forearm was hinged onto a
  //     mannequin.
  //   - THE WRIST IS TURNED (x 1.16). A hand at the chin is rolled almost
  //     ninety degrees so the knuckles face the jaw. Left flat, it reads as
  //     presenting the palm rather than resting a chin on it.
  //
  // Left arm, spine and head are unchanged: only the right side was measured.
  thinking: {
    leftUpperArm: { x: 0, y: 0, z: 1.3 },
    leftLowerArm: { x: 0, y: -0.2, z: 0.2 },

    rightShoulder: { x: 0, y: 0, z: -0.29 },
    rightUpperArm: { x: 0.87, y: 0.83, z: -0.82 },
    rightLowerArm: { x: -0.24, y: 2.21, z: 0.02 },
    rightHand: { x: 1.16, y: 0.09, z: -0.18 },

    spine: { x: 0.03, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0.12, y: 0.18, z: 0.08 },
  },
};

export const POSE_NAMES = Object.keys(POSES);

/**
 * The presets the idle scheduler rotates between.
 *
 * Standing in one shape forever is the same failure as the symmetric pose and
 * the rigid torso, just on a longer timescale: after a couple of minutes the
 * viewer has seen everything the body is going to do. Occasionally folding her
 * arms and later unfolding them adds a beat that no amount of procedural sway
 * can, because it is a DECISION rather than an oscillation — sway always
 * returns to where it started, and this does not.
 *
 * `thinking` is deliberately excluded. It means something specific about the
 * conversation, and a companion who adopts a pondering pose at random while
 * nothing is happening is lying about her own state.
 *
 * The single-arm variants are held back as well — the drift should be a
 * decision she visibly makes, and four shapes cycling reads as fidgeting
 * rather than settling.
 */
export const IDLE_POSE_ROTATION = ['companion', 'arms-behind'];

export const DEFAULT_POSE = 'companion';
