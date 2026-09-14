/**
 * The arc a model travels when the carousel changes who is on stage.
 *
 * ---------------------------------------------------------------------------
 * WHY AN ARC AND NOT A SLIDE
 * ---------------------------------------------------------------------------
 * A straight lateral slide reads as UI: two cards on a track, the same move a
 * settings panel makes. This stage is a lit room with a cyclorama and a rim
 * light, and the whole register of the thing is that she is a person standing
 * in it rather than a widget in it — so she leaves the way a person leaves,
 * withdrawing before turning away, and the next one arrives out of the depth
 * rather than being dealt onto the mark.
 *
 * That is the entire content of this file: x and z are eased on DIFFERENT
 * curves so the path bends. Give them the same curve and you get a diagonal,
 * which looks like a mistake rather than a move.
 *
 *   z  easeOutSine   moves early, most of the depth is spent in the first half
 *   x  easeInQuad    moves late, the sideways sweep happens once she is back
 *
 * The perspective camera does the rest for free: depth is also scale, so she
 * shrinks as she withdraws without anything here touching a scale factor.
 *
 * ---------------------------------------------------------------------------
 * THE THREE BEATS
 * ---------------------------------------------------------------------------
 *
 *   exit    the model on stage arcs back and off, opposite the press direction
 *   hold    NOTHING IS ON STAGE. Load-bearing — see below.
 *   enter   the new model arcs in from the press direction and settles
 *
 * The hold is not padding. Two things have to happen on an empty stage:
 *
 *   1. The camera re-solves. It is positioned from the loaded model's own head
 *      height and CameraRig SNAPS rather than eases, so a shorter model
 *      arriving would yank the whole frame. On an empty stage that snap is
 *      invisible.
 *   2. A model that was not prefetched in time gets a moment to arrive. The
 *      caller holds the clock here rather than letting the arc stutter, which
 *      is why the phase functions take elapsed time as an argument instead of
 *      reading a wall clock themselves.
 *
 * Pure by mandate — invariant 4.
 */

/**
 * How far sideways is far enough to be gone.
 *
 * THE BUG THIS EXISTS FOR. This was a constant — 1.2 metres — and it was not
 * enough. At bust framing the camera sits 1.69m back, so at the arc's depth of
 * 0.9m the frame is 1.23m wide either side of centre: a model parked at 1.2m is
 * INSIDE it, by three centimetres, and more on a narrower window. The exit
 * ended with her still at the edge of frame and the next one started from
 * there.
 *
 * No constant could have been right. The frame's width depends on the framing
 * (`full` covers 1.76x what `bust` does), on the viewport's aspect ratio, and
 * on the mobile zoom — all three of which this project already re-solves the
 * camera for. So the distance is computed from the camera that is actually
 * rendering, every frame, rather than written down.
 *
 * @param {number} halfWidth world half-width of the frustum at the arc's depth
 * @param {number} bodyHalfWidth roughly half a shoulder span, so an arm does
 *   not hang in frame after the rest of her has gone
 * @param {number} margin a little past merely gone, so the fade-out of the
 *   easing curve is not what is holding her out of shot
 */
export function exitClearance(halfWidth, bodyHalfWidth, margin) {
  return (Math.max(0, halfWidth) + bodyHalfWidth) * margin;
}

/** Slow to leave, then away — most of the sideways travel is in the second half. */
function easeInQuad(p) {
  return p * p;
}

/** Away immediately, then settling — most of the depth is spent in the first half. */
function easeOutSine(p) {
  return Math.sin((Math.PI / 2) * p);
}

/**
 * How fast she moves ALONG the path, as distinct from the shape of the path.
 *
 * THE BUG THIS EXISTS FOR, and it was a physical one rather than a visual one.
 * The path is walked forwards on the way out and backwards on the way in, which
 * is what makes an exit and an entrance look like the same room. But `z` is
 * eased with easeOutSine, whose speed is HIGHEST at p = 0 — and on the way in,
 * p = 0 is the moment she arrives on her mark. She was rushing forward into
 * frame at maximum speed at precisely the moment she should have been settling.
 *
 * On a character with spring bones that is not just an ugly landing, it is an
 * impact: chest and hair joints get a large velocity step in one frame and
 * discharge it as a violent wobble, which is what it looked like.
 *
 * Hermite smoothstep has zero slope at BOTH ends, so applying it to the phase
 * progress before walking the path means she leaves her mark gently and arrives
 * gently, whatever the path's own curves are doing in between. The shape of the
 * arc is unchanged; only the pacing along it is.
 */
function smoothstep(t) {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

function clamp01(p) {
  return Math.max(0, Math.min(1, p));
}

/** Total length of one transition. */
export function carouselTotalMs({ exitMs, holdMs, enterMs }) {
  return exitMs + holdMs + enterMs;
}

/**
 * Which beat we are in, and how far through it.
 *
 * `progress` is local to the phase, 0..1, so a caller never has to know where
 * the phase boundaries are — which is what keeps the timings tunable without
 * touching anything that consumes this.
 *
 * @returns {{phase: 'exiting'|'holding'|'entering'|'done', progress: number}}
 */
export function carouselPhase(elapsedMs, timing) {
  const { exitMs, holdMs, enterMs } = timing;
  if (elapsedMs < exitMs) {
    return { phase: 'exiting', progress: exitMs > 0 ? clamp01(elapsedMs / exitMs) : 1 };
  }
  if (elapsedMs < exitMs + holdMs) {
    const t = elapsedMs - exitMs;
    return { phase: 'holding', progress: holdMs > 0 ? clamp01(t / holdMs) : 1 };
  }
  if (elapsedMs < exitMs + holdMs + enterMs) {
    const t = elapsedMs - exitMs - holdMs;
    return { phase: 'entering', progress: enterMs > 0 ? clamp01(t / enterMs) : 1 };
  }
  return { phase: 'done', progress: 1 };
}

/**
 * Has the stage cleared enough to swap the model under it?
 *
 * The swap happens at the START of the hold, never when the button is pressed.
 * Pressing the button only sets the target: changing `modelUrl` immediately
 * would tear the current model out from under the exit animation, which is the
 * pop the whole transition exists to hide.
 */
export function shouldSwap(elapsedMs, timing) {
  return elapsedMs >= timing.exitMs;
}

/**
 * Where the model on stage should be, relative to her mark.
 *
 * One path, walked forwards on the way out and backwards on the way in, which
 * is what makes an exit and an entrance look like the same room rather than two
 * effects. `p` runs 0 (on the mark) to 1 (fully off), and the only difference
 * between the two halves is which side of the stage it happens on.
 *
 * @param {number} elapsedMs since the transition started
 * @param {number} direction +1 if the user pressed for the next model, -1 for previous
 * @param {{exitMs: number, holdMs: number, enterMs: number}} timing
 * @param {{offsetX: number, depth: number}} geometry in metres
 * @returns {{x: number, z: number}} offset to add to the model's root position
 */
export function carouselOffset(elapsedMs, direction, timing, geometry) {
  const { offsetX, depth } = geometry;
  const { phase, progress } = carouselPhase(elapsedMs, timing);

  // Pressing "next" sends the current model off to stage LEFT and brings the
  // new one in from stage RIGHT, so the cast appears to travel leftwards past a
  // fixed camera. Reversing one of these two signs is the difference between a
  // carousel and a shuffle where everyone enters from the same wing.
  const exitSide = -direction;
  const enterSide = direction;

  let side;
  let p;
  switch (phase) {
    case 'exiting':
      side = exitSide;
      p = smoothstep(progress);
      break;
    case 'holding':
      // Nothing should be visible here, but the new model may already be
      // mounted and waiting. Park it fully off-stage on the side it will enter
      // from, so if it does render it renders out of frame rather than on the
      // mark.
      side = enterSide;
      p = 1;
      break;
    case 'entering':
      side = enterSide;
      // The eased progress is what makes the landing settle rather than
      // arrive. See smoothstep above — this is the line the spring-bone wobble
      // was coming from.
      p = 1 - smoothstep(progress);
      break;
    default:
      return { x: 0, z: 0 };
  }

  return {
    x: side * offsetX * easeInQuad(p),
    z: -depth * easeOutSine(p),
  };
}
