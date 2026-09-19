import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  MODEL_URL, GREETING_CLIP, VISEMES, DEFAULTS, clipLabel, MODEL_NAMES, modelName, modelBlurb,
  modelVoice, modelVoiceForUrl, modelVoiceFallback, modelVoiceFallbackForUrl, voiceFallbackFor,
} from './constants.js';
import { parseVoiceId } from './voiceId.js';
import { modelPalette, modelPaletteForUrl } from './constants.js';

describe('constants', () => {
  it('points at a model that is actually in public/', () => {
    // This used to pin the filename, which asserted nothing useful: it was
    // green right up until the file it named was deleted, and the failure it
    // then reported was "the string changed" rather than "the app cannot load".
    //
    // Checking the file exists catches the real fault. It caught it once
    // already — the models were filtered down to those licensed for commercial
    // use, and MODEL_URL was left pointing at one of the casualties.
    //
    // Touching the filesystem from a lib test is the one exception in the
    // suite, and it earns it: MODEL_URL's entire job is to name a real file,
    // and nothing else in the project can tell you whether it does.
    expect(existsSync(join(process.cwd(), 'public', MODEL_URL.replace(/^\//, '')))).toBe(true);
  });

  it('labels the pixiv motion pack, and falls back to the filename', () => {
    expect(clipLabel('VRMA_02.vrma')).toBe('Greeting');
    expect(clipLabel('something-else.vrma')).toBe('something-else');
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

describe('model names', () => {
  const PUBLIC = join(process.cwd(), 'public');

  // The whole value of this table is that a name corresponds to a character
  // someone looked at. A row naming a file that is gone is worse than no row:
  // it silently falls back while still looking maintained.
  it('names only models that are actually installed', () => {
    for (const file of Object.keys(MODEL_NAMES)) {
      expect(existsSync(join(PUBLIC, file)), `${file} is named but missing`).toBe(true);
    }
  });

  it('covers every installed model, so none shows up as "FREE 5"', () => {
    const installed = readdirSync(PUBLIC).filter((f) => /\.vrm$/i.test(f));
    for (const file of installed) {
      expect(MODEL_NAMES[file], `${file} has no human name`).toBeDefined();
    }
  });

  it('gives every model a distinct name', () => {
    const names = Object.values(MODEL_NAMES).map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('falls back to the declared label for an unknown file', () => {
    expect(modelName('dropped-in.vrm', 'Some Declared Name')).toBe('Some Declared Name');
  });

  it('falls back to the bare stem when nothing is declared either', () => {
    expect(modelName('dropped-in.vrm')).toBe('dropped-in');
  });

  it('prefers our name over the declared one', () => {
    expect(modelName('free-1.vrm', 'FREE')).toBe('Sakura');
  });

  it('has no blurb for an unknown file', () => {
    expect(modelBlurb('dropped-in.vrm')).toBeNull();
  });
});

describe('model voices', () => {
  // The voice belongs to the model, so every model has to have one — a missing
  // row is silent (it falls through to the env default), which means the wrong
  // character speaks and nothing reports it.
  it('gives every named model a voice', () => {
    for (const [file, entry] of Object.entries(MODEL_NAMES)) {
      expect(entry.voice, `${file} has no voice`).toBeTruthy();
    }
  });

  it('uses qualified provider:id voice ids throughout', () => {
    for (const [file, entry] of Object.entries(MODEL_NAMES)) {
      const parsed = parseVoiceId(entry.voice);
      expect(parsed?.provider, `${file} voice is not provider-qualified`).toBeTruthy();
      expect(parsed.id.length).toBeGreaterThan(0);
    }
  });

  // Two characters sharing a voice is almost certainly a copy-paste rather than
  // a decision, and it is invisible until you switch between them and hear the
  // same person twice.
  it('gives each model a distinct voice', () => {
    const voices = Object.values(MODEL_NAMES).map((m) => m.voice);
    expect(new Set(voices).size).toBe(voices.length);
  });

  // Mio is deliberately the one male voice in the cast. Pinning it because it
  // is the single intentional asymmetry in the table and the easiest thing to
  // undo by accident while rebalancing the others after listening.
  it('gives Mio a different voice from every other model', () => {
    const mio = MODEL_NAMES['untitled-7.vrm'];
    expect(mio.name).toBe('Mio');

    const others = Object.entries(MODEL_NAMES)
      .filter(([file]) => file !== 'untitled-7.vrm')
      .map(([, m]) => m.voice);
    expect(others).not.toContain(mio.voice);
  });

  // Yuki and Mio are the same character model with a beret between them, which
  // makes them the pair most likely to be given one voice by mistake.
  it('does not give Yuki and Mio the same voice', () => {
    expect(MODEL_NAMES['untitled-6.vrm'].voice)
      .not.toBe(MODEL_NAMES['untitled-7.vrm'].voice);
  });

  it('resolves a voice from a filename and from a store URL alike', () => {
    expect(modelVoice('haishin-chan.vrm')).toBe(MODEL_NAMES['haishin-chan.vrm'].voice);
    expect(modelVoiceForUrl('/haishin-chan.vrm')).toBe(MODEL_NAMES['haishin-chan.vrm'].voice);
    expect(modelVoiceForUrl(MODEL_URL)).toBeTruthy();
  });

  // A dropped-in .vrm with no row must still speak, on the provider default.
  it('is null for a model with no row, rather than throwing', () => {
    expect(modelVoice('not-a-real-model.vrm')).toBeNull();
    expect(modelVoiceForUrl('/nope.vrm')).toBeNull();
    expect(modelVoiceForUrl(null)).toBeNull();
    expect(modelVoiceForUrl(undefined)).toBeNull();
  });

  describe('voice fallbacks', () => {
    // The three characters whose voices come from the Voice Library rather than
    // the premade 21. That distinction is the whole reason this feature exists:
    // a premade voice works on any plan, a Library one depends on the account's
    // plan and on the voice still being published.
    const LIBRARY_MODELS = ['free-2.vrm', 'free-3.vrm', 'free-5.vrm'];

    it('gives every Library-voiced model a fallback, and no other model one', () => {
      for (const [file, entry] of Object.entries(MODEL_NAMES)) {
        if (LIBRARY_MODELS.includes(file)) {
          expect(entry.voiceFallback, `${file} has no fallback voice`).toBeTruthy();
        } else {
          // Not an oversight to fix later. A premade row has nothing to fall
          // back FROM, so a fallback on one is a second id to keep correct for
          // a failure that cannot happen.
          expect(entry.voiceFallback, `${file} has a fallback it does not need`).toBeUndefined();
        }
      }
    });

    it('qualifies every fallback with its provider', () => {
      for (const [file, entry] of Object.entries(MODEL_NAMES)) {
        if (!entry.voiceFallback) continue;
        const parsed = parseVoiceId(entry.voiceFallback);
        expect(parsed?.provider, `${file} fallback is not provider-qualified`).toBeTruthy();
        expect(parsed.id.length).toBeGreaterThan(0);
      }
    });

    // A fallback equal to the voice it replaces is a no-op that looks like a
    // feature: the retry fires, fails identically, and the avatar is still mute.
    it('never falls back to the voice it is replacing', () => {
      for (const [file, entry] of Object.entries(MODEL_NAMES)) {
        if (!entry.voiceFallback) continue;
        expect(entry.voiceFallback, `${file} falls back to itself`).not.toBe(entry.voice);
      }
    });

    // The fallbacks are premade voices, and premade voices are shared across
    // characters by design rather than chosen per character — so unlike the
    // primary voices they are NOT required to be distinct from each other.
    // What they must not be is some other character's live voice, which would
    // put two characters in one voice the moment a Library voice lapsed.
    it('does not fall back onto a voice another character already uses', () => {
      const primaries = new Set(Object.values(MODEL_NAMES).map((m) => m.voice));
      for (const [file, entry] of Object.entries(MODEL_NAMES)) {
        if (!entry.voiceFallback) continue;
        expect(primaries.has(entry.voiceFallback), `${file} falls back onto a live voice`)
          .toBe(false);
      }
    });

    it('resolves a fallback from a filename and from a store URL alike', () => {
      expect(modelVoiceFallback('free-2.vrm')).toBe(MODEL_NAMES['free-2.vrm'].voiceFallback);
      expect(modelVoiceFallbackForUrl('/free-2.vrm')).toBe(MODEL_NAMES['free-2.vrm'].voiceFallback);
      // The claim is that the two spellings AGREE, so assert that rather than
      // that the default model's fallback is truthy. Truthiness here was a proxy
      // for "the default happens to use a Library voice", which is not a fact
      // about these two functions at all — it went red the day the default
      // became a premade-voice model, with nothing about the lookup broken.
      const file = MODEL_URL.replace(/^\//, '');
      expect(modelVoiceFallbackForUrl(MODEL_URL)).toBe(modelVoiceFallback(file));
    });

    it('is null for a model with no fallback, rather than throwing', () => {
      expect(modelVoiceFallback('free-1.vrm')).toBeNull();
      expect(modelVoiceFallback('not-a-real-model.vrm')).toBeNull();
      expect(modelVoiceFallbackForUrl(null)).toBeNull();
      expect(modelVoiceFallbackForUrl(undefined)).toBeNull();
    });

    // The reverse lookup is what /api/tts uses: it is handed a voice id and
    // never the model, so the fallback has to be reachable from the id alone.
    it('finds a fallback from the voice id alone', () => {
      for (const file of LIBRARY_MODELS) {
        const entry = MODEL_NAMES[file];
        expect(voiceFallbackFor(entry.voice)).toBe(entry.voiceFallback);
      }
    });

    it('has no fallback for a premade voice, or for anything unknown', () => {
      expect(voiceFallbackFor(MODEL_NAMES['free-1.vrm'].voice)).toBeNull();
      expect(voiceFallbackFor('elevenlabs:not-a-voice')).toBeNull();
      expect(voiceFallbackFor('openai:nova')).toBeNull();
      expect(voiceFallbackFor(null)).toBeNull();
      expect(voiceFallbackFor(undefined)).toBeNull();
      expect(voiceFallbackFor('')).toBeNull();
    });

    // A fallback that is itself a Library voice would be a chain, and the route
    // retries exactly once — so the second voice must be one that cannot fail
    // the same way. Nothing in code can read a voice's category, so this pins
    // the shape instead: a fallback is never itself fallback-able.
    it('does not chain: a fallback has no fallback of its own', () => {
      for (const entry of Object.values(MODEL_NAMES)) {
        if (!entry.voiceFallback) continue;
        expect(voiceFallbackFor(entry.voiceFallback)).toBeNull();
      }
    });
  });

  describe('model palettes', () => {
    // The backdrop is driven from this, so a model without one stands in front
    // of the default plum. That is a working fallback rather than a bug, which
    // is exactly why it needs a test — nothing on screen would tell you a row
    // had been missed.
    it('gives every named model a palette', () => {
      for (const [file, entry] of Object.entries(MODEL_NAMES)) {
        expect(entry.palette, `${file} has no palette`).toBeTruthy();
      }
    });

    // Main colour and mid-field. A one-colour palette still renders — the stage
    // repeats it — but it was almost certainly meant to have two.
    it('gives every palette a main and a secondary colour', () => {
      for (const [file, entry] of Object.entries(MODEL_NAMES)) {
        expect(entry.palette.length, `${file} has too few colours`)
          .toBeGreaterThanOrEqual(2);
      }
    });

    // These go straight into a CSS custom property. A malformed value does not
    // throw and does not fail a build — color-mix simply drops the whole
    // gradient stop, and the backdrop quietly loses a layer.
    it('uses colours CSS can parse', () => {
      for (const [file, entry] of Object.entries(MODEL_NAMES)) {
        for (const colour of entry.palette) {
          expect(colour, `${file} has a bad colour: ${colour}`)
            .toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    });

    it('resolves a palette from a filename and from a store URL alike', () => {
      expect(modelPalette('free-1.vrm')).toEqual(MODEL_NAMES['free-1.vrm'].palette);
      expect(modelPaletteForUrl('/free-1.vrm')).toEqual(MODEL_NAMES['free-1.vrm'].palette);
    });

    it('has no palette for a model it has never heard of', () => {
      expect(modelPalette('ghost.vrm')).toBeNull();
      expect(modelPaletteForUrl(null)).toBeNull();
    });
  });

  describe('the greeting', () => {
    // Bounded from both sides. Too short and the entrance is routinely skipped
    // on a cold cache; too long and a blank lit room sits there looking broken.
    it('waits a sane amount of time for the entrance clip', () => {
      expect(DEFAULTS.arrivalWaitMs).toBeGreaterThan(400);
      expect(DEFAULTS.arrivalWaitMs).toBeLessThan(3000);
    });

    // It fires unprompted on every page load, so a typo here is a feature that
    // silently never happens — the worst kind, because nothing reports it.
    it('names a clip in the animations directory, or nothing at all', () => {
      if (GREETING_CLIP === null) return;
      expect(GREETING_CLIP).toMatch(/^\/animations\/[^/]+\.vrma$/);
    });

    // Conditional on the pack being installed, because .vrma is gitignored and
    // a fresh clone legitimately has none. When the files ARE there, a name
    // that does not match one of them is a typo and this says so.
    it('names a file that exists, when the pack is installed', () => {
      if (GREETING_CLIP === null) return;
      const dir = join(process.cwd(), 'public', 'animations');
      if (!existsSync(dir)) return;
      const file = GREETING_CLIP.replace('/animations/', '');
      expect(
        existsSync(join(dir, file)),
        `${file} is not in public/animations`,
      ).toBe(true);
    });

    it('is a clip the menu has a human name for', () => {
      if (GREETING_CLIP === null) return;
      const file = GREETING_CLIP.replace('/animations/', '');
      expect(clipLabel(file)).toBe('Greeting');
    });
  });
});