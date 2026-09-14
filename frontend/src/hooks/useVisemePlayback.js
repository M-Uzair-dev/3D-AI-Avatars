'use client';

import { useRef } from 'react';
import { zeroWeights, sampleTimeline, dampWeights } from '@/lib/visemePlayback.js';

/**
 * Holds the damped weight state across frames.
 *
 * All the arithmetic lives in lib/visemePlayback.js as pure functions; this is
 * only the ref that survives between frames. That split is what keeps the maths
 * testable in plain Node with no jsdom and no GPU.
 *
 * It takes a position rather than a pair of timestamps, and that is the shape
 * the voice required. There are now two possible clocks — the audio hardware
 * while a synthesised utterance plays, the wall clock when she is mouthing
 * silently — and deciding between them is the caller's job, not this hook's.
 * Asking for "where in the timeline are we" keeps the choice in one place
 * (VrmAvatar) instead of teaching every layer about audio.
 */
export function useVisemePlayback() {
  const weightsRef = useRef(zeroWeights());

  /**
   * Advance one frame and return the current weights.
   *
   * `tMs` is milliseconds into the timeline, or null when nothing is being
   * said — in which case the mouth damps closed rather than freezing on its
   * last shape.
   */
  return function step({ timeline, tMs, dtSec, stiffness }) {
    const target = tMs === null || tMs === undefined
      ? zeroWeights()
      : sampleTimeline(timeline, tMs);

    weightsRef.current = dampWeights(weightsRef.current, target, dtSec, stiffness);
    return weightsRef.current;
  };
}
