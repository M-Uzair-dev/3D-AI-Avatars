# The Frame Loop

**Job of this doc:** specify exactly what happens in one frame, in what order, and
which parts of that order are load-bearing.

This is the most dangerous file in the project to edit casually. Every rule here was
paid for. All of it lives in [VrmAvatar.jsx](../frontend/src/components/VrmAvatar.jsx).

See also: [02-architecture.md](02-architecture.md) · [10-invariants.md](10-invariants.md)

---

## The order

```
  1. clamp dt              Math.min(delta, 0.1)
  2. read store            useAvatarStore.getState()   ← transient, never a selector
  3. resolve state         speaking ? 'speaking' : s.conversationState
  4. sync clip selection   load or stop, if s.clipUrl changed

  ── BONES ────────────────────────────────────────────
  5. step idle             → blink, deltas, gaze, weightDeltas, speechDeltas,
                             gesturePose + weight, poseRequest
  6. apply poseRequest     s.setPose(...)  ← the loop's ONE write to the store
  7. mixer.update(dt)      ← BEFORE compositing
  8. read clip pose back   off the normalized bone nodes
  9. ease preset blend     lerpPoses toward the target preset
 10. ease state overlay    lerpPoses toward overlayFor(state)
 11. addPoses              preset + overlay + hands + weight shift + speech emphasis
 12. blend state pose      blendPoseSubset, if the state has a full pose
 13. blend gesture         blendPoseSubset, if one is running
 14. compositeBones(...)   pose → additive idle → manual overrides
 15. write bone rotations  node.rotation.set(...)

  ── EXPRESSIONS ──────────────────────────────────────
 16. resting warmth        ramped, zero while speaking
 17. emotions              em.setValue(name, value) from the panel
 18. visemes               em.setValue(v, dampedWeight)
 19. auto-blink            unless the panel is driving blink manually
 20. publish debug         setDebug({ weights, fps })

  ── FINALIZE ─────────────────────────────────────────
 21. lookAt                camera position + gaze offset
 22. vrm.update(dt)        ← LAST, EXACTLY ONCE
```

## Rule 1 — `vrm.update(dt)` runs exactly once per frame, last

This call is what applies accumulated expression values, resolves expression override
flags, and advances spring bones. It is not a "commit" you can sprinkle.

Call it **before** the `setValue` calls and this frame's expressions are ignored while
last frame's are applied. Call it **twice** and spring bones integrate at double rate.
Either failure produces output that is subtly wrong and miserable to debug, because
nothing errors — it just looks slightly off.

It is the final statement of `useFrame`. Keep it there.

## Rule 2 — the mixer runs BEFORE compositing

An `AnimationMixer` writes *straight to the normalized bone nodes*. The compositor also
writes straight to the normalized bone nodes. Whichever runs second wins.

So the sequence is: run the mixer, read what it produced back out of the bone nodes into
a plain `clipPose` object, then blend that against the static pose with `lerpPoses` and
hand the result into the base pose.

Composite first and the compositor silently erases the clip every single frame. The
symptom is "clips do nothing" with no error anywhere.

## Rule 2b — a clip read back off the rig is Euler, and Euler is not continuous

This is the subtlest thing in the file and it cost a real bug: *"the model slightly jerks
for a split second, and it happens in the same place all the time."*

The mixer writes **quaternions**. The compositor works in **Euler angles**. So every frame
a clip is playing, `VrmAvatar` reads `node.rotation` back — and a quaternion has many Euler
spellings. `setFromQuaternion` picks one, and which one it picks changes abruptly as the
rotation moves.

Measured on the six shipped clips, replayed through a headless mixer:

| clip | bone | real rotation change in one frame | Euler jump | `y` |
|---|---|---|---|---|
| VRMA_01 | `hips` | **3.2°** | 114.6° | −86.8° |
| VRMA_05 | `hips` | **6.4°** | 110.0° | −84.0° |
| VRMA_06 | `leftLowerArm` | **2.8°** | 92.1° | −87.0° |

The motion is smooth. The numbers are not. And note the `y` column — every one of these is
within a few degrees of ±90°, which is gimbal.

**Two different problems live in that gap, and they need different fixes.**

**Whole turns and branch swaps** are pure renumbering — same rotation, different spelling.
[`unwrapPose`](../frontend/src/lib/unwrapEuler.js) fixes them by choosing the spelling
nearest last frame's, considering both the full-turn shifts and the second XYZ solution
`(x+π, π−y, z+π)` (verified numerically as the same rotation to within 3.4e-6°). That
alone took the worst frame from 507° to 115°.

**Gimbal itself cannot be fixed by renumbering.** Near `y = ±90°` the Euler coordinates are
genuinely ill-conditioned: they *have* to move fast to describe a slow rotation. Writing
them straight back is harmless — same rotation — but **adding** to them is not. A constant
breathing or sway delta added to an ill-conditioned coordinate is not a constant amount of
motion, and that is what was visible.

So the additive layers all fade out under a clip, on the clip's own envelope —
[invariant 23](10-invariants.md). A recorded performance carries its own aliveness, so
nothing is lost by quieting ours while it plays.

**How this was found, because the method generalises:** the clips were replayed through a
real `AnimationMixer` and a real VRM in Node — no GPU needed, the mixer is pure maths — and
the frame-to-frame output was compared against the quaternion delta. Reading the code had
already produced three wrong theories. The script is not kept; it was twenty lines.

## Rule 3 — read the store transiently, never subscribe

```js
const s = useAvatarStore.getState();   // correct, inside useFrame
```

A selector subscription here would re-render the entire Canvas subtree on every slider
drag. Avoiding that is the entire reason zustand is in this project.

**One deliberate exception**, at step 6: the pose-drift scheduler calls `s.setPose()`.
That is safe for the reason the rule exists — it targets per-frame churn, and this fires
at most once every thirty seconds. The Pose tab genuinely should show which pose she is
in, so routing it through the store is correct rather than convenient.

## Rule 4 — `dt` is clamped

```js
const dt = Math.min(delta, 0.1);
```

An alt-tab pause otherwise arrives as one enormous step, which throws damping and spring
bones across the room.

One known side effect: the Debug tab computes FPS from the clamped `dt`, so a long pause
reads "10 fps" rather than the true near-zero. Recorded in
[11-open-questions.md](11-open-questions.md).

## The two ways a layer combines

Everything that writes bones does so in one of exactly two ways, and choosing the wrong
one is the most likely mistake when adding a layer.

### Additive — `addPoses`

Sums rotations. Right for anything that **modifies** a pose: the state overlay, the
resting hand curl, the weight shift, speech emphasis.

### Subset blend — `blendPoseSubset`

Interpolates toward absolute rotations, **only for the bones named**. Right for anything
that **is** a pose: a gesture, a full-pose conversational state.

The distinction that makes it necessary: `lerpPoses` unions both bone sets and treats a
missing bone as zero rotation. That is correct for blending two complete poses, and
badly wrong for a five-bone gesture — it would drag every other bone toward the T-pose in
proportion to the gesture's weight. `blendPoseSubset` leaves unnamed bones untouched,
which is why she can scratch her head while still breathing and swaying.

## The three bone layers

[compositeBones](../frontend/src/lib/composite.js) resolves the final three into one
rotation set. Lowest priority first:

| Layer | Behaviour |
|---|---|
| `pose` | everything from steps 9–13 — preset, overlay, hands, weight, gesture |
| `idleDeltas` | **additive** — drift, breath, sway, gaze head-follow |
| `manualOverrides` | **replaces** everything for that bone |

The output set is the *union* of every bone any layer mentions, so a bone touched only by
idle, or only by an override, still appears in the result.

A manual edit short-circuits pose and idle entirely for that one bone — which is what
makes the Pose tab's per-bone editing behave predictably while a preset is active.

**`compositeBones` has no default for its outer argument object.** A zero-argument call
throws `TypeError`. Always pass a full options object.

## What is deliberately NOT in `idleDeltas`

`idleDeltas` is scaled by `idleAttenuationWhileSpeaking` (0.7) while speaking. Three
things are therefore folded into the base pose instead, and each would break if
attenuated:

| Layer | Why it must not be attenuated |
|---|---|
| state overlay | The `speaking` overlay exists *to* apply while speaking |
| weight shift | Scaling it mid-sentence partly un-shifts her — a lurch onto the other foot the moment she starts talking |
| speech emphasis | It only exists while speaking; attenuating it cancels the one layer the state depends on |

This is the trap to check first when a layer "works except while speaking".

## Pose and overlay easing

Neither snaps. `currentPose` tracks where the rig actually is and `poseBlend` advances
from 0 to 1 over `poseTransitionMs` (900 ms); `currentOverlay` does the same over
`stateTransitionMs` (1400 ms, raised from 550 — half a second reads as a cut).

`poseTransitionMs` was raised from 400 ms once poses started changing on their own — a
self-initiated move has to look considered, and folding your arms in under half a second
looks like flinching.

`lerpPoses` interpolates a bone present on only one side against zero rotation, so
presets that touch different bone sets still blend cleanly. It is a Euler lerp rather
than a quaternion slerp — deliberate, because these are small rotations on a humanoid rig
and the difference is not visible at this scale.

## Why visemes are not hand-suppressed

Steps 16–18 write warmth, then emotions, then visemes, and **nothing arbitrates between
them in application code.** That is intentional: VRM's own override flags do it inside
`vrm.update()`.

The one concession is that resting warmth ramps to **zero while speaking**, because on a
VRM 0.x model a raised emotion can suppress visemes outright and warmth is the only
emotion this system raises on its own. That is a decision about what *we* drive, not
arbitration between layers.

Do not add manual suppression logic. See [05-expressions.md](05-expressions.md).
