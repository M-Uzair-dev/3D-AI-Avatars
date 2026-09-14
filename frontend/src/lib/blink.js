/**
 * Blinking: the envelope, and when one is due.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A SINE
 * ---------------------------------------------------------------------------
 * The first version of this was `sin(t/duration * PI)` over 120ms — symmetric,
 * so the lid took exactly as long to shut as it took to open. Real eyelids do
 * not do that. Closing is close to ballistic and reopening is a slower release,
 * and a symmetric blink reads as drowsy for exactly that reason.
 *
 * So the envelope is three explicit phases, and the numbers below are the ones
 * VMagicMirror has been running against live streamers for years:
 *
 *      close 50ms      hold 40ms       open 100ms
 *   0 ─────────► 1 ═══════════════ 1 ──────────────► 0
 *
 * The other two behaviours here are scheduling decisions rather than shapes,
 * and both exist to break the metronome:
 *
 *   - a fifth of blinks are DOUBLES. Randomising the interval alone still
 *     reads as regular, because every blink looks the same; varying the blink
 *     itself is what actually kills the pattern.
 *   - blinks COUPLE TO GAZE. People blink when their eyes jump, not on a
 *     timer, and a blink landing on a saccade is most of what separates "this
 *     is alive" from "this has an animation running on it".
 *
 * Pure functions over plain numbers, per the lib/ boundary. The caller owns
 * the clock and the refs.
 */

/**
 * Phase durations in milliseconds.
 *
 * To make her blink sleepier, raise `openMs`. To make the blink heavier, raise
 * `holdMs` — that is the one that reads as a slow, deliberate blink rather than
 * a flick.
 */
export const BLINK_PHASES = { closeMs: 50, holdMs: 40, openMs: 100 };

/** Odds that a blink is a double rather than a single. */
export const DOUBLE_BLINK_CHANCE = 0.2;

/**
 * How far the eyes must travel for a saccade to be able to drag a blink with
 * it, in radians. 0.09 rad is ~5 degrees.
 *
 * Sits deliberately between the two gaze behaviours: an idle wander stays
 * inside +/- `gazeAmount` (0.06) and so mostly does NOT trigger, while an avert
 * is 1.6-2.8x that and so mostly does. Blinking on every small wander would
 * read as a twitch.
 */
export const SACCADE_BLINK_MIN_RAD = 0.09;

/** Odds that a large enough saccade actually pulls a blink along with it. */
export const SACCADE_BLINK_CHANCE = 0.7;

/**
 * How long the eyes stay open after a blink before another can be triggered by
 * behaviour. Without it a burst of saccades produces a burst of blinks.
 */
export const BLINK_COOLDOWN_MS = 2000;

/** Total length of a blink, in ms. */
export function blinkSpanMs(blinks = 1) {
  const { closeMs, holdMs, openMs } = BLINK_PHASES;
  return (closeMs + holdMs + openMs) * blinks;
}

/**
 * Lid position at a moment in a blink: 0 open, 1 fully closed.
 *
 * A double blink is the single envelope run twice back to back, so it passes
 * through fully open at the seam — which is the entire difference between a
 * double blink and one long one.
 */
export function blinkEnvelope(elapsedMs, blinks = 1) {
  const total = blinkSpanMs(blinks);
  if (elapsedMs < 0 || elapsedMs > total) return 0;

  const { closeMs, holdMs, openMs } = BLINK_PHASES;
  const single = closeMs + holdMs + openMs;
  const t = elapsedMs % single;

  if (t < closeMs) return t / closeMs;
  if (t < closeMs + holdMs) return 1;
  return 1 - (t - closeMs - holdMs) / openMs;
}

/** How many blinks this one should be: 1, or 2 a fifth of the time. */
export function blinkCount(rng = Math.random) {
  return rng() < DOUBLE_BLINK_CHANCE ? 2 : 1;
}

/**
 * Whether a gaze shift from `from` to `to` should pull a blink along with it.
 *
 * Gated on the distance TRAVELLED rather than on where the eyes end up: a flick
 * from one far corner to the other is a big movement even though neither end is
 * near centre.
 */
export function saccadeTriggersBlink(from, to, rng = Math.random) {
  const dyaw = to.yaw - from.yaw;
  const dpitch = to.pitch - from.pitch;
  const travelled = Math.hypot(dyaw, dpitch);
  if (travelled < SACCADE_BLINK_MIN_RAD) return false;
  return rng() < SACCADE_BLINK_CHANCE;
}
