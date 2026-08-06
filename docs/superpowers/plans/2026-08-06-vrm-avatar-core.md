# VRM Avatar Core Pipeline — Implementation Plan (1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VRM avatar standing on screen that animates its mouth through the visemes of typed text, with continuous idle life (blink, breathing, head drift), built on a pure, unit-tested compositor.

**Architecture:** All non-trivial logic lives in pure functions under `src/lib/` that import neither React nor three.js — text→timeline, timeline sampling, damping, and bone-layer compositing. `VrmAvatar` is a thin `useFrame` shell that gathers inputs, calls the pure compositor, writes the result to the VRM, and calls `vrm.update(delta)` exactly once at the end. Control values live in a zustand store read *transiently* via `getState()` inside the render loop, so slider drags never re-render the Canvas subtree.

**Tech Stack:** Next.js 16.3 (App Router), React 19.2.8, three 0.185, @react-three/fiber 9.7, @react-three/drei 10.7, @pixiv/three-vrm 3.5.5, zustand 5.0.14, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-vrm-avatar-reference-design.md`

## Global Constraints

- **No git.** The user has explicitly declined version control for this project. Every task ends with a **verification step** instead of a commit. Do not run `git init`, `git add`, or `git commit`.
- **No audio, ever.** No TTS, no microphone, no `Audio`/`AudioContext`. Timing derives from text alone.
- All work happens in `frontend/`. Run all commands from `frontend/`.
- **`src/lib/**` must never import React or three.js.** These are pure modules. A test that needs jsdom means the boundary was drawn wrong.
- **Read `node_modules/next/dist/docs/` before writing Next-specific code.** Next 16.3 has breaking changes from training data. `AGENTS.md` mandates this.
- `next/dynamic` with `ssr: false` **must be called from inside a `'use client'` file** — it is not permitted in a Server Component.
- **`vrm.update(delta)` is called exactly once per frame, last**, after all `setValue`/bone writes. Calling it early or twice produces subtly wrong output.
- Target the **VRM 1.0 expression vocabulary** (`happy`, `aa`, `blink`…). `three-vrm` normalizes the model's VRM 0.x names (`Joy`, `A`…). **Never branch on VRM version.**
- Model path is the single constant `MODEL_URL = '/model.vrm'` in `src/lib/constants.js`. No scattered string literals.
- Bone access is always via `vrm.humanoid.getNormalizedBoneNode(name)` — never raw scene graph traversal.
- Viseme set is exactly `['aa','ih','ou','ee','oh']`. `null` means CLOSED (lips together).

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.mjs` | Test runner config + `@/` alias |
| `src/lib/constants.js` | `MODEL_URL`, `VISEMES`, tuning defaults |
| `src/lib/visemeMap.js` | Grapheme→viseme tables, duration constants |
| `src/lib/textToVisemes.js` | PURE: text → contiguous segment timeline |
| `src/lib/visemePlayback.js` | PURE: sample timeline at t, damp weights |
| `src/lib/composite.js` | PURE: pose + idle + manual → final bone rotations |
| `src/lib/poses.js` | Named pose presets (bone → Euler) |
| `src/lib/vrmIntrospect.js` | Enumerate expressions + bones from a loaded VRM |
| `src/stores/avatarStore.js` | zustand store, all control values |
| `src/hooks/useVisemePlayback.js` | Thin ref-holding wrapper over playback math |
| `src/hooks/useIdleMotion.js` | Blink/breathe/drift → additive deltas |
| `src/components/AvatarStage.jsx` | `'use client'` boundary, dynamic import, layout |
| `src/components/Scene.jsx` | Canvas, lights, ground, OrbitControls |
| `src/components/VrmAvatar.jsx` | The compositor — single write point |
| `src/components/MissingModelNotice.jsx` | Load failure / progress UI |
| `src/components/SpeechInput.jsx` | Textarea + Speak + stiffness/rate sliders |
| `src/app/page.js` | Server Component shell (modified) |

---

## Task 1: Dependencies and test harness

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.mjs`
- Create: `frontend/src/lib/constants.js`
- Test: `frontend/src/lib/constants.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `MODEL_URL: string`, `VISEMES: string[]`, `DEFAULTS: object`; `npm test` runs Vitest

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install three@0.185.1 @react-three/fiber@9.7.0 @react-three/drei@10.7.8 @pixiv/three-vrm@3.5.5 zustand@5.0.14
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D vitest
```

- [ ] **Step 3: Create `vitest.config.mjs`**

```js
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

`environment: 'node'` is deliberate. Every test in this plan covers a pure module. If a
test ever needs jsdom, the logic is in the wrong file.

- [ ] **Step 4: Add the test script to `package.json`**

Add to the `"scripts"` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write the failing test**

Create `src/lib/constants.test.js`:

```js
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
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./constants.js`

- [ ] **Step 7: Write `src/lib/constants.js`**

```js
export const MODEL_URL = '/model.vrm';

export const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh'];

export const DEFAULTS = {
  stiffness: 18,
  rate: 1,
  idleAttenuationWhileSpeaking: 0.4,
  blinkIntervalMin: 2000,
  blinkIntervalMax: 6000,
  blinkDuration: 120,
  headDriftAmplitude: 0.052,
  headDriftSpeed: 0.35,
  breathAmplitude: 0.018,
  breathRate: 0.25,
};
```

`headDriftAmplitude` is 0.052 rad ≈ 3°, matching the spec.

- [ ] **Step 8: Run tests and confirm they pass**

Run: `npm test`
Expected: PASS, 3 tests

- [ ] **Step 9: Verify the dev server still boots**

Run: `npm run dev`
Expected: compiles without error; the default scaffold page loads. Stop the server.

---

## Task 2: Viseme map and text tokenization

**Files:**
- Create: `frontend/src/lib/visemeMap.js`
- Test: `frontend/src/lib/visemeMap.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `DIGRAPHS: Record<string, Entry>` — two-character sequences
  - `LETTERS: Record<string, Entry>` — single characters
  - `DURATION: { vowelMin, vowelMax, consonantMin, consonantMax, word, comma, sentence }`
  - `Entry = { viseme: string|null, weight: number, type: 'vowel'|'consonant' }`
  - `viseme: null` means CLOSED (lips together)

- [ ] **Step 1: Write the failing test**

Create `src/lib/visemeMap.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { DIGRAPHS, LETTERS, DURATION } from './visemeMap.js';
import { VISEMES } from './constants.js';

const isValidEntry = (e) => {
  const visemeOk = e.viseme === null || VISEMES.includes(e.viseme);
  const weightOk = e.weight >= 0 && e.weight <= 1;
  const typeOk = e.type === 'vowel' || e.type === 'consonant';
  return visemeOk && weightOk && typeOk;
};

describe('visemeMap', () => {
  it('maps the five vowels to their matching visemes at full weight', () => {
    expect(LETTERS.a).toMatchObject({ viseme: 'aa', weight: 1, type: 'vowel' });
    expect(LETTERS.e).toMatchObject({ viseme: 'ee', weight: 1, type: 'vowel' });
    expect(LETTERS.i).toMatchObject({ viseme: 'ih', weight: 1, type: 'vowel' });
    expect(LETTERS.o).toMatchObject({ viseme: 'oh', weight: 1, type: 'vowel' });
    expect(LETTERS.u).toMatchObject({ viseme: 'ou', weight: 1, type: 'vowel' });
  });

  it('closes the lips completely on every bilabial', () => {
    for (const letter of ['b', 'p', 'm']) {
      expect(LETTERS[letter].viseme).toBeNull();
      expect(LETTERS[letter].weight).toBe(0);
    }
  });

  it('gives consonants a reduced open shape', () => {
    for (const letter of ['s', 't', 'n', 'l']) {
      expect(LETTERS[letter].type).toBe('consonant');
      expect(LETTERS[letter].weight).toBeGreaterThan(0);
      expect(LETTERS[letter].weight).toBeLessThan(0.6);
    }
  });

  it('covers every letter of the alphabet', () => {
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      expect(LETTERS[c], `missing letter: ${c}`).toBeDefined();
    }
  });

  it('defines the digraphs that English spelling actually needs', () => {
    for (const d of ['th', 'sh', 'ch', 'ng', 'oo', 'ee', 'ou', 'ai', 'qu']) {
      expect(DIGRAPHS[d], `missing digraph: ${d}`).toBeDefined();
    }
  });

  it('every digraph key is exactly two characters', () => {
    for (const key of Object.keys(DIGRAPHS)) {
      expect(key.length, `bad digraph key: ${key}`).toBe(2);
    }
  });

  it('every entry is structurally valid', () => {
    for (const [k, e] of Object.entries({ ...LETTERS, ...DIGRAPHS })) {
      expect(isValidEntry(e), `invalid entry: ${k}`).toBe(true);
    }
  });

  it('orders durations so vowels outlast consonants and sentences outlast words', () => {
    expect(DURATION.vowelMin).toBeGreaterThan(DURATION.consonantMax);
    expect(DURATION.sentence).toBeGreaterThan(DURATION.comma);
    expect(DURATION.comma).toBeGreaterThan(DURATION.word);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/lib/visemeMap.test.js`
Expected: FAIL — cannot resolve `./visemeMap.js`

- [ ] **Step 3: Write `src/lib/visemeMap.js`**

```js
/**
 * Grapheme -> viseme tables.
 *
 * `viseme: null` means CLOSED — lips together, all mouth weights driven to zero.
 * This is the single most important cue in silent lip animation: without visible
 * lip closure on bilabials (b, p, m) the mouth reads as a fish rather than speech.
 *
 * Weights are deliberately partial for consonants. A consonant is a transition,
 * not a held shape, so it only nudges the mouth toward its viseme.
 */

const vowel = (viseme) => ({ viseme, weight: 1, type: 'vowel' });
const consonant = (viseme, weight) => ({ viseme, weight, type: 'consonant' });
const closed = () => ({ viseme: null, weight: 0, type: 'consonant' });

export const LETTERS = {
  a: vowel('aa'),
  e: vowel('ee'),
  i: vowel('ih'),
  o: vowel('oh'),
  u: vowel('ou'),
  y: { viseme: 'ih', weight: 0.8, type: 'vowel' },

  // Bilabials — lips together. Load-bearing.
  b: closed(),
  p: closed(),
  m: closed(),

  // Labiodentals — lower lip to teeth, mouth barely open.
  f: consonant('ih', 0.3),
  v: consonant('ih', 0.3),

  // Rounded.
  w: consonant('ou', 0.7),
  r: consonant('ou', 0.45),
  j: consonant('ou', 0.4),
  q: consonant('ou', 0.5),

  // Alveolars — tongue behind teeth, small opening.
  l: consonant('ih', 0.4),
  n: consonant('ih', 0.3),
  d: consonant('ih', 0.35),
  t: consonant('ih', 0.35),
  s: consonant('ih', 0.3),
  z: consonant('ih', 0.3),
  c: consonant('ih', 0.35),
  x: consonant('ih', 0.35),

  // Velars — back of tongue, jaw drops slightly.
  k: consonant('aa', 0.35),
  g: consonant('aa', 0.35),

  // Glottal — mouth stays near the neighbouring vowel.
  h: consonant('aa', 0.2),
};

export const DIGRAPHS = {
  // Consonant clusters that are one mouth shape, not two.
  th: consonant('ih', 0.3),
  sh: consonant('ou', 0.4),
  ch: consonant('ou', 0.4),
  ph: consonant('ih', 0.3),
  wh: consonant('ou', 0.6),
  ck: consonant('aa', 0.35),
  ng: consonant('ih', 0.3),
  qu: consonant('ou', 0.6),

  // Vowel digraphs.
  oo: vowel('ou'),
  ee: vowel('ee'),
  ea: vowel('ee'),
  ou: vowel('ou'),
  ow: vowel('oh'),
  oa: vowel('oh'),
  oi: vowel('oh'),
  oy: vowel('oh'),
  ai: vowel('aa'),
  au: vowel('aa'),
  ay: vowel('ee'),
  ie: vowel('ih'),
};

export const DURATION = {
  vowelMin: 110,
  vowelMax: 140,
  consonantMin: 50,
  consonantMax: 70,
  word: 40,
  comma: 150,
  sentence: 350,
};
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test src/lib/visemeMap.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Verify the full suite is still green**

Run: `npm test`
Expected: PASS, 11 tests total

---

## Task 3: textToVisemes

**Files:**
- Create: `frontend/src/lib/textToVisemes.js`
- Test: `frontend/src/lib/textToVisemes.test.js`

**Interfaces:**
- Consumes: `LETTERS`, `DIGRAPHS`, `DURATION` from `visemeMap.js`
- Produces:
  - `textToVisemes(text: string, opts?: { rate?: number, rng?: () => number }) => Segment[]`
  - `Segment = { viseme: string|null, weight: number, start: number, dur: number }`
  - Timeline is **contiguous**: `start[n+1] === start[n] + dur[n]`, `start[0] === 0`
  - All `start`/`dur` are integers (milliseconds)
  - `rng` is injectable so tests are deterministic

- [ ] **Step 1: Write the failing test**

Create `src/lib/textToVisemes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { textToVisemes } from './textToVisemes.js';
import { DURATION } from './visemeMap.js';

// Deterministic rng: always the midpoint of any min..max range.
const mid = () => 0.5;
const total = (tl) => tl.reduce((sum, s) => sum + s.dur, 0);

describe('textToVisemes', () => {
  it('returns an empty timeline for empty or whitespace input', () => {
    expect(textToVisemes('', { rng: mid })).toEqual([]);
    expect(textToVisemes('   ', { rng: mid })).toEqual([]);
    expect(textToVisemes('\n\t', { rng: mid })).toEqual([]);
  });

  it('produces a contiguous timeline starting at zero', () => {
    const tl = textToVisemes('hello there, friend.', { rng: mid });
    expect(tl.length).toBeGreaterThan(0);
    expect(tl[0].start).toBe(0);
    for (let i = 1; i < tl.length; i++) {
      expect(tl[i].start).toBe(tl[i - 1].start + tl[i - 1].dur);
    }
  });

  it('uses integer timings so contiguity is exact', () => {
    const tl = textToVisemes('testing one two three', { rate: 0.77, rng: mid });
    for (const s of tl) {
      expect(Number.isInteger(s.start)).toBe(true);
      expect(Number.isInteger(s.dur)).toBe(true);
    }
  });

  it('matches digraphs before single letters', () => {
    // "the" must be [th][e], not [t][h][e].
    const tl = textToVisemes('the', { rng: mid });
    expect(tl).toHaveLength(2);
    expect(tl[0]).toMatchObject({ viseme: 'ih', weight: 0.3 });
    expect(tl[1]).toMatchObject({ viseme: 'ee', weight: 1 });
  });

  it('closes the lips on bilabials', () => {
    const tl = textToVisemes('mob', { rng: mid });
    const closedSegments = tl.filter((s) => s.viseme === null);
    // m and b both close; o does not.
    expect(closedSegments).toHaveLength(2);
    expect(tl[0].viseme).toBeNull();
    expect(tl[1].viseme).toBe('oh');
    expect(tl[2].viseme).toBeNull();
  });

  it('inserts a closed pause of the right length at a word boundary', () => {
    const tl = textToVisemes('a a', { rng: mid });
    expect(tl).toHaveLength(3);
    expect(tl[1]).toMatchObject({ viseme: null, dur: DURATION.word });
  });

  it('inserts longer pauses for commas than for spaces', () => {
    const tl = textToVisemes('a, a', { rng: mid });
    const pause = tl.find((s) => s.dur === DURATION.comma);
    expect(pause).toBeDefined();
    expect(pause.viseme).toBeNull();
  });

  it('inserts the longest pause at a sentence end', () => {
    const tl = textToVisemes('a. a', { rng: mid });
    const pause = tl.find((s) => s.dur === DURATION.sentence);
    expect(pause).toBeDefined();
    expect(pause.viseme).toBeNull();
  });

  it('does not emit a duplicate pause for punctuation followed by a space', () => {
    const withSpace = textToVisemes('a. a', { rng: mid });
    const pauses = withSpace.filter((s) => s.viseme === null);
    // Exactly one pause between the two vowels, not a sentence pause AND a word pause.
    expect(pauses).toHaveLength(1);
  });

  it('gives vowels longer durations than consonants', () => {
    const tl = textToVisemes('at', { rng: mid });
    expect(tl[0].dur).toBeGreaterThan(tl[1].dur);
  });

  it('scales total duration by the rate multiplier', () => {
    const base = total(textToVisemes('the quick brown fox', { rate: 1, rng: mid }));
    const fast = total(textToVisemes('the quick brown fox', { rate: 2, rng: mid }));
    const slow = total(textToVisemes('the quick brown fox', { rate: 0.5, rng: mid }));
    // Rounding makes this approximate, not exact.
    expect(fast).toBeCloseTo(base / 2, -1);
    expect(slow).toBeCloseTo(base * 2, -1);
  });

  it('is case insensitive', () => {
    const lower = textToVisemes('hello', { rng: mid });
    const upper = textToVisemes('HELLO', { rng: mid });
    expect(upper).toEqual(lower);
  });

  it('skips unknown characters without throwing', () => {
    expect(() => textToVisemes('a€b¥c', { rng: mid })).not.toThrow();
    const tl = textToVisemes('a€b¥c', { rng: mid });
    expect(tl.length).toBeGreaterThan(0);
  });

  it('handles digits without throwing', () => {
    expect(() => textToVisemes('room 101', { rng: mid })).not.toThrow();
  });

  it('never emits a zero or negative duration', () => {
    const tl = textToVisemes('the quick brown fox, jumped! over 7 dogs.', { rng: mid });
    for (const s of tl) {
      expect(s.dur).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/lib/textToVisemes.test.js`
Expected: FAIL — cannot resolve `./textToVisemes.js`

- [ ] **Step 3: Write `src/lib/textToVisemes.js`**

```js
import { LETTERS, DIGRAPHS, DURATION } from './visemeMap.js';

const SENTENCE_ENDS = new Set(['.', '!', '?']);
const CLAUSE_ENDS = new Set([',', ';', ':']);

const CLOSED = { viseme: null, weight: 0 };

/** Pick an integer in [min, max] using an injectable rng. */
function pick(min, max, rng) {
  return min + (max - min) * rng();
}

/**
 * Convert text into a contiguous timeline of viseme segments.
 *
 * There is no audio anywhere in this system, so timing is derived entirely from
 * the text. That also means phonetic accuracy is not the bar — with no sound to
 * compare against, a viewer judges rhythm and shape variety, not correctness.
 * Grapheme rules are therefore good enough and a pronunciation dictionary is not
 * worth its weight.
 *
 * @param {string} text
 * @param {{ rate?: number, rng?: () => number }} [opts]
 *   rate — global speed multiplier; 2 is twice as fast (durations halved).
 *   rng  — injectable randomness so tests are deterministic.
 * @returns {Array<{viseme: string|null, weight: number, start: number, dur: number}>}
 */
export function textToVisemes(text, opts = {}) {
  const { rate = 1, rng = Math.random } = opts;
  const src = String(text ?? '').toLowerCase();

  // Pass 1 — tokenize into untimed segments with a duration hint.
  const raw = [];
  let pendingPause = 0; // collapses runs of spaces/punctuation into one pause

  const flushPause = () => {
    if (pendingPause > 0) {
      raw.push({ ...CLOSED, base: pendingPause });
      pendingPause = 0;
    }
  };

  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    const one = src[i];

    // Longest match first: digraphs before single letters, so "the" is [th][e].
    const entry = (two.length === 2 && DIGRAPHS[two]) || LETTERS[one];

    if (entry) {
      flushPause();
      const isDigraph = two.length === 2 && DIGRAPHS[two] === entry;
      const base =
        entry.type === 'vowel'
          ? pick(DURATION.vowelMin, DURATION.vowelMax, rng)
          : pick(DURATION.consonantMin, DURATION.consonantMax, rng);
      raw.push({ viseme: entry.viseme, weight: entry.weight, base });
      i += isDigraph ? 2 : 1;
      continue;
    }

    // Not a speech sound. Longest applicable pause wins, and consecutive
    // separators collapse — "a. a" yields one sentence pause, not a sentence
    // pause followed by a word pause.
    if (SENTENCE_ENDS.has(one)) {
      pendingPause = Math.max(pendingPause, DURATION.sentence);
    } else if (CLAUSE_ENDS.has(one)) {
      pendingPause = Math.max(pendingPause, DURATION.comma);
    } else if (/\s/.test(one)) {
      pendingPause = Math.max(pendingPause, DURATION.word);
    }
    // Anything else (digits, emoji, unknown punctuation) is silently skipped.
    i += 1;
  }

  // A trailing pause animates nothing, so drop it.

  // Pass 2 — apply rate and lay out contiguously.
  // Integer durations accumulated into a running start keeps
  // start[n+1] === start[n] + dur[n] exactly true, with no float drift.
  const timeline = [];
  let t = 0;
  for (const seg of raw) {
    const dur = Math.max(1, Math.round(seg.base / rate));
    timeline.push({ viseme: seg.viseme, weight: seg.weight, start: t, dur });
    t += dur;
  }

  return timeline;
}

/** Total timeline length in milliseconds. */
export function timelineDuration(timeline) {
  if (timeline.length === 0) return 0;
  const last = timeline[timeline.length - 1];
  return last.start + last.dur;
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test src/lib/textToVisemes.test.js`
Expected: PASS, 15 tests

- [ ] **Step 5: Verify the full suite**

Run: `npm test`
Expected: PASS, 26 tests total

---

## Task 4: Playback sampling and damping

**Files:**
- Create: `frontend/src/lib/visemePlayback.js`
- Test: `frontend/src/lib/visemePlayback.test.js`

**Interfaces:**
- Consumes: `VISEMES` from `constants.js`
- Produces:
  - `zeroWeights() => Weights` — `{aa:0, ih:0, ou:0, ee:0, oh:0}`
  - `sampleTimeline(timeline: Segment[], tMs: number) => Weights`
  - `dampWeights(current: Weights, target: Weights, dtSec: number, stiffness: number) => Weights`
  - `Weights = Record<'aa'|'ih'|'ou'|'ee'|'oh', number>`
  - All functions are pure and return new objects; none mutate their arguments.

- [ ] **Step 1: Write the failing test**

Create `src/lib/visemePlayback.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { zeroWeights, sampleTimeline, dampWeights } from './visemePlayback.js';
import { textToVisemes } from './textToVisemes.js';

const mid = () => 0.5;
const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);

describe('zeroWeights', () => {
  it('returns every viseme at zero', () => {
    expect(zeroWeights()).toEqual({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
  });

  it('returns a fresh object each call', () => {
    const a = zeroWeights();
    a.aa = 1;
    expect(zeroWeights().aa).toBe(0);
  });
});

describe('sampleTimeline', () => {
  const timeline = [
    { viseme: 'aa', weight: 1, start: 0, dur: 100 },
    { viseme: null, weight: 0, start: 100, dur: 50 },
    { viseme: 'oh', weight: 0.5, start: 150, dur: 100 },
  ];

  it('returns the active segment weight', () => {
    expect(sampleTimeline(timeline, 50).aa).toBe(1);
    expect(sampleTimeline(timeline, 200).oh).toBe(0.5);
  });

  it('zeroes every other viseme while one is active', () => {
    const w = sampleTimeline(timeline, 50);
    expect(w.oh).toBe(0);
    expect(w.ih).toBe(0);
    expect(sum(w)).toBe(1);
  });

  it('returns all zeros during a CLOSED segment', () => {
    expect(sum(sampleTimeline(timeline, 120))).toBe(0);
  });

  it('returns all zeros before the timeline starts', () => {
    expect(sum(sampleTimeline(timeline, -10))).toBe(0);
  });

  it('returns all zeros after the timeline ends', () => {
    expect(sum(sampleTimeline(timeline, 9999))).toBe(0);
  });

  it('returns all zeros for an empty timeline', () => {
    expect(sum(sampleTimeline([], 0))).toBe(0);
  });

  it('treats segment boundaries as start-inclusive and end-exclusive', () => {
    expect(sampleTimeline(timeline, 0).aa).toBe(1);
    expect(sampleTimeline(timeline, 100).aa).toBe(0);
  });

  it('never throws anywhere across a real generated timeline', () => {
    const tl = textToVisemes('the quick brown fox, jumped!', { rng: mid });
    const end = tl[tl.length - 1].start + tl[tl.length - 1].dur;
    for (let t = -50; t < end + 50; t += 7) {
      expect(() => sampleTimeline(tl, t)).not.toThrow();
    }
  });
});

describe('dampWeights', () => {
  it('moves current toward target without overshooting', () => {
    const out = dampWeights(zeroWeights(), { ...zeroWeights(), aa: 1 }, 1 / 60, 18);
    expect(out.aa).toBeGreaterThan(0);
    expect(out.aa).toBeLessThan(1);
  });

  it('converges to the target given enough time', () => {
    let w = zeroWeights();
    const target = { ...zeroWeights(), aa: 1 };
    for (let i = 0; i < 300; i++) w = dampWeights(w, target, 1 / 60, 18);
    expect(w.aa).toBeCloseTo(1, 3);
  });

  it('decays back to zero when the target is zero', () => {
    let w = { ...zeroWeights(), aa: 1 };
    for (let i = 0; i < 300; i++) w = dampWeights(w, zeroWeights(), 1 / 60, 18);
    expect(w.aa).toBeCloseTo(0, 3);
  });

  it('is frame-rate independent', () => {
    const target = { ...zeroWeights(), aa: 1 };
    // One 16ms step versus two 8ms steps must land in the same place.
    const oneBig = dampWeights(zeroWeights(), target, 0.016, 18);
    let twoSmall = zeroWeights();
    twoSmall = dampWeights(twoSmall, target, 0.008, 18);
    twoSmall = dampWeights(twoSmall, target, 0.008, 18);
    expect(oneBig.aa).toBeCloseTo(twoSmall.aa, 6);
  });

  it('reaches the target faster at higher stiffness', () => {
    const target = { ...zeroWeights(), aa: 1 };
    const soft = dampWeights(zeroWeights(), target, 1 / 60, 5);
    const hard = dampWeights(zeroWeights(), target, 1 / 60, 40);
    expect(hard.aa).toBeGreaterThan(soft.aa);
  });

  it('does not mutate its inputs', () => {
    const current = zeroWeights();
    const target = { ...zeroWeights(), aa: 1 };
    dampWeights(current, target, 1 / 60, 18);
    expect(current.aa).toBe(0);
    expect(target.aa).toBe(1);
  });

  it('survives a zero dt without producing NaN', () => {
    const out = dampWeights(zeroWeights(), { ...zeroWeights(), aa: 1 }, 0, 18);
    expect(Number.isNaN(out.aa)).toBe(false);
    expect(out.aa).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/lib/visemePlayback.test.js`
Expected: FAIL — cannot resolve `./visemePlayback.js`

- [ ] **Step 3: Write `src/lib/visemePlayback.js`**

```js
import { VISEMES } from './constants.js';

/** A fresh all-zero weight set. */
export function zeroWeights() {
  const w = {};
  for (const v of VISEMES) w[v] = 0;
  return w;
}

/**
 * Read the timeline at time `tMs` and return the raw target weights.
 *
 * Deliberately a hard step function — no interpolation here. Smoothing is the
 * job of dampWeights, which gets co-articulation as a side effect. Keeping the
 * two separate means sampling stays trivially testable.
 *
 * Segment boundaries are start-inclusive, end-exclusive.
 */
export function sampleTimeline(timeline, tMs) {
  const weights = zeroWeights();
  if (!timeline || timeline.length === 0) return weights;

  for (const seg of timeline) {
    if (tMs >= seg.start && tMs < seg.start + seg.dur) {
      // A CLOSED segment (viseme === null) leaves everything at zero,
      // which is exactly the lips-together shape we want.
      if (seg.viseme !== null) weights[seg.viseme] = seg.weight;
      return weights;
    }
  }
  return weights;
}

/**
 * Exponentially damp `current` toward `target`.
 *
 * This single line is what produces co-articulation: because weights decay
 * rather than snap, each mouth shape bleeds into its neighbours the way real
 * speech does. Tuning the whole mouth is therefore one number.
 *
 * Putting dt in the exponent makes the result frame-rate independent — one
 * 16ms step and two 8ms steps land in the same place, so a 144Hz monitor does
 * not animate differently from a 60Hz one.
 */
export function dampWeights(current, target, dtSec, stiffness) {
  const alpha = 1 - Math.exp(-stiffness * dtSec);
  const out = {};
  for (const v of VISEMES) {
    const c = current[v] ?? 0;
    const t = target[v] ?? 0;
    out[v] = c + (t - c) * alpha;
  }
  return out;
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test src/lib/visemePlayback.test.js`
Expected: PASS, 17 tests

- [ ] **Step 5: Verify the full suite**

Run: `npm test`
Expected: PASS, 43 tests total

---

## Task 5: Pose presets and the bone compositor

**Files:**
- Create: `frontend/src/lib/poses.js`
- Create: `frontend/src/lib/composite.js`
- Test: `frontend/src/lib/composite.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `POSES: Record<string, Record<string, {x,y,z}>>` with keys `'t-pose'`, `'relaxed'`
  - `POSE_NAMES: string[]`
  - `compositeBones({ pose, idleDeltas, manualOverrides, speaking, attenuation }) => Record<string, {x,y,z}>`
  - Plan 2 adds more entries to `POSES`; the compositor signature is final and must not change.

- [ ] **Step 1: Write the failing test**

Create `src/lib/composite.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { compositeBones } from './composite.js';
import { POSES, POSE_NAMES } from './poses.js';

const base = {
  pose: { head: { x: 0, y: 0, z: 0 }, chest: { x: 0.1, y: 0, z: 0 } },
  idleDeltas: {},
  manualOverrides: {},
  speaking: false,
  attenuation: 0.4,
};

describe('poses', () => {
  it('defines t-pose and relaxed', () => {
    expect(POSES['t-pose']).toBeDefined();
    expect(POSES.relaxed).toBeDefined();
    expect(POSE_NAMES).toContain('relaxed');
  });

  it('gives t-pose no rotations, since that is the VRM rest pose', () => {
    for (const rot of Object.values(POSES['t-pose'])) {
      expect(rot).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('mirrors left and right arms in the relaxed pose', () => {
    const { leftUpperArm, rightUpperArm } = POSES.relaxed;
    expect(leftUpperArm.z).toBeCloseTo(-rightUpperArm.z, 5);
  });

  it('gives every pose rotation all three axes', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      for (const [bone, rot] of Object.entries(pose)) {
        expect(Object.keys(rot).sort(), `${name}.${bone}`).toEqual(['x', 'y', 'z']);
      }
    }
  });
});

describe('compositeBones', () => {
  it('returns the pose unchanged when nothing else is active', () => {
    expect(compositeBones(base)).toEqual(base.pose);
  });

  it('adds idle deltas on top of the pose rather than replacing it', () => {
    const out = compositeBones({
      ...base,
      idleDeltas: { head: { x: 0.05, y: 0, z: 0 } },
    });
    expect(out.head.x).toBeCloseTo(0.05, 6);
    expect(out.chest.x).toBeCloseTo(0.1, 6); // untouched bone keeps its pose value
  });

  it('attenuates idle deltas while speaking', () => {
    const idleDeltas = { head: { x: 0.1, y: 0, z: 0 } };
    const idle = compositeBones({ ...base, idleDeltas });
    const talking = compositeBones({ ...base, idleDeltas, speaking: true });
    expect(talking.head.x).toBeCloseTo(0.04, 6); // 0.1 * 0.4
    expect(talking.head.x).toBeLessThan(idle.head.x);
  });

  it('lets a manual override replace the pose value for that bone only', () => {
    const out = compositeBones({
      ...base,
      manualOverrides: { head: { x: 0.9, y: 0, z: 0 } },
    });
    expect(out.head.x).toBe(0.9);
    expect(out.chest.x).toBeCloseTo(0.1, 6);
  });

  it('lets a manual override win over idle motion', () => {
    const out = compositeBones({
      ...base,
      idleDeltas: { head: { x: 0.05, y: 0, z: 0 } },
      manualOverrides: { head: { x: 0.9, y: 0, z: 0 } },
    });
    expect(out.head.x).toBe(0.9);
  });

  it('includes bones that appear only in idle or overrides', () => {
    const out = compositeBones({
      ...base,
      idleDeltas: { leftHand: { x: 0.2, y: 0, z: 0 } },
      manualOverrides: { rightHand: { x: 0.3, y: 0, z: 0 } },
    });
    expect(out.leftHand.x).toBeCloseTo(0.2, 6);
    expect(out.rightHand.x).toBe(0.3);
  });

  it('produces the same result regardless of input key order', () => {
    const a = compositeBones({
      ...base,
      pose: { head: { x: 1, y: 0, z: 0 }, chest: { x: 2, y: 0, z: 0 } },
    });
    const b = compositeBones({
      ...base,
      pose: { chest: { x: 2, y: 0, z: 0 }, head: { x: 1, y: 0, z: 0 } },
    });
    expect(a).toEqual(b);
  });

  it('does not mutate its inputs', () => {
    const pose = { head: { x: 0, y: 0, z: 0 } };
    const idleDeltas = { head: { x: 0.05, y: 0, z: 0 } };
    compositeBones({ ...base, pose, idleDeltas });
    expect(pose.head.x).toBe(0);
    expect(idleDeltas.head.x).toBe(0.05);
  });

  it('tolerates empty inputs', () => {
    expect(() =>
      compositeBones({
        pose: {},
        idleDeltas: {},
        manualOverrides: {},
        speaking: false,
        attenuation: 0.4,
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/lib/composite.test.js`
Expected: FAIL — cannot resolve `./composite.js`

- [ ] **Step 3: Write `src/lib/poses.js`**

```js
/**
 * Named pose presets: humanoid bone name -> Euler rotation in radians.
 *
 * Rotations are applied to VRM *normalized* bones, whose rest pose is a T-pose
 * with arms along the X axis. Normalized bones are what make a pose portable —
 * raw bone orientations differ between models, normalized ones do not.
 *
 * These values are eyeball-tuned starting points. Adjust them in the Pose tab
 * and use "Copy Pose JSON" to paste refined values back here.
 */

const ZERO = { x: 0, y: 0, z: 0 };

export const POSES = {
  't-pose': {
    leftUpperArm: { ...ZERO },
    rightUpperArm: { ...ZERO },
    leftLowerArm: { ...ZERO },
    rightLowerArm: { ...ZERO },
    spine: { ...ZERO },
    chest: { ...ZERO },
    head: { ...ZERO },
  },

  // Default. Arms down and slightly away from the body, elbows softly bent.
  relaxed: {
    leftUpperArm: { x: 0, y: 0, z: -1.25 },
    rightUpperArm: { x: 0, y: 0, z: 1.25 },
    leftLowerArm: { x: 0, y: -0.15, z: -0.15 },
    rightLowerArm: { x: 0, y: 0.15, z: 0.15 },
    spine: { x: 0.02, y: 0, z: 0 },
    chest: { ...ZERO },
    head: { ...ZERO },
  },
};

export const POSE_NAMES = Object.keys(POSES);

export const DEFAULT_POSE = 'relaxed';
```

- [ ] **Step 4: Write `src/lib/composite.js`**

```js
/**
 * Resolve every bone-writing layer into one final rotation set.
 *
 * Layer order, lowest priority first:
 *   1. pose             — the selected preset (or a lerped blend toward it)
 *   2. idleDeltas       — ADDITIVE procedural motion (head drift, breathing)
 *   3. manualOverrides  — REPLACES everything for that bone
 *
 * Idle is attenuated while speaking so head motion does not compete with the
 * mouth for the viewer's attention.
 *
 * This is a pure function over plain objects: no three.js, no React, no clock.
 * That is what makes layer precedence unit-testable without a GPU, and it is
 * the pattern the production implementation should copy.
 *
 * @param {{
 *   pose: Record<string, {x:number,y:number,z:number}>,
 *   idleDeltas: Record<string, {x:number,y:number,z:number}>,
 *   manualOverrides: Record<string, {x:number,y:number,z:number}>,
 *   speaking: boolean,
 *   attenuation: number,
 * }} input
 * @returns {Record<string, {x:number,y:number,z:number}>}
 */
export function compositeBones({
  pose = {},
  idleDeltas = {},
  manualOverrides = {},
  speaking = false,
  attenuation = 0.4,
}) {
  const out = {};
  const scale = speaking ? attenuation : 1;

  // Union of every bone any layer mentions, so a bone touched only by idle or
  // only by an override still appears in the result.
  const bones = new Set([
    ...Object.keys(pose),
    ...Object.keys(idleDeltas),
    ...Object.keys(manualOverrides),
  ]);

  for (const bone of bones) {
    // A manual edit is absolute — it short-circuits pose and idle entirely.
    const override = manualOverrides[bone];
    if (override) {
      out[bone] = { x: override.x, y: override.y, z: override.z };
      continue;
    }

    const p = pose[bone] ?? { x: 0, y: 0, z: 0 };
    const d = idleDeltas[bone] ?? { x: 0, y: 0, z: 0 };

    out[bone] = {
      x: p.x + d.x * scale,
      y: p.y + d.y * scale,
      z: p.z + d.z * scale,
    };
  }

  return out;
}
```

- [ ] **Step 5: Run tests and confirm they pass**

Run: `npm test src/lib/composite.test.js`
Expected: PASS, 13 tests

- [ ] **Step 6: Verify the full suite**

Run: `npm test`
Expected: PASS, 56 tests total

---

## Task 6: Control store

**Files:**
- Create: `frontend/src/stores/avatarStore.js`
- Test: `frontend/src/stores/avatarStore.test.js`

**Interfaces:**
- Consumes: `DEFAULTS` from `constants.js`, `DEFAULT_POSE` from `poses.js`
- Produces: `useAvatarStore` (zustand). State and actions:
  - State: `timeline`, `speechStartedAt`, `stiffness`, `rate`, `expressions`, `poseName`, `manualBones`, `idle:{blink,breathe,drift,lookAt}`, `debug:{weights,fps}`
  - Actions: `speak(timeline)`, `stopSpeaking()`, `setStiffness(n)`, `setRate(n)`, `setExpression(name, value)`, `resetExpressions()`, `setPose(name)`, `setBone(name, axis, value)`, `clearBone(name)`, `clearAllBones()`, `setIdle(key, value)`, `setDebug(partial)`
  - `speechStartedAt` is `null` when not speaking, otherwise a `performance.now()` timestamp.

Plan 2's control panel binds to these exact names. Do not rename them.

- [ ] **Step 1: Write the failing test**

Create `src/stores/avatarStore.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useAvatarStore } from './avatarStore.js';
import { DEFAULT_POSE } from '@/lib/poses.js';

const reset = () => useAvatarStore.getState().resetAll();
const s = () => useAvatarStore.getState();

describe('avatarStore', () => {
  beforeEach(reset);

  it('starts not speaking with an empty timeline', () => {
    expect(s().timeline).toEqual([]);
    expect(s().speechStartedAt).toBeNull();
  });

  it('starts on the default pose with no manual bone edits', () => {
    expect(s().poseName).toBe(DEFAULT_POSE);
    expect(s().manualBones).toEqual({});
  });

  it('records a start timestamp when speaking begins', () => {
    s().speak([{ viseme: 'aa', weight: 1, start: 0, dur: 100 }]);
    expect(s().timeline).toHaveLength(1);
    expect(typeof s().speechStartedAt).toBe('number');
  });

  it('clears the start timestamp when speaking stops', () => {
    s().speak([{ viseme: 'aa', weight: 1, start: 0, dur: 100 }]);
    s().stopSpeaking();
    expect(s().speechStartedAt).toBeNull();
  });

  it('sets and resets individual expressions', () => {
    s().setExpression('happy', 0.7);
    expect(s().expressions.happy).toBe(0.7);
    s().resetExpressions();
    expect(s().expressions).toEqual({});
  });

  it('sets a single bone axis without disturbing the others', () => {
    s().setBone('head', 'x', 0.5);
    s().setBone('head', 'y', 0.2);
    expect(s().manualBones.head).toEqual({ x: 0.5, y: 0.2, z: 0 });
  });

  it('clears one bone without clearing the rest', () => {
    s().setBone('head', 'x', 0.5);
    s().setBone('chest', 'x', 0.3);
    s().clearBone('head');
    expect(s().manualBones.head).toBeUndefined();
    expect(s().manualBones.chest).toBeDefined();
  });

  it('clears every bone at once', () => {
    s().setBone('head', 'x', 0.5);
    s().setBone('chest', 'x', 0.3);
    s().clearAllBones();
    expect(s().manualBones).toEqual({});
  });

  it('toggles idle behaviours independently', () => {
    expect(s().idle.blink).toBe(true);
    s().setIdle('blink', false);
    expect(s().idle.blink).toBe(false);
    expect(s().idle.breathe).toBe(true);
  });

  it('exposes a tunable parameter for every idle behaviour', () => {
    const { idle } = s();
    for (const key of [
      'blinkIntervalMin', 'blinkIntervalMax',
      'breathAmplitude', 'breathRate',
      'driftAmplitude', 'driftSpeed',
    ]) {
      expect(typeof idle[key], `missing idle param: ${key}`).toBe('number');
    }
  });

  it('sets idle parameters through the same action as the toggles', () => {
    s().setIdle('driftAmplitude', 0.2);
    expect(s().idle.driftAmplitude).toBe(0.2);
    expect(s().idle.drift).toBe(true); // unrelated keys untouched
  });

  it('updates tuning values', () => {
    s().setStiffness(30);
    s().setRate(1.5);
    expect(s().stiffness).toBe(30);
    expect(s().rate).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/stores/avatarStore.test.js`
Expected: FAIL — cannot resolve `./avatarStore.js`

- [ ] **Step 3: Write `src/stores/avatarStore.js`**

```js
import { create } from 'zustand';
import { DEFAULTS } from '@/lib/constants.js';
import { DEFAULT_POSE } from '@/lib/poses.js';

const ZERO = { x: 0, y: 0, z: 0 };

const initialState = {
  // Speech
  timeline: [],
  speechStartedAt: null,

  // Tuning
  stiffness: DEFAULTS.stiffness,
  rate: DEFAULTS.rate,

  // Expressions: sparse map of expression name -> 0..1. Absent means zero.
  expressions: {},

  // Pose
  poseName: DEFAULT_POSE,
  manualBones: {},

  // Idle — on/off plus the tunable parameters for each behaviour.
  idle: {
    blink: true,
    blinkIntervalMin: DEFAULTS.blinkIntervalMin,
    blinkIntervalMax: DEFAULTS.blinkIntervalMax,
    breathe: true,
    breathAmplitude: DEFAULTS.breathAmplitude,
    breathRate: DEFAULTS.breathRate,
    drift: true,
    driftAmplitude: DEFAULTS.headDriftAmplitude,
    driftSpeed: DEFAULTS.headDriftSpeed,
    lookAt: true,
  },

  // Debug readout, written from the render loop
  debug: { weights: {}, fps: 0 },
};

/**
 * Every control value in one store.
 *
 * The render loop reads this *transiently* via useAvatarStore.getState() inside
 * useFrame rather than subscribing, so dragging a slider mutates a value the
 * loop already reads each frame without triggering React reconciliation of the
 * Canvas subtree. Only the control panel subscribes reactively.
 */
export const useAvatarStore = create((set) => ({
  ...initialState,

  speak: (timeline) =>
    set({ timeline, speechStartedAt: performance.now() }),

  stopSpeaking: () => set({ speechStartedAt: null }),

  setStiffness: (stiffness) => set({ stiffness }),
  setRate: (rate) => set({ rate }),

  setExpression: (name, value) =>
    set((state) => ({ expressions: { ...state.expressions, [name]: value } })),

  resetExpressions: () => set({ expressions: {} }),

  setPose: (poseName) => set({ poseName }),

  setBone: (name, axis, value) =>
    set((state) => ({
      manualBones: {
        ...state.manualBones,
        [name]: { ...ZERO, ...state.manualBones[name], [axis]: value },
      },
    })),

  clearBone: (name) =>
    set((state) => {
      const next = { ...state.manualBones };
      delete next[name];
      return { manualBones: next };
    }),

  clearAllBones: () => set({ manualBones: {} }),

  setIdle: (key, value) =>
    set((state) => ({ idle: { ...state.idle, [key]: value } })),

  setDebug: (partial) =>
    set((state) => ({ debug: { ...state.debug, ...partial } })),

  resetAll: () => set({ ...initialState, expressions: {}, manualBones: {} }),
}));
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test src/stores/avatarStore.test.js`
Expected: PASS, 12 tests

- [ ] **Step 5: Verify the full suite**

Run: `npm test`
Expected: PASS, 68 tests total

---

## Task 7: Scene scaffold and the client boundary

**Files:**
- Modify: `frontend/src/app/page.js`
- Create: `frontend/src/components/AvatarStage.jsx`
- Create: `frontend/src/components/Scene.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `<AvatarStage/>` default export; `<Scene>{children}</Scene>` accepting children rendered inside the Canvas

**No unit tests.** This task is verified visually — it is Canvas plumbing, and a
jsdom test of it would assert nothing meaningful.

- [ ] **Step 1: Read the Next.js client-component docs**

Run: `cat node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md | head -80`

Confirm the `next/dynamic` + `ssr: false` pattern before writing code. `AGENTS.md`
requires this — Next 16.3 differs from training data.

- [ ] **Step 2: Write `src/components/Scene.jsx`**

```jsx
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

/**
 * The 3D stage: camera, lights, ground, orbit controls.
 *
 * Camera sits at chest height looking slightly up, which frames a standing
 * humanoid better than the default origin-facing camera.
 */
export default function Scene({ children }) {
  return (
    <Canvas
      camera={{ position: [0, 1.35, 2.2], fov: 30 }}
      shadows
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#1a1a1f']} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={1.4} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />

      <Grid
        args={[10, 10]}
        cellColor="#2e2e38"
        sectionColor="#3d3d4a"
        fadeDistance={12}
        infiniteGrid
      />

      {children}

      <OrbitControls target={[0, 1.25, 0]} maxPolarAngle={Math.PI / 1.8} />
    </Canvas>
  );
}
```

- [ ] **Step 3: Write `src/components/AvatarStage.jsx`**

```jsx
'use client';

import dynamic from 'next/dynamic';

// three.js touches `window` at import time, so the Canvas subtree must never be
// server-rendered. `ssr: false` is only permitted inside a 'use client' file —
// calling it from a Server Component is an error in the App Router.
const Scene = dynamic(() => import('./Scene.jsx'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-zinc-500">
      Loading scene…
    </div>
  ),
});

export default function AvatarStage() {
  return (
    <div className="flex h-screen w-full flex-col bg-zinc-900 lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <Scene />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.js`**

```jsx
import AvatarStage from '@/components/AvatarStage.jsx';

// Stays a Server Component. The 'use client' boundary and the ssr:false dynamic
// import both live one level down, in AvatarStage.
export default function Home() {
  return <AvatarStage />;
}
```

- [ ] **Step 5: Run the dev server and verify visually**

Run: `npm run dev`
Open: `http://localhost:3000`

Expected:
- A dark scene with a receding grid floor
- Mouse drag orbits the camera; scroll zooms
- **Browser console has no errors** — in particular no `window is not defined`

- [ ] **Step 6: Verify the production build compiles**

Run: `npm run build`
Expected: build succeeds. This is the real test of the SSR boundary — `next dev`
is more forgiving than `next build` about server/client mistakes.

---

## Task 8: Load the VRM

**Files:**
- Create: `frontend/src/lib/vrmIntrospect.js`
- Create: `frontend/src/components/MissingModelNotice.jsx`
- Create: `frontend/src/components/VrmAvatar.jsx`
- Modify: `frontend/src/components/AvatarStage.jsx`
- Modify: `frontend/.gitignore`
- Test: `frontend/src/lib/vrmIntrospect.test.js`

**Interfaces:**
- Consumes: `MODEL_URL`
- Produces:
  - `listExpressions(vrm) => string[]`
  - `listBones(vrm) => string[]`
  - `<VrmAvatar onLoaded={(vrm) => void} />`
  - `<MissingModelNotice progress={number|null} error={string|null} />`

`vrmIntrospect` takes plain duck-typed objects, so it is testable with fakes and
never imports three.js.

- [ ] **Step 1: Write the failing test**

Create `src/lib/vrmIntrospect.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { listExpressions, listBones } from './vrmIntrospect.js';

const fakeVrm = {
  expressionManager: {
    expressions: [
      { expressionName: 'happy' },
      { expressionName: 'aa' },
      { expressionName: 'blink' },
    ],
  },
  humanoid: {
    getNormalizedBoneNode: (name) =>
      ['head', 'chest', 'leftUpperArm'].includes(name) ? { name } : null,
  },
};

describe('listExpressions', () => {
  it('returns every expression name the model actually defines', () => {
    expect(listExpressions(fakeVrm)).toEqual(['happy', 'aa', 'blink']);
  });

  it('returns an empty array when there is no expression manager', () => {
    expect(listExpressions({})).toEqual([]);
    expect(listExpressions(null)).toEqual([]);
  });
});

describe('listBones', () => {
  it('returns only the humanoid bones present on the model', () => {
    const bones = listBones(fakeVrm);
    expect(bones).toContain('head');
    expect(bones).toContain('leftUpperArm');
    expect(bones).not.toContain('leftToes');
  });

  it('returns an empty array when there is no humanoid', () => {
    expect(listBones({})).toEqual([]);
    expect(listBones(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/lib/vrmIntrospect.test.js`
Expected: FAIL — cannot resolve `./vrmIntrospect.js`

- [ ] **Step 3: Write `src/lib/vrmIntrospect.js`**

```js
/**
 * The full VRM 1.0 humanoid bone vocabulary, in a sensible top-down order for UI.
 * Fingers are omitted deliberately — 30 extra sliders would drown the panel.
 */
export const HUMANOID_BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftEye', 'rightEye', 'jaw',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
];

/**
 * Every expression the *loaded model* defines.
 *
 * Read from the model rather than hardcoding VRM's preset list, because models
 * ship custom expressions beyond the presets — this project's model has a
 * non-preset `Surprised` group. A hardcoded list would work with one model and
 * silently drop capability on the next.
 *
 * three-vrm normalizes VRM 0.x names to the 1.0 vocabulary on load
 * (Joy->happy, Sorrow->sad, A->aa), so no version branching is needed here.
 */
export function listExpressions(vrm) {
  const expressions = vrm?.expressionManager?.expressions;
  if (!Array.isArray(expressions)) return [];
  return expressions.map((e) => e.expressionName).filter(Boolean);
}

/** Only those humanoid bones the loaded model actually has. */
export function listBones(vrm) {
  const humanoid = vrm?.humanoid;
  if (!humanoid?.getNormalizedBoneNode) return [];
  return HUMANOID_BONES.filter((name) => humanoid.getNormalizedBoneNode(name));
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test src/lib/vrmIntrospect.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Write `src/components/MissingModelNotice.jsx`**

```jsx
'use client';

import { MODEL_URL } from '@/lib/constants.js';

export default function MissingModelNotice({ progress, error }) {
  if (error) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
        <div className="pointer-events-auto max-w-md rounded-lg border border-red-900 bg-zinc-900/95 p-6 text-sm">
          <h2 className="mb-2 font-semibold text-red-400">Could not load the model</h2>
          <p className="mb-3 text-zinc-400">
            Expected a VRM file at{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-zinc-300">
              frontend/public{MODEL_URL}
            </code>
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-red-300">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  if (progress !== null && progress < 1) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-56 text-center">
          <div className="mb-2 text-sm text-zinc-400">
            Loading avatar… {Math.round(progress * 100)}%
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-zinc-400 transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 6: Write `src/components/VrmAvatar.jsx`** (loading only — the compositor arrives in Task 9)

```jsx
'use client';

import { useEffect, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { MODEL_URL } from '@/lib/constants.js';

export default function VrmAvatar({ onLoaded, onProgress, onError }) {
  const [vrm, setVrm] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (cancelled) return;
        const loaded = gltf.userData.vrm;

        // Strips unused joints/morphs. Meaningful on an 18MB model.
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);

        // VRM 0.x models face +Z; rotate so the avatar faces the camera.
        VRMUtils.rotateVRM0(loaded);

        loaded.scene.traverse((obj) => {
          obj.frustumCulled = false; // avoids pop-out when morphs move vertices
        });

        setVrm(loaded);
        onLoaded?.(loaded);
      },
      (event) => {
        if (cancelled || !event.total) return;
        onProgress?.(event.loaded / event.total);
      },
      (err) => {
        if (cancelled) return;
        onError?.(String(err?.message ?? err));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [onLoaded, onProgress, onError]);

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
```

- [ ] **Step 7: Wire it into `AvatarStage.jsx`**

Replace the file contents:

```jsx
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import MissingModelNotice from './MissingModelNotice.jsx';

const Scene = dynamic(() => import('./Scene.jsx'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-zinc-500">
      Loading scene…
    </div>
  ),
});

const VrmAvatar = dynamic(() => import('./VrmAvatar.jsx'), { ssr: false });

export default function AvatarStage() {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [, setVrm] = useState(null);

  const handleLoaded = useCallback((loaded) => {
    setVrm(loaded);
    setProgress(1);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-900 lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <Scene>
          <VrmAvatar
            onLoaded={handleLoaded}
            onProgress={setProgress}
            onError={setError}
          />
        </Scene>
        <MissingModelNotice progress={progress} error={error} />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add the model to `.gitignore`**

Append to `frontend/.gitignore`:

```
# VRM models — large binaries, user-supplied
*.vrm
*.vrma
```

- [ ] **Step 9: Verify visually**

Run: `npm run dev`

Expected:
- A progress bar appears, counts up, then disappears
- The character stands in the scene **facing the camera**
- Orbiting confirms it is a full 3D model
- Console has no errors

If the avatar faces away, `rotateVRM0` did not apply — confirm the model is VRM 0.x
(it is) and that the call is present.

- [ ] **Step 10: Verify the introspection tests still pass**

Run: `npm test`
Expected: PASS, 72 tests total

---

## Task 9: The compositor — visemes, idle motion, and speech input

**Files:**
- Create: `frontend/src/hooks/useVisemePlayback.js`
- Create: `frontend/src/hooks/useIdleMotion.js`
- Create: `frontend/src/components/SpeechInput.jsx`
- Modify: `frontend/src/components/VrmAvatar.jsx`
- Modify: `frontend/src/components/AvatarStage.jsx`
- Test: `frontend/src/hooks/idleMath.test.js`
- Create: `frontend/src/lib/idleMath.js`

**Interfaces:**
- Consumes: `sampleTimeline`, `dampWeights`, `zeroWeights`, `compositeBones`, `POSES`, `useAvatarStore`, `textToVisemes`
- Produces:
  - `blinkValue(elapsedMs, duration) => number`
  - `driftDeltas(tSec, amplitude, speed) => {x,y,z}`
  - `breathDelta(tSec, amplitude, rate) => {x,y,z}`
  - `<SpeechInput/>`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/idleMath.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { blinkValue, driftDeltas, breathDelta } from '@/lib/idleMath.js';

describe('blinkValue', () => {
  it('is closed at the midpoint of the blink', () => {
    expect(blinkValue(60, 120)).toBeCloseTo(1, 2);
  });

  it('is open at the start and end', () => {
    expect(blinkValue(0, 120)).toBeCloseTo(0, 2);
    expect(blinkValue(120, 120)).toBeCloseTo(0, 2);
  });

  it('is open outside the blink window', () => {
    expect(blinkValue(-10, 120)).toBe(0);
    expect(blinkValue(500, 120)).toBe(0);
  });

  it('never leaves the 0..1 range', () => {
    for (let t = -50; t <= 200; t += 3) {
      const v = blinkValue(t, 120);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('driftDeltas', () => {
  it('stays within the requested amplitude on every axis', () => {
    for (let t = 0; t < 200; t += 0.37) {
      const d = driftDeltas(t, 0.05, 0.35);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });

  it('produces different values on different axes, so motion is not a rigid tilt', () => {
    const d = driftDeltas(3.3, 0.05, 0.35);
    expect(d.x).not.toBeCloseTo(d.y, 4);
  });

  it('is deterministic for a given time', () => {
    expect(driftDeltas(7, 0.05, 0.35)).toEqual(driftDeltas(7, 0.05, 0.35));
  });

  it('returns zeros at zero amplitude', () => {
    expect(driftDeltas(5, 0, 0.35)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('breathDelta', () => {
  it('oscillates within amplitude on x only', () => {
    for (let t = 0; t < 60; t += 0.21) {
      const d = breathDelta(t, 0.02, 0.25);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(0.02 + 1e-9);
      expect(d.y).toBe(0);
      expect(d.z).toBe(0);
    }
  });

  it('actually varies over time', () => {
    // Sample at a quarter period, not a half: at rate 0.25, t=2 lands on
    // sin(pi) which equals sin(0), so comparing t=0 to t=2 can never pass.
    const a = breathDelta(0, 0.02, 0.25).x;
    const b = breathDelta(1, 0.02, 0.25).x;
    expect(a).not.toBeCloseTo(b, 4);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/hooks/idleMath.test.js`
Expected: FAIL — cannot resolve `@/lib/idleMath.js`

- [ ] **Step 3: Write `src/lib/idleMath.js`**

```js
/**
 * Procedural idle motion, as pure functions of time.
 *
 * Idle is not garnish. A face that is perfectly still between sentences reads as
 * dead, and no amount of lip-sync quality compensates. This is roughly thirty
 * lines and it does more perceptual work than the viseme pipeline.
 */

/** Blink envelope: 0 open, 1 fully closed, smooth in and out. */
export function blinkValue(elapsedMs, duration) {
  if (elapsedMs < 0 || elapsedMs > duration) return 0;
  // Half a sine period: 0 -> 1 -> 0 across the blink.
  return Math.sin((elapsedMs / duration) * Math.PI);
}

/**
 * Head drift as summed out-of-phase sines.
 *
 * Deliberately not a noise library. At ±3° the difference is invisible, and
 * incommensurable frequencies (0.31/0.53, 0.23/0.41…) never repeat visibly.
 * Each axis is normalized by 2 so the sum stays within amplitude.
 */
export function driftDeltas(tSec, amplitude, speed) {
  const t = tSec * speed;
  return {
    x: (amplitude * (Math.sin(t * 0.31) + Math.sin(t * 0.53))) / 2,
    y: (amplitude * (Math.sin(t * 0.23 + 1.7) + Math.sin(t * 0.41 + 0.6))) / 2,
    z: (amplitude * (Math.sin(t * 0.17 + 3.1) + Math.sin(t * 0.29 + 2.2))) / 2,
  };
}

/** Chest rise and fall. Slow, single axis. */
export function breathDelta(tSec, amplitude, rate) {
  return { x: amplitude * Math.sin(tSec * rate * Math.PI * 2), y: 0, z: 0 };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test src/hooks/idleMath.test.js`
Expected: PASS, 10 tests

- [ ] **Step 5: Write `src/hooks/useVisemePlayback.js`**

```js
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
```

- [ ] **Step 6: Write `src/hooks/useIdleMotion.js`**

```js
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
```

- [ ] **Step 7: Rewrite `src/components/VrmAvatar.jsx` as the compositor**

```jsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { MODEL_URL, VISEMES, DEFAULTS } from '@/lib/constants.js';
import { compositeBones } from '@/lib/composite.js';
import { POSES } from '@/lib/poses.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { useVisemePlayback } from '@/hooks/useVisemePlayback.js';
import { useIdleMotion } from '@/hooks/useIdleMotion.js';

export default function VrmAvatar({ onLoaded, onProgress, onError }) {
  const [vrm, setVrm] = useState(null);
  const stepVisemes = useVisemePlayback();
  const stepIdle = useIdleMotion();
  const lookTarget = useRef(new Vector3());
  const elapsed = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (cancelled) return;
        const loaded = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(loaded);
        loaded.scene.traverse((obj) => {
          obj.frustumCulled = false;
        });
        setVrm(loaded);
        onLoaded?.(loaded);
      },
      (event) => {
        if (!cancelled && event.total) onProgress?.(event.loaded / event.total);
      },
      (err) => {
        if (!cancelled) onError?.(String(err?.message ?? err));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [onLoaded, onProgress, onError]);

  useFrame((state, delta) => {
    if (!vrm) return;

    // Clamp dt so an alt-tab pause does not produce one enormous step.
    const dt = Math.min(delta, 0.1);
    elapsed.current += dt;
    const nowMs = performance.now();

    // Read transiently — subscribing here would re-render the Canvas on every
    // slider drag, which is exactly what the store exists to avoid.
    const s = useAvatarStore.getState();
    const speaking = s.speechStartedAt !== null;

    // ---------- BONES ----------
    const { blink, deltas } = stepIdle({ nowMs, tSec: elapsed.current, idle: s.idle });

    const bones = compositeBones({
      pose: POSES[s.poseName] ?? {},
      idleDeltas: deltas,
      manualOverrides: s.manualBones,
      speaking,
      attenuation: DEFAULTS.idleAttenuationWhileSpeaking,
    });

    for (const [name, rot] of Object.entries(bones)) {
      const node = vrm.humanoid?.getNormalizedBoneNode(name);
      if (node) node.rotation.set(rot.x, rot.y, rot.z);
    }

    // ---------- EXPRESSIONS ----------
    const em = vrm.expressionManager;
    if (em) {
      // Emotions first, from the control panel.
      for (const [name, value] of Object.entries(s.expressions)) {
        em.setValue(name, value);
      }

      // Then visemes. Note we do NOT hand-suppress these when an emotion is
      // active — VRM's own override flags arbitrate that inside vrm.update().
      const weights = stepVisemes({
        timeline: s.timeline,
        speechStartedAt: s.speechStartedAt,
        nowMs,
        dtSec: dt,
        stiffness: s.stiffness,
      });
      for (const v of VISEMES) em.setValue(v, weights[v]);

      // Auto-blink, unless the panel is driving blink manually.
      if (s.expressions.blink === undefined) em.setValue('blink', blink);

      s.setDebug({ weights, fps: Math.round(1 / dt) });
    }

    // ---------- FINALIZE ----------
    if (s.idle.lookAt && vrm.lookAt) {
      state.camera.getWorldPosition(lookTarget.current);
      vrm.lookAt.lookAt(lookTarget.current);
    }

    // MUST be last, exactly once per frame. This is what applies the accumulated
    // expression values, resolves override flags, and advances spring bones.
    // Calling it before the setValue calls, or twice, produces subtly wrong
    // output that is painful to debug.
    vrm.update(dt);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
```

- [ ] **Step 8: Write `src/components/SpeechInput.jsx`**

```jsx
'use client';

import { useState } from 'react';
import { textToVisemes, timelineDuration } from '@/lib/textToVisemes.js';
import { useAvatarStore } from '@/stores/avatarStore.js';

export default function SpeechInput() {
  const [text, setText] = useState('Hello there. I am a talking avatar, and my mouth moves with the words.');
  const speak = useAvatarStore((s) => s.speak);
  const stopSpeaking = useAvatarStore((s) => s.stopSpeaking);
  const stiffness = useAvatarStore((s) => s.stiffness);
  const setStiffness = useAvatarStore((s) => s.setStiffness);
  const rate = useAvatarStore((s) => s.rate);
  const setRate = useAvatarStore((s) => s.setRate);

  const handleSpeak = () => {
    const timeline = textToVisemes(text, { rate });
    if (timeline.length === 0) return;
    speak(timeline);
    // No audio to end the utterance, so schedule the stop ourselves.
    setTimeout(stopSpeaking, timelineDuration(timeline) + 200);
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-zinc-300">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full resize-none rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-500"
      />

      <button
        onClick={handleSpeak}
        className="rounded bg-zinc-200 px-4 py-2 font-medium text-zinc-900 transition-colors hover:bg-white"
      >
        Speak
      </button>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-xs text-zinc-500">
          <span>Stiffness</span>
          <span className="font-mono">{stiffness.toFixed(0)}</span>
        </span>
        <input
          type="range" min="2" max="60" step="1" value={stiffness}
          onChange={(e) => setStiffness(Number(e.target.value))}
          className="accent-zinc-400"
        />
        <span className="text-[11px] text-zinc-600">Low is mushy, high is crisp.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-xs text-zinc-500">
          <span>Rate</span>
          <span className="font-mono">{rate.toFixed(2)}×</span>
        </span>
        <input
          type="range" min="0.5" max="2" step="0.05" value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="accent-zinc-400"
        />
        <span className="text-[11px] text-zinc-600">Applied when you press Speak.</span>
      </label>
    </div>
  );
}
```

- [ ] **Step 9: Add the sidebar to `AvatarStage.jsx`**

Add the import:

```jsx
import SpeechInput from './SpeechInput.jsx';
```

And replace the returned JSX:

```jsx
  return (
    <div className="flex h-screen w-full flex-col bg-zinc-900 lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <Scene>
          <VrmAvatar
            onLoaded={handleLoaded}
            onProgress={setProgress}
            onError={setError}
          />
        </Scene>
        <MissingModelNotice progress={progress} error={error} />
      </div>
      <aside className="w-full shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-900 lg:h-screen lg:w-80 lg:border-l lg:border-t-0">
        <SpeechInput />
      </aside>
    </div>
  );
```

- [ ] **Step 10: Verify the whole thing visually**

Run: `npm run dev`

Expected:
- Avatar stands in the `relaxed` pose — arms down, not a T-pose
- **It blinks** every few seconds, at irregular intervals
- Head drifts slowly; chest rises and falls
- Eyes track the camera as you orbit
- Pressing **Speak** animates the mouth for the length of the text, then it settles closed
- Lips visibly **close** on `m`, `b`, `p` — check with "mama bapa mumble"
- Dragging **Stiffness** while speaking changes crispness with no stutter
- Console has no errors

- [ ] **Step 11: Verify the full test suite**

Run: `npm test`
Expected: PASS, 82 tests total

- [ ] **Step 12: Verify the production build**

Run: `npm run build`
Expected: build succeeds with no SSR errors.

---

## Done

At this point you have a standing VRM avatar that blinks, breathes, drifts, tracks the
camera, and animates its mouth through typed text — with the compositor, the timeline
generator, and the layer-precedence logic all under unit test.

Plan 2 (`2026-08-06-vrm-avatar-control-surface.md`) adds the full control surface:
per-expression sliders driven by model introspection, pose presets and per-bone
manipulation, `.vrma` clip playback, and the debug readout.
