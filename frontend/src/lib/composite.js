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
