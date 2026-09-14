# Conversational States

**Job of this doc:** define the five states the host application drives, what each one
means, and the two mechanisms they are built from.

This is the layer that separates an AI companion from a text-to-speech mannequin. It
is also the one with a contract the host app has to honour, so read the meanings as
carefully as the code.

See also: [07-idle-motion.md](07-idle-motion.md) (what runs underneath them) ·
[13-gestures.md](13-gestures.md) (what interrupts them)

---

## The contract

One store key, one action:

```js
useAvatarStore.getState().setConversationState('working');
```

Valid values are in `CONVERSATION_STATES` from
[postures.js](../frontend/src/lib/postures.js):

| State | Means | Reads as |
|---|---|---|
| `idle` | Nothing is happening | Settled weight, wandering gaze, slow blinks |
| `listening` | User is typing or speaking | Settles **back** at the hips and brings the head toward you, holds your gaze |
| `thinking` | Request sent, no reply yet | Hand to chin, eyes break away **upward** |
| `working` | Long task running — image, app, build | Folds **down**, gaze drops and stays, glances up periodically |
| `speaking` | Reply being delivered | **Identical to idle from the neck down.** Eyes lock to the camera, head moves on the rhythm |

`speaking` is the exception to "the host drives it": an active viseme timeline wins
over whatever the store says, because `VrmAvatar` knows it is speaking first-hand.

```js
const convState = speaking ? 'speaking' : s.conversationState;
```

That keeps the caller from having to sequence two updates, and it means the mouth and
the posture can never disagree.

> **These meanings are the contract as much as the names are.** A caller that sets
> `thinking` while streaming a reply gets an avatar looking away from the user
> mid-sentence. `working` is for tasks measured in tens of seconds and up.

## Two mechanisms, and when each is right

A state is expressed as **either** a small additive overlay **or** a full pose. The
choice is not stylistic — it follows from how long the state is held.

### Overlays — `STATE_OVERLAYS`

A few bones, added on top of whatever pose preset is selected, eased in over
`stateTransitionMs` (1400 ms). `listening`, `working` and `speaking` use these.

`listening` is the one that was **measured in the Pose tab** rather than written, then
expressed as the delta from `companion` so it stays an overlay. Three numbers carry it:
`hips.x -0.42` for the lean, `neck.x +0.36` bringing the head back over it, and
`upperChest.y -0.11` turning the torso off-square. The neck counter-pitch is the part to
preserve through any retune — a body that pitches at the hips and lets the head ride
along is a plank.

#### The legs must not come with the pelvis

`hips` is the **root of the VRM humanoid skeleton**, so a rotation there carries the
femurs, shins and feet along with the torso. At 24 degrees the result is a body that
tips as one rigid plank from the ankles — reported, accurately, as looking like the
Michael Jackson lean rather than like someone leaning in.

The measured hip value was **not** the thing that was wrong, so it was not touched. The
fix cancels the same rotation at both femurs:

```js
hips:         { x: LISTEN_HIP_PITCH }   // -0.42
leftUpperLeg: { x: -LISTEN_HIP_PITCH }
rightUpperLeg:{ x: -LISTEN_HIP_PITCH }
```

That leaves the torso shape exactly as it was dragged out in the Pose tab and converts a
whole-body tip into a hinge at the hip joint, which is what a standing lean actually is:
the pelvis rotates and the legs stay under you.

All three are keyed off one constant, because the failure is **silent** — nothing throws
and the bone names stay valid; the legs simply travel with the pelvis again. A test in
`postures.test.js` pins `hips + upperLeg` at zero on every axis, for **every** overlay
rather than just this one, so the next overlay that reaches for `hips` cannot reintroduce
it. `working` spreads its pitch across spine, chest, neck and head and never touches the
hips, which is why it was never affected.

It is four times the size of anything else here, which retired the old "every axis under
0.2 rad" test. The rule that replaced it is the one that bound was reaching for:
**an overlay must never touch a bone that places a hand.** Torso lean can be large; an
overlay dragging the arms would fight whichever preset is selected.

Because they are additive and partial, the Pose tab keeps working underneath: a state
colours the current pose rather than replacing it, and every idle behaviour keeps
running. That is what makes them safe to hold for minutes.

### Full poses — `STATE_POSES`

An absolute pose, blended over the base with `blendPoseSubset` exactly as a gesture is.
Only `thinking` uses one, and it reuses the measured `thinking` preset from
[poses.js](../frontend/src/lib/poses.js).

`thinking` earns a full pose because *considering something* has a recognisable shape —
hand to chin — and no amount of spine tilt substitutes for it. The other states are
shadings of standing still, which is exactly what an overlay is for.

While a full-pose state is held, **idle gestures are suppressed**: her hands are
already committed, and a gesture would fight the same bones.

**It also borrows `companion` for the duration.** `STATE_POSES.thinking` was authored
over `companion`, and `blendPoseSubset` only touches the bones it names. Entered while
her hands are behind her back, the shoulder it does not name keeps the 50° roll that put
them there, and the free arm hangs off a twisted shoulder. So the base pose moves to
`companion` while the state is held and returns to whatever she was in afterwards — the
same trade the arm gestures make, in [13-gestures.md](13-gestures.md).

## On magnitude — the mistake this file made first

> The overlays were originally authored at half a degree to two degrees, with a
> comment approving of how subtle they were. They were invisible. The four states
> were distinguishable only by reading the store.

The error was applying the right rule to the wrong thing. **Subtlety is correct for
idle motion** — sway, breath, drift — because that runs continuously and anything
large enough to notice moment-to-moment becomes unbearable over an hour.
**Conversational states are the opposite kind of thing:** discrete signals, shown
once, that a viewer has to *read*.

> A state change nobody can see is not a subtle state change. It is a no-op.

They now run to five to nine degrees of accumulated lean.

### Opposition beats magnitude

Making them bigger was necessary and not sufficient. Three states that all lean
forward by slightly different amounts are not a contrast at any size. So the shapes
are deliberately opposed:

```
  listening    settles BACK at the hips, head carried TOWARD you
  working      folds forward and DOWN, rounded and turned away
  idle         the reference — the companion pose, nothing added
  speaking     also the reference. Everything it does is above the neck
```

**`speaking` has no posture at all, and that is the current answer rather than a gap.**

It used to open the chest backward and draw the shoulders with it — the physical
opposite of listening, so the two read as a contrast. That was right when the idle layer
was thinner. It stopped being right for a reason worth recording: **the idle layer got
good enough to cause the problem.** Between the gaze wander, the head drift and the
microsaccades she is rarely looking straight down the lens, and that — not her posture —
is what makes a talking avatar look wrong. Fixing the eyes and leaving the body alone
reads better than any postural change did.

So the whole state is two things, and both are head:

- **the eyes lock to the camera** for the utterance, snapped on the frame speech starts
  and released the frame it ends
- **`speechEmphasis` moves the head at 1–3 Hz** against sway's 0.2 — a tempo gap rather
  than a shape

The opposition this section used to describe is therefore gone, having broken twice:
first when `listening` was measured and turned out to settle *back* at the hips rather
than lean forward, then when speaking's posture was removed outright. The contrast that
remains is between `listening` having a posture and `speaking` having none, plus what
the eyes and the tempo are doing. A test asserts both halves, including that emptying
`listening` too would be caught.

Two tests guard this, and between them they describe the whole failure:
`aliveness.test.js` asserts a **lower** bound on every non-idle overlay, and that
`listening` and `speaking` lean opposite ways. An upper bound alone could never have
caught it — *"too subtle to perceive"* passes every check that asks whether a value is
small.

## States are behaviour, not only shape

The strongest signals in this layer are not poses at all.

**Gaze direction separates `thinking` from `working`,** and it does so instantly
without anyone being told:

| | direction | duration |
|---|---|---|
| `thinking` | **up** and away | brief — the middle-distance look of someone retrieving something |
| `working` | **down** | sustained — absorbed in something in front of her |

Sustained downward gaze is the clearest way a body says *you do not need to wait on
me*. See `pickGazeOffset` and `pickWorkGazeOffset` in
[aliveness.js](../frontend/src/lib/aliveness.js).

**`listening` narrows the gaze** to 45% wander held 1.7× longer, so her eyes settle on
you rather than roaming. Roaming eyes contradict a lean-in.

**`speaking` holds the camera.** The wander is switched off for the duration, the target
snaps to centre the moment speech begins, and a fresh wander target is picked the moment
it ends — so she is never left staring down the lens after she has stopped talking.
Every other state treats a fixed gaze as the thing to avoid; this one treats losing it
as the thing to avoid. See [07-idle-motion.md](07-idle-motion.md).

**`speaking` adds motion.** Speaking is an activity, not a shape — people move their
heads constantly while they talk, and a head that holds still through a sentence is the
clearest tell that something is being *played back* rather than said. `speechEmphasis`
runs at 1–3 Hz where sway is 0.2 and breath 0.25; that tempo gap is what makes the
state read before the shape registers.

This also reversed an earlier decision. Idle motion used to be damped to `0.4` while
speaking so it would not compete with the mouth. Half right — undirected drift does
compete — but the answer was never *stillness*; she was visibly stiller while talking
than while silent. It is now `0.7`, with directed emphasis supplying the rest.

**`working` paces the whole system differently**, via `DEFAULTS.workingPace`. It is a
minutes-long state, and numbers tuned for a short one are wrong across that span —
someone concentrating for minutes fidgets *more*, not less:

| | scale |
|---|---|
| gesture interval | ×0.55 — more frequent |
| weight-shift interval | ×0.7 |
| breath rate | ×0.8 — slower |
| breath amplitude | ×1.15 — deeper |
| resting warmth | ×0.55 — concentration, not beaming |

Scales multiply the store's values rather than replacing them, so the Idle tab's
sliders stay meaningful in every state.

## The check-in glance

Every 20–40 s while `working`, she looks up at the viewer for about 1.1 s, then back
down to the task.

It is the state's progress indicator, and a better one than a spinner: it says *still
running* and *still yours* in the same beat, with no UI at all. Without it, nothing
distinguishes a long task from a hung process — which is the one impression this state
must never give.

The interval has to stay long. A companion who keeps glancing up reads as unable to
concentrate, which is the opposite of the point.

One implementation detail worth keeping: the ordinary gaze-wander schedule is
**blocked** during a glance. Without that guard, a routine saccade fires a fraction of
a second into the check-in and cuts it short.

## Where it all lands in the frame

State overlays are folded into the **base pose**, not into `idleDeltas`:

```js
const basePose = addPoses(preset, stateOverlay, relaxedHands, weightDeltas, speechDeltas);
```

That is deliberate. `idleDeltas` is attenuated while speaking, and attenuating the
`speaking` overlay — or the speech emphasis, which only *exists* while speaking —
would unpick each of them at exactly the wrong moment.

Full ordering in [03-frame-loop.md](03-frame-loop.md).
