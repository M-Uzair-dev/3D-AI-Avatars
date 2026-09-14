import { describe, it, expect } from 'vitest';
import {
  carouselPhase, carouselOffset, shouldSwap, carouselTotalMs, exitClearance,
} from '@/lib/carouselMotion.js';
import { FRAMINGS, FOV_DEG, DEFAULTS } from '@/lib/constants.js';

const TIMING = { exitMs: 450, holdMs: 120, enterMs: 550 };
const GEO = { offsetX: 1.2, depth: 0.9 };
const NEXT = +1;
const PREV = -1;

const at = (ms, dir = NEXT) => carouselOffset(ms, dir, TIMING, GEO);

describe('exitClearance', () => {
  // THE REGRESSION TEST. offsetX was a constant 1.2 metres, and the frame at
  // the arc's depth is 1.23 metres wide either side of centre at bust framing —
  // so the exit ended with her still in shot, and the outgoing model then sat
  // visibly at the entry mark waiting for its replacement. Reproduced here from
  // the project's own framing numbers rather than from the figure, so it fails
  // again if the framing changes underneath it.
  const halfWidthAt = (framing, depth, aspect, headY = 1.35) => {
    const view = FRAMINGS[framing].coverage * headY;
    const cameraZ = view / (2 * Math.tan((FOV_DEG * Math.PI) / 360));
    return (cameraZ + depth) * Math.tan((FOV_DEG * Math.PI) / 360) * aspect;
  };

  const { depth, bodyHalfWidth, clearMargin } = DEFAULTS.carousel;
  const clearanceFor = (framing, aspect) =>
    exitClearance(halfWidthAt(framing, depth, aspect), bodyHalfWidth, clearMargin);

  it('proves the old constant was too small', () => {
    expect(halfWidthAt('bust', depth, 16 / 9)).toBeGreaterThan(1.2);
  });

  it('clears the frame at every framing and a wide range of aspects', () => {
    for (const framing of Object.keys(FRAMINGS)) {
      for (const aspect of [0.5, 1, 4 / 3, 16 / 9, 21 / 9]) {
        const half = halfWidthAt(framing, depth, aspect);
        expect(
          clearanceFor(framing, aspect),
          `${framing} at aspect ${aspect.toFixed(2)} does not clear the frame`,
        ).toBeGreaterThan(half + bodyHalfWidth);
      }
    }
  });

  // Bounded from both sides, per the habit in docs/09. A clearance that grows
  // without limit is as wrong as one that is too small: she would spend the
  // whole exit travelling and never appear to leave.
  it('does not send her absurdly far', () => {
    const half = halfWidthAt('bust', depth, 16 / 9);
    expect(clearanceFor('bust', 16 / 9)).toBeLessThan((half + bodyHalfWidth) * 2);
  });

  it('grows with the frame rather than ignoring it', () => {
    expect(clearanceFor('full', 16 / 9)).toBeGreaterThan(clearanceFor('close', 16 / 9));
  });

  it('treats a nonsense frame width as no width rather than going negative', () => {
    expect(exitClearance(-5, 0.45, 1.15)).toBeCloseTo(0.45 * 1.15, 6);
  });
});

describe('carouselTotalMs', () => {
  it('is the three beats end to end', () => {
    expect(carouselTotalMs(TIMING)).toBe(1120);
  });
});

describe('carouselPhase', () => {
  it('walks exit, hold, enter, done', () => {
    expect(carouselPhase(0, TIMING).phase).toBe('exiting');
    expect(carouselPhase(449, TIMING).phase).toBe('exiting');
    expect(carouselPhase(450, TIMING).phase).toBe('holding');
    expect(carouselPhase(569, TIMING).phase).toBe('holding');
    expect(carouselPhase(570, TIMING).phase).toBe('entering');
    expect(carouselPhase(1119, TIMING).phase).toBe('entering');
    expect(carouselPhase(1120, TIMING).phase).toBe('done');
  });

  it('reports progress local to the phase', () => {
    expect(carouselPhase(225, TIMING).progress).toBeCloseTo(0.5, 5);
    expect(carouselPhase(450 + 60, TIMING).progress).toBeCloseTo(0.5, 5);
    expect(carouselPhase(570 + 275, TIMING).progress).toBeCloseTo(0.5, 5);
  });

  it('stays done well past the end', () => {
    expect(carouselPhase(99999, TIMING).phase).toBe('done');
  });
});

describe('shouldSwap', () => {
  // The swap is at the START of the hold, not on the button press. Swapping on
  // the press tears the model out from under its own exit animation, which is
  // the pop the entire transition exists to hide.
  it('does not swap while she is still leaving', () => {
    expect(shouldSwap(0, TIMING)).toBe(false);
    expect(shouldSwap(449, TIMING)).toBe(false);
  });

  it('swaps the moment the stage is clear', () => {
    expect(shouldSwap(450, TIMING)).toBe(true);
  });
});

describe('carouselOffset', () => {
  it('starts on the mark', () => {
    expect(at(0).x).toBeCloseTo(0, 6);
    expect(at(0).z).toBeCloseTo(0, 6);
  });

  it('ends on the mark', () => {
    const end = at(carouselTotalMs(TIMING));
    expect(end.x).toBeCloseTo(0, 6);
    expect(end.z).toBeCloseTo(0, 6);
  });

  // Press "next" and the cast should appear to travel leftwards past a fixed
  // camera: the current model leaves stage left, the new one arrives from
  // stage right. Flipping either sign gives a shuffle where everyone enters
  // from the same wing, which does not read as a carousel at all.
  it('sends her off one side and brings the next in from the other', () => {
    expect(at(440, NEXT).x).toBeLessThan(0);
    expect(at(600, NEXT).x).toBeGreaterThan(0);
  });

  it('mirrors exactly when the other button is pressed', () => {
    expect(at(440, PREV).x).toBeCloseTo(-at(440, NEXT).x, 6);
    expect(at(600, PREV).x).toBeCloseTo(-at(600, NEXT).x, 6);
  });

  it('travels away from the camera, never toward it', () => {
    for (let t = 0; t <= carouselTotalMs(TIMING); t += 10) {
      expect(at(t).z).toBeLessThanOrEqual(1e-9);
    }
  });

  // THE WHOLE POINT OF THE FILE. x and y on the same easing curve is a
  // diagonal, which reads as a mistake; the arc is the two curves disagreeing.
  // Asserted as a RATIO at the halfway point: at mid-exit she should be most of
  // the way back and only a little to the side.
  it('bends rather than running diagonally', () => {
    const mid = at(TIMING.exitMs / 2);
    const sideFraction = Math.abs(mid.x) / GEO.offsetX;
    const depthFraction = Math.abs(mid.z) / GEO.depth;
    expect(depthFraction).toBeGreaterThan(0.6);
    expect(sideFraction).toBeLessThan(0.35);
    expect(depthFraction).toBeGreaterThan(sideFraction * 2);
  });

  // Bounded from BOTH sides, per the habit in docs/09. "Too subtle to see"
  // passes every assertion that only asks whether a number is small, and this
  // project has shipped invisibility before.
  it('actually leaves the frame', () => {
    const gone = at(TIMING.exitMs - 1);
    expect(Math.abs(gone.x)).toBeGreaterThan(GEO.offsetX * 0.9);
    expect(Math.abs(gone.z)).toBeGreaterThan(GEO.depth * 0.9);
  });

  // A model that finishes loading early is mounted during the hold. If this
  // returned the mark it would render her standing on it for a frame or two
  // before the entrance starts — a pop, in the one beat reserved for hiding
  // pops.
  //
  // Note this is now a SECOND line of defence rather than the only one. Parking
  // off-stage was originally the whole mechanism for hiding the outgoing model
  // and it failed, because "off-stage" depended on a frame width nobody had
  // measured. VrmAvatar hides a stale model outright now; this keeps the
  // position sane for the model that legitimately IS entering.
  it('parks a model that arrives during the hold off-stage', () => {
    const held = at(TIMING.exitMs + TIMING.holdMs / 2, NEXT);
    expect(held.x).toBeCloseTo(GEO.offsetX, 6);
    expect(held.z).toBeCloseTo(-GEO.depth, 6);
  });

  it('is continuous across the hold-to-enter seam', () => {
    const before = at(569);
    const after = at(571);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.02);
    expect(Math.abs(after.z - before.z)).toBeLessThan(0.02);
  });

  // The seam that is easier to get wrong: exit ends fully off on ONE side and
  // the hold parks fully off on the OTHER. That jump is invisible only because
  // nothing is on stage to see it — so this test pins the fact that they are
  // deliberately opposite rather than accidentally equal.
  it('crosses the stage during the hold, while nothing is visible', () => {
    const leaving = at(TIMING.exitMs - 1, NEXT);
    const waiting = at(TIMING.exitMs + 1, NEXT);
    expect(Math.sign(leaving.x)).toBe(-Math.sign(waiting.x));
  });

  // THE SPRING-BONE BUG. The path is walked backwards on the way in, and `z` is
  // eased with a curve whose speed is highest at p = 0 — which on the way in is
  // the moment she lands. She arrived at full forward speed, and on a character
  // with chest and hair physics that is an impact, not just an ugly stop: the
  // joints take a large velocity step in one frame and discharge it as a
  // violent wobble.
  //
  // Measured as SPEED rather than position, because position was already
  // correct — she did arrive exactly on her mark. It was how fast she was
  // moving when she got there that was wrong.
  const speedAt = (ms, dir = NEXT) => {
    const a = at(ms - 8, dir);
    const b = at(ms + 8, dir);
    return Math.hypot(b.x - a.x, b.z - a.z) / 16;
  };

  it('arrives slowly, however fast it was travelling on the way', () => {
    const total = carouselTotalMs(TIMING);
    const midFlight = speedAt(TIMING.exitMs + TIMING.holdMs + TIMING.enterMs * 0.5);
    const landing = speedAt(total - 12);
    expect(landing).toBeLessThan(midFlight * 0.15);
  });

  it('leaves its mark gently too, rather than snatching her off it', () => {
    const departing = speedAt(12);
    const midExit = speedAt(TIMING.exitMs * 0.5);
    expect(departing).toBeLessThan(midExit * 0.15);
  });

  // Bounded from both sides: a transition that is slow everywhere is not a fix,
  // it is a different bug. The middle of each half still has to move.
  it('still travels at speed in between', () => {
    const midExit = speedAt(TIMING.exitMs * 0.5);
    expect(midExit).toBeGreaterThan(0.001);
  });

  it('settles smoothly rather than snapping onto the mark', () => {
    const nearlyHome = at(carouselTotalMs(TIMING) - 30);
    expect(Math.abs(nearlyHome.x)).toBeLessThan(GEO.offsetX * 0.05);
    expect(Math.abs(nearlyHome.x)).toBeGreaterThan(0);
  });
});
