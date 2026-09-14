/**
 * The ring of models, and which of them are worth keeping in memory.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A RING AND NOT A LIST
 * ---------------------------------------------------------------------------
 * The production surface offers two buttons, not eight rows. That is a
 * different contract from the dev panel's list: a list lets you go to a model,
 * a ring only lets you go to the NEXT one. Wrapping is what keeps the two
 * buttons from ever being dead — a carousel that stops at the ends has two
 * controls that do nothing at the two moments you are most likely to press
 * them.
 *
 * The order is whatever /api/models returns, which is the directory sorted by
 * filename. That is arbitrary as an artistic running order and exactly right as
 * a STABLE one: dropping a new .vrm into public/ slots it into the ring without
 * an edit here, and the ring does not reshuffle itself between sessions.
 *
 * Pure by mandate — invariant 4. Nothing here knows what a VRM is; it moves
 * strings around. The module that actually holds 18MB of parsed model is
 * models/vrmCache.js, and it asks this file what to keep.
 */

/**
 * How many parsed models may be resident at once.
 *
 * ALL OF THEM. This started at three — the model on stage plus both
 * neighbours — which is the least that makes both buttons instant, and it was
 * raised because three is also the most that guarantees a stall: walk two steps
 * in one direction and you are loading again, and loading is the one thing this
 * feature cannot afford to do while she is moving.
 *
 * Keeping the whole cast costs roughly 18MB of source model apiece, and rather
 * more once textures are decoded. That is a real cost on a thermally tight
 * machine and it was taken deliberately: it is paid once, quietly, during
 * warm-up, in exchange for every transition after it being free. Lower this
 * number if memory becomes the problem — `residentUrls` is ordered nearest
 * first, so a cap sheds the models furthest around the ring and both buttons
 * keep working.
 */
export const MAX_RESIDENT = Infinity;

/**
 * The whole ring, nearest first: where we are, then one step either way, then
 * two, and so on.
 *
 * The order is the point. It is the order to warm the cache in, so the models
 * you are most likely to reach are ready first, and it is the order to shed
 * them in if a cap is ever reintroduced. Both fall out of the same question —
 * how far is this from where she is standing — so they are answered once.
 */
export function ringOrder(urls, url) {
  const i = ringIndex(urls, url);
  // A model the ring has never heard of is still the model on stage, and still
  // the one thing that must not be evicted.
  if (i < 0) return url ? [url] : [];

  const n = urls.length;
  const out = [urls[i]];
  for (let d = 1; out.length < n; d += 1) {
    const forward = urls[(i + d) % n];
    const back = urls[((i - d) % n + n) % n];
    if (!out.includes(forward)) out.push(forward);
    if (!out.includes(back)) out.push(back);
  }
  return out;
}

/** Where `url` sits in the ring, or -1 if it is not in it at all. */
export function ringIndex(urls, url) {
  return urls.indexOf(url);
}

/**
 * The model `direction` steps away from `url`, wrapping at both ends.
 *
 * @param {string[]} urls the ring, in order
 * @param {string} url where we are now
 * @param {number} direction +1 for the next model, -1 for the previous
 * @returns {string|null} null when there is nowhere to go — an empty ring, a
 *   single model, or a current url the list has never heard of
 */
export function stepUrl(urls, url, direction) {
  if (!Array.isArray(urls) || urls.length < 2) return null;
  const i = ringIndex(urls, url);
  if (i < 0) return null;
  // Two modulos rather than one: JavaScript's % keeps the sign of the dividend,
  // so stepping back from index 0 gives -1 and indexes nothing.
  const n = urls.length;
  return urls[((i + direction) % n + n) % n];
}

/**
 * Both of the current model's neighbours.
 *
 * On a ring of two these are the same model, which is correct and not worth
 * special-casing: prefetching it twice is one cache entry either way.
 */
export function neighbours(urls, url) {
  return {
    prev: stepUrl(urls, url, -1),
    next: stepUrl(urls, url, +1),
  };
}

/**
 * Everything that should stay parsed, nearest first.
 *
 * With the cap at Infinity this is the whole ring, which is the current policy:
 * load the cast once and never load again. The cap is still honoured so that
 * lowering it is a one-line change rather than a redesign.
 */
export function residentUrls(urls, url, max = MAX_RESIDENT) {
  const order = ringOrder(urls, url);
  return Number.isFinite(max) ? order.slice(0, max) : order;
}

/**
 * Which cached models to throw away.
 *
 * Anything not wanted, least-recently-used first — so a caller evicting only
 * some of them sheds the coldest. `lastUsed` is a timestamp; entries without
 * one are treated as coldest of all, which is right for something that was
 * prefetched and never shown.
 *
 * NOTE THE ASYMMETRY with the rest of this file: getting this wrong does not
 * throw, does not fail a test that only checks the ring, and does not show up
 * on screen. It shows up as 18MB a switch, forever. VrmAvatar used to dispose
 * unconditionally on every model change; this function is what replaced that
 * guarantee, so it is the one place in the carousel worth being paranoid about.
 *
 * @param {Array<{url: string, lastUsed?: number}>} cached
 * @param {string[]} keep urls that must survive
 * @returns {string[]} urls to dispose, coldest first
 */
export function evictions(cached, keep) {
  const keepSet = new Set(keep);
  return cached
    .filter((entry) => !keepSet.has(entry.url))
    .slice()
    .sort((a, b) => (a.lastUsed ?? 0) - (b.lastUsed ?? 0))
    .map((entry) => entry.url);
}
