/**
 * Procedural idle motion, as pure functions of time.
 *
 * Idle is not garnish. A face that is perfectly still between sentences reads as
 * dead, and no amount of lip-sync quality compensates. This is roughly thirty
 * lines and it does more perceptual work than the viseme pipeline.
 */

/** Blink envelope: 0 open, 1 fully closed, smooth in and out. */
export function blinkValue(elapsedMs, duration) {
  if (elapsedMs < 0 || elapsedMs > duration) return 0;
  // Half a sine period: 0 -> 1 -> 0 across the blink.
  return Math.sin((elapsedMs / duration) * Math.PI);
}

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

/** Chest rise and fall. Slow, single axis. */
export function breathDelta(tSec, amplitude, rate) {
  return { x: amplitude * Math.sin(tSec * rate * Math.PI * 2), y: 0, z: 0 };
}
