/**
 * Make an MToon material actually respond to the light it is standing in.
 *
 * ── The bug this exists for ─────────────────────────────────────────────────
 *
 * She looked like a sticker on a photograph: colour-matched to the room and
 * lit by nothing. The light rig was right and was being applied. The MATERIAL
 * could not express it, and the numbers say so exactly.
 *
 * MToon's diffuse term is
 *
 *     shading       = linearstep( -1 + toony, 1 - toony, dotNL + shift )
 *     directDiffuse = lightColor * BRDF_Lambert( mix( shadeColor, litColor, shading ) )
 *
 * Note what is NOT there: `dotNL` never multiplies the result. Unlike a
 * Lambert surface, an MToon surface has exactly ONE way to vary with the
 * direction of the light, and that is the `shading` ramp between two colours.
 * If those two colours are the same, or if the ramp saturates everywhere, the
 * surface renders a constant — whatever the lights are doing.
 *
 * ── How much of this is measured, and how much is inference ─────────────────
 *
 * The numbers below were measured from the models' own glTF across 87
 * materials — but on FIVE bodies: free-1, free-2, free-3, free-5 and free-6.
 * This project ships EIGHT. `haishin-chan`, `untitled-6` and `untitled-7` have
 * never been through it, and for them this file is inference rather than
 * measurement.
 *
 * It is a good inference: every uniform below is derived from the material's
 * OWN lit colour rather than from an authored constant, and every clamp is
 * one-directional, so a material already authored sanely is left alone. But it
 * is still reasoning, and reasoning about a renderer is what produced the bug
 * in the first place. Those three want an eye on them.
 *
 * Both failures are present in the five that were measured:
 *
 *   - `_ShadeColor == _Color` on hair, brows, eyes, shoes and bottoms, and
 *     within 3% of it on most cloth. The shade side IS the lit side. On the
 *     `Tops` materials it is inverted — lit 0.49, shade 0.96 — so the sweater
 *     was brighter in shadow than in light.
 *   - `_ShadeShift = -0.8` on every face material, which after three-vrm's v0
 *     conversion (`toony = lerp(0.9, 1, 0.5 + 0.5 * shift)` = 0.91) gives
 *     `linearstep(-0.09, 0.09, dotNL - 0.8)`. The face is fully in shade
 *     colour below dotNL 0.71 — everywhere except a patch pointing within 27
 *     degrees of the key.
 *
 * So every visible pixel evaluated to `albedo * a constant tint`. That is the
 * translucent orange overlay, and it was in the model, not in the lighting.
 *
 * ── Why this is a retune and not a material swap ────────────────────────────
 *
 * Replacing MToon with MeshStandardMaterial would light her correctly and
 * destroy the art style, which is the one thing that must not change. These
 * are the four uniforms that decide whether a toon surface has form at all.
 * Textures, normal maps, emissives and outlines are untouched.
 *
 * ── The fact that makes darkening the shade side safe ───────────────────────
 *
 * `shadeColorFactor` multiplies `shadeMultiplyTexture`, and on all 87
 * materials across the five measured bodies `_ShadeTexture === _MainTex`. The
 * shade side samples the SAME albedo texture as the lit side, so lowering the
 * factor darkens her without flattening her to a colour. Checked per material
 * anyway — see `shadeTextureFor`.
 */

/** Guard against dividing by an unlit channel when recovering the authored hue. */
const EPSILON = 1e-4;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * The authored hue of a material's shade colour, with its magnitude removed.
 *
 * VRoid encodes a deliberate hue tilt in the shade colour — anime skin shades
 * PINK, not grey — and throwing that away would be a style change. But the
 * magnitude it ships is unusable (equal to the lit colour, or above it), so
 * the two are separated: the ratio's direction is kept and its length
 * renormalised to 1, leaving `shadeDepth` in sole charge of how dark a shadow
 * is.
 *
 * Skin ships [0.97, 0.81, 0.86] against a lit [1, 1, 1]; mean 0.88 gives
 * [1.10, 0.92, 0.98] — the pink survives, the depth becomes ours.
 */
export function shadeHueOf(litFactor, shadeFactor) {
  const ratio = [0, 1, 2].map((i) => {
    const lit = litFactor[i];
    if (!(lit > EPSILON)) return 1;
    const r = shadeFactor[i] / lit;
    return Number.isFinite(r) && r > 0 ? r : 1;
  });
  const mean = (ratio[0] + ratio[1] + ratio[2]) / 3;
  if (!(mean > EPSILON)) return [1, 1, 1];
  return ratio.map((r) => r / mean);
}

/**
 * What one material's shading uniforms should become.
 *
 * Pure, so the half of this that can be wrong needs no GPU to test. Every
 * clamp is one-directional on purpose — this only ever moves a material TOWARD
 * responding to light, never past what the artist asked for. A material
 * already authored with a soft ramp keeps its own value.
 *
 * @param {object} authored  `{ litFactor, shadeColorFactor, shadingShiftFactor,
 *                              shadingToonyFactor, rimLightingMixFactor }`,
 *                            colours as plain 3-arrays
 * @param {object} tuning    `response`, as assembled by stageLighting.js from
 *                            the room's bounce colour and DEFAULTS.lighting
 */
export function resolveMtoonResponse(authored, tuning) {
  const lit = authored.litFactor ?? [1, 1, 1];
  const shade = authored.shadeColorFactor ?? [1, 1, 1];

  // TERMINATOR. `shift` slides the lit/shade boundary along dotNL. The face
  // ships -0.8, which parks the boundary at dotNL 0.8 and leaves the whole
  // head in shade. Raising it to near 0 puts the boundary back where a real
  // one is: at the 90-degree silhouette edge. Never LOWERED, so a material
  // already sitting at 0 is left alone.
  const shadingShiftFactor = Math.max(authored.shadingShiftFactor ?? 0, tuning.terminator);

  // SOFTNESS. `toony` is the width of the ramp, inverted: 0.91 is a 5-degree
  // hard step, 0.55 a broad near-Lambert falloff that still reads as toon
  // shading. Capped rather than set, so the hair's authored 0.6 — deliberately
  // softer than the cloth's 0.91 — keeps its relative character.
  const shadingToonyFactor = Math.min(authored.shadingToonyFactor ?? 0.9, tuning.softness);

  // SHADE DEPTH. Derived from the material's own LIT colour rather than from
  // its authored shade colour, which is what makes this uniform across a set
  // of materials whose authored ratios run from 0.97 to 1.96.
  const hue = shadeHueOf(lit, shade);
  const tint = tuning.shadeTint ?? [1, 1, 1];
  const amount = clamp01(tuning.shadeTintAmount ?? 0);
  const shadeColorFactor = [0, 1, 2].map((i) => {
    // The room's bounce colour, mixed in so a shadow picks up where it is
    // rather than being a neutral fraction of the lit side. This is the only
    // place the environment touches her albedo, and it is a hue shift INSIDE
    // THE SHADOW — not a wash over the whole model, which is the thing being
    // fixed.
    const tinted = 1 - amount + amount * tint[i];
    return clamp01(lit[i] * hue[i] * tuning.shadeDepth * tinted);
  });

  // RIM MIX. `rimMix = mix(vec3(1), directSpecular, rimLightingMixFactor)`,
  // and `directSpecular` on MToon is not specular at all — it is the sum of
  // every light's colour. At the shipped 0 the matcap and the parametric rim
  // are ADDED at full strength whatever the lighting, which is a constant over
  // the whole body and the second half of the orange overlay. At 1 the room's
  // reflection is itself lit by the room.
  const rimLightingMixFactor = Math.max(
    authored.rimLightingMixFactor ?? 0,
    clamp01(tuning.rimLightingMix ?? 0),
  );

  return { shadingShiftFactor, shadingToonyFactor, shadeColorFactor, rimLightingMixFactor };
}

function eachMaterial(root, fn) {
  root?.traverse?.((object) => {
    const material = object?.material;
    if (!material) return;
    if (Array.isArray(material)) material.forEach((m) => m && fn(m));
    else fn(material);
  });
}

/**
 * The albedo to sample on the shade side, if the material has none of its own.
 *
 * Every shipped body sets `_ShadeTexture` to `_MainTex`, so this returns the
 * material's existing shade texture and changes nothing. It exists for the
 * material that does not: without a shade texture, `shadeColorFactor` IS the
 * entire shade side, and darkening it would replace her texture with a flat
 * colour in shadow. Borrowing `map` keeps the texture and makes the factor a
 * multiplier, which is what the rest of this file assumes.
 */
export function shadeTextureFor(material) {
  return material.shadeMultiplyTexture ?? material.map ?? null;
}

/**
 * Retune every MToon material under `root`, and hand back an undo.
 *
 * ── Why it undoes itself ────────────────────────────────────────────────────
 *
 * Same reason as applyMatcap, and it is load-bearing here rather than
 * theoretical: `models/vrmCache.js` keeps the WHOLE CAST parsed and hands the
 * same VRM object back every time you walk the carousel round to her again.
 * Retuning in place without an undo means the second visit retunes the result
 * of the first — `shadeDepth` compounding on itself until she is black — and
 * changing rooms without one leaves the old room's bounce tint in her shadows.
 *
 * The undo is what makes this idempotent, so it runs on every room change and
 * on unmount.
 *
 * @param {object} root    the VRM's scene, or anything with traverse()
 * @param {object} tuning  `response`, as assembled by stageLighting.js
 * @returns {() => void}   restores every value this touched
 */
export function applyMtoonResponse(root, tuning) {
  if (!tuning) return () => {};

  const restores = [];

  eachMaterial(root, (material) => {
    if (!material.isMToonMaterial) return;

    const lit = material.color;
    const shade = material.shadeColorFactor;
    if (!lit || !shade) return;

    const resolved = resolveMtoonResponse(
      {
        litFactor: [lit.r, lit.g, lit.b],
        shadeColorFactor: [shade.r, shade.g, shade.b],
        shadingShiftFactor: material.shadingShiftFactor,
        shadingToonyFactor: material.shadingToonyFactor,
        rimLightingMixFactor: material.rimLightingMixFactor,
      },
      tuning,
    );

    const previous = {
      shade: { r: shade.r, g: shade.g, b: shade.b },
      shift: material.shadingShiftFactor,
      toony: material.shadingToonyFactor,
      rimMix: material.rimLightingMixFactor,
      shadeTexture: material.shadeMultiplyTexture,
    };

    // Adding a map where there was none changes the shader's defines, so this
    // needs the needsUpdate below or the old program stays bound — the same
    // trap applyMatcap documents.
    material.shadeMultiplyTexture = shadeTextureFor(material);
    shade.setRGB(...resolved.shadeColorFactor);
    material.shadingShiftFactor = resolved.shadingShiftFactor;
    material.shadingToonyFactor = resolved.shadingToonyFactor;
    material.rimLightingMixFactor = resolved.rimLightingMixFactor;
    material.needsUpdate = true;

    restores.push(() => {
      material.shadeMultiplyTexture = previous.shadeTexture;
      shade.setRGB(previous.shade.r, previous.shade.g, previous.shade.b);
      material.shadingShiftFactor = previous.shift;
      material.shadingToonyFactor = previous.toony;
      material.rimLightingMixFactor = previous.rimMix;
      material.needsUpdate = true;
    });
  });

  return () => {
    for (const restore of restores) restore();
    restores.length = 0;
  };
}
