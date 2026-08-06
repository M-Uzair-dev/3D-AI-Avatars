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
  relaxed: {
    leftUpperArm: { x: 0, y: 0, z: -1.25 },
    rightUpperArm: { x: 0, y: 0, z: 1.25 },
    leftLowerArm: { x: 0, y: -0.15, z: -0.15 },
    rightLowerArm: { x: 0, y: 0.15, z: 0.15 },
    spine: { x: 0.02, y: 0, z: 0 },
    chest: { ...ZERO },
    head: { ...ZERO },
  },
};

export const POSE_NAMES = Object.keys(POSES);

export const DEFAULT_POSE = 'relaxed';
