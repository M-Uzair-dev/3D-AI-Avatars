import { describe, it, expect } from 'vitest';
import { MODEL_URL, VISEMES, DEFAULTS } from './constants.js';

describe('constants', () => {
  it('points at the model in public/', () => {
    expect(MODEL_URL).toBe('/model.vrm');
  });

  it('defines exactly the five VRM viseme shapes', () => {
    expect(VISEMES).toEqual(['aa', 'ih', 'ou', 'ee', 'oh']);
  });

  it('provides tuning defaults in sane ranges', () => {
    expect(DEFAULTS.stiffness).toBeGreaterThan(0);
    expect(DEFAULTS.rate).toBe(1);
    expect(DEFAULTS.idleAttenuationWhileSpeaking).toBeLessThan(1);
  });
});
