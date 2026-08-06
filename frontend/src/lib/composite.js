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
