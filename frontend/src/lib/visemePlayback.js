import { VISEMES } from './constants.js';

/** A fresh all-zero weight set. */
export function zeroWeights() {
  const w = {};
  for (const v of VISEMES) w[v] = 0;
  return w;
}

/**
 * Read the timeline at time `tMs` and return the raw target weights.
 *
 * Deliberately a hard step function — no interpolation here. Smoothing is the
 * job of dampWeights, which gets co-articulation as a side effect. Keeping the
 * two separate means sampling stays trivially testable.
 *
 * Segment boundaries are start-inclusive, end-exclusive.
 */
export function sampleTimeline(timeline, tMs) {
  const weights = zeroWeights();
  if (!timeline || timeline.length === 0) return weights;

  for (const seg of timeline) {
    if (tMs >= seg.start && tMs < seg.start + seg.dur) {
      // A CLOSED segment (viseme === null) leaves everything at zero,
      // which is exactly the lips-together shape we want.
      if (seg.viseme !== null) weights[seg.viseme] = seg.weight;
      return weights;
    }
  }
  return weights;
}

/**
 * Exponentially damp `current` toward `target`.
 *
 * This single line is what produces co-articulation: because weights decay
 * rather than snap, each mouth shape bleeds into its neighbours the way real
 * speech does. Tuning the whole mouth is therefore one number.
 *
 * Putting dt in the exponent makes the result frame-rate independent — one
 * 16ms step and two 8ms steps land in the same place, so a 144Hz monitor does
 * not animate differently from a 60Hz one.
 */
export function dampWeights(current, target, dtSec, stiffness) {
  const alpha = 1 - Math.exp(-stiffness * dtSec);
  const out = {};
  for (const v of VISEMES) {
    const c = current[v] ?? 0;
    const t = target[v] ?? 0;
    out[v] = c + (t - c) * alpha;
  }
  return out;
}
