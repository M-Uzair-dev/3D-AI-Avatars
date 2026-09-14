import { clipLabel } from './constants.js';
import { GESTURES } from './gestures.js';

/**
 * The one list behind the production UI's "Animate" menu.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * To a user there is one idea here: things she can be asked to do. To the code
 * there are two entirely separate mechanisms, and they have nothing in common
 * below this file:
 *
 *   clip     a recorded .vrma, fetched over the network, played by three.js's
 *            AnimationMixer and blended in before compositing. Dispatched with
 *            setClip(url).
 *   gesture  authored keyframes living in gestures.js, sampled by our own code
 *            inside the composite step. Nothing is fetched. Dispatched with
 *            playGesture(id).
 *
 * The control panel used to expose that split directly — clips on the Pose tab,
 * gestures on the State tab — which is a fine way to arrange a workbench and a
 * bad way to arrange a product. Merging them is a labelling job, not a runtime
 * one: every row carries a `kind`, and the component switches on it. Nothing
 * about either mechanism changes, which is what keeps the dev panel working
 * unchanged behind ?dev=1.
 *
 * This stays pure data — no React, no three.js, per invariant 4 — so the shape
 * of the list is unit-tested while the dispatch stays in the component where it
 * belongs.
 */

/**
 * Gestures the user can trigger by name.
 *
 * EMPTY, and deliberately so rather than by neglect. `wave` was the only entry
 * and has been removed from the project entirely; nothing replaced it, so the
 * Animate menu is currently clips only.
 *
 * The rule for adding one back: it MUST be a gesture marked `idle: false`. A
 * gesture offered here is a deliberate action, and one that ALSO fires itself
 * every 16-46 seconds is not a deliberate action — it is weather. There is a
 * test pinning that, so promoting an idle gesture fails loudly rather than
 * quietly double-triggering it.
 *
 * The rest of the roster — scratch-head, the two neck stretches, roll-shoulders
 * — stays automatic and unlisted. They are there to imply an inner life, and a
 * button marked "Scratch head" destroys the effect it exists to create.
 */
export const PROMOTED_GESTURES = [];

/** Where the clip route serves .vrma from. */
const CLIP_DIR = '/animations';

/**
 * Merge the authored gestures and the recorded clips into one labelled list.
 *
 * Gestures come first, deliberately. They are the ones tuned for this project
 * and this register; the pixiv clips are showcase motions — Spin, Squat, Peace
 * sign — that demonstrate the retargeting path rather than anything a companion
 * would do unprompted. Ordering by what you are most likely to want beats
 * ordering by how the file happens to be loaded.
 *
 * @param {string[]} files filenames from /api/animations. Tolerates undefined,
 *   because that fetch can fail and an empty menu is better than a crash.
 * @returns {{id: string, label: string, kind: 'clip'|'gesture', url?: string}[]}
 */
export function buildAnimationList(files) {
  const gestures = PROMOTED_GESTURES
    .filter((name) => GESTURES[name])
    .map((name) => ({
      id: name,
      label: GESTURES[name].label,
      kind: 'gesture',
    }));

  const clips = (files ?? [])
    .filter((file) => /\.vrma$/i.test(file))
    .map((file) => ({
      id: file,
      label: clipLabel(file),
      kind: 'clip',
      url: `${CLIP_DIR}/${file}`,
    }));

  return [...gestures, ...clips];
}
