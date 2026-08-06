# Handoff — VRM Avatar Reference Implementation

**Written:** 2026-08-06
**Branch:** `vrm-avatar-core` (13 commits ahead of `main`)
**HEAD at handoff:** `cc965fa`
**State:** Both plans complete and working. One open problem: pose preset tuning.

---

## What this project is

A **reference implementation** for driving a VRM avatar in React. The code here is
meant to be copied into a later production implementation, so clarity of pattern
matters as much as correctness.

A VRM character stands on screen. You can type text and watch the mouth animate
through the visemes that text would produce, drive every expression the model
exposes, pose the character, tune the idle behaviours, and inspect live state.

**There is no audio anywhere in this system.** No TTS, no microphone, no playback.
All timing derives from the text. This is deliberate — it removes phoneme/waveform
alignment entirely, and it is what makes VRM's 5-viseme limit acceptable, since with
no sound to compare against a viewer judges rhythm and shape variety rather than
phonetic accuracy.

Run it: `cd frontend && npm run dev` → `http://localhost:3000`

---

## Current state

- **93 tests passing**, `npm run build` clean, working tree clean.
- Everything is committed. Nothing is half-written.

### Confirmed working (the user verified these by eye)

- Model loads facing the camera, arms at its sides
- Blinks on a random 2–6s interval, breathes, head drifts, eyes track the camera
- Typing text and pressing **Speak** animates the mouth, then settles closed
- Five tabs render: Speech, Expressions, Pose, Idle, Debug

### The model

`frontend/public/model.vrm` — 18 MB, **VRM 0.x** (declares the `VRM` extension, not
`VRMC_vrm`). Gitignored; it is the user's asset.

`@pixiv/three-vrm` v3 normalizes 0.x names to the 1.0 vocabulary on load
(`Joy`→`happy`, `Sorrow`→`sad`, `Fun`→`relaxed`, `A`→`aa`), so **application code
never branches on VRM version.** The model also ships a non-preset `Surprised`
blendshape — which is exactly why expressions are enumerated from the model rather
than from a hardcoded preset list.

One consequence worth knowing: VRM 0.x has only boolean `ignoreMouth`/`ignoreBlink`
flags, which map to `'block'`/`'none'` — there is no `'blend'`. So an emotion either
fully suppresses visemes or fully collides with them. That is a model-format
property to *surface* (the Debug tab shows the resolved flags), **not a bug to
patch**. Do not add manual suppression logic.

---

## THE OPEN PROBLEM — start here

**The pose presets look unnatural.** `arms-crossed` reads as "hands clasped at the
waist"; `pointing` had the arm hanging at the hip (partially fixed in `cc965fa`, still
unverified). `waving` and `thinking` are unverified and probably also wrong.

### Why, precisely

Pose presets in `frontend/src/lib/poses.js` are maps of humanoid bone → Euler
rotation, applied to VRM **normalized** bones (rest pose = T-pose). Only **one axis
is confirmed by observation**:

> **`z` is the up/down axis.** On the LEFT arm, positive `z` rotates it DOWN toward
> the body; negative raises it. The right arm mirrors (negative `z` is down).

This was established the hard way: the first pass had the sign inverted and stood the
avatar in a permanent cheer. Note that `composite.test.js` did **not** catch it — the
test asserts the arms *mirror* each other, which was true in both the correct and
incorrect orientation. A test can verify symmetry; it cannot tell you which way is
down.

**The unknown:** which sign of **`y`** swings an arm **forward toward the camera**
versus backward. Every pose needing a limb to come forward depends on it —
`pointing`, `waving`, `thinking`, and the forearm tuck in `arms-crossed`. Deriving it
from the VRM spec has already produced one wrong answer, so **do not guess again.**

### How to resolve it — 30 seconds with a browser

1. `cd frontend && npm run dev`
2. Load `http://localhost:3000`, open the **Pose** tab
3. Scroll to `rightUpperArm`, drag its **`y`** slider to +3.14
4. Observe: does the arm swing forward toward the viewer, or backward?

That single observation fixes all five presets. `pointing` currently carries
`rightUpperArm.y: +1.4` on a coin-flip — if she points behind herself, negate the
`y` term in every preset.

### The better workflow

The Pose tab has per-bone X/Y/Z sliders and a **Copy pose JSON** button, built for
exactly this. Drag until a pose looks right, copy, paste into `poses.js`. This beats
estimating from the spec and is the intended authoring loop.

---

## Invariants — breaking any of these causes subtle, painful bugs

1. **`vrm.update(delta)` exactly once per frame, LAST**, after every `setValue` and
   bone write. It is what applies accumulated expression values, resolves override
   flags, and advances spring bones. Called early or twice, output is subtly wrong
   and miserable to debug. See `VrmAvatar.jsx` — the final statement of `useFrame`.

2. **`VrmAvatar.jsx` reads the store ONLY via `useAvatarStore.getState()`** inside
   `useFrame` — never a selector subscription. Subscribing there re-renders the
   Canvas subtree on every slider drag, which is the entire reason zustand is in this
   project. Control panel components *should* subscribe; that is correct for them.

3. **The animation mixer runs BEFORE compositing.** `mixerRef.current.update(dt)`,
   then read the resulting bone rotations back into `clipPose`, then blend that
   against the static pose via `lerpPoses` and pass it as the compositor's `pose`.
   Composite first and the compositor silently erases the clip every frame.
   (`VrmAvatar.jsx:87` onward.)

4. **`src/lib/**` must never import React or three.js.** All non-trivial logic lives
   there as pure functions — that is why 93 tests run in ~2s with no jsdom, no
   browser, no GPU. If a test needs jsdom, the boundary was drawn wrong.

5. **Enumerate expressions and bones from the loaded model**, never a hardcoded list
   (`listExpressions(vrm)`, `listBones(vrm)`). This is the central pattern the
   reference exists to demonstrate.

6. **Store key and action names are frozen.** Every control panel component binds to
   them.

7. **Bone access is always** `vrm.humanoid.getNormalizedBoneNode(name)` — never raw
   scene-graph traversal.

8. **`compositeBones` has no default for its outer argument object** — a zero-arg
   call throws `TypeError`. Always pass a full options object.

9. **Fixed frame order:** bones (pose → additive idle → manual overrides) →
   expressions (emotions → visemes → blink) → lookAt → `vrm.update(dt)`.

10. **Next.js 16.3 differs from training data.** `frontend/AGENTS.md` mandates
    reading `node_modules/next/dist/docs/` before writing Next-specific code. Also:
    `next/dynamic` with `ssr: false` must be called from inside a `'use client'`
    file — it is not permitted in a Server Component. `page.js` stays a Server
    Component; `AvatarStage.jsx` carries the boundary.

---

## File map

```
frontend/src/
  app/page.js                    Server Component shell
  app/api/animations/route.js    Lists .vrma files in public/animations/
  components/
    AvatarStage.jsx              'use client' boundary, dynamic({ssr:false}), layout
    Scene.jsx                    Canvas, lights, grid, OrbitControls, renders children
    VrmAvatar.jsx                THE COMPOSITOR — loads VRM, single write point per frame
    MissingModelNotice.jsx       Load progress / failure UI
    ControlPanel/
      index.jsx                  Tab shell (passes `vrm` to each tab)
      Slider.jsx                 Shared labelled slider
      SpeechTab.jsx              Textarea, Speak, stiffness + rate
      ExpressionTab.jsx          One slider per model-defined expression
      PoseTab.jsx                Presets, per-bone XYZ, Copy pose JSON, clip controls
      IdleTab.jsx                Idle toggles + live tunables
      DebugTab.jsx               Viseme bars, FPS, resolved override flags
  lib/                           ALL PURE — no React, no three.js
    constants.js                 MODEL_URL, VISEMES, DEFAULTS
    visemeMap.js                 Grapheme→viseme tables, durations
    textToVisemes.js             text → contiguous timeline
    visemePlayback.js            sampleTimeline, dampWeights
    composite.js                 compositeBones, lerpPoses
    poses.js                     7 presets  ← THE OPEN PROBLEM LIVES HERE
    idleMath.js                  blinkValue, driftDeltas, breathDelta
    vrmIntrospect.js             listExpressions, listBones, HUMANOID_BONES
  hooks/
    useVisemePlayback.js         Ref-holding frame stepper
    useIdleMotion.js             Blink scheduling + procedural deltas
    useVrmAnimations.js          .vrma loading + AnimationMixer
  stores/avatarStore.js          zustand — every control value
```

**Docs:**
- Spec: `docs/superpowers/specs/2026-08-06-vrm-avatar-reference-design.md`
- Plan 1: `docs/superpowers/plans/2026-08-06-vrm-avatar-core.md` (9 tasks, complete)
- Plan 2: `docs/superpowers/plans/2026-08-06-vrm-avatar-control-surface.md` (7 tasks, complete)
- Ledgers: `.superpowers/sdd/*/progress.md` — per-task commits, review verdicts,
  deferred minors, and controller rulings. Gitignored but present on disk.

---

## Verification gaps — be honest about these

**Playwright MCP disconnected partway through Task 8 of Plan 1** and never came back
within that session. The server itself is healthy (`claude mcp list` shows Connected);
the session's tool registrations were pruned one-way and do not repopulate. **A fresh
session gets them back** — that is the main reason this handoff exists.

Consequently:

- **Everything in Plan 2 is visually unverified** except what the user spot-checked
  (tabs render; poses look wrong). Tab switching, slider liveness, pose easing,
  per-bone edit/reset, and clipboard export were all reasoned from code, never
  observed.
- **Clip playback has never executed.** There are no `.vrma` files, so `loadClip` has
  literally never run. `/api/animations` correctly returns `{"files":[]}` and the
  Pose tab shows its "No clips found" note — but the actual mixer path is untested.
  To exercise it, drop a `.vrma` into `frontend/public/animations/` and reload
  (Booth and VRoid Hub distribute them).

---

## Deferred minors worth knowing

None block anything, all recorded in the ledgers:

- No `AbortController` on the 18 MB model fetch; a stray Strict-Mode fetch can
  free-run in dev. A `cancelled` guard prevents any state corruption.
- `timelineDuration` has no direct unit test despite being consumed by `SpeechTab`.
- `sampleTimeline` has no non-mutation test (`dampWeights` does).
- Debug FPS is computed from the clamped `dt`, so a long alt-tab pause reads "10 fps"
  rather than the true near-zero.
- `useIdleMotion` recomputes `nextBlinkAt` every frame while blink is toggled off,
  rather than once on toggle. Negligible.

---

## Suggested next steps

1. **Resolve the `y`-axis direction** (30-second slider test above), then fix all five
   presets in one pass.
2. **Walk the whole reference** with a browser: every expression slider moves the
   face; all seven poses ease in; a bone edit shows the amber "edited" marker and
   overrides its preset; Copy pose JSON produces pasteable output; idle toggles each
   do what they claim; Debug bars ease rather than snap during Speak.
3. Optionally drop a `.vrma` in to exercise clip playback for the first time.

Beyond that the reference is feature-complete against its spec. Anything further
(audio/TTS, LLM integration, sentiment-driven expressions, CMUdict phonemes, mobile)
was explicitly scoped out — see the spec's "Out of scope" section.
