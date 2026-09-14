# VRM Avatar — Documentation Index

A VRM avatar built to read as a **living companion** for an AI agent, and a reference
implementation for driving one in React. A character stands on screen; the host app
tells her what is happening — listening, thinking, working, speaking — and she behaves
accordingly. You can also type text and watch the mouth animate through the visemes that
text would produce, pose the rig, tune every idle behaviour, and inspect live state.

She **speaks out loud**, via a hosted TTS API, and the audio is the clock the mouth runs
on. With no API key she falls back to mouthing silently, which is how the whole project
worked until recently — see [15-voice-and-tts.md](15-voice-and-tts.md).

The code is written to be read and copied, so clarity of pattern matters as much as
correctness. These docs exist for the same reason.

Run it: `cd frontend && npm run dev` → `http://localhost:3000`

---

## Start here

**New to the project?** Read [01-orientation.md](01-orientation.md), then
[02-architecture.md](02-architecture.md), then [03-frame-loop.md](03-frame-loop.md).
That is enough to work anywhere in the codebase.

**Integrating this into a host app?** [12-conversational-states.md](12-conversational-states.md)
is the contract for what she is doing; [15-voice-and-tts.md](15-voice-and-tts.md) is the
contract for making her say it. Between them: `setConversationState(...)` and `say(...)`.

**About to change something?** Read [10-invariants.md](10-invariants.md) first. It is one
screen long and every rule on it has already cost someone a debugging session.

**Picking up where the last session stopped?** [11-open-questions.md](11-open-questions.md).

## The map

| # | Doc | Its one job |
|---|---|---|
| 01 | [Orientation](01-orientation.md) | What this is, why there is no audio, the stack, how to run it |
| 02 | [Architecture](02-architecture.md) | Module boundaries, file map, why `lib/` is pure |
| 03 | [The Frame Loop](03-frame-loop.md) | Exact per-frame order and which parts are load-bearing |
| 04 | [Speech Pipeline](04-speech-pipeline.md) | Text → timeline → sample → damp; where co-articulation comes from |
| 05 | [Expressions](05-expressions.md) | Enumerate-don't-hardcode; VRM override flags; the 0.x limitation |
| 06 | [Poses and the Rig](06-poses-and-rig.md) | Axis conventions, contrapposto, and **measure, don't derive** |
| 07 | [Idle Motion](07-idle-motion.md) | The aliveness layer — sway, gaze, weight, breath, hands |
| 08 | [State and the Control Surface](08-state-and-ui.md) | Store contract, the subscription rule, the seven tabs |
| 09 | [Testing](09-testing.md) | What is covered, and five ways a test here has lied |
| 10 | [Invariants](10-invariants.md) | The checklist. Read before editing |
| 11 | [Open Questions](11-open-questions.md) | Unverified, unfinished, deliberately excluded |
| 12 | [Conversational States](12-conversational-states.md) | The five states and the host app's contract |
| 13 | [Gestures](13-gestures.md) | Idle gestures, how one is shaped, the authoring rule |
| 14 | [Stage and Lighting](14-stage-and-lighting.md) | The lighting rig, why the first one washed her out, framing |
| 15 | [Voice and TTS](15-voice-and-tts.md) | Setup, the audio clock, how the voice fails safely |

## Find it by task

| I want to… | Read |
|---|---|
| Switch or add a model | [14](14-stage-and-lighting.md) · licences in [11](11-open-questions.md) |
| Change the model carousel or its prefetch | [08](08-state-and-ui.md) |
| Change how she first appears | [14](14-stage-and-lighting.md) |
| Work out why a clip jerks or drifts | [03](03-frame-loop.md) |
| Change the production UI | [08](08-state-and-ui.md) · backdrop in [14](14-stage-and-lighting.md) |
| Drive the avatar from my app | [12](12-conversational-states.md) |
| Change how the mouth moves | [04](04-speech-pipeline.md) |
| Add or fix a pose | [06](06-poses-and-rig.md) |
| Add or fix a gesture | [13](13-gestures.md) |
| Understand why an emotion killed the mouth | [05](05-expressions.md) |
| Add a control or a store key | [08](08-state-and-ui.md) |
| Touch anything inside `useFrame` | [03](03-frame-loop.md) + [10](10-invariants.md) |
| Make the avatar feel more alive | [07](07-idle-motion.md) |
| Change the lighting or the camera | [14](14-stage-and-lighting.md) |
| Know why a test does not exist | [09](09-testing.md) |
| Load an animation clip | [06](06-poses-and-rig.md) · status in [11](11-open-questions.md) |
| Know what is safe to trust | [11](11-open-questions.md) |

## Find it by file

| Source | Doc |
|---|---|
| [VrmAvatar.jsx](../frontend/src/components/VrmAvatar.jsx) · [composite.js](../frontend/src/lib/composite.js) | [03](03-frame-loop.md) |
| [textToVisemes.js](../frontend/src/lib/textToVisemes.js) · [visemeMap.js](../frontend/src/lib/visemeMap.js) · [visemePlayback.js](../frontend/src/lib/visemePlayback.js) | [04](04-speech-pipeline.md) |
| [vrmIntrospect.js](../frontend/src/lib/vrmIntrospect.js) | [05](05-expressions.md) |
| [poses.js](../frontend/src/lib/poses.js) · [useVrmAnimations.js](../frontend/src/hooks/useVrmAnimations.js) · [clips.js](../frontend/src/lib/clips.js) | [06](06-poses-and-rig.md) |
| [aliveness.js](../frontend/src/lib/aliveness.js) · [blink.js](../frontend/src/lib/blink.js) · [idleMath.js](../frontend/src/lib/idleMath.js) · [useIdleMotion.js](../frontend/src/hooks/useIdleMotion.js) | [07](07-idle-motion.md) |
| [avatarStore.js](../frontend/src/stores/avatarStore.js) · `components/Controls/*` · `components/ControlPanel/*` · [animations.js](../frontend/src/lib/animations.js) | [08](08-state-and-ui.md) |
| [carousel.js](../frontend/src/lib/carousel.js) · [carouselMotion.js](../frontend/src/lib/carouselMotion.js) · [vrmCache.js](../frontend/src/models/vrmCache.js) · [ModelNav.jsx](../frontend/src/components/Controls/ModelNav.jsx) | [08](08-state-and-ui.md) · [14](14-stage-and-lighting.md) |
| [unwrapEuler.js](../frontend/src/lib/unwrapEuler.js) · [clips.js](../frontend/src/lib/clips.js) | [03](03-frame-loop.md) |
| [postures.js](../frontend/src/lib/postures.js) | [12](12-conversational-states.md) |
| [gestures.js](../frontend/src/lib/gestures.js) | [13](13-gestures.md) |
| [Scene.jsx](../frontend/src/components/Scene.jsx) · [framing.js](../frontend/src/lib/framing.js) · [globals.css](../frontend/src/app/globals.css) | [14](14-stage-and-lighting.md) |
| [AvatarStage.jsx](../frontend/src/components/AvatarStage.jsx) · [page.js](../frontend/src/app/page.js) · [vrmMeta.js](../frontend/src/lib/vrmMeta.js) | [02](02-architecture.md) |

## The ten things most worth knowing

1. **`vrm.update(dt)` last, exactly once per frame.** Everything else is negotiable.
   → [03](03-frame-loop.md)
2. **`lib/` imports neither React nor three.js.** That is why 422 tests run in 6
   seconds. → [02](02-architecture.md)
3. **Enumerate from the model, never hardcode.** → [05](05-expressions.md)
4. **Co-articulation is a free side effect of exponential damping** — one line, one
   tuning number. → [04](04-speech-pipeline.md)
5. **Do not derive rig axes. Measure them.** Six wrong answers so far. Drag it in the
   Pose tab and read the number off. → [06](06-poses-and-rig.md)
6. **Nothing on a body moves alone.** Every aliveness failure here has been one joint
   isolated from its chain. → [07](07-idle-motion.md)
7. **Subtlety is for continuous motion, not for signals.** A state change nobody can see
   is a no-op. → [12](12-conversational-states.md)
8. **A list built for one purpose is wrong in another.** Reading a clip back through the
   Pose tab's bone list dropped every finger, so `Peace sign` made no peace sign; reading
   it through the active preset's dropped the legs. Both were silent. →
   [06](06-poses-and-rig.md)
9. **The mixer writes quaternions; the compositor reads Euler, and that conversion is not
   continuous.** Measured on the shipped clips: the read-back jumps by a full turn while
   the real rotation moves three degrees, with the bone sitting at gimbal. Writing it back
   is harmless; *adding* to it is not. → [03](03-frame-loop.md)
10. **Never claim a thing before you can act on it.** The frame loop moved its clip ref to
    the requested url and *then* asked the mixer to play it — so a clip that could not
    start yet was recorded as playing and never retried. Same shape as hiding the avatar
    by moving her somewhere assumed to be off screen. → [03](03-frame-loop.md) ·
    [08](08-state-and-ui.md)
