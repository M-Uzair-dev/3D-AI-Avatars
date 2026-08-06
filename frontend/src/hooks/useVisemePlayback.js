'use client';

import { useRef } from 'react';
import { zeroWeights, sampleTimeline, dampWeights } from '@/lib/visemePlayback.js';

/**
 * Holds the damped weight state across frames.
 *
 * All the arithmetic lives in lib/visemePlayback.js as pure functions; this is
 * only the ref that survives between frames. That split is what keeps the maths
 * testable in plain Node with no jsdom and no GPU.
 */
export function useVisemePlayback() {
  const weightsRef = useRef(zeroWeights());

  /** Advance one frame and return the current weights. */
  return function step({ timeline, speechStartedAt, nowMs, dtSec, stiffness }) {
    const target =
      speechStartedAt === null
        ? zeroWeights()
        : sampleTimeline(timeline, nowMs - speechStartedAt);

    weightsRef.current = dampWeights(weightsRef.current, target, dtSec, stiffness);
    return weightsRef.current;
  };
}
