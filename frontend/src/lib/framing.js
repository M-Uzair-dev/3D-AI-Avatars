/**
 * Where to put the camera, solved from the model rather than written down.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------
 * Framings used to be literal world coordinates — camera at y 1.38, z 1.70,
 * looking at y 1.30 — arrived at by solving the fov for ONE model and pasting
 * the answer in. That is fine while there is one model. With eight of them, of
 * different heights, the same coordinates put a short model's head in the
 * middle of the frame and push a tall one's out through the top.
 *
 * So nothing here is a coordinate. A framing is now two intentions:
 *
 *   coverage  how much of her to show, as a multiple of her own head height
 *   headAt    where her head should sit on screen, as a fraction from the top
 *
 * and the coordinates are solved per model from those. Swapping models changes
 * the numbers and not the composition, which is the entire point.
 *
 * ---------------------------------------------------------------------------
 * THE ARITHMETIC
 * ---------------------------------------------------------------------------
 * For a vertical fov of t, a camera d away sees a vertical slice of the plane
 * through the target of height
 *
 *     V = 2 d tan(t/2)
 *
 * The camera looks horizontally — its height equals the target's — so the view
 * runs from `Ty - V/2` at the bottom to `Ty + V/2` at the top. Putting the head
 * a fraction f down from the top means
 *
 *     headY = Ty + V/2 - fV        so        Ty = headY - V(0.5 - f)
 *
 * Both directions are here: `solveFraming` goes intention to coordinates, and
 * `headScreenFraction` goes back, which is what lets a test assert the
 * composition holds across model heights rather than assert the arithmetic
 * against itself.
 *
 * Pure, per the lib/ boundary: numbers in, numbers out. Scene.jsx does the
 * writing.
 */

import { FRAMINGS, DEFAULT_FRAMING } from './constants.js';

/**
 * Head height to assume before a model has been measured.
 *
 * The camera is constructed before the VRM finishes downloading, so this is the
 * framing for the first second of every session — and for any model whose head
 * bone cannot be read. A typical VRoid model is about 1.5m with the head bone
 * near the ears, a little below the crown.
 */
export const NOMINAL_HEAD_Y = 1.35;

/**
 * How large she reads on a phone, as a fraction of her desktop size.
 *
 * A viewport that narrow cannot give both the character and the control bar the
 * room they want, and the character is the one that can afford to give: at full
 * size the bar lands across her waist and the framing stops being a composition.
 * Pulling the camera back is the right lever rather than shrinking the model,
 * because it keeps every pose, overlay and gesture reading at the same
 * proportions — only the distance changes.
 */
export const MOBILE_MODEL_SCALE = 0.6;

/**
 * Widths at or below this get the mobile zoom. Tailwind's `sm` breakpoint, so
 * the camera and the control bar's own wrapping change at the same place rather
 * than at two widths that have to be kept in sync by hand.
 */
export const MOBILE_MAX_WIDTH = 640;

/**
 * The zoom for a viewport width.
 *
 * An unreadable width falls back to 1 rather than to the mobile value: the
 * camera is solved before the canvas has been measured at least once per
 * session, and guessing "phone" there would shrink her on every desktop for a
 * frame.
 *
 * @param {number} width viewport width in CSS pixels
 */
export function zoomForWidth(width) {
  if (!(width > 0)) return 1;
  return width <= MOBILE_MAX_WIDTH ? MOBILE_MODEL_SCALE : 1;
}

/** Vertical world height the view covers at the target plane. */
function coverageOf(framing, headY) {
  const f = FRAMINGS[framing] ?? FRAMINGS[DEFAULT_FRAMING];
  return f.coverage * headY;
}

/**
 * Camera position and orbit target for a framing, given where this model's
 * head bone actually sits.
 *
 * `zoom` is APPARENT SIZE, not distance: 0.6 means she reads at six tenths of
 * her usual size, which means showing MORE of the scene and therefore standing
 * the camera FURTHER back. The inversion is the easy mistake, so it is divided
 * rather than multiplied here and a test asserts the direction.
 *
 * `headAt` is applied after the zoom, so the composition rule survives it — a
 * phone gets the same framing further away, not a different framing.
 *
 * @param {string} framing key into FRAMINGS; unknown names fall back to default
 * @param {number} headY world height of the head bone, or null before load
 * @param {number} fovDeg the camera's vertical field of view, in degrees
 * @param {number} [zoom=1] apparent size; values <= 0 are ignored
 */
export function solveFraming(framing, headY, fovDeg, zoom = 1) {
  const f = FRAMINGS[framing] ?? FRAMINGS[DEFAULT_FRAMING];
  const head = headY > 0 ? headY : NOMINAL_HEAD_Y;
  // A zero or negative zoom would divide the view to nothing or flip it, which
  // puts the camera inside her. Treat anything unusable as "no zoom".
  const z = zoom > 0 ? zoom : 1;

  const view = coverageOf(framing, head) / z;
  const distance = view / (2 * Math.tan((fovDeg * Math.PI) / 360));
  // Solved so the head lands at `headAt` down from the top edge.
  const targetY = head - view * (0.5 - f.headAt);

  return {
    // Level with the target, so she is neither looked down on nor up at.
    position: [0, targetY, distance],
    target: [0, targetY, 0],
  };
}

/**
 * Where the head ends up on screen, 0 at the top edge and 1 at the bottom.
 *
 * The inverse of the solve, and it exists for the tests: checking that a camera
 * puts the head a third of the way down is a different claim from checking that
 * the formula was typed in correctly twice.
 */
export function headScreenFraction(view, headY, fovDeg) {
  const half = view.position[2] * Math.tan((fovDeg * Math.PI) / 360);
  const top = view.target[1] + half;
  return (top - headY) / (2 * half);
}
