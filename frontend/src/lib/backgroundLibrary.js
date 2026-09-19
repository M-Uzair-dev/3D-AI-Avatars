/**
 * The rooms she can stand in.
 *
 * ---------------------------------------------------------------------------
 * WHAT REPLACED WHAT
 * ---------------------------------------------------------------------------
 * This supersedes the `.cyclorama` — a CSS gradient behind a transparent
 * canvas, tinted from the model's own palette. That was the right backdrop
 * while the backdrop was a flat wash, and it cannot do this job: a DOM layer
 * does not move when the camera moves, so the moment you orbit her a CSS
 * backdrop reads as her spinning inside a photograph.
 *
 * On `scene.background` the equirect is world-fixed and the parallax is free.
 * It falls out of moving the camera rather than being a second thing to
 * animate and keep in sync.
 *
 * ---------------------------------------------------------------------------
 * THE ASSETS, AND WHY THERE IS NO BAKE SCRIPT HERE
 * ---------------------------------------------------------------------------
 * Three files per room, none of them an HDR file:
 *
 *   skyUrl     the equirect skybox, already tone-mapped to LDR
 *   matcapUrl  the diffuse convolution MToon samples, because it cannot sample
 *              an environment map at all — see applyMatcap.js
 *   thumbUrl   the picker tile
 *
 * They were baked from 4k Poly Haven `.exr` sources by a script that lives in
 * the host project, along with the equirect/lightRig/matcap modules that derive
 * `backgroundRigs.json`. **That pipeline was deliberately not ported here**, so
 * in this repo the room set is FIXED AT SIX and the rig file is a committed
 * artifact rather than something regenerated. Adding a room means baking it
 * over there and copying four files across.
 *
 * Sources are Poly Haven, CC0 — no attribution required and redistribution
 * permitted, which is why these ship where three of the eight VRMs could not.
 */

import RIGS from './backgroundRigs.json';

const PREFIX = '/backgrounds/baked';

/**
 * @typedef {object} BackgroundEntry
 * @property {string} id
 * @property {string} name       shown in the picker
 * @property {string} blurb      one line, so two daylight rooms are distinguishable
 * @property {string} skyUrl
 * @property {string} matcapUrl
 * @property {string} thumbUrl
 * @property {object} rig        baked light rig; consumed by stageLighting.js
 */

/**
 * Hand-written display copy, keyed by id. Entirely optional.
 *
 * The library is GENERATED from whatever was baked, so a room appears here
 * whether or not it is listed below — under the name the bake derived from its
 * filename. Listing it just gives it better copy than a filename can.
 *
 * A missing entry is not a bug.
 */
const COPY = {
  'modern-evening-street': {
    name: 'Evening Street',
    blurb: 'Blue hour, shop lights from the left',
  },
  'palermo-square': {
    name: 'Palermo Square',
    blurb: 'Hard noon sun, warm stone',
  },
  'snowy-field': {
    name: 'Snowy Field',
    blurb: 'Flat overcast, bright ground bounce',
  },
  'spruit-sunrise': {
    name: 'Spruit Sunrise',
    blurb: 'Low gold key, long shadows',
  },
  'suburban-garden': {
    name: 'Suburban Garden',
    blurb: 'Soft daylight through leaves',
  },
  'the-sky-is-on-fire': {
    name: 'Sky On Fire',
    blurb: 'Deep dusk, red horizon',
  },
};

/**
 * Every room that was baked, in the order the bake produced them.
 *
 * Derived from `backgroundRigs.json` rather than hand-listed, so the array and
 * the assets cannot drift apart by someone editing one and not the other. If
 * this is empty, the rig file is missing.
 */
/** @type {BackgroundEntry[]} */
export const BACKGROUND_LIBRARY = Object.entries(RIGS).map(([id, rig]) => ({
  id,
  name: COPY[id]?.name ?? rig.name ?? id,
  blurb: COPY[id]?.blurb ?? '',
  skyUrl: `${PREFIX}/${id}.webp`,
  matcapUrl: `${PREFIX}/${id}-matcap.png`,
  thumbUrl: `${PREFIX}/${id}-thumb.webp`,
  rig,
}));

const BY_ID = new Map(BACKGROUND_LIBRARY.map((e) => [e.id, e]));

/** Is this a room we ship? */
export function isBgId(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

/**
 * The entry for an id, or null.
 *
 * Null is reachable from a typo and from nothing else — unlike the host
 * project, every model here is always in a room. The callers still have to mean
 * something by it, and what they mean is "fall back to the hand-tuned studio
 * rig", which is what stageLighting.js does with a null.
 */
export function getBackground(id) {
  return (typeof id === 'string' ? BY_ID.get(id) : undefined) ?? null;
}

export function skyUrlFor(id) {
  return getBackground(id)?.skyUrl ?? null;
}

export function matcapUrlFor(id) {
  return getBackground(id)?.matcapUrl ?? null;
}

export function thumbUrlFor(id) {
  return getBackground(id)?.thumbUrl ?? null;
}

export function rigFor(id) {
  return getBackground(id)?.rig ?? null;
}
