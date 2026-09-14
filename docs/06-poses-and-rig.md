# Poses and the Rig

**Job of this doc:** record the rig's axis conventions, how poses are authored, and the
traps that have already cost this project six wrong answers.

**If you read one section here, read [The authoring rule](#the-authoring-rule).**

See also: [03-frame-loop.md](03-frame-loop.md) (how poses are composited and eased) ·
[13-gestures.md](13-gestures.md) (the same lesson, learned again)

---

## Bone access

> **Always `vrm.humanoid.getNormalizedBoneNode(name)`. Never raw scene-graph traversal.**

Normalized bones are what make a pose portable. Their rest pose is a T-pose with arms
along the X axis, identically on every model. Raw bone orientations differ between
models, so a rotation authored against raw bones is meaningless on the next character.

[vrmIntrospect.js](../frontend/src/lib/vrmIntrospect.js) holds `HUMANOID_BONES`, the
full VRM 1.0 vocabulary in top-down UI order, and `listBones(vrm)` filters it to the
bones the loaded model actually has. Fingers are omitted from that vocabulary
deliberately — thirty extra sliders would drown the panel — and live in `FINGER_BONES`
instead. See [07-idle-motion.md](07-idle-motion.md).

## Axis conventions — measured, not read off the spec

These were established by rotating one bone at a time and reading the resulting
world-space hand position back out of `matrixWorld`. **Deriving them from the VRM spec
produced two wrong answers in a row.** For the **left** arm:

| Axis | Meaning |
|---|---|
| `z` | **Elevation.** POSITIVE lowers the arm toward the body; negative raises it. |
| `y` | **Azimuth.** NEGATIVE swings the arm forward, toward the camera. |
| `x` | **Twist** along the arm's own axis. Does not move the hand at all from rest — it rolls the limb, changing the plane the elbow bends in. |

The **right arm mirrors all three.**

For the torso and head: `x` is pitch (positive tips the chin **down**), `y` is yaw
(positive turns to **her left**), `z` is roll (positive tilts toward her **right**
shoulder).

For a **hand**, confirmed by eye rather than derived: `x` is the wrist roll, since bone
rotations apply in the parent's frame and the forearm's own axis is `x`.

Getting arm `z` backwards is what stood the avatar in a permanent cheer on the first
pass.

### The test that did not catch it

`composite.test.js` used to assert the arms *mirror* each other — which was true in both
the correct and the inverted orientation, and true again while the default pose was a
symmetric mannequin. **A test can verify symmetry; it cannot tell you which way is
down.**

That assertion has been replaced by its opposite: the default pose must be
**asymmetric**. The old test would have blocked the fix.

## The Euler-order trap

Euler order is three.js's default **XYZ**, so the matrix is `Rx·Ry·Rz` and **`z` is
applied first.**

That makes `(z, y)` behave like **(latitude, longitude)**: `z` sets how far the arm has
dropped from horizontal, and *then* `y` swings it around the vertical axis.

The consequence is the trap. Near the poles, longitude stops meaning much — so once `z`
has put the arm near vertical (`|z| > ~1.2`, arm at the side), `y` barely moves the hand
forward at all.

This degeneracy is precisely why the old `arms-crossed` preset read as "hands clasped at
the waist": it asked `y` to do work that only a smaller `z` could permit. The fix was
not a bigger `y`, it was a smaller `z` (~1.05).

**It also means a hand position does not have one answer.** Two measurements of the same
head-scratch reached the same place by different routes — one folding the elbow on `y`,
the other on `z`. Both are correct; anything built on top of a pose must not assume
which axis carries the fold. See [13-gestures.md](13-gestures.md).

## The presets

All in [poses.js](../frontend/src/lib/poses.js). `POSE_NAMES` is derived from the keys;
`DEFAULT_POSE` is `companion`.

| Preset | Intent |
|---|---|
| `companion` | **Default.** The resting posture. Asymmetric — see below. |
| `arms-behind` | Both hands behind the back, **staggered** rather than mirrored. The second resting shape, and what the idle scheduler drifts into. |
| `arm-behind-left` | One hand behind, the other hanging at rest. |
| `arm-behind-right` | The mirror of it. |
| `thinking` | Right forearm folded up, hand just under the chin, head tipped into it. Also drives the `thinking` conversational state. |

All three `behind` variants are built from one exported measurement,
`ARM_BEHIND_LEFT`, plus `mirrorLimb` — retune that and every variant follows. There is a
test that says so.

## Why the arms went behind her back

`arms-crossed` was the second resting shape and it had a defect no tuning fixes:
**crossed forearms pass through the chest** at some points in the sway cycle. Folding
the arms across the body puts both forearms exactly where the ribcage is, the rig has no
collision, and the sway keeps moving the ribcage. The only reliable fix is to put the
hands somewhere the body is not.

Behind her is that place, and it turned out to be a better pose for the job anyway:
hands behind the back reads as *at ease and still attentive* — someone listening to you
with nothing in their hands. Crossed arms always carried a hint of closed-off that a
companion does not want.

**It has since been removed from `POSES` altogether.** It spent a while selectable but
out of `IDLE_POSE_ROTATION` — a pose good enough to pick by hand but not to appear
unasked. That turned out to be a distinction without a use: nothing selected it, and a
preset carrying a known defect is a trap for whoever reads the list next. The reasoning
is kept here because it is the argument *for* the pose that replaced it.

Two things carry the pose, and neither is the arm:

- **The shoulder does the work** (`x -0.87`, ~50°). Putting a hand behind your back is a
  shoulder movement that the arm follows. An arm swung back from a level shoulder is the
  same failure this project has now hit in four separate poses.
- **The two arms are staggered, not mirrored.** A perfect mirror puts both hands at the
  same point behind her spine — the identical collision that made `arms-crossed` bad,
  merely hidden from the camera. `BEHIND_STAGGER` takes ~8° of fold out of the right
  forearm so the left passes in front of it. It is the one estimated number in the pose.

> **The axis table above does not apply naively to this pose.** A 50° roll at the
> shoulder reorients the whole chain, so the upper arm's `y` is no longer the plain
> azimuth it is from rest. If these values need changing, drag them again — do not
> reason about them from the table. The tests assert that the pose *differs* from rest
> rather than which way it points, for exactly this reason.

Trimmed from eight. `t-pose`, `relaxed`, `pointing` and `waving` were reference material
rather than anything a companion needs; `hands-on-hips` was removed because it fights
the weight shift, which moves the hips out from under the hands.

One reason that is easy to undo by accident:

- **`thinking` keeps the hand below the mouth**, not over it. Watching the visemes is
  the entire point of the app.

## `companion`, and why symmetry is the enemy

The preset it replaced was geometrically correct and still read as a mannequin, for one
reason: it was **perfectly symmetric** — mirrored arms, level shoulders, head at exactly
zero. Nothing else about a resting pose matters as much.

A human at rest is never mirrored. They put their weight on one leg, which tips the
pelvis, which the spine has to counter, which drops one shoulder. Painters call the
result *contrapposto* and have used it for six centuries for exactly this reason: it is
the difference between a figure and a statue.

Three things do the work, in order of how much they matter:

1. **Weight on her left leg.** Hips roll ~2°, spine counters, chest counters again.
   Opposition between the hip line and the shoulder line *is* contrapposto.
2. **The body is off-square.** Hips turn ~6° and the head turns most of the way back
   toward the camera. A torso square to the lens is the second mannequin tell, and the
   reason passport photos look lifeless.
3. **The arms differ from each other.** By only a few degrees — but the eye reads two
   identical limbs as manufactured almost instantly.

A small head tilt is included because a lateral tilt is read near-universally as warmth
and attention. It is the cheapest friendliness in the rig.

The pose is composed from two halves rather than written out flat:

```js
companion: addPoses(CONTRAPPOSTO, COMPANION_ASYMMETRY)
```

`CONTRAPPOSTO` is exported because `weightShiftDeltas` negates it to produce the
opposite stance. One definition, so a retune of the pose cannot silently stop matching
the shift — a mismatch there would show only as a lurch every twenty seconds, which is
miserable to track down. See [07-idle-motion.md](07-idle-motion.md).

## Mirroring a measured limb

Only one arm ever gets measured; `mirrorLimb()` produces the other. The `behind` poses
are its first real caller.

> **The rule is `(x, -y, -z)`.** "Negate everything" is the obvious guess and it is
> wrong.

Reflection in the body's midplane is an *improper* transform — it reverses handedness. A
rotation is an axial vector, so under `M = diag(-1, 1, 1)` it maps to `-M·r`, which is
`(x, -y, -z)`: the component along the mirror's normal keeps its sign, the other two
flip.

Counter-intuitive for the twist, and still correct. Normalized bones share the model's
global axes and the two arms point in **opposite** directions along X, so the same
rotation about world X twists each limb the opposite way about its own axis — which is
precisely mirrored twist.

A test checks the rule against a symmetric arm pair that was hand-written long before
the helper existed, so the assertion rests on independent data rather than on the same
reasoning that produced the code.

## The measured values are measurements of a model that is gone

Worth knowing before you trust a number in this file. Every arm chain here was dragged
out against `kitsaki.vrm`, which was removed when the models were filtered down to those
whose metadata permits commercial use.

Normalized bones make a pose *portable* in the sense that it will apply cleanly to any
VRM — the bone names are identical and nothing errors. They do not make it *correct*:
where a hand lands depends on upper-arm and forearm length, and on how far apart the
shoulders are. A pose measured on one model puts the hand somewhere else on the next.

So the split is:

- **torso, neck, shoulders, contrapposto** — carry across unchanged, as they always have
- **anything placing a hand on the body** — `thinking`, `arms-behind`, `scratch-head`,
  — are now estimates again, of exactly the kind this file spends its length
  warning about

Nothing will throw and no test will catch it. Re-measure against whichever model you
settle on, and settle on one first. Status in
[11-open-questions.md](11-open-questions.md).

## The authoring rule

> **Do not derive arm values. Measure them.**

Every arm here was originally solved by **inverse kinematics against anatomical
targets** — "elbow here, wrist there", in world coordinates from the model's own
measurements (upper arm 0.213, forearm 0.199, shoulder at y=1.293). Converged wrist
error was under 25 mm.

**That was not enough, and understanding why is the most useful thing in this doc.**
Every solved arm hit its wrist target and still looked wrong, because a solver scoring
wrist *position* is blind to everything that carries the read:

- **the twist on the upper arm**, which by definition does not move the wrist at all and
  so contributes nothing to the score — while deciding whether a folded forearm crosses
  the body or juts out of it
- **the shoulder**, left level while a real one lifts with the arm
- **the wrist's own rotation**, which decides whether a hand *rests on* a chin or
  *presents a palm at* it

The clearest single example, from `arms-crossed` — a preset since removed, though the
measurement outlived it. Re-measuring it moved two axes by nothing:

```
leftUpperArm   y  -0.477 → -0.48    already right
               z   1.097 →  1.10    already right
               x   0     →  0.45    ← the entire problem
```

Two of three axes correct to two decimal places, and the third — the twist — left at
zero by a solver that could not see it.

> **Solvers get position right and orientation wrong. Orientation carries the read.**

### Torso is cheap, arms are expensive

A pattern strong enough to plan around, established across six attempts:

> **Values on the spine, neck and shoulders can be written directly and work first
> time. Values down the arm cannot.**

Every posture and gesture authored on the torso worked immediately. Every one that
reached down the arm failed and had to be measured. Budget accordingly, and reach for
the Pose tab first for anything that puts a hand at a specific point on the body. Full
record in [13-gestures.md](13-gestures.md).

## The authoring loop

This is the intended way to make or fix a pose, and it beats reasoning from the spec
every time:

1. `npm run dev`, open the **Pose** tab
2. Select the preset you are working from
3. Drag per-bone X/Y/Z sliders until it looks right
4. Press **Copy pose JSON**
5. Paste into `poses.js` — or into a gesture keyframe, which takes the same shape

A screenshot of the slider values works just as well as the JSON.

[PoseTab.jsx](../frontend/src/components/ControlPanel/PoseTab.jsx) exports what the
compositor would produce **with idle switched off** — the static pose, not a momentary
frame of head drift — rounded to three decimals, in exactly the shape `POSES` expects.

Two behaviours that make the loop usable:

- **Editing a bone overrides the preset for that bone only.** An amber `edited` marker
  and a per-bone `reset` appear; `Reset bones` clears them all.
- **The first edit to a bone seeds from the active preset**, not from zero. Nudging one
  axis does not silently drop the other two. Seeding from zero made the limb jump the
  instant a slider was touched, which defeated the whole loop. Bones the preset does not
  mention still start at zero. See
  [avatarStore.js](../frontend/src/stores/avatarStore.js) and its two tests.

For correcting something mid-motion, a gesture can be marked `hold: true` so it parks at
its peak and gives a still target to drag against. See [13-gestures.md](13-gestures.md).

## Animation clips (`.vrma`)

[useVrmAnimations.js](../frontend/src/hooks/useVrmAnimations.js) loads `.vrma` files via
`VRMAnimationLoaderPlugin`, builds a clip with `createVRMAnimationClip(animation, vrm)`,
and plays it through an `AnimationMixer`.

Clips are discovered by [`/api/animations`](../frontend/src/app/api/animations/route.js)
listing `frontend/public/animations/`, so adding one is a file-drop, not a code edit.
`clipWeight` blends between the static pose (0) and the clip (1).

**The mixer must run before compositing** — this is the trap described in
[03-frame-loop.md](03-frame-loop.md), and it is the first thing to check if a clip
appears to do nothing.

### Read the clip back through `CLIP_BONES`, never a narrower list

The mixer writes to the normalized bones; the compositor reads them into `clipPose` and
then writes its own result over the top. **Any bone missing from that read-back is
silently discarded** — the clip animated it, and the compositor painted over it.

This has now caught the project out twice, and both times the symptom was identical: the
clip plays, most of the body moves, and the part you were actually watching does not.

| Read-back list | What it dropped | How it looked |
|---|---|---|
| the active preset's key set | the legs | `Squat` moved everything except the squat |
| `HUMANOID_BONES` | all 30 finger bones | `Peace sign` made no peace sign, `Shoot` had no gun |

The fingers are the sharper lesson, because omitting them from `HUMANOID_BONES` is
*correct* — that list drives the Pose tab, and thirty extra sliders would drown it. The
mistake was reusing a list built for one purpose in a place with different requirements.
A clip does not care how the panel is organised; it carries whatever its author recorded,
and the pixiv pack records all 55 humanoid bones.

`CLIP_BONES` in [vrmIntrospect.js](../frontend/src/lib/vrmIntrospect.js) is
`HUMANOID_BONES` plus `FINGER_BONES`, and a test asserts it covers the full vocabulary
rather than merely being non-empty.

> Because the resting hand curl is part of the base pose, the fingers blend correctly
> once they are read back: `lerpPoses` carries them from the idle curl to the clip's own
> hand shape as the envelope opens.

### A clip plays once and hands the body back

`LoopOnce`, not the mixer's default `LoopRepeat`. These are punctuation — a greeting, a
peace sign, a spin — and a looping greeting is the same mistake as a companion who waves
hello every thirty seconds, which is why a greeting gesture would be out of the rotation for
exactly the same reason.

### The clip must ease in and out, at both ends

> **The first version of play-once eased only the way out, and it jerked at both ends.**
> Worth recording, because each end had a different cause and only one of them was the
> obvious one.

**`clipEnvelope` in [clips.js](../frontend/src/lib/clips.js)** is the fix for the start:
zero at both ends, one through the middle, smoothstepped — deliberately the same contract
as `gestureEnvelope`, because it is the same problem. Applied at full weight on the first
frame its action exists, a clip cuts from the standing pose to its own first frame in a
single frame. Every other layer here eases; the clip was the one that did not.

The fade-out runs **inside** the clip's own duration rather than after it, so the last
600 ms of recorded motion is traded for a seamless return. That is a cheap trade: the
tail of a clip is a character settling back toward rest anyway, so it lands near where
the clip was going.

`DEFAULTS.clipFadeMs` is both ends. `clipElapsed` is a ref in `VrmAvatar` because it
moves every frame ([invariant 2](10-invariants.md)), and the envelope *scales* the
store's `clipWeight` rather than replacing it, so the panel slider keeps working
throughout.

### The other half of the jerk was the hips, and it outlived the clip

`createVRMAnimationClip` emits **a hips translation track** alongside the rotations —
`${nodeName}.position`, scaled from the clip's rest hips height to the model's.

The compositor only ever writes `node.rotation`. Nothing in `src/` touched `.position` at
all. So the clip's root motion was landing on the model raw: snapped on at frame 0, and
then — because `stopAllAction` stops the mixer *writing* without undoing what it wrote —
left exactly where the clip finished, permanently.

That is the more interesting half, because it is the general form of the trap:

> **The compositor only writes the bones some layer names.** Anything the mixer touched
> that no layer names — the legs, the fingers, the hips translation — keeps the clip's
> last frame forever.

Two things fix it. The hips position is interpolated against
`humanoid.normalizedRestPose.hips.position` by the same envelope as the rotations (against
*rest*, not toward zero — normalized rest hips sit at hip height, and zero would drop her
through the floor). And `releaseClip()` calls **`vrm.humanoid.resetNormalizedPose()`**,
which restores rotation *and* position across the whole humanoid; the compositor writes
its own bones again on the same frame.

**`setClip(null)`** then clears the selection. That is a frame-loop write to the store,
and it is the same exception the pose drift takes: once at the end of a clip rather than
per frame, and the Pose tab should not go on highlighting a clip that has stopped.

### Read the clip off every humanoid bone, not the preset's

`clipPose` is built by walking `HUMANOID_BONES`, not `Object.keys(POSES[poseName])`.

A preset names the handful of bones that make its shape — `companion` never mentions a
leg. A clip animates the whole body. Reading the mixer's output through the preset's key
set therefore dropped every bone the preset did not happen to care about, which meant
`Squat` moved everything except the part that squats. Nothing errored; the clip just
played a partial body.

It is the same lesson as [invariant 5](10-invariants.md) in a different costume:
**enumerate from the model, not from a list that happens to be nearby.**
