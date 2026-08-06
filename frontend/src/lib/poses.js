/**
 * Named pose presets: humanoid bone name -> Euler rotation in radians.
 *
 * Rotations are applied to VRM *normalized* bones, whose rest pose is a T-pose
 * with arms along the X axis. Normalized bones are what make a pose portable —
 * raw bone orientations differ between models, normalized ones do not.
 *
 * These values are eyeball-tuned starting points. Adjust them in the Pose tab
 * and use "Copy Pose JSON" to paste refined values back here.
 */

const ZERO = { x: 0, y: 0, z: 0 };

export const POSES = {
  't-pose': {
    leftUpperArm: { ...ZERO },
    rightUpperArm: { ...ZERO },
    leftLowerArm: { ...ZERO },
    rightLowerArm: { ...ZERO },
    spine: { ...ZERO },
    chest: { ...ZERO },
    head: { ...ZERO },
  },

  // Default. Arms down and slightly away from the body, elbows softly bent.
  //
  // Sign convention, confirmed by eye against a real model: on the LEFT arm a
  // POSITIVE z rotates the arm down toward the body, and negative raises it.
  // The right arm mirrors. Getting this backwards puts the avatar in a
  // permanent cheer, which is exactly what the first pass did.
  relaxed: {
    leftUpperArm: { x: 0, y: 0, z: 1.25 },
    rightUpperArm: { x: 0, y: 0, z: -1.25 },
    leftLowerArm: { x: 0, y: -0.15, z: 0.15 },
    rightLowerArm: { x: 0, y: 0.15, z: -0.15 },
    spine: { x: 0.02, y: 0, z: 0 },
    chest: { ...ZERO },
    head: { ...ZERO },
  },

  // Upper arms held close to the body, forearms folded up across the chest so
  // each hand tucks under the opposite arm. The previous values let the hands
  // meet at the waist instead, which reads as "clasped", not "crossed": the
  // upper arms were too far out and the forearms too low.
  'arms-crossed': {
    leftUpperArm: { x: 0, y: -0.55, z: 1.35 },
    rightUpperArm: { x: 0, y: 0.55, z: -1.35 },
    leftLowerArm: { x: 0, y: -1.85, z: -0.35 },
    rightLowerArm: { x: 0, y: 1.85, z: 0.35 },
    spine: { x: 0.02, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
  },

  'hands-on-hips': {
    leftUpperArm: { x: 0, y: -0.5, z: 1.0 },
    rightUpperArm: { x: 0, y: 0.5, z: -1.0 },
    leftLowerArm: { x: 0, y: -1.4, z: 0.5 },
    rightLowerArm: { x: 0, y: 1.4, z: -0.5 },
    spine: { x: 0, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
  },

  // Left arm down, right arm raised above horizontal.
  waving: {
    leftUpperArm: { x: 0, y: 0, z: 1.25 },
    rightUpperArm: { x: 0, y: 0, z: 0.6 },
    leftLowerArm: { x: 0, y: -0.15, z: 0.15 },
    rightLowerArm: { x: 0, y: 0.6, z: 0.9 },
    spine: { x: 0, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0.1, z: 0 },
  },

  // Left arm down, right arm raised to horizontal and swung forward.
  //
  // The z here is near zero on purpose: z is the up/down axis, so the previous
  // -1.0 held the arm at the side and the pose pointed at nothing. Forward
  // travel is the y term, whose sign is not yet confirmed against the model —
  // if the arm swings behind her, negate it.
  pointing: {
    leftUpperArm: { x: 0, y: 0, z: 1.25 },
    rightUpperArm: { x: 0, y: 1.4, z: -0.15 },
    leftLowerArm: { x: 0, y: -0.15, z: 0.15 },
    rightLowerArm: { x: 0, y: 0.1, z: 0 },
    spine: { x: 0, y: -0.05, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: -0.15, z: 0 },
  },

  // Left arm down, right forearm folded up toward the chin.
  thinking: {
    leftUpperArm: { x: 0, y: 0, z: 1.3 },
    rightUpperArm: { x: 0, y: -0.3, z: -0.75 },
    leftLowerArm: { x: 0, y: -0.2, z: 0.2 },
    rightLowerArm: { x: 0, y: 1.3, z: -0.9 },
    spine: { x: 0.03, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0.12, y: 0.18, z: 0.08 },
  },
};

export const POSE_NAMES = Object.keys(POSES);

export const DEFAULT_POSE = 'relaxed';
