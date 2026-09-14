# Idle Motion

**Job of this doc:** explain the aliveness layer — everything that runs continuously
underneath poses, states and gestures — and why it punches so far above its size.

See also: [03-frame-loop.md](03-frame-loop.md) (how idle is attenuated and composited)
· [12-conversational-states.md](12-conversational-states.md) (how states re-pace it)

---

## Why this layer matters

> Idle is not garnish. A face that is perfectly still between sentences reads as dead,
> and no amount of lip-sync quality compensates.

That was true when this layer was thirty lines. The second lesson cost more:

> A head drifting on a rigid torso is **worse** than total stillness. The eye picks up
> that exactly one part is animated and the illusion collapses. That is a bobblehead.

Aliveness is not amplitude. It is **coupling and lag**. A real body is a chain: the
hips shift, the spine counters to keep the head level, the shoulders counter again, and
the arms arrive last because they are hanging. Every link is late by a few tens of
milliseconds, and that lag is the entire effect. Drive every bone from the same sine
with the same phase and you get a mannequin on a boat.

Most of the maths lives in [aliveness.js](../frontend/src/lib/aliveness.js), blinking in
[blink.js](../frontend/src/lib/blink.js);
[idleMath.js](../frontend/src/lib/idleMath.js) keeps the three original behaviours.

## The behaviours

| Behaviour | Drives | Source |
|---|---|---|
| Blink | the `blink` expression | `blinkEnvelope()` + scheduling in the hook |
| Head drift | `head`, additively | `driftDeltas()` |
| Breathing | chest, spine, shoulders, head | `breathChain()` |
| **Weight sway** | hips → spine → chest → shoulders → arms | `swayDeltas()` |
| **Weight shift** | the whole contrapposto, mirrored | `weightShiftDeltas()` |
| **Gaze** | `vrm.lookAt` + partial head follow | `pickGazeOffset()`, `sampleGaze()`, `gazeJitter()` |
| **Hand relax** | all thirty finger bones | `relaxedHandPose()` |
| **Pose drift** | `poseName` in the store | scheduled in the hook |
| Speech emphasis | head + chest, only while speaking | `speechEmphasis()` |

Each has a toggle and live tunables in the Idle tab.

## Weight sway — coupling and lag

```js
hips:          { y: w  * a * 0.55, z: w  * a        }
spine:         { y: -w1 * a * 0.3, z: -w1 * a * 0.45 }   // counters
chest:         { y: -w1 * a * 0.22, z: -w1 * a * 0.3  }   // counters again
leftUpperArm:  { y: w2 * a * 0.5,  z: w2 * a * 0.55 }    // doubled lag
```

Two things are load-bearing.

**The counter-rotation** is what makes it read as *balance* rather than as swaying.
When the hips roll one way the spine and chest roll back — that is what a body does to
keep its head over its feet. Skip it and the whole torso tips like a felled tree.

**The arms share the same `z` sign**, which looks wrong on paper and is right in
practice: `z` is mirrored between the arms, so one signed value raises the left while
lowering the right — exactly what a roll does to a pair of hanging arms.

Amplitude is ~1.5° at the hips, less at every link above. Turning only this off is the
fastest way to see why the whole layer exists: she goes straight back to being a head
on a post.

## Weight shift — the only thing here that does not oscillate

Contrapposto fixes the mannequin problem and creates a smaller one: a body holding the
*same* asymmetry forever is still a held shape. Every 14–34 s she rolls her weight onto
the other foot over ~2.1 s, and it is a whole-body event.

The maths is a **negation, not a second pose**:

```js
delta = base * (side - 1)     // side +1 = as authored, -1 = fully mirrored
```

`CONTRAPPOSTO` in [poses.js](../frontend/src/lib/poses.js) is the single definition of
"the asymmetry", exported precisely so the shifter cannot drift out of sync with the
pose. Duplicating those numbers would mean a retune silently stopped matching, and the
mismatch would only show as a lurch every twenty seconds — miserable to track down.

Pitch is excluded: leaning forward stays leaning forward regardless of which leg
carries you, and flipping it would rock her backwards on every shift.

It is returned **outside** `deltas` because `deltas` is attenuated while speaking, and
scaling the weight shift mid-sentence would partly un-shift her.

## Gaze — the eyes must not lock

Tracking the camera exactly produces a fixed, unblinking stare, which is the single
most unsettling thing an avatar can do. So the eyes hold a point for a second or two,
then flick to another in under a tenth of a second.

Both halves matter. Without the hold it looks twitchy; without the flick, sedated.
`saccadeEase` is a cubic ease-out rather than exponential damping because real saccades
are **ballistic and fast** — 30–80 ms, two to five frames at 60 fps.

The offset nudges the *look target*, not the eye bones, so VRM's own solver stays in
charge of eye limits and convergence:

```js
lookTarget.x += gaze.yaw * dist;   // scaled by distance, so the angle is framing-independent
lookTarget.y += gaze.pitch * dist;
```

**Positive pitch is up.** That sign had been wrong in `pickGazeOffset`'s averted branch
since the function was written — directly beneath a comment saying the pitch was biased
upward. Nothing caught it because the comment and the code were only ever read
together, and both sounded right. It surfaced the moment a second gaze behaviour needed
to point the *other* way and a test compared the two directions.

> A difference between two things is checkable in a way that one thing's correctness
> is not.

**Speaking looks at the camera and nowhere else.** That is a deliberate exception to
everything above, and it is an exception rather than a contradiction: delivering a line
to someone while your eyes wander off their face reads as distracted or evasive, which
is the worst thing the one state that *is* addressing you could read as. What keeps it
from being a stare is that the rest of the layer carries on — she still blinks, the
microsaccades still run, and `speechEmphasis` moves her head at 1–3 Hz underneath. The
eyes hold the lens while the head does not hold still. The target snaps to centre on the frame
speech starts and a fresh wander target is picked on the frame it ends — both edges,
because the next scheduled saccade can be four seconds away, which is long enough to
spend half a sentence looking elsewhere or to sit locked on the lens well after she has
finished.

**The head follows about a quarter of the way** (`headFollowDelta`). Driving it 1:1
with the eyes looks robotic; not driving it at all looks like the eyes are loose in the
skull.

**Microsaccades fill the gaps.** Between flicks the eyes used to be *perfectly* still
for one to two seconds at a time, which is the one thing real eyes never are — a
fixating eye drifts and corrects several times a second. `gazeJitter` adds that tremor
at about a tenth of the wander amplitude.

It is a pure function of time rather than another scheduled target, unlike everything
else about gaze. There is no decision here to hold state for: it is a tremor, not a
behaviour, and the same summed-incommensurable-sines trick as head drift gives a signal
that never visibly repeats for free.

**The head does not follow it.** `headFollowDelta` reads the un-jittered gaze, because a
head that tracks microsaccades is a head with a tremor. A test pins the jitter as
running several times faster than breathing — tuned slow it would just be a second head
drift, and nothing that checked its amplitude would notice.

## Hand relax

Straight splayed fingers are a mannequin tell of exactly the same kind as mirrored arms,
and the most visible one in a waist-up framing where the hands sit near the bottom of
frame. `relaxedHandPose(amount, sides)` curls all thirty finger bones, distributed so
the knuckle bends most and the fingertip least — equal curl on all three segments gives
a claw.

Finger bones are **not** in `HUMANOID_BONES` (that list drives the Pose tab, and thirty
extra sliders would drown it), so `FINGER_BONES` exists separately in
[vrmIntrospect.js](../frontend/src/lib/vrmIntrospect.js), written out literally as an
independent check on the code that builds those names by template. A misspelled bone
name here is invisible: `getNormalizedBoneNode` returns null, the loop skips it, and the
hands simply never curl.

The `sides` argument exists so a one-handed gesture can close that hand while the other
keeps its idle curl.

## Pose drift

Every 30–90 s she moves between `companion` and `arms-behind`, eased over 900 ms.

Unlike everything else here, this **does not return to where it started** — which is
the point. Sway always comes back; a pose change is a *decision*, and it adds a beat no
oscillation can. Held off mid-gesture, mid-sentence, and while a full-pose state is
active.

It is the one place the render loop **writes** to the store. That is a deliberate
exception to [invariant 2](10-invariants.md), and safe for the reason the invariant
exists: the rule targets per-frame churn, this fires at most once every thirty seconds,
and the Pose tab genuinely should show which pose she is in.

## Blink

Three explicit phases, in [blink.js](../frontend/src/lib/blink.js):

```
   close 50ms      hold 40ms       open 100ms
0 ─────────► 1 ═══════════════ 1 ──────────────► 0
```

**It shuts faster than it opens, and that asymmetry is the whole point.** The first
version was a symmetric `sin(t/duration · π)` over 120 ms, which gives an eyelid that
takes exactly as long to close as to open — and reads as drowsy, because a real lid
close is near-ballistic and the reopening is a slower release. Numbers from
VMagicMirror, which has run them against live streamers for years.

Two scheduling decisions sit on top, and both exist to break the metronome:

**A fifth of blinks are doubles.** Randomising the interval alone is not enough, because
every blink still looks identical; varying the blink itself is what actually kills the
pattern. A double is the envelope run twice back to back, so it passes through *fully
open* at the seam — that is the entire difference between a double blink and one long
one, and there is a test on it.

**Blinks couple to gaze.** A saccade larger than `SACCADE_BLINK_MIN_RAD` (~5°) pulls a
blink along with it 70% of the time, subject to a 2 s cooldown. People blink when their
eyes jump, not on a timer, and a blink landing on a saccade does more for aliveness than
any amount of interval tuning. The magnitude gate is what keeps an ordinary wander from
dragging one along — that would read as a twitch — and it is deliberately set between
the two gaze behaviours: above the ±`gazeAmount` of a wander, below the 1.6–2.8× of an
avert.

This is why **the blink scheduler runs after the gaze scheduler** in `useIdleMotion`.
Scheduling blink first would put the coupling a frame late.

Interval random in `[blinkIntervalMin, blinkIntervalMax]` (3000–12000 ms), raised from
2000–6000 once the blink stopped being a 120 ms flick.

**The panel can take the eyelids.** Auto-blink applies only when the blink slider has
never been touched; `resetExpressions()` hands them back.

```js
if (s.expressions.blink === undefined) em.setValue('blink', blink);
```

## Breathing travels

A chest bone rotating alone is nearly invisible on a clothed model. What actually reads
as breath is the **shoulders rising** and the head floating on top, because those
silhouette edges are against the background where the eye can see them move. The
shoulders lag the chest by 0.18 s — the ribcage leads, the shoulders ride.

**The oscillator is squared, which makes it unipolar.** The breath runs from rest
*upward* and never below it. The plain sine this replaced spent half of every cycle
rotating the chest backwards past the pose, which is not something a resting body does —
quiet breathing starts from empty and returns to it. Rest is the floor of the cycle, not
its middle.

Squaring halves the travel for a given amplitude, which is why `breathAmplitude` was
doubled to 0.09 (~5° at the top of a breath) in the same change. The visible movement is
unchanged; the resting silhouette is not. **If she looks like she is heaving, that is
the number to pull down.**

`breathPhase(tSec, rate)` exports where in the breath she is, 0–1, for anything that
wants to run *on* the breath rather than alongside it — the alternative is every such
layer keeping its own clock, and two clocks that are supposed to agree eventually will
not.

`breathDelta` in `idleMath.js` is the superseded single-axis version, kept because it
is the clearest possible statement of the idea and the contrast is the lesson. It is
still the old symmetric sine, which is now a second contrast worth noticing.

## Resting warmth

Not a bone at all. A VRM neutral face is *genuinely* neutral — slack, unfocused, and
read by viewers as bored or cold. Resting warmth holds `relaxed` (or `happy`) at a low
weight whenever she is not speaking, so her default is *content* rather than *absent*.
It is the facial counterpart of the asymmetric standing pose.

It ramps to zero while speaking, and that is not cosmetic: per
[invariant 11](10-invariants.md), a raised emotion on a VRM 0.x model can suppress
visemes outright through the override flags. If the mouth ever looks damped, this is
the first number to pull down.

Setting `relaxed` by hand in the Expressions tab overrides it.

## Everything is additive, and attenuated while speaking

`useIdleMotion` returns `deltas` as a bone → rotation map for `compositeBones`'
**additive** layer. Layers are *summed* rather than assigned, because several
behaviours legitimately want the same bone — breath and sway both touch the chest;
drift, breath and gaze-follow all touch the head. Assigning would let whichever ran
last win.

Attenuation while speaking is `0.7`, raised from `0.4`. Damping undirected drift during
speech is right — it does compete with the mouth — but 0.4 made her visibly *stiller*
while talking, which is backwards. Speech emphasis supplies directed motion instead.

## Tunables are live

Every value the hook reads comes from the **`idle` store slice**, not `DEFAULTS`.
`DEFAULTS` seeds the store's initial state and nothing else; that is what makes the Idle
tab take effect immediately rather than on reload. `blinkDuration`, `swayLag`,
`gazeDuration`, `checkInDuration` and the `workingPace` scales are the exceptions, and
are not exposed as sliders.
