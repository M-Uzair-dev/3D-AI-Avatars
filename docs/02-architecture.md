# Architecture

**Job of this doc:** show how the code is arranged, where each responsibility lives,
and why the boundaries fall where they do.

See also: [03-frame-loop.md](03-frame-loop.md) (what happens each frame) ·
[09-testing.md](09-testing.md) (what the boundaries buy you)

---

## The shape in one sentence

Pure functions in `src/lib/` compute everything; one component
([VrmAvatar.jsx](../frontend/src/components/VrmAvatar.jsx)) is the sole place those
results are written to the model; a zustand store carries every control value
between the UI and that component.

## The load-bearing boundary

> **`src/lib/**` must never import React or three.js.**

This is the single most important structural rule in the project.

Everything genuinely tricky — text tokenization, timeline layout, weight damping,
layer precedence, idle maths — lives in `lib/` as pure functions over plain objects.
No clock, no GPU, no DOM.

What that buys:

- **422 tests run in ~6 seconds** in plain Node. No jsdom, no headless browser, no
  WebGL context.
- Layer precedence is unit-testable, which is the kind of bug that is otherwise
  diagnosed by squinting at a rendered avatar.
- The production implementation can lift `lib/` wholesale — it has no framework
  opinions to inherit.

The corollary is a useful tripwire: **if a test needs jsdom, the boundary was drawn
in the wrong place.**

`VrmAvatar` is deliberately thin as a result. It gathers inputs, calls the pure
compositor, and writes the result. It contains no arithmetic worth testing.

## Layers

```
  ┌─────────────────────────────────────────────────────┐
  │ ControlPanel tabs        subscribe to store (React) │
  └───────────────────────┬─────────────────────────────┘
                          │ actions
  ┌───────────────────────▼─────────────────────────────┐
  │ avatarStore (zustand)    every control value        │
  └───────────────────────┬─────────────────────────────┘
                          │ getState() — transient read, no subscription
  ┌───────────────────────▼─────────────────────────────┐
  │ VrmAvatar  useFrame     THE SINGLE WRITE POINT      │
  │   ├─ hooks/   ref-holding frame steppers            │
  │   └─ lib/     pure maths                            │
  └───────────────────────┬─────────────────────────────┘
                          │ node.rotation.set(), em.setValue()
  ┌───────────────────────▼─────────────────────────────┐
  │ VRM model      vrm.update(dt)  ← last, exactly once │
  └─────────────────────────────────────────────────────┘
```

The arrow from store to `VrmAvatar` is a *transient read*, not a subscription. That
distinction is the whole reason zustand is in this project, and it is explained in
[08-state-and-ui.md](08-state-and-ui.md).

## Three kinds of module

**`lib/` — pure.** Plain functions, plain objects. Fully tested.

**`hooks/` — refs only.** Each hook owns state that must survive between frames and
delegates every calculation to `lib/`. [useVisemePlayback.js](../frontend/src/hooks/useVisemePlayback.js)
is 26 lines and holds exactly one ref.

[useIdleMotion.js](../frontend/src/hooks/useIdleMotion.js) is the large one, and it is
large for a defensible reason: it holds **every schedule in the system** — blink, gaze,
the working check-in, weight shift, gestures, pose drift. Each is a few refs and a
"when is the next one due" comparison, and each delegates its maths to `lib/`. The thing
to resist is letting any arithmetic settle here; if something in this file deserves a
test, it belongs in `lib/` instead.

**`components/` — render and write.** React and three.js live here and nowhere else.

**`audio/` — the one exception to the two-directory rule, and it earns it.**
[speechEngine.js](../frontend/src/audio/speechEngine.js) is plain JS with no React in it,
but it is not pure either: it owns an `AudioContext`, scheduled buffers and in-flight
requests. It is a module singleton rather than a hook because `say()` has to be callable
by the host application through the store, from anywhere, before any component has
mounted. It reaches the store through an injected sink rather than importing it, so the
dependency runs one way — store → engine, never back.

## File map

```
frontend/src/
  app/
    page.js                      Server Component shell — renders <AvatarStage/>
    api/animations/route.js      Lists .vrma files in public/animations/
    api/models/route.js          Lists .vrm files in public/, with their metadata
    api/tts/route.js             Synthesises one chunk — proxies the TTS API, keeps the key
    api/voices/route.js          Every voice from every provider (developer lookup)

  components/
    AvatarStage.jsx              'use client' boundary, dynamic({ssr:false}), picks surface
    Scene.jsx                    Canvas, store-driven lights, dev-only grid, CameraRig
    VrmAvatar.jsx                THE COMPOSITOR — see 03-frame-loop.md
    MissingModelNotice.jsx       Load progress / failure UI
    Controls/                    PRODUCTION surface — the bar over a full-bleed scene
      index.jsx                  Bar layout: state row, then animate / speech
      Popover.jsx                Shared menu shell (opens upward, Esc + click-outside)
      StateBar.jsx               All five conversational states, always visible
      ModelNav.jsx               STAGE furniture: edge arrows + her name on top
      AnimationMenu.jsx          Clips + promoted gestures, dispatched by `kind`
      SpeechBar.jsx              Input, Speak/Stop
      VoiceToggle.jsx            Voice on/off; off still mouths the words
    ControlPanel/                WORKBENCH — reached with ?dev=1
      index.jsx                  Tab shell (passes `vrm` down to each tab)
      Slider.jsx                 Shared labelled slider
      StateTab.jsx               Conversational states + gesture triggers
      SpeechTab.jsx              Textarea, Speak, stiffness + rate
      ExpressionTab.jsx          One slider per model-defined expression
      PoseTab.jsx                Presets, per-bone XYZ, Copy pose JSON, clips
      IdleTab.jsx                Idle toggles + live tunables
      StageTab.jsx               Camera framing + the full lighting rig
      DebugTab.jsx               Viseme bars, FPS, resolved override flags

  models/
    vrmCache.js                  Parsed VRMs, kept between switches. IMPURE — owns disposal

  lib/                           ALL PURE — no React, no three.js
    carousel.js                  The model ring, its nearest-first order, and eviction
    unwrapEuler.js               Keeps a clip's Euler read-back continuous frame to frame
    carouselMotion.js            The arc she travels when the cast changes
    constants.js                 MODEL_URL, MODEL_NAMES (+ each model's voice), VISEMES, DEFAULTS, FRAMINGS
    animations.js                Merges .vrma clips + promoted gestures into one list
    visemeMap.js                 Grapheme→viseme tables, durations (silent fallback)
    textToVisemes.js             text → contiguous timeline (silent fallback)
    chunkText.js                 Splits an utterance into synthesis chunks
    phonemes.js                  IPA → viseme timeline — awaiting a phoneme source
    wav.js                       RIFF header → duration
    voiceId.js                   Qualified `provider:id` voice identity
    ttsConfig.js                 Keys, models, voices from env    (server-only)
    tts/providers.js             OpenAI + ElevenLabs behind one shape (server-only)
    visemePlayback.js            sampleTimeline, dampWeights
    composite.js                 compositeBones, addPoses, blendPoseSubset, lerpPoses
    poses.js                     5 presets, CONTRAPPOSTO, mirrorLimb, axis conventions
    postures.js                  State overlays + poses, relaxedHandPose
    gestures.js                  Keyframed idle gestures + sampler
    clips.js                     The .vrma fade-in/fade-out envelope
    framing.js                   Solves camera position from the model's head height
    idleMath.js                  driftDeltas, breathDelta
    aliveness.js                 Sway, weight shift, gaze, breath chain, speech emphasis
    blink.js                     Blink envelope, doubles, saccade coupling
    vrmIntrospect.js             listExpressions, listBones, HUMANOID_BONES, FINGER_BONES
    vrmMeta.js                   Reads a .vrm's name/author/licence from its GLB header

  audio/
    speechEngine.js              THE VOICE — chunks, synthesis, gapless playback,
                                 barge-in, and the audio clock the mouth reads

  hooks/
    useVisemePlayback.js         Ref-holding frame stepper
    useIdleMotion.js             Every scheduler: blink, gaze, weight, gesture, pose drift
    useVrmAnimations.js          .vrma loading + AnimationMixer

  stores/avatarStore.js          zustand — every control value
```

Which doc covers which file:

| Area | Files | Doc |
|---|---|---|
| Frame order, compositing | `VrmAvatar.jsx`, `composite.js` | [03-frame-loop.md](03-frame-loop.md) |
| Mouth | `visemeMap.js`, `textToVisemes.js`, `visemePlayback.js`, `useVisemePlayback.js` | [04-speech-pipeline.md](04-speech-pipeline.md) |
| Voice | `audio/speechEngine.js`, `chunkText.js`, `wav.js`, `api/tts` | [15-voice-and-tts.md](15-voice-and-tts.md) |
| Face | `vrmIntrospect.js`, `ExpressionTab.jsx`, `DebugTab.jsx` | [05-expressions.md](05-expressions.md) |
| Bones | `poses.js`, `PoseTab.jsx`, `useVrmAnimations.js` | [06-poses-and-rig.md](06-poses-and-rig.md) |
| Aliveness | `aliveness.js`, `idleMath.js`, `useIdleMotion.js`, `IdleTab.jsx` | [07-idle-motion.md](07-idle-motion.md) |
| State + UI | `avatarStore.js`, `Controls/*`, `ControlPanel/*` | [08-state-and-ui.md](08-state-and-ui.md) |
| Conversational states | `postures.js`, `StateTab.jsx` | [12-conversational-states.md](12-conversational-states.md) |
| Gestures | `gestures.js` | [13-gestures.md](13-gestures.md) |
| Lights + camera | `Scene.jsx`, `StageTab.jsx`, `globals.css` | [14-stage-and-lighting.md](14-stage-and-lighting.md) |

## The client boundary

three.js touches `window` at import time, so the Canvas subtree must never be
server-rendered.

`next/dynamic` with `ssr: false` is the right tool, but in the App Router it **must be
called from inside a `'use client'` file** — it is not permitted in a Server
Component. So the boundary is arranged as:

- [page.js](../frontend/src/app/page.js) — stays a Server Component, renders `<AvatarStage/>`
- [AvatarStage.jsx](../frontend/src/components/AvatarStage.jsx) — carries `'use client'`, does the `dynamic(..., { ssr: false })` imports of both `Scene` and `VrmAvatar`

Verified against `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`.
This version of Next differs from training data; read the bundled docs before writing
Next-specific code. See [10-invariants.md](10-invariants.md).

## Why `/api/models` reads the files

The model picker needs a name for each `.vrm`, and four of the ten carry no filename
worth showing. The name is in the file — a VRM declares its own title, author and
licence terms in the glTF JSON chunk, a few hundred bytes into an eighteen-megabyte
file.

So [vrmMeta.js](../frontend/src/lib/vrmMeta.js) parses that chunk from raw bytes, and
the route reads only the **first megabyte** of each file to feed it. Reading all ten in
full would mean pulling 180 MB off disk to render a list.

It is also the one place in the codebase that branches on VRM version, which looks like
a violation of [invariant 10](10-invariants.md) and is not: that rule works everywhere
else because three-vrm normalizes names *at load time*, and this deliberately does not
load the model. VRM 1.0 renamed every field in the meta block and made `author` an
array. The branch is contained here so nothing else needs it.

## Why `/api/animations` exists

A browser cannot list a directory. [route.js](../frontend/src/app/api/animations/route.js)
reads `public/animations/` server-side and returns the `.vrma` filenames, which keeps
adding an animation a file-drop rather than a code edit. A missing directory is the
normal empty case and returns `{"files":[]}`, not an error.
