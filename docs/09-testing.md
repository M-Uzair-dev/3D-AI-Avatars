# Testing

**Job of this doc:** record what is tested, why the suite runs without a browser, and
what is knowingly not covered.

See also: [02-architecture.md](02-architecture.md) (the purity boundary that makes
this possible) · [11-open-questions.md](11-open-questions.md) (verification gaps)

---

## The suite

```sh
cd frontend && npm test        # vitest run
npm run test:watch
```

**422 tests across 22 files, ~6 seconds.** `environment: 'node'` — no jsdom, no
headless browser, no WebGL context. The `@` alias resolves to `src/`.

| File | Tests | Covers |
|---|---|---|
| [aliveness.test.js](../frontend/src/lib/aliveness.test.js) | 62 | sway, weight shift, gaze, hands, gestures, states, mirroring |
| [composite.test.js](../frontend/src/lib/composite.test.js) | 31 | layer precedence, `lerpPoses`, presets, arms behind |
| [blink.test.js](../frontend/src/lib/blink.test.js) | 14 | envelope shape, doubles, saccade coupling |
| [visemePlayback.test.js](../frontend/src/lib/visemePlayback.test.js) | 17 | sampling, damping |
| [textToVisemes.test.js](../frontend/src/lib/textToVisemes.test.js) | 15 | tokenization, timeline layout |
| [avatarStore.test.js](../frontend/src/stores/avatarStore.test.js) | 21 | actions, bone seeding, and that muting or changing model stops a running utterance |
| [idleMath.test.js](../frontend/src/hooks/idleMath.test.js) | 6 | drift, breath |
| [visemeMap.test.js](../frontend/src/lib/visemeMap.test.js) | 8 | table shape and invariants |
| [vrmIntrospect.test.js](../frontend/src/lib/vrmIntrospect.test.js) | 7 | enumeration against a stub `vrm`, and that CLIP_BONES covers the whole vocabulary |
| [constants.test.js](../frontend/src/lib/constants.test.js) | 10 | the viseme set, that MODEL_URL names a file that exists, and that every model has its own distinct voice |
| [vrmMeta.test.js](../frontend/src/lib/vrmMeta.test.js) | 7 | GLB metadata parsing, both VRM versions |
| [clips.test.js](../frontend/src/lib/clips.test.js) | 10 | the clip fade envelope, both ends |
| [framing.test.js](../frontend/src/lib/framing.test.js) | 8 | the head lands at the same screen fraction at any model height |
| [chunkText.test.js](../frontend/src/lib/chunkText.test.js) | 29 | sentence splitting, the merge floor, over-long fallbacks, the pause each chunk ending earns, and clause break tags |
| [voiceId.test.js](../frontend/src/lib/voiceId.test.js) | 9 | qualified voice ids, and that an unknown prefix stays part of the id |
| [phonemes.test.js](../frontend/src/lib/phonemes.test.js) | 20 | IPA parsing, longest-match, contiguity against a measured duration. Covers the fix for the mouth, not code on the current path — see [15](15-voice-and-tts.md) |
| [wav.test.js](../frontend/src/lib/wav.test.js) | 9 | RIFF header walking, duration, truncation |

> `idleMath.test.js` lives under `src/hooks/` but tests `src/lib/idleMath.js`. That is
> a misplacement, not a signal about where the code belongs.

## Why it runs in Node

Because `src/lib/**` imports neither React nor three.js. That boundary is the reason
the two genuinely tricky pieces of logic — text→timeline and layer resolution — are
testable in milliseconds instead of through a rendered avatar.

The tripwire: **if a test needs jsdom, the boundary was drawn in the wrong place.**
Fix the boundary, not the test environment.

**One test touches the filesystem**, and it is the exception that proves the rule:
`constants.test.js` checks that `MODEL_URL` names a `.vrm` that actually exists in
`public/`. It earns it because that constant's entire job is to name a real file, and
nothing else in the project can tell you whether it does. It replaced an assertion that
pinned the *filename*, which was green right up to the moment that file was deleted and
then reported "the string changed" rather than "the app cannot load." See
[five ways a test here has lied](#five-ways-a-test-here-has-lied) — this is the
fifth.

## What the tests actually assert

**`textToVisemes`** — known input produces the expected sequence; timings are
monotonic and contiguous (`start[n+1] === start[n] + dur[n]`, exactly, no float
drift); bilabials `b`/`p`/`m` produce CLOSED segments; digraphs match before single
letters, so `"the"` is not `t`+`h`+`e`; punctuation produces pauses of the stated
length; the rate multiplier scales total duration proportionally; empty strings,
whitespace, digits and unknown characters degrade without throwing. `rng` is injected
so runs are deterministic.

**`composite`** — a manual bone edit overrides the preset for that bone and no other;
idle deltas are additive on top of pose rather than replacing it; attenuation applies
while speaking and not otherwise; clearing a manual edit restores the preset value;
layer order is stable regardless of input key ordering.

**`visemePlayback`** — weights at t=0, mid-timeline and past-end; everything converges
to 0 after the timeline completes; **damping is frame-rate independent**, i.e. one
16 ms step and two 8 ms steps land within tolerance.

**`avatarStore`** — each action's effect, plus the two bone-seeding cases: a first edit
seeds from the active preset, and a bone the preset does not mention seeds from zero.

**`aliveness`** — the largest file, and almost all of it guards a failure that actually
happened rather than a hypothetical. The categories worth knowing:

- **Bone names exist.** `relaxedHandPose`, the gestures and the state overlays are all
  checked against `FINGER_BONES` / `HUMANOID_BONES`. This is the highest-value check in
  the suite: `getNormalizedBoneNode` returns null for a typo, the frame loop skips it,
  and the effect simply never happens with nothing reported anywhere.
- **Claims about coupling.** The spine counter-rotates against the hips; the arms are
  driven from a later phase than the hips. Those are the two sentences the sway module
  exists to be true.
- **Directions oppose.** Work gaze points down where a thinking avert points up;
  `listening` leans opposite to `speaking`. The blink envelope shuts faster than it
  opens, and microsaccades run several times faster than breathing. See below for why
  this class matters.
- **Structural rules.** Every key in a gesture names the same bone set; a gesture's
  envelope starts and ends at zero; a held gesture sits at full weight at its hold point;
  the scratch sweep moves whichever axis actually carries the elbow fold.
- **The roster is exactly what it should be**, by name. Added after a text-range deletion
  of one gesture silently removed two neighbours and every other test kept passing —
  because they all *iterate* `GESTURES`. **Iterating a collection can never tell you
  something has fallen out of it.**

**`clips`** — the fade envelope is zero at both ends and one through the middle, rises
and falls monotonically, and **never steps by more than a tenth between adjacent frames
at 60 fps**. That last one is the assertion that matters: the bug was a clip applied at
full weight on its first frame, and a bound that only asks whether the weight is *in
range* passes the entire time — 1.0 is a perfectly legal weight. It is the same lesson as
the invisible state overlays, inverted. Bound the *step*, not the value.

## What is not unit tested, and why

`VrmAvatar`, `Scene`, and every control panel component. Testing them would require a
GPU context to assert almost nothing — the components contain no arithmetic worth
checking, by design.

They are verified **visually, by running the app**. That is what the Debug tab is for:
it makes viseme weights, FPS, and resolved override flags legible at a glance, so
"looks wrong" becomes "this flag is amber".

### `no-undef` is the one automated check they get

`eslint-config-next` turns `no-undef` **off**, because it is redundant under TypeScript
and that is what the config is tuned for. This project is plain JS, so with it off
nothing in the toolchain checks that an identifier exists.

That is not theoretical. A local `framing` in `Scene.jsx` was renamed to `initial` and
one JSX usage was missed. `npm test` passed — the components have no tests, by design.
`npm run build` passed — a reference to a name that does not exist is valid JavaScript
until it runs. The app was a blank screen with `ReferenceError: framing is not defined`,
and the work had been reported as verified.

The rule is now on for `src/**`, with browser and node globals declared. It was checked
by putting the bug back and watching lint fail on it, rather than by assuming it would —
the same "verify a difference" habit as the rest of this doc.

> **A green suite and a green build say nothing about a component in this project.**
> They contain no arithmetic worth testing, which is exactly why lint is the only net
> under them.

## Five ways a test here has lied

Each of these passed while the thing it covered was broken. They are the most
transferable content in this doc.

### 1. It verified symmetry, not correctness

`composite.test.js` asserted the arms **mirror** each other. True while the elevation
axis was inverted and the avatar stood in a permanent cheer — and true again, later,
while the default pose was a symmetric mannequin.

> A test can verify symmetry. It cannot tell you which way is down.

It has since been replaced by its opposite: the default pose must be **asymmetric**. The
old test would have blocked the fix.

### 2. It bounded a value from one side only

The conversational-state overlays had an upper bound and no lower one. They shipped at
half a degree — invisible — and the check passed comfortably.

> *"Too subtle to perceive"* passes every check that asks whether a value is small.

Several tests now assert a floor as well as a ceiling.

### 3. It iterated the collection it was meant to police

Every gesture test loops over `GESTURES`. When a deletion removed two gestures that were
not meant to go, all of them passed on the smaller collection. Only an assertion naming
the expected members could catch it.

### 4. It pinned a name instead of a fact

`constants.test.js` asserted `MODEL_URL === '/model.vrm'`. That is a restatement of the
source, not a check on it: it could only fail when someone edited the constant, which is
the one moment they already know what they are doing. When the models were filtered down
to those licensed for commercial use and the file it named was deleted, the test failed —
but it reported a changed string rather than an app that could no longer load its model.

> A test that asserts a value equals itself tells you when it changed, never whether it
> is right.

It now checks the file exists.

### 5. It passed vacuously

A held-gesture test looped over gestures with `hold: true` and skipped the rest. With
none holding, it asserted nothing and reported success. It now checks every gesture.

## What a green suite still cannot tell you

Anything spatial. Record what you actually observed, not what the code implies.

The counterpart is worth stating too, because it is the one structural trick that has
repeatedly worked: **verify a difference rather than a correctness.** A gaze sign was
wrong for the entire life of the function, directly beneath a comment describing the
opposite, because the code and the comment were only ever read together and both sounded
right. It surfaced the instant a second behaviour had to point the other way and a test
compared the two directions.

## Known gaps in coverage

Small, none blocking, all deliberate:

- `timelineDuration` has no direct unit test, despite `SpeechTab` depending on it.
- `sampleTimeline` has no non-mutation test (`dampWeights` does).
