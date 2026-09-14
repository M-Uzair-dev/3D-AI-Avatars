/**
 * Procedural idle motion, as pure functions of time.
 *
 * Idle is not garnish. A face that is perfectly still between sentences reads as
 * dead, and no amount of lip-sync quality compensates. This is roughly thirty
 * lines and it does more perceptual work than the viseme pipeline.
 *
 * Blinking used to live here as a symmetric half-sine. It moved to blink.js
 * when it stopped being a pure shape and grew scheduling decisions of its own
 * — doubles, and coupling to the gaze.
 */

/**
 * Head drift as summed out-of-phase sines.
 *
 * Deliberately not a noise library. At ±3° the difference is invisible, and
 * incommensurable frequencies (0.31/0.53, 0.23/0.41…) never repeat visibly.
 * Each axis is normalized by 2 so the sum stays within amplitude.
 */
export function driftDeltas(tSec, amplitude, speed) {
  const t = tSec * speed;
  return {
    x: (amplitude * (Math.sin(t * 0.31) + Math.sin(t * 0.53))) / 2,
    y: (amplitude * (Math.sin(t * 0.23 + 1.7) + Math.sin(t * 0.41 + 0.6))) / 2,
    z: (amplitude * (Math.sin(t * 0.17 + 3.1) + Math.sin(t * 0.29 + 2.2))) / 2,
  };
}

/**
 * Chest rise and fall. Slow, single axis.
 *
 * SUPERSEDED by `breathChain` in aliveness.js, which drives the same
 * oscillator but also lifts the shoulders and floats the head — a chest bone
 * rotating alone is nearly invisible on a clothed model, because the silhouette
 * never changes. Kept here because it is the clearest possible statement of the
 * idea, and because the contrast between the two is the lesson.
 */
export function breathDelta(tSec, amplitude, rate) {
  return { x: amplitude * Math.sin(tSec * rate * Math.PI * 2), y: 0, z: 0 };
}
