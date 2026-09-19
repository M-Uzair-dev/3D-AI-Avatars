/**
 * Dress a VRM in a room's reflection.
 *
 * MToon cannot sample an environment map — the include is commented out in its
 * own shader — but it has a `matcapTexture`, which is the toon-shading idiom
 * for the same idea. Each room ships a `-matcap.png` — its own convolution,
 * baked in the host project — and this puts it on.
 *
 * This is the ONLY way the room reaches her surface. Setting `scene.environment`
 * does nothing at all to an MToon material: the `envmap_fragment` include is
 * commented out in the shader and the indirect path is gated on
 * `defined( STANDARD )`, which MToon never defines. Verify that before ever
 * reaching for a PMREM here — it would be pure cost for no pixels.
 *
 * ── Two things that make this look like a no-op when it is wrong ────────────
 *
 * 1. `matcapFactor` multiplies the matcap and VRoid exports it BLACK. Setting
 *    the texture without opening the factor gives a contribution of exactly
 *    zero, which is indistinguishable from the texture failing to load.
 * 2. Adding a map where there was none changes the shader's defines, so the
 *    material needs `needsUpdate` or the old program stays bound.
 *
 * ── Why it undoes itself ────────────────────────────────────────────────────
 *
 * The parsed VRM is SHARED and long-lived. `models/vrmCache.js` keeps the whole
 * cast parsed and hands back the same object every time the carousel comes
 * round to her again, so a model dressed in one room and never undressed walks
 * into the next room still wearing the last one. Changing rooms runs the undo
 * and re-applies.
 */

/**
 * How strongly the room shows on her.
 *
 * Low on purpose. This is meant to read as her belonging in the shot, not as a
 * chrome finish.
 *
 * 0.22 -> 0.10, and the reason is not wetness. MToon ADDS the matcap, and the
 * convolution of a lit room is a mid-grey disc — mean RGB 149-184 across the
 * eight — so what the slot actually does is add a constant to every pixel
 * whichever way it faces. That is the definition of raising the black point,
 * which is the same mistake `DEFAULTS.lighting.ambient` was dropped from 0.6
 * to 0.06 to undo, and it arrived back through a different door.
 *
 * Measured on her torso, which carries a pure black frill collar, at 900x900.
 * 2nd-percentile luminance is the black point, p98 - p2 the tonal range:
 *
 *                 0.00        0.10        0.22        0.35
 *   sunset       0 / 181    25 / 166    50 / 153    72 / 142
 *   lobby        0 / 196    29 / 177    47 / 170    63 / 160
 *   studio-soft  0 / 158    23 / 143    49 / 129    72 / 117
 *
 * At the shipped 0.22 a black frill renders at RGB 50 and one sixth of the
 * range is gone. That IS the washed-out look, and it was in the room path
 * rather than in the lighting where everyone was looking for it.
 *
 * 0.00 was tried: the blacks come back perfectly and she stops picking up any
 * of the room's colour, which is the whole point of the slot. 0.10 keeps the
 * tint and costs 8 percent of the range instead of 17. Past 0.35 the wetness
 * the old comment warned about does eventually show up, but the contrast has
 * already gone by then, so it is never the binding limit.
 */
const MATCAP_STRENGTH = 0.1;

function eachMaterial(root, fn) {
  root?.traverse?.((object) => {
    const material = object?.material;
    if (!material) return;
    if (Array.isArray(material)) material.forEach((m) => m && fn(m));
    else fn(material);
  });
}

/**
 * @param {object} root      the VRM's scene, or anything with traverse()
 * @param {object|null} texture
 * @returns {() => void} restores what was there before
 */
export function applyMatcap(root, texture) {
  if (!texture) return () => {};

  const restores = [];

  eachMaterial(root, (material) => {
    if (!material.isMToonMaterial) return;

    const previousTexture = material.matcapTexture ?? null;
    const f = material.matcapFactor;
    const previousFactor = f ? { r: f.r, g: f.g, b: f.b } : null;

    material.matcapTexture = texture;
    f?.setRGB?.(MATCAP_STRENGTH, MATCAP_STRENGTH, MATCAP_STRENGTH);
    material.needsUpdate = true;

    restores.push(() => {
      material.matcapTexture = previousTexture;
      if (previousFactor) f.setRGB(previousFactor.r, previousFactor.g, previousFactor.b);
      material.needsUpdate = true;
    });
  });

  return () => {
    for (const restore of restores) restore();
    restores.length = 0;
  };
}
