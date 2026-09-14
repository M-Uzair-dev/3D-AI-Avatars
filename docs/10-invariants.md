# Invariants

**Job of this doc:** the checklist to read before editing. Each rule is one line plus a
pointer to the doc that explains it.

Breaking any of these causes subtle bugs that do not throw. That is what makes them
worth a list.

---

### 1. `vrm.update(delta)` runs exactly once per frame, LAST

After every `setValue` and every bone write. It applies accumulated expression values,
resolves override flags, and advances spring bones. Early or twice, the output is subtly
wrong and miserable to debug.
→ [03-frame-loop.md](03-frame-loop.md) · [VrmAvatar.jsx](../frontend/src/components/VrmAvatar.jsx)

### 2. The render loop reads the store via `getState()`, never a selector

Subscribing inside `useFrame` re-renders the Canvas subtree on every slider drag, which
is the entire reason zustand is in this project. Control panel components *should*
subscribe — that is correct for them.

**One deliberate exception:** the pose-drift scheduler calls `setPose()` at most once
every thirty seconds. The rule targets per-frame churn, not any write at all.
→ [08-state-and-ui.md](08-state-and-ui.md)

### 3. The animation mixer runs BEFORE compositing

`mixer.update(dt)` → read the resulting bone rotations back into `clipPose` → blend
against the static pose → pass into the base pose. Composite first and the compositor
silently erases the clip every frame.
→ [03-frame-loop.md](03-frame-loop.md)

### 4. `src/lib/**` must never import React or three.js

All non-trivial logic lives there as pure functions. That is why 454 tests run in ~6 s
with no jsdom, no browser, no GPU. **If a test needs jsdom, the boundary was drawn
wrong.**
→ [02-architecture.md](02-architecture.md) · [09-testing.md](09-testing.md)

### 5. Enumerate expressions and bones from the loaded model

`listExpressions(vrm)`, `listBones(vrm)` — never a hardcoded list. This project's model
has a non-preset `Surprised` blendshape that proves the point.
→ [05-expressions.md](05-expressions.md)

### 6. Store key and action names are frozen

Every control panel component binds to them. Renaming one is a cross-file change.
→ [08-state-and-ui.md](08-state-and-ui.md)

### 7. Bone access is always `vrm.humanoid.getNormalizedBoneNode(name)`

Never raw scene-graph traversal. Normalized bones are what make a pose portable.
→ [06-poses-and-rig.md](06-poses-and-rig.md)

### 8. `compositeBones` has no default for its outer argument object

A zero-argument call throws `TypeError`. Always pass a full options object.
→ [03-frame-loop.md](03-frame-loop.md) · [composite.js](../frontend/src/lib/composite.js)

### 9. Fixed frame order

bones (preset → overlay → hands → weight → gesture → additive idle → manual overrides) →
expressions (warmth → emotions → visemes → blink) → lookAt → `vrm.update(dt)`.
→ [03-frame-loop.md](03-frame-loop.md)

### 10. Never branch on VRM version

`@pixiv/three-vrm` v3 normalizes 0.x names to the 1.0 vocabulary at load time. Target the
1.0 names everywhere.
→ [05-expressions.md](05-expressions.md)

### 11. Never hand-suppress visemes when an emotion is raised

VRM's own override flags arbitrate inside `vrm.update()`. On a VRM 0.x model an emotion
either fully blocks the mouth or fully collides with it — a **format property to
surface, not a bug to patch.** The Debug tab shows the resolved flags.

The single exception is resting warmth, which ramps to zero while speaking. That is a
decision about what *we* raise, not arbitration between layers.
→ [05-expressions.md](05-expressions.md)

### 12. Next.js 16.3 differs from training data

Read `node_modules/next/dist/docs/` before writing Next-specific code; `frontend/AGENTS.md`
mandates it. Specifically: `next/dynamic` with `ssr: false` must be called from inside a
`'use client'` file. `page.js` stays a Server Component; `AvatarStage.jsx` carries the
boundary.
→ [02-architecture.md](02-architecture.md)

### 13. Measure arm values in the Pose tab. Do not derive them

Six wrong answers so far — two from the spec, four from the axis table. A solver or a
derivation gets wrist *position* right and is blind to twist, shoulder and wrist
rotation, which is what actually carries the read. Torso, neck and shoulder values can be
written directly; anything putting a hand at a point on the body must be dragged out and
pasted in.
→ [06-poses-and-rig.md](06-poses-and-rig.md) · [13-gestures.md](13-gestures.md)

### 14. Nothing on a body moves alone

Every failure in this project has been a joint isolated from its chain: mirrored arms, a
head drifting on a rigid torso, a wrist scratching under a frozen shoulder, a neck
pitching on a straight back. If one bone is moving, work out which others would move
with it.
→ [07-idle-motion.md](07-idle-motion.md) · [13-gestures.md](13-gestures.md)

### 15. Layers that only exist while speaking must not go in `idleDeltas`

`idleDeltas` is attenuated during speech. The `speaking` overlay, the weight shift and
speech emphasis are folded into the base pose instead. Check this first when a layer
"works except while speaking".
→ [03-frame-loop.md](03-frame-loop.md)

### 16. A conversational state must be large enough to see

Overlays run to five to nine degrees of accumulated lean, and the states are shaped as
**opposites** rather than variations. Subtlety is right for continuous idle motion and
wrong for a discrete signal — a state change nobody can see is a no-op, not a subtle
change.
→ [12-conversational-states.md](12-conversational-states.md)

### 17. The audio is the clock

While a synthesised utterance is playing, the mouth samples its timeline at
`speechEngine.positionMs()` — never at `performance.now()`. The wall clock and the audio
hardware drift apart by tens of milliseconds a minute, and a mouth ahead of the voice is
the most obvious way an avatar looks fake. `positionMs()` returning `null` is the signal
to fall back to the wall clock for silent mouthing; a **negative** value is normal and
means the first sample has not played yet.
→ [15-voice-and-tts.md](15-voice-and-tts.md)

### 18. Phonemize with the same front end the voice speaks with, where there is a choice

Two independent guesses at how a word is pronounced is how a mouth desyncs from its
audio. The current hosted synthesiser returns no phonemes at all, so the mouth infers
shapes from spelling and stretches them over the measured duration — the known quality
gap, not a settled design.
→ [15-voice-and-tts.md](15-voice-and-tts.md)

### 19. Only `vrmCache` disposes a model

Models now outlive the component that loaded them, because the carousel prefetches both
neighbours. `VrmAvatar`'s effect cleanup no longer calls `deepDispose` and must not start
again: freeing a model the cache still references does not throw and does not fail a
test — she renders as an untextured smear the next time you switch back to her. The cache
frees against the pure decision in `lib/carousel.js`.
→ [08-state-and-ui.md](08-state-and-ui.md) · [vrmCache.js](../frontend/src/models/vrmCache.js)

### 20. Never hide a model by moving it. Hide it

Off-stage is not a place. How far is far enough depends on the framing, the aspect ratio
and the mobile zoom, and the first version of the carousel got it wrong by three
centimetres — the outgoing model sat in frame waiting for its replacement. A model that
should not be seen has `visible = false`; the arc's travel is for motion, not for
concealment.
→ [08-state-and-ui.md](08-state-and-ui.md)

### 21. Do not load or parse a model while she is moving

`GLTFLoader.parse`, `removeUnnecessaryVertices` and `combineSkeletons` are main-thread and
an 18MB model is a visible stall. Warming is paused for the length of a transition and
runs one model at a time. This was the whole of the carousel's "it lags, like a lot" — and
the reason the cache now holds the entire cast is that a stall which cannot happen does not
have to be scheduled around.
→ [08-state-and-ui.md](08-state-and-ui.md) · [vrmCache.js](../frontend/src/models/vrmCache.js)

### 22. Suppress spring bones while the root is travelling

Moving the root more than a metre in half a second is, to a spring joint, an acceleration
nothing else in this project produces — and the joints that notice first on these models
are the chest ones, which made the carousel read as violent rather than lively.
`springBoneManager.reset()` after `vrm.update()` for the length of a transition, so no
velocity is ever accumulated between marks.
→ [08-state-and-ui.md](08-state-and-ui.md)

### 23. A clip owns the body. Every additive layer fades out under it

The overlay, the weight shift, speech emphasis, the resting hand curl and the whole idle
delta set are scaled by `1 - clipInfluence`. Two reasons, and the second is why it is all
of them: a clip animates the fingers itself, so `Peace sign` came out as two extended
fingers with a resting curl added on top — and near gimbal the clip read-back is
ill-conditioned, so a constant delta added to it is not a constant amount of motion. See
invariant 24.
→ [03-frame-loop.md](03-frame-loop.md) · [composite.js](../frontend/src/lib/composite.js)

### 24. A clip read back off the rig must be unwrapped before anything touches it

The mixer writes quaternions; the compositor reads Euler. That conversion is **not
continuous** — measured on the shipped clips, the read-back jumps by up to a full turn in
one frame while the real rotation moves 3 degrees. Same rotation, different numbers, and
every layer that interpolates or adds to those numbers jumps with it.
`unwrapPose` picks the spelling nearest last frame's. It handles whole turns and the
second XYZ solution; it cannot fix gimbal itself, which is what invariant 23 is for.

**And unwrapping ACCUMULATES** — see invariant 26, which is the bill for this one.
→ [03-frame-loop.md](03-frame-loop.md) · [unwrapEuler.js](../frontend/src/lib/unwrapEuler.js)

### 25. The carousel changes `modelUrl` at the midpoint, never on the press

A button press sets `carousel`; the frame loop swaps the model on an empty stage. Swapping
on the press tears the model out from under its own exit animation, and it moves the
camera's head-height snap to a moment you can see it.
→ [08-state-and-ui.md](08-state-and-ui.md)

### 26. Blend a clip against a pose as QUATERNIONS, never as Euler numbers

Invariant 24 keeps the clip read-back continuous by choosing the spelling nearest last
frame's — and those choices accumulate. Measured on the shipped clips, `VRMA_01` ends
with `hips.z` at **360.6 degrees** and `VRMA_07` with `leftLowerArm.z` at **-721.5**: the
same rotations they describe near zero, spelled turns away.

At full clip weight that is free, because the blend returns the clip pose exactly. The
**fade-out** is where it costs. Interpolating those numbers down to the static pose walked
`hips.z` through a full turn in 600 ms, and `hips` is the skeleton root — so the whole
body cartwheeled sideways at the end of every wound-up clip.

Shifting by whole turns is not the fix: the arms wind up on the *second XYZ solution*,
which no turn-shifting removes. `blendPosesShortest` converts to quaternions, where a
rotation has no spelling at all, and slerps by the short arc.

`lerpPoses` keeps its Euler arithmetic for easing between presets, where its own comment
is true — those really are small rotations. Clip blending never was.
→ [03-frame-loop.md](03-frame-loop.md) · [quat.js](../frontend/src/lib/quat.js)

### 27. `commercial_use` and `redistribution` are different licence flags

A VRM's licence answers *may she appear in your product* and *may this file be handed on*
separately, and three of the eight models here answer them opposite ways. The project
filtered once on the first, recorded it as "the licence filter", and treated publishing
the files as settled — it was not.

Only `redistribution` governs what is committed. `npm run licences` reads it out of each
file and fails if git is tracking one that forbids it. Silence in a file's metadata is
not permission.
→ [ASSETS.md](../frontend/public/ASSETS.md) · [vrmMeta.js](../frontend/src/lib/vrmMeta.js)

---

## Three habits, not rules

**A green suite does not mean the pose is right.** `composite.test.js` once asserted the
arms mirror each other — true while the avatar stood in a permanent cheer, and true again
while the default pose was a symmetric mannequin. Anything spatial needs an eye on it.
→ [09-testing.md](09-testing.md)

**Bound values from both sides.** *"Too subtle to perceive"* passes every check that asks
whether a value is small. Several tests here now assert a floor as well as a ceiling,
because the bug that shipped was invisibility, not excess.
→ [09-testing.md](09-testing.md)

**Verify a difference, not a correctness.** A gaze sign was wrong for the whole life of
the function, directly beneath a comment describing the opposite — because the code and
the comment were only ever read together and both sounded right. It surfaced the moment a
second behaviour had to point the other way and a test compared the two.
→ [07-idle-motion.md](07-idle-motion.md)
