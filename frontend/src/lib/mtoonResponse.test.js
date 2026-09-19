import { describe, expect, it } from "vitest";
import { applyMtoonResponse, resolveMtoonResponse, shadeHueOf } from "./mtoonResponse.js";

/**
 * The tuning under test is the shipped one. These assertions are about the
 * SHAPE of the answer, not about a hand-tuned number, so retuning `shadeDepth`
 * by eye must not turn this file red.
 */
const TUNING = {
  terminator: -0.05,
  softness: 0.55,
  shadeDepth: 0.62,
  shadeTint: [1, 0.49, 0.17],
  shadeTintAmount: 0.3,
  rimLightingMix: 1,
};

/** What VRoid actually ships, measured from the glTF of the five bodies. */
const SKIN = {
  litFactor: [1, 1, 1],
  shadeColorFactor: [0.97, 0.81, 0.86],
  shadingShiftFactor: -0.8,
  shadingToonyFactor: 0.91,
  rimLightingMixFactor: 0,
};
const HAIR = {
  litFactor: [1, 1, 1],
  shadeColorFactor: [1, 1, 1],
  shadingShiftFactor: 0,
  shadingToonyFactor: 0.6,
  rimLightingMixFactor: 0,
};
/** The `Tops` materials, whose authored shade colour is BRIGHTER than their lit colour. */
const INVERTED = {
  litFactor: [0.49, 0.6, 0.68],
  shadeColorFactor: [0.96, 0.95, 0.95],
  shadingShiftFactor: 0,
  shadingToonyFactor: 0.9,
  rimLightingMixFactor: 0,
};

/**
 * MToon's own diffuse term, transcribed from the shader so these tests measure
 * what the GPU will do rather than what this module intends.
 *
 *   shading       = linearstep( -1 + toony, 1 - toony, dotNL + shift )
 *   directDiffuse = lightColor * mix( shadeColor, litColor, shading )
 *
 * `dotNL` never multiplies the result — that is the whole reason the bug
 * existed, so it is the thing this helper must reproduce faithfully.
 */
function shadingAt(dotNL, { shadingShiftFactor: shift, shadingToonyFactor: toony }) {
  const a = -1 + toony;
  const b = 1 - toony;
  return Math.max(0, Math.min(1, (dotNL + shift - a) / (b - a)));
}

/** Luminance of the green channel is enough to talk about lightness here. */
function litValueAt(dotNL, resolved, litFactor) {
  const s = shadingAt(dotNL, resolved);
  return resolved.shadeColorFactor[1] * (1 - s) + litFactor[1] * s;
}

describe("shadeHueOf", () => {
  it("keeps the authored hue tilt and normalises its magnitude away", () => {
    const hue = shadeHueOf([1, 1, 1], [0.97, 0.81, 0.86]);
    // Red above green: VRoid shades skin pink, and that must survive.
    expect(hue[0]).toBeGreaterThan(hue[1]);
    // Magnitude gone — the mean is 1, so shadeDepth is in sole charge of depth.
    expect((hue[0] + hue[1] + hue[2]) / 3).toBeCloseTo(1, 6);
  });

  it("is neutral when the model authored no tilt at all", () => {
    expect(shadeHueOf([1, 1, 1], [1, 1, 1])).toEqual([1, 1, 1]);
  });

  it("survives an unlit channel instead of dividing by zero", () => {
    const hue = shadeHueOf([0, 0.6, 0.68], [0.9, 0.5, 0.4]);
    expect(hue.every(Number.isFinite)).toBe(true);
  });
});

describe("resolveMtoonResponse", () => {
  it("gives the shade side somewhere to go", () => {
    // The defect: shipped, shade IS lit, so the ramp mixes between two equal
    // colours and no light direction can change the result.
    const resolved = resolveMtoonResponse(HAIR, TUNING);
    expect(resolved.shadeColorFactor[1]).toBeLessThan(HAIR.litFactor[1] * 0.8);
  });

  it("puts the face's terminator back on the silhouette", () => {
    const resolved = resolveMtoonResponse(SKIN, TUNING);
    // Shipped, the face is fully shaded below dotNL 0.71 — i.e. everywhere but
    // a patch aimed at the key.
    expect(shadingAt(0.5, SKIN)).toBe(0);
    // Fixed, a surface 60 degrees off the key is partly lit.
    expect(shadingAt(0.5, resolved)).toBeGreaterThan(0);
  });

  it("makes brightness actually vary with the direction of the light", () => {
    // This is the user-visible bug, stated as a measurement. Shipped, a
    // surface facing the key and a surface turned away from it render
    // IDENTICALLY — the ramp mixes between two equal colours, so its output
    // cannot matter. That is the uniform illumination, in one number.
    const spread = (m) => litValueAt(1, m, HAIR.litFactor) - litValueAt(-0.3, m, HAIR.litFactor);
    expect(spread(HAIR)).toBeCloseTo(0, 6);

    // Fixed, the turned-away side is more than a third darker.
    const resolved = resolveMtoonResponse(HAIR, TUNING);
    expect(spread(resolved)).toBeGreaterThan(0.3);

    // And it falls off gradually rather than switching at a terminator, which
    // is what "realistic falloff" means on a toon surface: inside the ramp,
    // each step away from the light is strictly darker than the last.
    //
    // The ramp is `linearstep(-1 + toony, 1 - toony, dotNL)`, so at the
    // shipped softness of 0.55 it spans dotNL ±0.45 and saturates outside
    // that. The samples stay inside deliberately — a test that wandered past
    // the saturation point would be asserting that a clamp is not a clamp.
    const steps = [0.4, 0.2, 0, -0.2, -0.4].map((d) => litValueAt(d, resolved, HAIR.litFactor));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it("un-inverts a material whose authored shade is brighter than its lit colour", () => {
    const resolved = resolveMtoonResponse(INVERTED, TUNING);
    // Shipped, the sweater was BRIGHTER in shadow than in light.
    expect(INVERTED.shadeColorFactor[1]).toBeGreaterThan(INVERTED.litFactor[1]);
    // Deriving from the lit colour rather than the authored shade fixes that
    // without a special case for it.
    expect(resolved.shadeColorFactor[1]).toBeLessThan(INVERTED.litFactor[1]);
  });

  it("only ever moves a material toward responding to light", () => {
    // Hair ships SOFTER than the cap, and that is an artistic choice about
    // hair. Capping must not harden it.
    const resolved = resolveMtoonResponse({ ...HAIR, shadingToonyFactor: 0.3 }, TUNING);
    expect(resolved.shadingToonyFactor).toBe(0.3);
    // And a material already authored at 0 must not have its terminator pushed
    // down to the floor.
    expect(resolveMtoonResponse(HAIR, TUNING).shadingShiftFactor).toBe(0);
  });

  it("tints the shadow toward the room without tinting the lit side", () => {
    const warm = resolveMtoonResponse(HAIR, TUNING);
    const neutral = resolveMtoonResponse(HAIR, { ...TUNING, shadeTintAmount: 0 });
    // The room is orange, so the shadow loses relatively more blue than red.
    expect(warm.shadeColorFactor[2] / neutral.shadeColorFactor[2]).toBeLessThan(
      warm.shadeColorFactor[0] / neutral.shadeColorFactor[0],
    );
    // Nothing here touches the lit colour. That is the difference between this
    // and the overlay it replaces.
    expect(warm.shadeColorFactor.every((c) => c <= 1)).toBe(true);
  });

  it("stops the matcap being added at full strength whatever the light", () => {
    expect(resolveMtoonResponse(HAIR, TUNING).rimLightingMixFactor).toBe(1);
  });
});

/** The smallest stand-in for an MToon material that the applier touches. */
function fakeMaterial(authored, { map = { id: "albedo" }, shadeTexture = undefined } = {}) {
  const rgb = (c) => ({
    r: c[0],
    g: c[1],
    b: c[2],
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
    },
  });
  return {
    isMToonMaterial: true,
    map,
    color: rgb(authored.litFactor),
    shadeColorFactor: rgb(authored.shadeColorFactor),
    shadeMultiplyTexture: shadeTexture,
    shadingShiftFactor: authored.shadingShiftFactor,
    shadingToonyFactor: authored.shadingToonyFactor,
    rimLightingMixFactor: authored.rimLightingMixFactor,
    needsUpdate: false,
  };
}

function fakeRoot(materials) {
  return {
    traverse(fn) {
      for (const material of materials) fn({ material });
    },
  };
}

describe("applyMtoonResponse", () => {
  it("restores every value it touched", () => {
    // Load-bearing: vrmCache shares ONE parsed VRM across consumers, so a
    // stage that retunes for its own room and never restores leaves that
    // tuning on another agent wearing the same body.
    const material = fakeMaterial(SKIN, { shadeTexture: { id: "shade" } });
    const before = {
      shade: [material.shadeColorFactor.r, material.shadeColorFactor.g, material.shadeColorFactor.b],
      shift: material.shadingShiftFactor,
      toony: material.shadingToonyFactor,
      rimMix: material.rimLightingMixFactor,
      shadeTexture: material.shadeMultiplyTexture,
    };

    const restore = applyMtoonResponse(fakeRoot([material]), TUNING);
    expect(material.shadingShiftFactor).not.toBe(before.shift);
    restore();

    expect([
      material.shadeColorFactor.r,
      material.shadeColorFactor.g,
      material.shadeColorFactor.b,
    ]).toEqual(before.shade);
    expect(material.shadingShiftFactor).toBe(before.shift);
    expect(material.shadingToonyFactor).toBe(before.toony);
    expect(material.rimLightingMixFactor).toBe(before.rimMix);
    expect(material.shadeMultiplyTexture).toBe(before.shadeTexture);
  });

  it("leaves a material that already has a shade texture alone", () => {
    const shadeTexture = { id: "shade" };
    const material = fakeMaterial(SKIN, { shadeTexture });
    applyMtoonResponse(fakeRoot([material]), TUNING);
    expect(material.shadeMultiplyTexture).toBe(shadeTexture);
  });

  it("borrows the albedo when a material has no shade texture", () => {
    // Without this the shade side is `shadeColorFactor` alone, so darkening it
    // would replace her texture with a flat colour in shadow — the exact
    // opposite of leaving the original textures intact.
    const map = { id: "albedo" };
    const material = fakeMaterial(SKIN, { map, shadeTexture: undefined });
    applyMtoonResponse(fakeRoot([material]), TUNING);
    expect(material.shadeMultiplyTexture).toBe(map);
  });

  it("ignores materials that are not MToon", () => {
    const plain = { isMToonMaterial: false, color: { r: 1, g: 1, b: 1 } };
    const restore = applyMtoonResponse(fakeRoot([plain]), TUNING);
    expect(plain).toEqual({ isMToonMaterial: false, color: { r: 1, g: 1, b: 1 } });
    restore();
  });

  it("recompiles the program, or the old one stays bound", () => {
    const material = fakeMaterial(HAIR);
    applyMtoonResponse(fakeRoot([material]), TUNING);
    expect(material.needsUpdate).toBe(true);
  });
});
