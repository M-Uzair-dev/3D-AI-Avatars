import { describe, it, expect } from "vitest";
import { resolveLighting } from "./stageLighting.js";
import { DEFAULTS } from "./constants.js";

const rig = {
  keyDirection: [0, 1, 0],
  keyColor: [1, 0.8, 0.6],
  skyColor: [0.6, 0.7, 1],
  groundColor: [0.4, 0.3, 0.25],
  exposure: 1.1,
  backgroundIntensity: 0.85,
};

describe("resolveLighting", () => {
  it("falls back to the hand-tuned defaults when there is no room", () => {
    const l = resolveLighting(null, DEFAULTS.lighting);
    expect(l.key).toBe(DEFAULTS.lighting.key);
    expect(l.rim).toBe(DEFAULTS.lighting.rim);
    expect(l.exposure).toBe(DEFAULTS.lighting.exposure);
  });

  it("uses the room's exposure when there is one", () => {
    expect(resolveLighting(rig, DEFAULTS.lighting).exposure).toBe(1.1);
  });

  it("puts the key where the room's light actually is", () => {
    // keyDirection points AT the light, and a DirectionalLight shines from its
    // position toward the origin, so position is the direction scaled out.
    const l = resolveLighting(rig, DEFAULTS.lighting);
    expect(l.keyPosition[1]).toBeGreaterThan(0);
    expect(Math.hypot(...l.keyPosition)).toBeGreaterThan(1);
  });

  it("takes light colours from the room", () => {
    const l = resolveLighting(rig, DEFAULTS.lighting);
    expect(l.keyColor).toEqual([1, 0.8, 0.6]);
    expect(l.skyColor).toEqual([0.6, 0.7, 1]);
    expect(l.groundColor).toEqual([0.4, 0.3, 0.25]);
  });

  // The rim is what separates her from the backdrop, and a backdrop is exactly
  // what a room adds. Dropping it because "the environment lights her now" is
  // the mistake that makes her merge into the wall.
  it("keeps the rim light when a room is present", () => {
    expect(resolveLighting(rig, DEFAULTS.lighting).rim).toBeGreaterThan(0.5);
  });

  it("never returns an undefined intensity", () => {
    for (const r of [null, rig, {}]) {
      const l = resolveLighting(r, DEFAULTS.lighting);
      for (const k of ["ambient", "hemisphere", "key", "fill", "rim", "exposure"]) {
        expect(Number.isFinite(l[k]), `${k} for ${JSON.stringify(r)}`).toBe(true);
      }
    }
  });

  it("survives a malformed rig rather than blanking the stage", () => {
    const l = resolveLighting({ keyDirection: [0, 0, 0] }, DEFAULTS.lighting);
    expect(Math.hypot(...l.keyPosition)).toBeGreaterThan(0);
    expect(l.keyColor).toHaveLength(3);
  });

  /**
   * The room branch builds its object field by field rather than spreading the
   * defaults, so every tuning value has to be listed in it BY HAND. A value
   * present in the no-room branch and missing here is silent: it arrives as
   * `undefined`, the `?? fallback` at the call site swallows it, and the dial
   * simply stops working in exactly the case it was added for.
   *
   * That asymmetry has cost this project more than any other single mistake.
   * This is the guard.
   */
  it("carries the same tuning keys down both branches", () => {
    const withRoom = resolveLighting(rig, DEFAULTS.lighting);
    const without = resolveLighting(null, DEFAULTS.lighting);
    for (const k of ["shadowRadius", "contact", "contactSize", "fillPosition", "fillColor"]) {
      expect(withRoom[k], `${k} missing from the room branch`).toBeDefined();
      expect(without[k], `${k} missing from the no-room branch`).toBeDefined();
    }
    expect(withRoom.response).toBeDefined();
    expect(without.response).toBeDefined();
  });

  it("puts the fill opposite the key rather than at a fixed studio position", () => {
    // The fixed position was only a fill for the key it was tuned against. For
    // a baked key on the same side it stopped being a fill and became a second
    // key, and nothing lit her shadow side at all.
    for (const dir of [
      [0.46, 0.45, 0.76],
      [0.75, 0.36, -0.55],
      [-0.69, 0.41, 0.59],
    ]) {
      const l = resolveLighting({ ...rig, keyDirection: dir }, DEFAULTS.lighting);
      const key = l.keyPosition;
      const fill = l.fillPosition;
      // Opposite in azimuth: the horizontal components point the other way.
      expect(key[0] * fill[0] + key[2] * fill[2]).toBeLessThan(0);
      // And never below the floor, which would uplight her like a torch.
      expect(fill[1]).toBeGreaterThan(0);
    }
  });

  it("gives the shadow the room's own bounce colour to be tinted by", () => {
    const l = resolveLighting(rig, DEFAULTS.lighting);
    expect(l.response.shadeTint).toEqual(rig.groundColor);
    // With no room there is nothing to tint toward, and tinting toward a
    // guess would repaint every agent made before the environment milestone.
    expect(resolveLighting(null, DEFAULTS.lighting).response.shadeTint).toEqual([1, 1, 1]);
  });
});
