/**
 * The full VRM 1.0 humanoid bone vocabulary, in a sensible top-down order for UI.
 * Fingers are omitted deliberately — 30 extra sliders would drown the panel.
 */
export const HUMANOID_BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftEye', 'rightEye', 'jaw',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
];

/**
 * Every expression the *loaded model* defines.
 *
 * Read from the model rather than hardcoding VRM's preset list, because models
 * ship custom expressions beyond the presets — this project's model has a
 * non-preset `Surprised` group. A hardcoded list would work with one model and
 * silently drop capability on the next.
 *
 * three-vrm normalizes VRM 0.x names to the 1.0 vocabulary on load
 * (Joy->happy, Sorrow->sad, A->aa), so no version branching is needed here.
 */
export function listExpressions(vrm) {
  const expressions = vrm?.expressionManager?.expressions;
  if (!Array.isArray(expressions)) return [];
  return expressions.map((e) => e.expressionName).filter(Boolean);
}

/** Only those humanoid bones the loaded model actually has. */
export function listBones(vrm) {
  const humanoid = vrm?.humanoid;
  if (!humanoid?.getNormalizedBoneNode) return [];
  return HUMANOID_BONES.filter((name) => humanoid.getNormalizedBoneNode(name));
}
