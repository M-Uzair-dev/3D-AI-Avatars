import { describe, it, expect } from 'vitest';
import { FRAMINGS, DEFAULT_FRAMING, FOV_DEG } from './constants.js';
import { solveFraming, headScreenFraction, MOBILE_MODEL_SCALE, zoomForWidth } from './framing.js';

// Three model heights spanning what VRoid actually produces: a short chibi-ish
// one, a typical 1.5m anime model, and a tall one. `headY` is the head BONE,
// which sits around the ears rather than at the top of the hair.
const SHORT = 1.12;
const TYPICAL = 1.35;
const TALL = 1.62;

describe('solveFraming', () => {
  it('puts the head at the same screen fraction whatever the model height', () => {
    // THE WHOLE POINT. Fixed camera positions put a short model's head
    // mid-screen and a tall one's through the top of the frame.
    for (const name of Object.keys(FRAMINGS)) {
      const target = FRAMINGS[name].headAt;
      for (const headY of [SHORT, TYPICAL, TALL]) {
        const view = solveFraming(name, headY, FOV_DEG);
        expect(headScreenFraction(view, headY, FOV_DEG), `${name} @ ${headY}`)
          .toBeCloseTo(target, 4);
      }
    }
  });

  it('keeps the head in the upper half in every framing', () => {
    // Bounded from both sides: 0 is the head jammed against the top edge, 0.5
    // is dead centre, which reads as a passport photo.
    for (const [name, f] of Object.entries(FRAMINGS)) {
      expect(f.headAt, `${name} too high`).toBeGreaterThan(0.05);
      expect(f.headAt, `${name} too low`).toBeLessThanOrEqual(0.35);
    }
  });

  it('scales the camera distance with the model', () => {
    // A taller model needs the camera further back to show the same PROPORTION
    // of it. Same framing, two heights, must not produce the same distance.
    const short = solveFraming('bust', SHORT, FOV_DEG);
    const tall = solveFraming('bust', TALL, FOV_DEG);
    expect(tall.position[2]).toBeGreaterThan(short.position[2]);
  });

  it('looks horizontally, so the model is not viewed from above or below', () => {
    // A tilted camera foreshortens the face and reads as looking down on her.
    // Camera height and target height being equal is what keeps it level.
    const view = solveFraming('bust', TYPICAL, FOV_DEG);
    expect(view.position[1]).toBeCloseTo(view.target[1], 6);
  });

  it('shows the feet in the full-body framing', () => {
    // The one framing whose job is bounded at the BOTTOM rather than the top.
    for (const headY of [SHORT, TYPICAL, TALL]) {
      const view = solveFraming('full', headY, FOV_DEG);
      const half = view.position[2] * Math.tan((FOV_DEG * Math.PI) / 360);
      expect(view.target[1] - half, `feet cut off at ${headY}`).toBeLessThanOrEqual(0);
    }
  });

  it('orders the framings from tightest to widest', () => {
    const at = (n) => solveFraming(n, TYPICAL, FOV_DEG).position[2];
    expect(at('close')).toBeLessThan(at('bust'));
    expect(at('bust')).toBeLessThan(at('full'));
  });

  it('falls back to the default framing for a name it does not know', () => {
    expect(solveFraming('nonsense', TYPICAL, FOV_DEG))
      .toEqual(solveFraming(DEFAULT_FRAMING, TYPICAL, FOV_DEG));
  });

  it('falls back to a nominal height before a model has loaded', () => {
    // The camera is constructed before the VRM finishes downloading, so this
    // runs with no measurement at least once every session.
    expect(() => solveFraming('bust', null, FOV_DEG)).not.toThrow();
    expect(solveFraming('bust', null, FOV_DEG).position[2]).toBeGreaterThan(0);
    expect(solveFraming('bust', 0, FOV_DEG).position[2]).toBeGreaterThan(0);
  });
});

/**
 * On a phone the whole model is pulled back so she reads at roughly 0.6x, which
 * leaves room for the control bar without it sitting across her face.
 *
 * `zoom` means APPARENT SIZE, so 0.6 shows MORE of the scene and puts the camera
 * FURTHER away. Getting that inverted is the obvious mistake and it is the first
 * thing asserted.
 */
describe('mobile zoom', () => {
  it('moves the camera back to make her smaller, not closer', () => {
    const full = solveFraming('bust', TYPICAL, FOV_DEG, 1);
    const small = solveFraming('bust', TYPICAL, FOV_DEG, MOBILE_MODEL_SCALE);
    expect(small.position[2]).toBeGreaterThan(full.position[2]);
  });

  it('scales apparent size by exactly the zoom', () => {
    // Apparent size is inversely proportional to distance at a fixed fov, so
    // asserting the distance ratio is asserting the size ratio.
    const full = solveFraming('bust', TYPICAL, FOV_DEG, 1);
    const small = solveFraming('bust', TYPICAL, FOV_DEG, MOBILE_MODEL_SCALE);
    expect(full.position[2] / small.position[2]).toBeCloseTo(MOBILE_MODEL_SCALE, 6);
  });

  it('keeps the head where the framing wants it even when zoomed out', () => {
    // The composition rule has to survive the zoom, or the phone layout gets a
    // different framing rather than the same one further away.
    const small = solveFraming('bust', TYPICAL, FOV_DEG, MOBILE_MODEL_SCALE);
    expect(headScreenFraction(small, TYPICAL, FOV_DEG))
      .toBeCloseTo(FRAMINGS.bust.headAt, 6);
  });

  it('defaults to full size when no zoom is given', () => {
    expect(solveFraming('bust', TYPICAL, FOV_DEG))
      .toEqual(solveFraming('bust', TYPICAL, FOV_DEG, 1));
  });

  it('ignores a nonsense zoom rather than putting the camera inside her', () => {
    for (const bad of [0, -1, null, undefined, NaN]) {
      expect(solveFraming('bust', TYPICAL, FOV_DEG, bad).position[2])
        .toBeCloseTo(solveFraming('bust', TYPICAL, FOV_DEG, 1).position[2], 6);
    }
  });
});

describe('zoomForWidth', () => {
  it('shrinks her on phone widths', () => {
    expect(zoomForWidth(390)).toBe(MOBILE_MODEL_SCALE);
    expect(zoomForWidth(360)).toBe(MOBILE_MODEL_SCALE);
  });

  it('leaves tablets and desktops alone', () => {
    expect(zoomForWidth(768)).toBe(1);
    expect(zoomForWidth(1440)).toBe(1);
  });

  it('treats an unknown width as desktop rather than shrinking by surprise', () => {
    expect(zoomForWidth(0)).toBe(1);
    expect(zoomForWidth(null)).toBe(1);
    expect(zoomForWidth(undefined)).toBe(1);
  });
});
