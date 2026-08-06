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

  'arms-crossed': {
    leftUpperArm: { x: 0, y: -0.35, z: 1.15 },
    rightUpperArm: { x: 0, y: 0.35, z: -1.15 },
    leftLowerArm: { x: 0, y: -1.5, z: 0.2 },
    rightLowerArm: { x: 0, y: 1.5, z: -0.2 },
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

  // Left arm down, right arm angled forward toward the viewer.
  pointing: {
    leftUpperArm: { x: 0, y: 0, z: 1.25 },
    rightUpperArm: { x: -0.15, y: -0.4, z: -1.0 },
    leftLowerArm: { x: 0, y: -0.15, z: 0.15 },
    rightLowerArm: { x: 0, y: 0.2, z: -0.1 },
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
