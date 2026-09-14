# Gestures

**Job of this doc:** explain the idle gesture system, how a gesture is shaped, and the
authoring rule the whole file was rewritten around.

See also: [06-poses-and-rig.md](06-poses-and-rig.md) (the measurement loop) ·
[12-conversational-states.md](12-conversational-states.md) (what suppresses gestures)

---

## Why they exist

This is the thing games have done for thirty years: leave a character alone and
eventually they scratch their head, roll a shoulder, check their weapon.

It works because it implies an inner life — *something happened that the player did not
cause*. Procedural sway says "this body is not a statue"; a gesture says "this person
is bored". They are different claims and you want both.

Authored as keyframes in [gestures.js](../frontend/src/lib/gestures.js) rather than
loaded as `.vrma`, for two reasons: clip playback in this project has never actually
executed ([11-open-questions.md](11-open-questions.md)), and keyframes stay pure data
the test suite can check without a GPU.

## The roster

| Gesture | In idle rotation | Notes |
|---|---|---|
| `scratch-head` | yes | Measured arm; rub distributed across the chain |
| `neck-stretch` | yes | Side to side. No arm bones, but it does write the shoulders |
| `neck-stretch-vertical` | yes | Chin up, hold, chin down, hold |
| `roll-shoulders` | yes | Up, back, released. **Pins both upper arms** so they ride with the shoulders, so it counts as an arm gesture |

`idle: false` marks a gesture the scheduler may not pick. Nothing carries it today —
`wave` did, and has been **removed from the project** (see below) — but the flag and its
filter stay, because the reasoning outlives the gesture: a companion that waves hello
every thirty seconds is a companion with a memory problem. Trigger it from the host
app when she arrives.

```js
useAvatarStore.getState().playGesture('scratch-head');
```

## Staging: she returns to `companion` first

Gesture keyframes are **absolute**, and the arm gestures begin and end at `ARM_DOWN` —
the arm hanging at her side, exactly where `companion` puts it. Fired while her hands
are behind her back, the blend drags them from behind her to a start position the
keyframes assume they already occupy, and the hand ends up somewhere no arm would be.

Re-measuring every gesture against every pose is a combinatorial problem, and arms are
the expensive thing to measure on this rig. So instead she **goes back to the pose the
gestures were authored against, plays, and returns**:

```
  arms-behind ──────────► companion ──────────► arms-behind
       └── gesture envelope fades in over the top ──┘
```

**The gesture starts in the same frame as the pose request, not after it.** The first
version waited a full `poseTransitionMs` for the pose to land, and it put a dead second
in front of every gesture — she visibly stopped in `companion` and *then* began, which
reads as two unrelated movements. Both eases run together instead: the base pose travels
out of `arms-behind` while the gesture envelope fades in over it. The pose transition is
the lead-out as well, once the gesture releases.

`gestureNeedsHomePose(name)` decides, and it is **derived from the keyframes** rather
than declared as a flag, so a gesture that grows an arm cannot forget to say so. That
derivation has now caught two gestures this doc had filed as spine-only.

> **The shoulder counts as a bone that places a hand.** Leaving it out is the mistake
> this rule was built with, and it is worth recording. Excluding the shoulder was right
> for every pose that existed at the time — and wrong the moment `arms-behind` arrived,
> because that pose holds her hands behind her back with a **50° roll at the shoulder**.
> A gesture that blends the shoulders toward neutral takes the hands out from behind her
> and leaves the arms pointing at nothing, without naming a single arm bone.

So the roster now splits like this:

| Gesture | Why it stages |
|---|---|
| `scratch-head` | absolute arm keyframes starting at `ARM_DOWN` |
| `roll-shoulders` | pins both upper arms so they ride with the shoulders |
| `neck-stretch`, `neck-stretch-vertical` | write the shoulders — a stretch that leaves them out is a head on a post |

Every gesture on the current roster needs it, which makes the predicate look redundant.
It is not: it is a fact about the roster rather than a rule. A gesture confined to head,
neck and chest would play anywhere, and this is what would let it.

## Scheduling

One fires every 16–46 s (`gestureIntervalMin/Max`), picked at random from
`IDLE_GESTURE_NAMES`. Long gaps are the point — the charm is entirely in the surprise,
and a head-scratch every eight seconds reads as a twitch, not a mood.

Suppressed while:

- **speaking** — a hand going to the face competes with the mouth at precisely the
  moment the mouth is the point
- **a full-pose state is held** (`thinking`) — her hands are already committed

A manual `playGesture(name)` always wins, even over a running gesture, or the panel
buttons would feel broken while one plays. A request naming nothing recognisable is a
**release** — that is how the panel clears a held gesture.

## How a gesture is shaped

```js
{
  label: 'Scratch head',
  idle: true,          // eligible for the random rotation
  hold: false,         // park at the peak instead of playing through
  duration: 3600,
  keys: [ { t: 0, pose: {...} }, ... ],
}
```

Keys hold **absolute** bone rotations at normalized times `0..1`. Absolute rather than
offsets, because a gesture is a *destination* — "hand at the top of the head" — and an
offset would make every value depend on whichever preset happened to be selected.

The blend back to the base pose is a separate weight envelope
(`gestureEnvelope`), so only the bones a gesture names are affected and everything
else keeps doing what it was doing. That is why she can scratch her head while still
breathing, swaying and shifting weight.

`blendPoseSubset` is what makes that true, and it is why `lerpPoses` could not be
reused: `lerpPoses` unions the two bone sets and treats a missing bone as zero, which
would drag every unnamed bone toward the T-pose in proportion to the gesture's weight.

> **INVARIANT: every key in a gesture must name the same bone set.** Interpolation
> treats a bone missing from a key as zero rotation, so a bone appearing in only some
> keys snaps toward the T-pose partway through. There is a test.

## `hold: true`

Parks a gesture at `HOLD_POINT` (halfway, inside the envelope's plateau) and never
expires it. It exists for repair work: it gives a still target to drag the Pose tab
sliders against.

The first attempt at holding simply zeroed the gesture's motion. That stopped the
*sweep* but the envelope still faded the whole thing out and the player still expired
it at its duration. **Stopping a thing moving is not the same as stopping it ending.**
Two tests now pin the contract: full weight at the hold point, and the hold point
landing before the ease-out begins.

## The authoring rule

> **Do not derive arm values from the axis conventions. Measure them.**

This file was written twice and the difference is entirely method. The record:

| Attempt | Method | Result |
|---|---|---|
| `scratch-head` #1 | derived from the axis table | A convincing **wave**. Promoted to one, and later removed. |
| `scratch-head` #2 | derived, corrected by reasoning | Worse |
| `scratch-neck` | derived | Never worked. Deleted. |
| `adjust-hair` | derived | Worked, then cut |
| `scratch-head` #3 | **measured in the Pose tab** | Correct |

How far off the guesses were: the real elbow sits at `y 2.07` where the guess had
`1.42`, and the real upper arm at `z 0.05` where the guess had `0.30`. No amount of
nudging finds that.

The pattern across every failure is consistent enough to act on:

> **Gestures that stay on the spine and shoulders work first time. Gestures that reach
> down the arm do not.**

Torso gestures can be written directly. Anything that puts a hand at a specific point
on the body should be dragged out in the Pose tab and pasted in.

## Two shaping lessons worth keeping

**Wrist and fingers carry the meaning, not the arm.** The same upper-arm and elbow
angles served both a wave and a head-scratch; everything that distinguished them happened past
the elbow. That is why attempt #1 read so unmistakably as a greeting — the arm was in
the right place, but the hand was flat, the wrist straight and the fingers splayed.

**Nothing on a body moves alone.** The scratch rub was first driven from the wrist
alone, which was robotic. It is now distributed down the chain with amplitude growing
outward — shoulder 1.25°, forearm 5°, wrist 1.5° — because scratching your own head is
an *elbow* movement. Leading from the wrist produces a flick that reads as brushing
something off.

That is the same mistake as the symmetric pose and the head-on-a-rigid-torso idle, in
a third costume. It is worth watching for.

## The fold axis is a property of the pose, not the rig

The rub names its axis per joint:

```js
rub: {
  upperArm: { axis: 'y', amount: deg(1.25) },
  lowerArm: { axis: 'z', amount: deg(5) },
  hand:     { axis: 'z', amount: deg(1.5) },
}
```

This is structural, not cosmetic. Two measurements of the *same* hand position folded
the elbow on different axes — `y 2.07` in one, `z 2.14` in the other — because `(z, y)`
behaves like latitude and longitude and both routes reach the same place. A sweep
hard-coded to `y` would have kept producing plausible numbers while swinging the arm
somewhere unrelated the moment a pose was re-measured.

A test derives the fold axis from the pose and asserts the sweep moves *that* axis.

## `wave` was removed

It is gone from `GESTURES`, from `PROMOTED_GESTURES`, and from the Animate menu, which is
clips only now. Removed on request rather than because it was broken — and worth a note
because two of this project's better lessons came out of it and both outlive it.

**It was an accident that got promoted.** It began as an attempt at `scratch-head` built
from the axis table, and turned out to be a more convincing wave than a head-scratch, so
it became one. That is still the clearest single illustration of why the axis table cannot
be trusted for anything putting a hand on the body — see the table above.

**Its palm roll is the sign-error shape.** Negative rolled the palm *away* from the
viewer, and "not facing the camera yet" looks exactly like "not far enough", so the first
correction made it worse. An effect that gets worse when you increase it usually has its
sign wrong rather than its magnitude. Worth carrying to the next gesture that does not
read right.

What went with it: `WAVE`, `waveAt`, and the only `idle: false` entry on the roster. The
flag and the filter in `IDLE_GESTURE_NAMES` are deliberately still there, for the next
gesture that should only ever fire on purpose.
