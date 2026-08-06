# VRM Avatar Reference Implementation — Design

**Date:** 2026-08-06
**Status:** Approved, scope expanded 2026-08-06 (expressions + poses)

## Goal

A **reference implementation** for driving a VRM avatar in React. Code written here will
be used as the worked example for a later production implementation, so it must
demonstrate the full control surface, not just a single effect.

A VRM character stands on screen. The user can:

- type text and see the mouth animate through the visemes that text would produce
- drive every expression the loaded model exposes, individually
- pose the character via presets or direct per-bone manipulation
- tune and toggle every idle behavior
- inspect live state while it runs

**Explicitly out of scope:** audio. No TTS, no microphone, no sound playback. Timing is
derived entirely from text. There is no LLM and no backend.

## Why no audio changes the design

Removing audio removes the hardest problem in this genre — aligning phoneme timing to a
playing waveform under streaming latency. It also lowers the accuracy bar: with no sound
to compare against, a viewer cannot detect that a given consonant uses an approximate
mouth shape. Silent lip movement is judged on **rhythm and shape variety**, not phonetic
correctness. This is what makes VRM's 5-viseme limit acceptable.

## Model format: VRM

Using VRM via `@pixiv/three-vrm`, rather than Ready Player Me GLB.

| | VRM | Ready Player Me |
|---|---|---|
| Mouth shapes | 5 (`aa`, `ih`, `ou`, `ee`, `oh`) | 15 Oculus visemes incl. consonants |
| API | `vrm.expressionManager.setValue('aa', 0.8)` | name → index into `morphTargetDictionary` |
| Expressions | Standardized presets + model-defined customs | 52 ARKit blendshapes |
| Skeleton | **Standardized humanoid bone names** | Varies |
| Look | Anime / VTuber | Realistic human |

**Rationale:** VRM normalizes both the expression system *and* the skeleton, so the same
code drives any model with zero per-model plumbing. For a reference implementation that
portability matters more than viseme count, and the missing consonant shapes are
neutralized by the no-audio constraint. Accepted tradeoff: anime aesthetic.

## Dependency versions (verified 2026-08-06)

| Package | Version | Purpose |
|---|---|---|
| `@react-three/fiber` | 9.7.0 | peer `react >=19 <19.3`; project has 19.2.8 ✓ |
| `@react-three/drei` | 10.7.8 | OrbitControls, Environment, helpers |
| `three` | 0.185.1 | |
| `@pixiv/three-vrm` | 3.5.5 | peer `three >=0.137` ✓ |
| `@pixiv/three-vrm-animation` | 3.5.5 | `.vrma` clip playback (optional module) |
| `zustand` | 5.0.14 | control state, read transiently in `useFrame` |
| `vitest` | latest | test runner (dev) |

### Why zustand rather than React state

With this many controls, `useState` + prop drilling would re-render the Canvas subtree on
every slider drag. The r3f-idiomatic pattern is to keep control values in a store read
**transiently** inside `useFrame` via `useAvatarStore.getState()`, so dragging a slider
mutates a value the render loop already reads each frame without triggering React
reconciliation. Only the control panel itself subscribes reactively.

This is exactly the sort of pattern the reference exists to demonstrate.

## Architecture

```
frontend/src/
  app/page.js                     Server Component shell
  components/
    AvatarStage.jsx               'use client' — dynamic({ssr:false}) boundary + layout
    Scene.jsx                     <Canvas>, lights, ground, OrbitControls
    VrmAvatar.jsx                 THE COMPOSITOR — single write point per frame
    MissingModelNotice.jsx        shown when public/avatar.vrm is absent
    ControlPanel/
      index.jsx                   tab shell
      SpeechTab.jsx               text input, stiffness, rate
      ExpressionTab.jsx           auto-generated slider per model expression
      PoseTab.jsx                 preset select + per-bone XYZ rotation
      IdleTab.jsx                 blink / breathe / drift / lookAt toggles + params
      DebugTab.jsx                live weights, active viseme, FPS
  lib/
    visemeMap.js                  grapheme→viseme table, duration constants
    textToVisemes.js              PURE: text → timeline. No three.js, no React.
    poses.js                      named pose presets → bone rotation maps
    vrmIntrospect.js              enumerate expressions + present bones from a loaded VRM
    composite.js                  PURE: layer inputs → final weight/rotation set
  hooks/
    useVisemePlayback.js          timeline + clock → mouth weights
    useIdleMotion.js              blink / breathe / drift → additive deltas
  stores/
    avatarStore.js                zustand: all control values
frontend/public/
  model.vrm                       user-supplied, present (18 MB, VRM 0.x)
  animations/*.vrma               optional, user-supplied
```

### Target model (inspected 2026-08-06)

`frontend/public/model.vrm` — 18 MB, glTF binary, declares the **`VRM` extension (0.x)**,
not `VRMC_vrm` (1.0). Observed blendshape names include the VRM 0.x preset set
(`Joy`, `Angry`, `Sorrow`, `Fun`, `Neutral`, `Blink`) plus at least one non-preset custom
group (`Surprised`), and viseme groups in mixed casing.

Two implications:

1. **Naming is handled for us.** `@pixiv/three-vrm` v3 loads both 0.x and 1.0 and
   normalizes 0.x names to the 1.0 vocabulary — `Joy→happy`, `Sorrow→sad`, `Fun→relaxed`,
   `A→aa`, `I→ih`, `U→ou`, `E→ee`, `O→oh`. Application code targets the 1.0 names and
   stays version-agnostic. Do not branch on VRM version anywhere.

2. **Override support is reduced.** See Part 2.

The presence of a custom `Surprised` group confirms the enumerate-don't-hardcode decision:
a hardcoded preset list would silently drop capability this model actually has.

**Load-bearing boundary:** `textToVisemes.js` and `composite.js` import nothing from
three.js or React. The two pieces of genuinely tricky logic — text→timeline and
layer resolution — are pure functions testable in Node in milliseconds. `VrmAvatar` is
deliberately thin: it gathers inputs, calls the pure compositor, and writes the result.

### Next.js 16 constraint

`next/dynamic` with `ssr: false` remains correct, but in the App Router it **must be
called from within a `'use client'` file** — it is not permitted in a Server Component.
So `page.js` stays a Server Component and renders `<AvatarStage/>`, which carries
`'use client'` and dynamically imports `Scene.jsx`. three.js touches `window` at import
time, so the Canvas subtree must never be server-rendered.

Verified against `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`.

---

## Part 1 — Text to visemes

```
"Hi there, friend."
  ├─ tokenize: longest-match-first digraphs (th, sh, ch, ng, oo, ee, ai, ou …)
  │            then fall through to single letters
  ├─ map each token → one of 5 VRM visemes, or CLOSED
  ├─ assign durations
  ▼
[{viseme:'ih', start:0, dur:60}, {viseme:'aa', start:60, dur:125}, …]
```

### Duration table

| Segment | Duration |
|---|---|
| Vowel | 110–140 ms (randomized per segment) |
| Consonant | 50–70 ms |
| Word boundary | 40 ms CLOSED |
| `,` `;` `:` | 150 ms CLOSED |
| `.` `!` `?` | 350 ms CLOSED |

Jitter is applied per segment so repeated words do not animate identically. A global
**rate multiplier** (0.5×–2×) scales all durations, exposed in the Speech tab.

### Viseme mapping

Vowels map directly: `a→aa`, `e→ee`, `i→ih`, `o→oh`, `u→ou`. Digraphs match before single
letters so `ee`, `oo`, `ou`, `ai`, `th`, `sh`, `ch`, `ng` resolve as units. Consonants map
to an approximate open shape at reduced weight (0.3–0.5), **except bilabials.**

> **The critical rule:** `b`, `p`, `m` must drive every mouth weight to **zero** — lips
> visibly together. This single cue is what reads as speech to a viewer, more than any
> vowel shape. Without it the animation looks like a fish. This gets a dedicated test.

### Playback and co-articulation

Each frame computes a target weight per viseme and applies exponential damping:

```js
w += (target - w) * (1 - Math.exp(-STIFFNESS * dt))
```

This produces co-articulation for free — shapes bleed into neighbors the way real speech
does — and reduces tuning to a single `STIFFNESS` constant controlling crisp vs. mushy
articulation. Frame-rate independent by construction (`dt` in the exponent), so behavior
is identical at 60 Hz and 144 Hz. Exposed as a slider.

---

## Part 2 — Expressions

### Dynamic enumeration, not a hardcoded list

`vrmIntrospect.js` reads `vrm.expressionManager.expressions` from the **loaded model** and
the Expression tab generates one slider per expression found. VRM 1.0 defines presets
(`happy`, `angry`, `sad`, `relaxed`, `surprised`, `neutral`, `blink`, `blinkLeft`,
`blinkRight`, `lookUp/Down/Left/Right`) but individual models ship custom expressions
beyond these.

Hardcoding the preset list would make the reference work with one model and silently drop
half the capability of the next. Enumerating means any VRM the user loads is fully
controllable. **This is the correct pattern for the production implementation to copy.**

Each slider is 0.0–1.0 (not a toggle), so expressions can be blended and held partially.

### Conflict resolution — use the format's own mechanism

VRM 1.0 expressions carry `overrideMouth`, `overrideBlink`, and `overrideLookAt`
properties, each `'none' | 'block' | 'blend'`. `three-vrm`'s expression manager applies
these automatically during `vrm.update()`.

The design **uses this rather than reinventing it**. The compositor does not manually
suppress visemes when an emotion is active — it writes both and lets the expression
manager arbitrate per the model's own declarations.

### VRM 0.x limitation (applies to the current model)

VRM 0.x predates the three-state override flags. It has only boolean `ignoreMouth`,
`ignoreBlink`, `ignoreLookAt` on blendshape groups, which `three-vrm` maps to `'block'` or
`'none'` — **`'blend'` is unavailable**. On a 0.x model an emotion either fully suppresses
visemes or fully collides with them; there is no partial mix.

This is a model-format property, not something to code around, and attempting to
hand-roll partial blending would defeat the purpose of using the format's own mechanism.
The design's response is to make it **visible rather than mysterious**: the Debug tab
displays each active expression's resolved override values alongside the final applied
weights, so when an emotion visibly swallows the mouth animation the reason is on screen.

Practical consequence for the reference: emotion sliders and speech may not compose the
way a VRM 1.0 model would. That behavior should be documented in the code, not patched.

---

## Part 3 — Poses

### Preset poses

`poses.js` defines named poses as maps of humanoid bone name → Euler rotation:

`t-pose` · `relaxed` (default idle, arms down and slightly out) · `arms-crossed` ·
`hands-on-hips` · `waving` · `pointing` · `thinking`

Poses are applied to **normalized** humanoid bones via
`vrm.humanoid.getNormalizedBoneNode(name)`, which is the VRM abstraction that makes a
pose portable across models with different rest orientations. Switching pose lerps bone
rotations toward the target over ~400ms rather than snapping.

### Per-bone manipulation

The Pose tab lists every humanoid bone actually present on the loaded model (again via
introspection, not a hardcoded list) with X/Y/Z rotation sliders. Manual bone edits
override the preset for that bone only; a per-bone reset returns it to the preset value,
and a global reset returns everything.

Optional-but-cheap addition: a "copy pose as JSON" button, so a pose tuned by hand in the
panel can be pasted straight into `poses.js` as a new preset. Small, and it makes the
reference genuinely useful as an authoring tool.

### VRMA animation clips (optional module)

`@pixiv/three-vrm-animation` loads `.vrma` files — the VRM ecosystem's native animation
format — and plays them through three.js `AnimationMixer`. The Pose tab exposes a clip
list populated from `public/animations/`, with play/pause and a weight slider for blending
against the static pose.

Included because body animation is how this would really be driven in production, and the
reference should show the hook point. It degrades gracefully: no `.vrma` files present
means an empty clip list and a note, exactly as with the missing model.

---

## Part 4 — The compositor

This is the heart of the reference. Every frame, `VrmAvatar`'s `useFrame` runs a fixed
order. Layers are applied as **absolute writes, never accumulation**, so there is no drift
across frames.

```
1. Read control state transiently: useAvatarStore.getState()

BONES
2. Base:     set each humanoid bone from the active pose preset (lerped)
3. Clips:    apply VRMA mixer output at its blend weight, if playing
4. Idle:     ADD head drift + breathing deltas
             (attenuated to ~40% while speaking, so idle doesn't fight the mouth)
5. Manual:   OVERWRITE any bone the user has explicitly edited

EXPRESSIONS
6. Emotion:  setValue() for every manually-set expression
7. Viseme:   setValue() for the 5 mouth shapes from playback
8. Blink:    setValue('blink') from the auto-blink timer, unless manually overridden

FINALIZE
9. lookAt target update (camera / manual / off)
10. vrm.update(delta)   ← MUST be last, exactly once
```

**Step 10 is a real gotcha worth documenting in the code:** `vrm.update(delta)` is what
actually applies accumulated expression values, resolves override flags, and advances
spring bones. Calling it before setting values, or more than once per frame, produces
subtly wrong output that is painful to debug.

The ordering logic in steps 2–8 lives in `composite.js` as a pure function taking plain
objects and returning a plain object of final values. `VrmAvatar` only performs the
resulting writes. This makes precedence unit-testable without a GPU.

---

## Part 5 — Idle layer

Runs every frame regardless of speaking state. Not garnish — a perfectly still face reads
as dead. Every parameter is exposed in the Idle tab, each independently toggleable.

| Behavior | Implementation | Exposed params |
|---|---|---|
| Blink | `setValue('blink')`, ~120ms close/open curve | on/off, min/max interval (default 2–6 s) |
| Head drift | ±3° on `head` bone, summed out-of-phase sines | on/off, amplitude, speed |
| Breathing | slow sine on `chest` bone | on/off, amplitude, rate |
| Eye contact | `vrm.lookAt.target` | camera / manual XY / off |

Summed out-of-phase sines are used instead of a noise library — cheap, dependency-free,
and visually indistinguishable at this amplitude.

---

## Part 6 — Model loading

The model path is a single exported constant (`/model.vrm`), not scattered string
literals, so swapping models is a one-line change.

**Loading state.** At 18 MB this is not an instant load — on a cold cache it is a visible
wait. `GLTFLoader`'s `onProgress` callback drives a percentage readout; the scene,
lighting, ground, camera controls, and full control panel render immediately and remain
interactive while the model streams in.

**Missing / failed model.** Load failure is caught, not thrown. `MissingModelNotice`
renders in place of the avatar with the expected path and the error, while everything else
stays live. This keeps the viseme pipeline buildable and testable independent of the
asset, and makes a swapped-in broken model diagnosable instead of a blank screen.

An ignore entry for `*.vrm` is added to `frontend/.gitignore` regardless, so an 18 MB
binary is never committed if the project is later put under version control.

---

## Testing

Vitest, added as a dev dependency.

**`textToVisemes` (pure — primary test surface):**
- Known input produces expected viseme sequence
- Timings monotonic and contiguous: `start[n+1] === start[n] + dur[n]`
- Bilabials (`b`, `p`, `m`) produce CLOSED segments
- Digraphs match before single letters (`"the"` does not tokenize as `t`+`h`+`e`)
- Punctuation produces pauses of the specified length
- Rate multiplier scales total duration proportionally
- Empty string, whitespace-only, digits, unknown characters degrade without throwing

**`composite` (pure — layer precedence):**
- Manual bone edit overrides pose preset for that bone and no other
- Idle deltas are additive on top of pose, not replacing it
- Idle attenuation applies while speaking and not while idle
- Clearing a manual edit restores the preset value
- Layer order is stable regardless of input key ordering

**`useVisemePlayback` (fake clock):**
- Weights at t=0, mid-timeline, past-end
- All weights converge to 0 after the timeline completes
- Damping frame-rate independent: 1×16ms vs 2×8ms lands within tolerance

**Not unit tested:** `VrmAvatar`, `Scene`, control panel components. Verified visually by
running the app — which is what the Debug tab is for.

---

## Risks

| Risk | Mitigation |
|---|---|
| English spelling is irregular; grapheme rules mispronounce words | Accepted. Without audio the error is undetectable. CMUdict lookup documented as a future upgrade, not in scope. |
| Expression/viseme mouth collision varies by model | Delegated to VRM's own override flags; Debug tab surfaces resolved values so behavior is legible. |
| Current model is VRM 0.x — no `'blend'` override, so emotions may fully swallow visemes | Accepted and documented, not patched. `three-vrm` normalizes naming so no version branching is needed; only compositing fidelity is affected. |
| 18 MB model is a visible cold-cache load | `onProgress` percentage readout; UI and scene stay interactive throughout. |
| Scope is now large for one plan | Parts 1–2 and 4–6 are the core; Part 3's VRMA module is isolated and can be dropped without touching anything else. |
| Anime aesthetic may not suit production | Format decision isolated to `VrmAvatar`; the timeline and composite contracts are format-agnostic. |
| VRM asset licensing | User selects and supplies the model; licensing is theirs to verify. |

## Out of scope

Audio, TTS, microphone input, LLM integration, sentiment-driven automatic expression
selection, CMUdict phoneme lookup, mobile optimization, in-browser model upload UI,
physics beyond VRM's built-in spring bones.
