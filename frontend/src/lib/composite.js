/**
 * Resolve every bone-writing layer into one final rotation set.
 *
 * Layer order, lowest priority first:
 *   1. pose             — the selected preset (or a lerped blend toward it)
 *   2. idleDeltas       — ADDITIVE procedural motion (head drift, breathing)
 *   3. manualOverrides  — REPLACES everything for that bone
 *
 * Idle is attenuated while speaking so head motion does not compete with the
 * mouth for the viewer's attention.
 *
 * This is a pure function over plain objects: no three.js, no React, no clock.
 * That is what makes layer precedence unit-testable without a GPU, and it is
 * the pattern the production implementation should copy.
 *
 * @param {{
 *   pose: Record<string, {x:number,y:number,z:number}>,
 *   idleDeltas: Record<string, {x:number,y:number,z:number}>,
 *   manualOverrides: Record<string, {x:number,y:number,z:number}>,
 *   speaking: boolean,
 *   attenuation: number,
 * }} input
 * @returns {Record<string, {x:number,y:number,z:number}>}
 */
export function compositeBones({
  pose = {},
  idleDeltas = {},
  manualOverrides = {},
  speaking = false,
  attenuation = 0.4,
}) {
  const out = {};
  const scale = speaking ? attenuation : 1;

  // Union of every bone any layer mentions, so a bone touched only by idle or
  // only by an override still appears in the result.
  const bones = new Set([
    ...Object.keys(pose),
    ...Object.keys(idleDeltas),
    ...Object.keys(manualOverrides),
  ]);

  for (const bone of bones) {
    // A manual edit is absolute — it short-circuits pose and idle entirely.
    const override = manualOverrides[bone];
    if (override) {
      out[bone] = { x: override.x, y: override.y, z: override.z };
      continue;
    }

    const p = pose[bone] ?? { x: 0, y: 0, z: 0 };
    const d = idleDeltas[bone] ?? { x: 0, y: 0, z: 0 };

    out[bone] = {
      x: p.x + d.x * scale,
      y: p.y + d.y * scale,
      z: p.z + d.z * scale,
    };
  }

  return out;
}

/**
 * Sum any number of pose maps into one.
 *
 * Used to fold the conversational-state overlay onto the selected preset before
 * that result is handed to `compositeBones` as the base pose.
 *
 * Why this is separate from the `idleDeltas` layer, which is also additive: idle
 * is ATTENUATED while speaking so head motion does not compete with the mouth.
 * A posture overlay must not be attenuated — the whole point of the `speaking`
 * overlay is that it applies while speaking. Folding it in here keeps it out of
 * reach of that scaling.
 *
 * Later arguments add on top of earlier ones. Bones present in only some maps
 * are treated as zero in the rest, so maps touching different bone sets combine
 * cleanly.
 */
export function addPoses(...poses) {
  const out = {};

  for (const pose of poses) {
    if (!pose) continue;
    for (const [bone, rot] of Object.entries(pose)) {
      const acc = out[bone] ?? (out[bone] = { x: 0, y: 0, z: 0 });
      acc.x += rot.x ?? 0;
      acc.y += rot.y ?? 0;
      acc.z += rot.z ?? 0;
    }
  }

  return out;
}

/**
 * Blend `target` over `base`, but ONLY for the bones `target` names.
 *
 * The difference from `lerpPoses` is the whole reason this exists. `lerpPoses`
 * unions the two bone sets and treats a missing bone as zero rotation, which is
 * right for blending two complete poses and badly wrong for a gesture: a
 * head-scratch that names five bones would drag all the others toward the
 * T-pose in proportion to its weight.
 *
 * Bones absent from `target` pass through untouched, which is what lets a
 * gesture run while breathing, sway, and the conversational overlay all keep
 * doing their jobs on the bones it does not care about.
 */
export function blendPoseSubset(base = {}, target = {}, weight) {
  const k = Math.max(0, Math.min(1, weight));
  if (k === 0) return base;

  const zero = { x: 0, y: 0, z: 0 };
  const out = { ...base };

  for (const [bone, to] of Object.entries(target)) {
    const from = base[bone] ?? zero;
    out[bone] = {
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      z: from.z + (to.z - from.z) * k,
    };
  }

  return out;
}

/**
 * Linearly interpolate between two pose maps.
 *
 * Used for two things: smoothing preset switches so a pose change eases in
 * rather than snapping, and blending animation-clip output against a static
 * pose. A bone present in only one side is interpolated against zero rotation,
 * so poses that touch different bone sets still blend cleanly.
 *
 * Euler lerp rather than quaternion slerp is deliberate — these are small
 * rotations on a humanoid rig, and the difference is not visible at this scale.
 */
export function lerpPoses(a = {}, b = {}, t) {
  const k = Math.max(0, Math.min(1, t));
  const zero = { x: 0, y: 0, z: 0 };
  const out = {};

  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const from = a[bone] ?? zero;
    const to = b[bone] ?? zero;
    out[bone] = {
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      z: from.z + (to.z - from.z) * k,
    };
  }

  return out;
}

/**
 * Scale every rotation in a pose by one factor.
 *
 * Exists to quiet the ADDITIVE layers while an animation clip owns the body,
 * and the reason is measured rather than stylistic. A clip is read back off the
 * rig as Euler angles, and near gimbal — where a bone's `y` passes +/-90deg —
 * those numbers are ill-conditioned: on the shipped clips the hips move 3
 * degrees of actual rotation while their Euler triple moves 115. Adding a
 * constant breath or sway delta to a coordinate in that state does not add a
 * constant amount of motion; it adds a wildly varying one, and that was a
 * visible jerk at the same moment in a clip every time.
 *
 * So the layers fade out as the clip fades in and back as it releases. A
 * recorded performance already carries its own aliveness.
 *
 * `null` in, `null` out, so callers can pass an optional layer through.
 */
export function scalePose(pose, factor) {
  if (!pose) return pose;
  if (factor === 1) return pose;

  const out = {};
  for (const [bone, rot] of Object.entries(pose)) {
    out[bone] = { x: rot.x * factor, y: rot.y * factor, z: rot.z * factor };
  }
  return out;
}
