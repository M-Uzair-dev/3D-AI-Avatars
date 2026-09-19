import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BACKGROUND_LIBRARY,
  isBgId,
  getBackground,
  skyUrlFor,
  matcapUrlFor,
  thumbUrlFor,
  rigFor,
} from "./backgroundLibrary.js";
import { DEFAULT_ROOM } from "./constants.js";

describe("the library", () => {
  it("ships every environment that was baked", () => {
    // Not a fixed count: the library is generated from whatever the bake
    // produced, so pinning a number here would fail every time a room is added
    // or dropped, which is a normal editorial act rather than a regression.
    // What must hold is that SOMETHING was baked — an empty library means the
    // bake never ran, and the room feature silently does nothing.
    expect(BACKGROUND_LIBRARY.length).toBeGreaterThan(0);
  });

  it("gives every entry a unique id", () => {
    const ids = BACKGROUND_LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a name", () => {
    for (const e of BACKGROUND_LIBRARY) {
      // A name always exists — derived from the filename when no hand-written
      // copy is supplied. `blurb` is optional by design and may be "".
      expect(e.name, `${e.id} has no name`).toBeTruthy();
      expect(typeof e.blurb, `${e.id} blurb is not a string`).toBe("string");
    }
  });

  // The app opens in this room. A typo here is a blank stage on first paint
  // with nothing in the console, because a missing room is a null skybox rather
  // than a thrown error.
  it("opens in a room that exists", () => {
    expect(isBgId(DEFAULT_ROOM)).toBe(true);
  });

  // Every URL is an <img> src or a texture URL at the other end. A dead one is
  // a blank backdrop or an untextured model, and neither throws.
  it("has a real file behind every url", () => {
    const publicDir = path.resolve(import.meta.dirname, "../../public");
    for (const e of BACKGROUND_LIBRARY) {
      for (const url of [e.skyUrl, e.matcapUrl, e.thumbUrl]) {
        expect(existsSync(path.join(publicDir, url.replace(/^\//, ""))), `${e.id}: ${url}`).toBe(
          true,
        );
      }
    }
  });

  it("carries a complete rig for every entry", () => {
    for (const e of BACKGROUND_LIBRARY) {
      expect(e.rig, `${e.id} has no rig`).toBeTruthy();
      expect(e.rig.keyDirection).toHaveLength(3);
      expect(Math.hypot(...e.rig.keyDirection)).toBeCloseTo(1, 4);
      expect(e.rig.keyColor).toHaveLength(3);
      expect(e.rig.exposure).toBeGreaterThan(0);
    }
  });
});

describe("lookups", () => {
  it("accepts every shipped id and nothing else", () => {
    for (const e of BACKGROUND_LIBRARY) expect(isBgId(e.id)).toBe(true);
    expect(isBgId("a-room-we-never-shipped")).toBe(false);
    expect(isBgId(null)).toBe(false);
    expect(isBgId(undefined)).toBe(false);
    expect(isBgId("")).toBe(false);
  });

  // Null rather than a fallback, even though every model here is always in a
  // room. A silent fallback would turn a typo in DEFAULT_ROOM, or a room
  // dropped from the bake, into "some other room quietly appeared" — which is
  // indistinguishable from working. stageLighting.js is the one place that
  // decides what a null MEANS, and it means the studio rig.
  it("returns null for an unknown or absent id rather than falling back", () => {
    expect(getBackground("a-room-we-never-shipped")).toBe(null);
    expect(getBackground(undefined)).toBe(null);
    expect(getBackground(null)).toBe(null);
  });

  it("returns null from every accessor for an absent id", () => {
    expect(skyUrlFor(null)).toBe(null);
    expect(matcapUrlFor(null)).toBe(null);
    expect(thumbUrlFor(null)).toBe(null);
    expect(rigFor(null)).toBe(null);
  });

  it("returns the entry's own values for a known id", () => {
    const e = BACKGROUND_LIBRARY[0];
    expect(skyUrlFor(e.id)).toBe(e.skyUrl);
    expect(matcapUrlFor(e.id)).toBe(e.matcapUrl);
    expect(thumbUrlFor(e.id)).toBe(e.thumbUrl);
    expect(rigFor(e.id)).toBe(e.rig);
  });
});
