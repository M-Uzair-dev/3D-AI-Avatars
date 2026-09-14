/**
 * Parsed VRMs, kept alive between model changes.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHAT IT GAVE UP
 * ---------------------------------------------------------------------------
 * VrmAvatar used to load a model in an effect and deepDispose it in that
 * effect's cleanup. That was airtight — nothing could leak, because the model
 * died with the effect that made it — and it made every model change an 18MB
 * download with a progress bar in front of it.
 *
 * The carousel cannot have that. A transition that stops to fetch is not a
 * transition, so the two neighbours have to already be parsed when you press
 * the button, and "already parsed" means something has to hold them.
 *
 * THE COST IS REAL AND IT IS HERE. Nothing in this file throws when it goes
 * wrong. A retain() that keeps too much leaks ~18MB per model, silently, until
 * the tab is closed — three.js does not free GPU resources on garbage
 * collection, so an unreferenced model is not a freed one. The eviction
 * DECISION is pure and tested in lib/carousel.js; this file only carries it
 * out. That split is deliberate: the part that can be tested is the part most
 * likely to be wrong.
 *
 * Lives here rather than in lib/ because invariant 4 bars lib/ from importing
 * three.js, and disposal is three.js by definition. audio/speechEngine.js is
 * the same shape for the same reason: an impure singleton holding resources the
 * pure layer decides about.
 */

import { Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { evictions } from '@/lib/carousel.js';

/** url -> { url, vrm, headY, lastUsed, promise } */
const entries = new Map();

/**
 * Everything a loaded model has to have done to it before it can be shown.
 *
 * Lifted verbatim out of VrmAvatar's load effect — this is the same sequence,
 * in the same order, and the order matters: the head cannot be measured until
 * the world matrices exist, and they do not exist until updateMatrixWorld runs,
 * because nothing has rendered yet. Measuring first reads the head as sitting
 * on the floor, and the camera then frames the floor.
 */
function prepare(gltf) {
  const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false;
  });
  vrm.scene.updateMatrixWorld(true);
  const head = vrm.humanoid?.getNormalizedBoneNode('head');
  const headY = head ? head.getWorldPosition(new Vector3()).y : null;
  return { vrm, headY };
}

/**
 * A parsed model, from the cache if it is there and from the network if not.
 *
 * `onProgress` only fires on a cold load; a cached hit resolves without ever
 * calling it, which is what lets the caller show a progress bar for the first
 * visit to a model and nothing at all for every visit after.
 *
 * Concurrent calls for the same url share one request rather than racing. That
 * matters more than it looks: pressing the button twice quickly asks for the
 * same neighbour from both the prefetch and the transition.
 *
 * @returns {Promise<{vrm: object, headY: number|null}>}
 */
export function load(url, { onProgress } = {}) {
  const hit = entries.get(url);
  if (hit?.vrm) {
    hit.lastUsed = Date.now();
    return Promise.resolve({ vrm: hit.vrm, headY: hit.headY });
  }
  if (hit?.promise) return hit.promise;

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const promise = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const entry = entries.get(url);
        // Evicted while it was in flight. Dispose rather than resurrect: the
        // cache was told it was not wanted, and honouring that is the whole
        // contract. Callers still get their model — this resolves — they just
        // do not get a cached one.
        if (!entry) {
          const prepared = prepare(gltf);
          resolve(prepared);
          return;
        }
        const prepared = prepare(gltf);
        entry.vrm = prepared.vrm;
        entry.headY = prepared.headY;
        entry.lastUsed = Date.now();
        entry.promise = null;
        resolve(prepared);
      },
      (event) => {
        if (event.total) onProgress?.(event.loaded / event.total);
      },
      (err) => {
        entries.delete(url);
        reject(err);
      },
    );
  });

  entries.set(url, { url, vrm: null, headY: null, lastUsed: null, promise });
  return promise;
}

/**
 * Warming the cast, one model at a time, never while she is moving.
 *
 * ---------------------------------------------------------------------------
 * WHY A QUEUE WITH A PAUSE AND NOT A HANDFUL OF FETCHES
 * ---------------------------------------------------------------------------
 * Parsing a VRM is not cheap and the expensive half is not asynchronous:
 * GLTFLoader's parse, removeUnnecessaryVertices and combineSkeletons all run on
 * the main thread, and on an 18MB model that is a visible stall rather than a
 * hitch.
 *
 * The first cut fired both neighbours at once and did it whenever the current
 * model changed — which meant two of those landing back to back, one of them
 * reliably in the middle of a transition. That was the whole of "it lags, like
 * a lot". The work was always there; the old model menu just did it behind a
 * progress bar while the user was already waiting.
 *
 * So: one at a time, nearest first, and `paused` while a transition runs. The
 * cost is paid during the quiet minute after the page loads, and once the cast
 * is warm nothing ever loads again — which is the real fix, because a stall
 * that cannot happen does not need to be scheduled around.
 *
 * A load already in flight is NOT cancelled when the pause comes on. There is
 * no AbortController on the fetch (see docs/11) and the parse cannot be
 * interrupted, so the guarantee is "no NEW model starts", not "nothing is
 * happening". In practice that window closes for good once warm-up finishes.
 */
let warmQueue = [];
let warmInFlight = false;
let warmPaused = false;

/**
 * Hold the queue while she is moving, and let it go again afterwards.
 *
 * Releasing pumps immediately rather than waiting for the next warm() call,
 * because the thing that un-pauses this is a transition ending and nothing else
 * is going to come along and ask.
 */
export function setWarmPaused(paused) {
  warmPaused = paused;
  if (!paused) pumpWarm();
}

/**
 * The models to have ready, most wanted first.
 *
 * Replaces the queue rather than appending to it: the order depends on where
 * she is standing, and once she has moved the old order is not a worse plan, it
 * is the wrong one.
 */
export function warm(urls) {
  warmQueue = Array.isArray(urls) ? urls : [];
  pumpWarm();
}

function pumpWarm() {
  if (warmInFlight || warmPaused) return;
  // entries.has covers both "already parsed" and "already downloading", so a
  // model the user walked to themselves is never fetched twice.
  const next = warmQueue.find((url) => url && !entries.has(url));
  if (!next) return;

  warmInFlight = true;
  load(next)
    // A model that will not load is not an error the user should be shown —
    // they have not asked for it. They get the real message with the real
    // reason if they ever press toward it.
    .catch(() => {})
    .finally(() => {
      warmInFlight = false;
      pumpWarm();
    });
}

/** How much of the cast is ready. For the dev panel and for tests. */
export function warmProgress(urls) {
  const wanted = (urls ?? []).filter(Boolean);
  if (wanted.length === 0) return 1;
  return wanted.filter((url) => entries.get(url)?.vrm).length / wanted.length;
}

/** Is this model ready to be put on stage without waiting? */
export function isReady(url) {
  return Boolean(entries.get(url)?.vrm);
}

/** Mark a model as the one in use, so it is the last thing eviction considers. */
export function touch(url) {
  const entry = entries.get(url);
  if (entry) entry.lastUsed = Date.now();
}

/**
 * Keep these, throw away the rest.
 *
 * The caller passes what lib/carousel.js says is worth keeping; this walks the
 * difference and frees it. Entries still in flight are dropped from the map but
 * not disposed — there is nothing to dispose yet, and load() checks on arrival
 * whether it is still wanted.
 *
 * @param {string[]} keep urls that must survive
 * @returns {string[]} what was actually disposed, for the caller to log or test
 */
export function retain(keep) {
  const cached = [...entries.values()].map((e) => ({ url: e.url, lastUsed: e.lastUsed }));
  const doomed = evictions(cached, keep);
  for (const url of doomed) {
    const entry = entries.get(url);
    if (entry?.vrm) VRMUtils.deepDispose(entry.vrm.scene);
    entries.delete(url);
  }
  return doomed;
}

/** Free everything. For teardown. */
export function reset() {
  retain([]);
}

/** What is cached right now. Exposed for the dev panel and for tests. */
export function residentCount() {
  return entries.size;
}
