/**
 * Clip blend weight over the life of one .vrma playback.
 *
 * A clip is the only layer in this project that arrives already knowing its own
 * shape — it is a recording, not something composed from the pose system. What
 * it does NOT know is how to get into and out of the body it is being played
 * on, and that is the whole job of this file.
 *
 * The failure it exists to prevent: a clip applied at full weight on the frame
 * its action starts cuts from the standing pose to the clip's first frame in
 * one frame. Every other layer here eases — `poseTransitionMs`,
 * `stateTransitionMs`, `gestureEnvelope` — and the clip was the one that did
 * not, which read as a jerk at both ends.
 */

/** Hermite smoothstep, the same one gestures use. Linear ramps look mechanical. */
function smoothstep(t) {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/**
 * How much of the clip to apply, given how far into it we are.
 *
 * Zero at both ends, one through the middle — the same contract as
 * `gestureEnvelope`, and for the same reason: a layer that does not return to
 * zero at its own end has to be cut off by something else, and the cut is what
 * you see.
 *
 * The fade-out runs INSIDE the clip's duration rather than after it. That
 * trades the last fraction of a second of recorded motion for a seamless
 * return, which is the right trade here — the tail of a clip is a character
 * settling back toward rest, so cross-fading it against our own resting pose
 * lands in very nearly the same place the clip was going anyway.
 *
 * A clip shorter than its own fades still behaves: both ramps are clamped, so
 * the envelope peaks somewhere below 1 and never goes negative.
 *
 * @param {number} elapsedMs since the action started
 * @param {number} durationMs the clip's own length
 * @param {number} fadeInMs
 * @param {number} fadeOutMs
 * @returns {number} 0..1
 */
export function clipEnvelope(elapsedMs, durationMs, fadeInMs, fadeOutMs) {
  if (!(durationMs > 0)) return 0;
  if (elapsedMs <= 0 || elapsedMs >= durationMs) return 0;

  // Guard the degenerate cases rather than dividing by them: a zero-length fade
  // means "already fully in", not "infinitely steep".
  const rise = fadeInMs > 0 ? smoothstep(elapsedMs / fadeInMs) : 1;
  const fall = fadeOutMs > 0 ? smoothstep((durationMs - elapsedMs) / fadeOutMs) : 1;
  return Math.min(rise, fall);
}

/**
 * What the frame loop should do about the clip selection this frame.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT THREE LINES INLINE
 * ---------------------------------------------------------------------------
 * Because the three lines inline were wrong, in a way no test could reach.
 *
 * The old version claimed the selection — moved its own ref to the requested
 * url — and *then* asked the mixer to play it. When the mixer was not ready the
 * play was skipped silently, but the claim had already happened, so the frame
 * loop believed it was playing a clip that had never started. The menu
 * highlighted the row, she stood still, and nothing ever retried.
 *
 * That is not a rare race. The greeting dispatches in the same tick the model
 * finishes loading, and the mixer is built in a passive effect that React may
 * run after the next animation frame — so the greeting hit the gap every time
 * while a clip clicked by hand, seconds later, never did.
 *
 * `wait` is the state that was missing. Not ready is a reason to try again next
 * frame, not a reason to give up quietly.
 *
 * @param {{requested: string|null, current: string|null, ready: boolean}} input
 *   `requested` is the store's selection, `current` is what the frame loop has
 *   actually started, `ready` is whether a clip could be started right now.
 * @returns {'none'|'wait'|'load'|'release'}
 */
export function clipDispatch({ requested, current, ready }) {
  if (requested === current) return 'none';
  if (!requested) return 'release';
  return ready ? 'load' : 'wait';
}

/**
 * Whether she should still be off screen, waiting for her entrance.
 *
 * ---------------------------------------------------------------------------
 * WHY AN ARRIVAL NEEDS THIS AT ALL
 * ---------------------------------------------------------------------------
 * The greeting clip does not begin standing. It opens in a crouch and springs
 * up — which is a fine entrance and a terrible transition. Played the ordinary
 * way, she appeared standing in her idle pose, sank into the crouch over the
 * clip's 600ms fade, and then leapt. Three movements where the point was one,
 * and the first two of them read as a glitch.
 *
 * So for an arrival she is not rendered at all until the clip is actually
 * driving her, and the clip starts at full weight rather than fading in. The
 * first frame anyone sees is the clip's own first frame, and the leap becomes
 * her entrance instead of a correction to it.
 *
 * EVERY EXIT FROM THIS MUST LET HER THROUGH, because the failure mode is an
 * avatar that is never visible — far worse than the bug being fixed. Hence the
 * shape below: hiding requires a clip to be selected AND not yet blending. A
 * clip that fails to load clears the selection, which reveals her; a greeting
 * that was never dispatched leaves the selection null, which reveals her.
 *
 * @param {{arriving: boolean, clipSelected: boolean, clipBlend: number}} input
 */
export function arrivalHidesModel({ arriving, clipSelected, clipBlend }) {
  if (!arriving) return false;
  // No clip pending means nothing is coming to reveal her. Show her.
  if (!clipSelected) return false;
  return !(clipBlend > 0);
}
