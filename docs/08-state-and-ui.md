# State and the Control Surface

**Job of this doc:** document the store contract, the subscription rule that justifies
it, and the two surfaces built on it — the production bar and the seven-tab workbench.

See also: [03-frame-loop.md](03-frame-loop.md) (the transient read in context) ·
[02-architecture.md](02-architecture.md) (where the store sits)

---

## Why zustand rather than React state

One rule explains the whole choice:

> **The render loop reads the store transiently. The control panel subscribes.**

```js
// VrmAvatar.jsx, inside useFrame — CORRECT
const s = useAvatarStore.getState();

// PoseTab.jsx — also CORRECT, different context
const poseName = useAvatarStore((s) => s.poseName);
```

Dragging a slider mutates a value the frame loop already re-reads every frame. No
React reconciliation of the Canvas subtree is needed, and none happens. With React
state or a context, every slider drag would re-render the entire 3D tree at pointer
rate.

Getting this backwards is not a style error — it is a frame-rate collapse that looks
like "three.js is slow". It is [invariant 2](10-invariants.md).

## Store shape

All in [avatarStore.js](../frontend/src/stores/avatarStore.js).

| Slice | Keys | Notes |
|---|---|---|
| Speech | `timeline`, `speechStartedAt` | `speechStartedAt: null` means not speaking |
| Voice | `voiceEnabled`, `speechStatus` | Whether she speaks aloud, and what the voice is doing. **Which** voice is not here — it follows `modelUrl`. See [15](15-voice-and-tts.md) |
| Tuning | `stiffness`, `rate`, `sentencePauseMs` | `rate` applies at next `Speak`; `stiffness` and the sentence pause are live |
| Expressions | `expressions` | **sparse** map name → 0..1; absent means zero |
| Pose | `poseName`, `manualBones` | `manualBones` is sparse too |
| Model | `modelUrl`, `modelHeadY` | Which `.vrm` is loaded. `modelHeadY` is measured on load and drives the framing |
| Carousel | `modelRing`, `carousel` | The running order, and an in-flight transition or `null`. **`carousel.targetUrl` and `modelUrl` disagree on purpose** — see below |
| Clip | `clipUrl`, `clipWeight` | `clipUrl: null` means no clip |
| Conversation | `conversationState` | **the host application's key** — see [12](12-conversational-states.md) |
| Gesture | `gestureRequest` | one-shot `{name, at}`; a name of `null` releases |
| Idle | `idle.*` — eleven behaviours plus tunables | tunables are live |
| Stage | `lighting.*`, `framing` | judged by eye, so all live |
| Debug | `debug.{weights, fps}` | **written from the render loop** |

The `idle` slice is the big one. Each entry is a toggle plus its own tunables: `blink`,
`breathe`, `drift`, `sway`, `weightShift`, `gestures`, `poseShift`, `lookAt`, `gaze`,
`speechEmphasis`, plus two always-on amounts (`handRelax`, `restingWarmth`).

The `gaze` entry carries `gazeJitterAmount` alongside its wander and head-follow: the
microsaccade tremor is part of the same behaviour and rides the same toggle.

`DEFAULTS` from [constants.js](../frontend/src/lib/constants.js) seeds the initial
state and nothing else — the running values are the store's.

### Actions

`say` · `speak` · `stopSpeaking` · `setVoiceEnabled` · `setStiffness` · `setSentencePause` · `setRate` · `setExpression` ·
`resetExpressions` · `setPose` · `setConversationState` · `playGesture` · `setBone` ·
`clearBone` · `clearAllBones` · `setModel` · `setModelHeadY` · `startCarousel` · `endCarousel` · `setModelRing` · `setClip` · `setClipWeight` · `setIdle` · `setLighting` ·
`setFraming` · `setDebug` · `resetAll`

Two are the **host application's interface** to the avatar, and the only ones a caller
outside the control panel is expected to use:

```js
setConversationState('working');   // idle | listening | thinking | working | speaking
say('Here is what I found.');      // the whole utterance: voice, mouth, state
stopSpeaking();                    // barge-in
playGesture('scratch-head');       // one-shot; null releases a held gesture
```

`say()` is the third of these and the newest. It never throws, interrupting is just
calling it again, and there is no need to sequence it with `setConversationState` — an
active utterance already wins inside the frame loop. Full contract in
[15-voice-and-tts.md](15-voice-and-tts.md).

> **`stopSpeaking` no longer just clears a flag.** It routes through the speech engine,
> because the flag is not what makes a sound — scheduled audio buffers keep playing until
> something stops them. The engine tears them down and calls back to clear the flag,
> which is why the action does not clear it itself and cannot recurse.

`gestureRequest` carries a timestamp rather than just a name, so asking for the same
gesture twice in a row fires twice — the render loop compares `at` against the last one
it acted on.

> **Store key and action names are frozen.** Every control panel component binds to
> them. Renaming one is a cross-file change, not a local one.

### `setBone` seeds from the active preset

The only action with non-obvious behaviour:

```js
const seed = state.manualBones[name] ?? POSES[state.poseName]?.[name] ?? ZERO;
```

A bone's first edit starts from wherever the current preset already has it, so nudging
one axis does not silently zero the other two. Seeding from `ZERO` made the limb jump
the instant a slider was touched, which defeats the authoring loop the Pose tab exists
for. Bones the preset does not mention still start at zero. Both cases are tested.

Rationale in full: [06-poses-and-rig.md](06-poses-and-rig.md).

### Two keys flow backwards

Almost every key flows UI → store → loop. Two do not.

**`debug`** flows loop → store → UI: the frame loop calls `setDebug({ weights, fps })`
and the Debug tab subscribes. That is why the Debug tab can show damped weights without
reaching into the render loop.

**`poseName`** is written by the loop too, when the pose-drift scheduler decides to fold
or unfold her arms. It fires at most once every thirty seconds, so the re-render it
causes is not the per-frame churn [invariant 2](10-invariants.md) exists to prevent —
and the Pose tab genuinely should show which pose she is in.

## Two surfaces, one store

There are two control surfaces over the same scene, and `?dev=1` picks between them.
Neither has any state of its own beyond which menu is open: both drive the same store
actions, which is the whole reason the workbench keeps working after the production UI
was built on top of it.

| | Production (`/`) | Workbench (`/?dev=1`) |
|---|---|---|
| Shape | One bar floated over a full-bleed scene | Right-hand sidebar, seven tabs |
| Offers | State, model, animation, speech | Everything, including per-bone sliders |
| Backdrop | CSS cyclorama behind a transparent canvas | Flat `#16161b` + reference grid |
| Files | [components/Controls/](../frontend/src/components/Controls/) | [components/ControlPanel/](../frontend/src/components/ControlPanel/) |

`dev` is read from `searchParams` in [page.js](../frontend/src/app/page.js) — on the
server, so the right surface is in the first paint rather than flashing the wrong one.
**`searchParams` is a Promise in Next 16 and must be awaited**; it was a plain object
up to 14, which is what training data will tell you. See [invariant 12](10-invariants.md).

### The production bar

[Controls/index.jsx](../frontend/src/components/Controls/index.jsx) lays out three
things in the order you reach for them. **Who is on stage is not one of them** — that
moved onto the stage itself, see below.

| Control | Job | File |
|---|---|---|
| **State row** | All five conversational states, always visible | [StateBar.jsx](../frontend/src/components/Controls/StateBar.jsx) |
| **Animate** | Clips and promoted gestures in one list, popover | [AnimationMenu.jsx](../frontend/src/components/Controls/AnimationMenu.jsx) |
| **Speech** | Input, voice on/off, `Speak`/`Stop` | [SpeechBar.jsx](../frontend/src/components/Controls/SpeechBar.jsx) · [VoiceToggle.jsx](../frontend/src/components/Controls/VoiceToggle.jsx) |
| *(shared)* | Popover shell; menu trigger | [Popover.jsx](../frontend/src/components/Controls/Popover.jsx) · [MenuButton.jsx](../frontend/src/components/Controls/MenuButton.jsx) |

### The model carousel lives on the stage, not on the bar

[ModelNav.jsx](../frontend/src/components/Controls/ModelNav.jsx): an arrow at each screen
edge, vertically centred, and her name across the top.

It was on the bar twice — first as a menu, then as a carousel wedged between Animate and
Speech — and both were wrong the same way. The bar is for **driving the character you
have**; choosing her is the frame around that rather than another setting inside it.
Edge arrows also say something a bar could not: that there is somebody off to either
side, and that is where she goes.

**Neither piece has a panel**, which is the one deliberate departure from the rest of this
UI. Everything else sits on `lit-surface`. Two lit chips at the left and right edges would
put bright rectangles in the darkest corners of the cyclorama and frame her like a
slideshow; a plate behind the name would cut a hole in the backdrop's gradient at its most
visible point. So: bare chevrons and bare text, with a soft radial scrim fading in under
an arrow only while it is hovered — the one moment it has to hold up against a brightly
lit dress.

**The name animates, and it is the only unprompted motion in the production UI.** That is
allowed here for a specific reason rather than as decoration: the name is bound to
`modelUrl`, which changes at the midpoint of a transition, so it re-runs while she is off
stage. There is nothing on screen for it to compete with. Cutting instantly on an empty
stage read as a caption being corrected rather than as somebody new arriving.
`prefers-reduced-motion` gets the fade without the travel.

#### The swap happens off-stage

Changing who is on stage is the one control on this bar that produces a **performance**
rather than setting a value — she arcs off, and the next one arcs on. A dropdown framed
that as picking from a list, and ended on a progress bar over an empty stage while 18 MB
arrived.

What that costs: you can no longer jump to a specific model. The workbench's Stage tab
keeps the full list, which is where you want it anyway — jumping to a particular rig is
mostly something you do while measuring a pose against it.

**The one thing to understand before editing any of this:** pressing a button does not
change `modelUrl`. It sets `carousel`, and the frame loop changes `modelUrl` at the
transition's midpoint, on an empty stage. Two things depend on that timing:

- **The exit animation needs its model.** Swapping on the press tears the current model
  out from under the animation that is still playing it, which is the pop the whole
  transition exists to hide.
- **The camera snaps.** It is solved from the loaded model's own head height and
  [CameraRig](../frontend/src/components/Scene.jsx) sets the position outright rather
  than easing, so a model of a different height arriving mid-arc would yank the frame.
  On an empty stage that snap cannot be seen.

So during a transition `carousel.targetUrl` and `modelUrl` disagree, and the disagreement
is the feature. The name on the button follows `modelUrl`, which is why the label changes
while nobody is on stage rather than at the moment you press.

The third beat, the hold, is also the slack that absorbs a model which has not finished
parsing: the clock stops advancing rather than letting the entrance start from its middle.
See [`carouselMotion.js`](../frontend/src/lib/carouselMotion.js).

#### Three things that were wrong on the first look at it

All three shipped green — tests, lint and build — and all three were about the
**physical stage** rather than the logic, which is this feature's characteristic failure
the way wrong axes are the rig's.

**The outgoing model was visible at the entry mark.** It stays mounted until the incoming
one has parsed, and it was hidden by parking it off to the side. It was not off to the
side: `offsetX` was a constant 1.2 m, and at bust framing the frame is **1.23 m wide
either side of centre** at the arc's depth. She sat in shot, motionless, and then became
somebody else. Reported exactly as *"the same model appears from the right, then lags,
then changes"*.

Two fixes, because there were two faults. The model is now **hidden outright** while a
stale one is mounted, rather than being moved somewhere assumed to be invisible — and the
side distance is **computed from the live camera** every frame by `exitClearance`, since
no constant can be right across three framings, every aspect ratio, and the mobile zoom.

**The exit did not finish off-screen either**, by the same arithmetic on the other side.
Same fix.

**The lag was a parse, not the arc.** `modelUrl` changes at the midpoint, the retain
effect re-ran, and it started prefetching the *new* neighbour right there: an 18 MB
download plus `GLTFLoader.parse`, `removeUnnecessaryVertices` and `combineSkeletons`, all
on the main thread, in the middle of the animation they would ruin. Under the old menu
that work happened too — behind a progress bar, while the user was already waiting for
it. Making it invisible moved the cost; it did not remove it.

Three fixes: prefetching is **deferred while a transition is running**, prefetches are
**queued one at a time** instead of both at once, and the model you actually asked for
**starts loading on the press** rather than at the midpoint, which hands the download the
450 ms of exit animation for free.

#### The whole cast is kept, and warmed one at a time

**Every model stays parsed.** It started at three — on stage plus both neighbours — and
three turned out to be the number that *guarantees* a stall rather than prevents one: walk
two steps in one direction and you are loading again, and loading is the one thing this
feature cannot do while she is moving.

So the cache holds all eight. That costs ~18 MB of source model apiece and rather more
once textures are decoded, which is a real cost on a tight machine and was taken
knowingly: it is paid once, quietly, after the page settles, and buys a transition that
can never wait. `MAX_RESIDENT` is the one line to lower if memory becomes the problem —
`residentUrls` is ordered nearest-first, so a cap sheds the models furthest around the
ring and both buttons keep working.

Warming is **one model at a time and paused while a transition runs**, because the
expensive half of loading a VRM is not asynchronous: `GLTFLoader`'s parse,
`removeUnnecessaryVertices` and `combineSkeletons` are all main-thread. Two of those
landing back to back, one of them mid-transition, was the whole of *"it lags, like a
lot"*. The guarantee is "no new model starts", not "nothing is happening" — a fetch
already in flight is not cancelled, since there is no `AbortController` on it. In practice
that window closes for good once warm-up finishes.

The model you actually press toward also starts loading **on the press** rather than at
the midpoint, which hands it the 450 ms of exit animation. Once the cast is warm that is a
no-op, which is the usual case.

#### The disposal rule this broke

Models now outlive the component that loaded them. `VrmAvatar` used to `deepDispose` in
its effect cleanup — airtight, because a model died with the effect that made it — and
that guarantee is gone.

What replaced it: [`vrmCache.js`](../frontend/src/models/vrmCache.js) owns lifetime, and
asks [`carousel.js`](../frontend/src/lib/carousel.js) what to keep. **Never dispose a VRM
from a component again.**
Freeing a model the cache still holds does not throw; it shows up as an untextured smear
the next time you switch back to her.

The eviction *decision* is pure and tested; the cache only carries it out. That split is
deliberate — the failure here is a silent 18 MB leak per switch, so the half that can be
tested is the half most likely to be wrong.

#### A menu trigger has to look like one

The first cut rendered both menus as bare text with a hover background, and it was
reported immediately: *"the model is hard to see where to change"*. Bare text on a dark
bar is indistinguishable from a caption, and a control nobody recognises as a control is
not discoverable at any contrast. [MenuButton.jsx](../frontend/src/components/Controls/MenuButton.jsx)
carries the fix, and each part earns its place:

- **a border**, which is what separates "control" from "label"
- **a label saying what the control changes**, not only its current value — `Momiji`
  alone never told you it was the model
- **a chevron**, the conventional promise that something opens. It points *up*, because
  the bar is pinned to the bottom and the menus open upward

The model name is resolved from `modelUrl` rather than from the fetched list, so it is
correct in the first paint. Waiting on `/api/models` left the button reading a bare
"Model" for the whole cold start — which was the exact state that got reported.

#### The dismiss handler must not see the trigger as "outside"

`Popover` owns the wrapper element — trigger and panel both — and that structure is the
fix for a real bug rather than a matter of taste. When the trigger was a *sibling* of the
panel, clicking an open menu's own button reopened it instead of closing it:

1. `mousedown` on the trigger
2. the dismiss handler sees a target outside the **panel** and closes — `open = false`
3. `click` on the trigger fires the toggle — `open = true`

The menu closed and reopened inside one press, so it looked like the toggle was broken
rather than like a dismiss problem. The comment in the file originally claimed
`mousedown` *avoided* this; it is what causes it, because it lands **before** the toggle
rather than after it.

Two ways out, and the structural one is better than a guard: with the trigger inside the
element the handler tests, a press on it counts as "inside", the dismiss handler ignores
it, and the toggle is the only thing that acts — which is what makes it close. Adding an
`if (triggerRef.current.contains(e.target)) return;` would also have worked, but every
future menu would have to remember it.

`mousedown` is still the right event for genuine outside clicks: dismissing on press
feels immediate and fires even if the pointer moves before release.

Three decisions worth not re-litigating:

- **The states are a row, not a dropdown.** They are shaped as opposites of one
  another and the only way to judge one is against its neighbours. Hiding four behind
  a trigger makes the one comparison the control exists for impossible. The two menus
  beside it are dropdowns because their contents are long and rarely changed.
- **Clips and gestures are one list.** To a user there is one idea — things she can be
  asked to do. The two mechanisms behind it have nothing in common, and the merge is a
  labelling job in [animations.js](../frontend/src/lib/animations.js) rather than a
  runtime one. See [06-poses-and-rig.md](06-poses-and-rig.md).
- **Nothing on the bar animates on its own.** It holds just under full opacity and
  comes to full on hover. She is the one moving thing in the frame, and over an
  hours-long session a control surface that moves unprompted competes with her for
  exactly the attention she is meant to have.

Only `wave` is promoted into the Animate list. A promoted gesture must be marked
`idle: false`, because a gesture offered as a deliberate action must not also be
firing itself every 16–46 seconds — there is a test pinning that. The rest of the
roster stays automatic and unlisted: they exist to imply an inner life, and a button
marked "Scratch head" destroys the effect it exists to create.

### The workbench

[index.jsx](../frontend/src/components/ControlPanel/index.jsx) is a flat tab shell —
local `useState` for the active tab, and it passes the loaded `vrm` down to each tab.
Tabs need `vrm` because they enumerate from the model rather than from constants
(see [05-expressions.md](05-expressions.md)).

| Tab | Job | File |
|---|---|---|
| **State** | Conversational states, gesture triggers, `Release` | [StateTab.jsx](../frontend/src/components/ControlPanel/StateTab.jsx) |
| **Speech** | Textarea, `Speak`/`Stop`, voice on/off, voice readout, stiffness + rate | [SpeechTab.jsx](../frontend/src/components/ControlPanel/SpeechTab.jsx) |
| **Expressions** | One slider per **model-defined** expression | [ExpressionTab.jsx](../frontend/src/components/ControlPanel/ExpressionTab.jsx) |
| **Pose** | Presets, per-bone XYZ, Copy pose JSON, clip selection + blend | [PoseTab.jsx](../frontend/src/components/ControlPanel/PoseTab.jsx) |
| **Idle** | Per-behaviour toggles and live tunables | [IdleTab.jsx](../frontend/src/components/ControlPanel/IdleTab.jsx) |
| **Stage** | Model picker, camera framing, the whole lighting rig, reset | [StageTab.jsx](../frontend/src/components/ControlPanel/StageTab.jsx) |
| **Debug** | Viseme bars, FPS, resolved override flags | [DebugTab.jsx](../frontend/src/components/ControlPanel/DebugTab.jsx) |

[Slider.jsx](../frontend/src/components/ControlPanel/Slider.jsx) is the shared labelled
slider — 21 lines, takes `label`, `value`, `min`, `max`, `step`, `onChange`, optional
`format` and `hint`.

## Layout and loading

[AvatarStage.jsx](../frontend/src/components/AvatarStage.jsx) is the `'use client'`
boundary and the layout: the scene fills the space, the panel is a right-hand sidebar
on `lg` and a bottom strip below it. It owns `progress`, `error`, and the loaded `vrm`,
feeding the first two to [MissingModelNotice.jsx](../frontend/src/components/MissingModelNotice.jsx)
and the third to the control panel.

The model is 18 MB, so cold-cache load is visible. `onProgress` drives a percentage
readout and the UI stays interactive throughout.

[Scene.jsx](../frontend/src/components/Scene.jsx) holds the camera, five store-driven
lights, and an infinite grid. It defaults to the waist-up `bust` framing, and every
light is live from the Stage tab. Full rationale in
[14-stage-and-lighting.md](14-stage-and-lighting.md).
