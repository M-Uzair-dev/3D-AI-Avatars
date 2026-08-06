'use client';

import { useRef } from 'react';
import { DEFAULTS } from '@/lib/constants.js';
import { blinkValue, driftDeltas, breathDelta } from '@/lib/idleMath.js';

const randomInterval = (idle) => {
  const min = idle.blinkIntervalMin;
  const max = Math.max(min, idle.blinkIntervalMax);
  return min + Math.random() * (max - min);
};

/**
 * Blink scheduling plus procedural bone deltas.
 *
 * Every tuning value comes from the `idle` store slice rather than from
 * DEFAULTS, so the Idle tab's sliders are live — DEFAULTS only seeds the
 * store's initial state.
 *
 * Returns { blink, deltas } where deltas is a bone-name -> rotation map ready to
 * hand to compositeBones as the additive idle layer.
 */
export function useIdleMotion() {
  const nextBlinkAt = useRef(null);
  const blinkStartedAt = useRef(null);

  return function step({ nowMs, tSec, idle }) {
    if (nextBlinkAt.current === null) nextBlinkAt.current = nowMs + randomInterval(idle);

    // --- blink scheduling ---
    let blink = 0;
    if (idle.blink) {
      if (blinkStartedAt.current === null && nowMs >= nextBlinkAt.current) {
        blinkStartedAt.current = nowMs;
      }
      if (blinkStartedAt.current !== null) {
        const elapsed = nowMs - blinkStartedAt.current;
        blink = blinkValue(elapsed, DEFAULTS.blinkDuration);
        if (elapsed > DEFAULTS.blinkDuration) {
          blinkStartedAt.current = null;
          nextBlinkAt.current = nowMs + randomInterval(idle);
        }
      }
    } else {
      blinkStartedAt.current = null;
      nextBlinkAt.current = nowMs + randomInterval(idle);
    }

    // --- procedural bone deltas ---
    const deltas = {};
    if (idle.drift) {
      deltas.head = driftDeltas(tSec, idle.driftAmplitude, idle.driftSpeed);
    }
    if (idle.breathe) {
      deltas.chest = breathDelta(tSec, idle.breathAmplitude, idle.breathRate);
    }

    return { blink, deltas };
  };
}
