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
 * The finger bones, kept separate from HUMANOID_BONES above.
 *
 * They are excluded from that list because it drives the Pose tab, where 30
 * extra sliders would drown the panel — but they are still real bones that
 * `relaxedHandPose` writes to, and a misspelled name there is invisible:
 * `getNormalizedBoneNode` returns null, the frame loop skips it, and the hands
 * simply never curl. Written out literally rather than generated so that it is
 * an independent check on the code that builds these names by template.
 *
 * Note the thumb has Metacarpal where the other fingers have Intermediate.
 */
export const FINGER_BONES = [
  'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
  'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
  'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
  'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
  'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
  'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
  'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
  'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
  'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
  'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
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
/**
 * Every bone a .vrma can animate: the humanoid vocabulary plus the fingers.
 *
 * The two lists are kept apart because they are read by different things for
 * different reasons — `HUMANOID_BONES` drives the Pose tab, which thirty finger
 * sliders would drown, and `FINGER_BONES` drives the resting hand curl. A clip
 * respects neither split. It carries whatever its author recorded, and the
 * pixiv pack records all 55.
 *
 * READING A CLIP THROUGH A NARROWER LIST DISCARDS THE DIFFERENCE IN SILENCE,
 * and this project has now done it twice. First through the active preset's key
 * set, which dropped the legs, so `Squat` moved everything except the part that
 * squats. Then through `HUMANOID_BONES`, which dropped the fingers: the mixer
 * wrote the clip's finger rotations, nothing read them back, and the compositor
 * painted the resting hand curl over the top. `Peace sign` made no peace sign
 * and `Shoot` had no gun — every clip played with idle hands.
 *
 * Both failures look identical from the outside: the clip plays, most of the
 * body moves, and the part you were actually watching does not.
 */
export const CLIP_BONES = [...HUMANOID_BONES, ...FINGER_BONES];

export function listBones(vrm) {
  const humanoid = vrm?.humanoid;
  if (!humanoid?.getNormalizedBoneNode) return [];
  return HUMANOID_BONES.filter((name) => humanoid.getNormalizedBoneNode(name));
}
