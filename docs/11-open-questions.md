# Open Questions and Known Gaps

**Job of this doc:** be honest about what is unverified, unfinished, or deliberately
excluded. This is the doc most likely to go stale — update it when you resolve
something.

**Last reviewed:** 2026-09-15 (the commit landed; models published; voice fallbacks;
the end-of-clip 360 fixed; Vercel still not up)

See also: [06-poses-and-rig.md](06-poses-and-rig.md) · [09-testing.md](09-testing.md)

---

## If you read nothing else

Three things are blocking, in this order.

1. **Re-measure the arm poses against Rin** (§4b). Every hand-on-body value —
   `thinking`, `arms-behind`, `scratch-head` — was dragged out against `kitsaki.vrm`,
   which was deleted for being non-commercial. Nothing throws and no test fails; the
   hands are simply in the wrong place. The model is settled, so measuring now is
   measuring once. `npm run dev` → `?dev=1` → Pose tab → drag → Copy pose JSON. **This
   is now the largest open item in the project.**
2. **Nothing about the voice has ever been heard** (§4e). `ELEVENLABS_API_KEY` is set,
   the account is on Starter, and direct synthesis returns audio — but nothing has gone
   through `/api/tts` and the speech engine, so the audio clock, gapless chunk
   scheduling and whether the mouth matches the sound are all unexecuted. Every failure
   degrades to the silent mouth this project always had, so nothing is broken and
   nothing is proven. **`npm run dev` and press Speak is the whole cost.**
3. **Look at everything in §2.** Several sessions changed a great deal and almost none
   of it has been watched — the carousel, the entrance, the rooms and the material
   retune, the clip-jerk fix, and now the end-of-clip fix. Each was verified against numbers, which
   is not the same as being looked at.

~~**Commit**~~ — **done**, `8b210a3`, one honest commit of the whole companion layer.
`main` and `vrm-avatar-core` are identical and the tree is clean.

~~**Pick a model**~~ — **settled.** `free-2.vrm`, Rin, **chosen by eye**. The licence
filter still applies and still comes first, and Rin passes it.

Everything else in this file is a tuning question, and most of it needs a pair of eyes
rather than a decision.

---

## 1. Deployment: still not up

**This is the only thing here that is outright broken rather than unverified.**

The repo is public at `M-Uzair-dev/3D-AI-Avatars` and a Vercel deployment **builds
successfully and then serves `404: NOT_FOUND` on every path.**

What has been ruled out, by looking rather than by guessing:

- **Root Directory** is set to `frontend`. This was the first theory and it was wrong —
  check the setting before acting on it.
- **Everything the build needs is tracked**: `package.json`, `package-lock.json`,
  `next.config.mjs`, `jsconfig.json`, `postcss.config.mjs`, all of `src/`.
- `next@16.3.0` is a real dependency, so framework detection has something to detect.
- `npm test`, `npm run lint` and `npm run build` are green locally.

What is left is a **project setting overriding framework detection** — Framework Preset
switched to "Other", or an Output Directory override. Either gives exactly this shape:
the build command runs and passes, then the output is served as a static directory with
no `index.html` in it.

`frontend/vercel.json` now pins `{ "framework": "nextjs" }`, and `vercel.json` takes
precedence over the dashboard. It is deliberately that one key: a `buildCommand` or
`outputDirectory` there would override Vercel's native Next.js handling rather than
restore it.

**Unverified.** Nobody has watched this deploy. [DEPLOY.md](../DEPLOY.md) lists the
dashboard overrides to clear if it still 404s.

Also unknown: **the five committed models are 87 MB** of static assets, which is unusual
for a Vercel deployment and has never been deployed at that size. If a platform limit
bites, the fix is object storage — nothing in the app assumes the models are same-origin.

## 1a. What is in the repository, and what is not

Resolved, and worth recording because the reasoning was wrong for most of the project's
life. A VRM's licence carries `commercial_use` and `redistribution` as **separate flags**.
The models were filtered once on the first, that was recorded as "the licence filter",
and publishing the files was treated as settled. It was not.

- **Five models are committed** — `free-1`, `free-2`, `free-3`, `free-5`, `free-6`, all
  declaring `redistribution=allow`.
- **Three are not** — Momiji, Yuki and Mio declare `redistribution=disallow` while still
  permitting commercial use. Yuki also says `modification=disallow, credit=necessary`.
- **The six `.vrma` ARE committed, for the demo phase only.** The pixiv pack prohibits
  distributing the motions "in a way that can be rigged or extracted", which a `.vrma` in
  a public repo is. This is a deliberate, temporary exception taken at the project
  owner's direction with the tradeoff understood — not a change in what the terms allow.
  **Open, and due before the demo ends:** removing them from the tree does not remove
  them from git history, forks or GitHub's caches, so the cleanup is a history rewrite or
  a switch to a private repo. Decide which, early.
- **The pixiv credit line is owed and not displayed.** *"Animation credits to pixiv Inc.'s
  VRoid Project"* is a condition of the licence, not a courtesy, and nothing in the UI
  carries it. This is the smallest open item in the project and the only one that is a
  licence obligation rather than a judgement.

`npm run licences` reads it out of the files and exits 1 if git is tracking something
that forbids it. [ASSETS.md](../frontend/public/ASSETS.md) is the human version.
[Invariant 27](10-invariants.md).

**A fresh clone therefore has five models rather than eight**, but a full Animate menu
and a working entrance. Nothing errors — the list is built by reading the directory.

## 1b. The production UI

`/` is now a product surface and `?dev=1` is the old seven-tab workbench. Both drive the
same store; no store key or action changed, which is what let the workbench keep working
untouched. Full description in [08-state-and-ui.md](08-state-and-ui.md).

What it offers, and nothing else: conversational state, model, animation, speech.

Four things were fixed after the first look at it, and all four are worth knowing about
because **every one of them was valid code that passed every check**. None threw, none
failed a test, and the build compiled them all. They were wrong about *hierarchy or
ordering* — which bone owns which children, which event fires before which, which element
contains which, what a value is before its fetch resolves. That is this surface's
characteristic failure, the same way wrong arm axes are the rig's.

- **`listening` tipped the legs.** `hips` is the skeleton root, so 24 degrees there
  pitched the whole body as one rigid plank. The measured value is unchanged; the femurs
  are now counter-rotated. See [12](12-conversational-states.md).
- **The menu triggers did not read as controls.** Bare text with a hover background.
  Now bordered, labelled and chevroned — see [08](08-state-and-ui.md).
- **Clicking an open menu's own button reopened it** rather than closing it, because
  `mousedown` dismissed before `click` toggled. `Popover` now owns the trigger so the
  press counts as inside. Same doc.
- **Phones now frame her at 0.6x**, by moving the camera rather than scaling the model.
  See [14](14-stage-and-lighting.md).

**Watched working in a browser** (Momiji, 1440×960) — note this was BEFORE the four
fixes above, none of which has been looked at:

- the page renders, loads and frames her
- the model menu, named — switching models works from it
- the Animate menu listing the six clips (it listed `Wave` first at the time; that
  gesture has since been removed from the project)
- `Speak` → `Stop`, and the state row tinting `speaking` while an utterance runs
- `?dev=1` still reaching the full workbench, tabs and gestures intact

**Not looked at yet:**

- **any model but Momiji in the production layout.** The bar is bottom-anchored and she
  is bust-framed, so on a shorter or wider model the overlap between the two is
  different. Nothing breaks; it is a composition question.
- ~~**the control bar below the fold on mobile**~~ — **found and fixed.** The stage was
  `100vh`, the *large* viewport, which assumes the browser chrome is retracted; with a
  URL bar showing, anything anchored to the bottom of it is off screen. Now `100svh`.
  Not `dvh`: that tracks the chrome as it slides, and the camera re-frames on resize, so
  she would breathe in and out with the address bar. See
  [14](14-stage-and-lighting.md). **Not looked at on a phone since the change.**
- **the bar below `sm`**, since the state row was changed to wrap on its own after the
  420 px check. It is one flex item in its row, so the parent's `flex-wrap` could not
  break it up — narrow viewports would have overflowed.
- **the 0.6x phone framing**, which has never been rendered at any width. The solver is
  tested in both directions; whether 0.6 is the right number is an eye question.
- **the counter-rotated legs.** The suite pins `hips + upperLeg` to zero, which proves
  the legs no longer travel with the pelvis. It cannot tell you whether a 24 degree hinge
  at the hip now looks like a lean or like a bow.
- **a clip played from the production menu.** The dispatch is the same `setClip` the
  Pose tab uses and the menu highlights correctly, but the watched clip playbacks in §4
  were all triggered from the workbench.
- ~~`Wave` from the production menu~~ — removed from the project entirely, see
  [13](13-gestures.md).

## 2. Visual verification status

Confirmed by eye, in the browser:

- the lighting rig — she is no longer washed out, the rim separates her from the
  background
- `companion` reads as a person rather than a mannequin
- gestures `neck-stretch`, `roll-shoulders`
- the measured arm chains in `thinking`, `scratch-head` — **on the model that has
  since been deleted**, see §4b
- **model switching works**, across models of different heights and builds
- **clips play.** `Peace sign` and `Shoot` were watched running on the model. That
  retires the longest-standing gap in this document: the `.vrma` path had never executed
  at all until this point

**Changed after their last look, so unverified:**

- `thinking`'s gaze. The avert direction was inverted at the point it was fixed — it had
  been looking *down* where the code claimed *up*. Nobody has watched the corrected
  version.
- `neck-stretch-vertical` after its second pass (smaller angles, shoulders involved,
  off-axis).
- the `scratch-head` sweep after it moved to the `z` axis and was halved.
- the state overlays at their new magnitudes, and speech emphasis.
- **the whole blink rewrite** — the asymmetric envelope, the 20% doubles, and blinks
  firing off large saccades. None of it has been watched. The suite can pin the shape
  and the coupling but not whether the result reads as a blink.
- **breathing at its new amplitude.** The oscillator became unipolar and
  `breathAmplitude` was doubled to 0.09 to compensate, which should leave the visible
  travel unchanged and move the resting silhouette. Whether that trade is right is an
  eye question. First number to pull down if she looks like she is heaving.
- **microsaccade amplitude** (`gazeJitterAmount`, 0.006 rad / ~0.35°). Derived from "a
  tenth of the wander", not observed. Too large will read as shifty; zero is the stare
  it was added to remove.
- **the measured `listening` overlay**, at 24° of hip lean — by far the largest overlay
  in the system, and held for as long as the user is typing. Whether it still reads as
  *attending to you* rather than as *reclining* is the question, and it is the one thing
  here a test cannot answer.
- **whether `listening` and `speaking` still read as different states.** Their torso
  pitch now goes the same way and only the head opposes; see
  [12](12-conversational-states.md). Worth switching between the two in the State tab
  and watching, rather than reading the numbers.
- **gesture staging.** The full sequence — lowering her arms out of `arms-behind`,
  playing, and going back — has never been watched end to end. Roughly 7 s at the new
  transition time.
- **`poseTransitionMs` at 1800 ms**, and `stateTransitionMs` at 1400. Deliberate, or
  sluggish. Two numbers.
- **`speaking` reduced to nothing but the head.** No postural overlay at all now: the
  eyes lock to the camera for the utterance and release the frame it ends, and
  `speechEmphasis` supplies the motion. Whether that still reads as a distinct state is
  the open question, and it is the same question as the `listening` one above.
- **framing solved from the model's head height.** Every model should now load with the
  head a third of the way down the frame regardless of height. The bug it fixes was
  observed — short models sat neck-deep, tall ones were decapitated — but the fix has not
  been looked at across all eight.
- **fingers in clips.** The read-back dropped all thirty finger bones, so every clip
  played with idle hands. Fixed and untried: `Peace sign` is the one to watch, because it
  is the clip whose entire content is a hand shape.
- **the three `behind` poses.** The left arm chain is measured and trustworthy; what has
  not been seen is the mirrored right arm, whether the staggered `arms-behind` actually
  clears itself, and whether any of them clip at the extremes of the sway and weight
  shift — which is the exact failure that retired `arms-crossed`, so it is worth
  watching for a full weight-shift cycle rather than a glance.

**The model carousel, watched once and fixed three times since.** It replaced the model
menu on the production bar: two arrows, and she arcs off stage while the next one arcs on.

The first look reported *"the same model appears from the right, then lags, then changes
to the actual new model"*, which turned out to be three separate defects — a stale model
hidden by being moved somewhere that was not actually off-screen, an exit that did not
clear the frame either, and an 18MB main-thread VRM parse kicked off halfway through the
animation. All three are fixed and described in [08](08-state-and-ui.md); **none of the
fixes has been looked at.** Specifically open:

- **whether the arc reads as a person leaving a room or as a card on a track.** That is
  the entire reason it is an arc rather than a slide, and it is the one thing the tests
  cannot speak to. `x` and `z` ease on deliberately different curves — `lib/carouselMotion.js`
  explains why — and a test pins that the path bends, not that the bend looks like
  anything.
- **the whole cast resident at once.** The cache was three models and is now all eight —
  ~18MB of source apiece and more once decoded. Taken deliberately, because three
  guarantees a stall two steps out and the point of the feature is that nothing loads
  while she is moving. **This is the number to watch on a thermally tight machine**, and
  `MAX_RESIDENT` in [carousel.js](../frontend/src/lib/carousel.js) is the one line that
  lowers it; `residentUrls` is ordered nearest-first, so a cap of 3 restores the old
  behaviour without breaking either button.
- **whether warm-up is invisible.** Eight models download and parse one at a time after
  the page settles, paused for the length of any transition. The parse is main-thread, so
  if the idle animation hitches roughly once per model during the first minute, that is
  this. A fetch already in flight is not cancelled when the pause comes on — there is no
  `AbortController`, §5 — so one parse can still land mid-transition during warm-up, and
  never after it.
- **the nav on the stage rather than the bar.** Edge arrows at left and right centre, her
  name across the top. ~~Whether bare chevrons hold up against a brightly lit dress.~~
  **Answered by the rooms, and answered against the chevrons:** over a photograph there
  are no dark corners to sit in, so they are round glass discs now and the name carries a
  text shadow. What is still unseen is whether the discs read as controls laid ON the
  scene or as chrome stuck over it.
- **the nameplate's fade.** The only unprompted motion in the production UI. It runs at
  the midpoint of a transition, while she is off stage, which is the argument for it
  existing at all — if it reads as a competing animation rather than as an arrival, it is
  one class in [globals.css](../frontend/src/app/globals.css) to delete.
- **the spring bones, now suppressed for the whole transition.** Her hair and chest are
  rigid between marks. That was the fix for physics that read as violent rather than
  lively, and the cost is unknown: whether rigid hair through the travel reads as
  stillness or as a dead rig. The argument that it will not be noticed is that the fast
  part of the arc happens off screen.
- **the eased pacing.** The real cause of the violence was that `z` eases on a curve
  fastest at `p = 0`, and the entrance walks the path backwards — so she arrived at full
  forward speed and the spring joints took the whole velocity step in one frame. The
  phase progress is smoothstepped now, so she leaves and lands slowly. If the landing
  still looks abrupt with the springs already suppressed, that easing is where to look
  rather than the timings.
- ~~**the per-model backdrop.**~~ ~~**the backdrop crossfade.**~~ **Both obsolete.** The
  CSS cyclorama, the eight palettes feeding it and the 900 ms `@property` crossfade were
  all replaced by baked HDRI rooms. Neither was ever looked at, and neither exists now.
  The `palette` data survives in `MODEL_NAMES` with nothing reading it — see
  [14](14-stage-and-lighting.md).
- **the rooms, and what they do to her.** Six of them, and the whole material retune
  underneath. Watch for: whether the key really comes from where each photograph says it
  does; whether her shadow side reads as form or as dirt; whether the rim separates her
  on **Snowy Field**, which is the one room it exists for. Palermo Square is the default
  precisely because a hard noon key shows a wrong material soonest.
- **the three unmeasured models.** The MToon retune was measured across 87 materials on
  **five** bodies — `free-1/2/3/5/6`. `haishin-chan`, `untitled-6` and `untitled-7` have
  never been through it. Every uniform derives from each material's own lit colour and
  every clamp is one-directional, so it should generalise; that is reasoning, not
  measurement, and reasoning about this renderer is what produced the original bug.
- **the carousel walked twice round one room.** If the retune's undo is wrong, `shadeDepth`
  compounds on the second visit and she darkens. The undo exists for exactly this and has
  never been watched.
- **`shadeTintAmount` at 0.18.** Dialled down from 0.30 by eye after one look. The room's
  bounce in her shadows should read as reflected light, not as a colour cast on her.
- **the fingers under a clip.** `Peace sign` is the one to watch, since its entire content
  is a hand shape and it is what surfaced the bug.
- **the body under a clip, now that every additive layer fades out.** She no longer
  breathes or sways while a clip is at full weight — that was the fix for a jerk traced to
  Euler gimbal, [03](03-frame-loop.md). The open question is whether the playback now
  reads as slightly dead compared with the rest of the system. If so the lever is
  per-bone rather than global: only bones near gimbal actually need quieting.
- **whether the jerk is gone.** It was reproduced and measured headlessly rather than
  watched, so the fix is verified against the numbers and not against an eye. `VRMA_01`
  at about 4.7s and `VRMA_06` at about 3.5s are where it was worst.
- **whether the end-of-clip 360 is gone.** Reported as *"at the end of every single
  animation it does a full 360, like a frontflip but sideways"*, traced to unwrapped
  Euler spellings accumulating over a clip and then being interpolated back down during
  the fade-out. Now blended as quaternions — [rule 2c](03-frame-loop.md),
  [invariant 26](10-invariants.md). Measured: `hips` travel during VRMA_01's fade-out
  fell from 349° to 7°, `leftLowerArm` on VRMA_07 from 840° to 19°. **Numbers again, not
  an eye.** `Show full body` and `Squat` are the two to watch, and what to watch for is
  the *last 600 ms* — whether the clip now settles into the idle pose or still snaps.
- **whether the fade-out still reads as motion at all.** The fix removes rotation that
  was never real, but VRMA_02's genuine arm movement through its fade dropped slightly
  too (152° to 132°) because the shortest arc is shorter than the Euler path. That is
  correct and might be visible; if the release now looks abrupt, `clipFadeMs` is the
  lever, not the blend.
- **the entrance.** She is held off screen until the greeting is driving her, the clip
  plays at full weight from frame one, and the springs are reset on the frame she
  reappears. Watched twice in broken forms — first standing-then-sinking-then-leaping,
  then with a one-frame hole at the end that read as a model swap — and not since the
  second fix. What to look for now: whether appearing already in a crouch reads as an
  entrance or as a pop; whether the leap shakes anything loose despite the spring reset;
  and **whether the end of the greeting is clean**, which is where the hole was.
- **the hair at the end of the greeting.** Reported as "still in the air" when the clip
  finished. Some of that was the one-frame hole and is fixed. The rest is spring bones
  settling after motion stops, which is correct physics and may simply need the
  `clipFadeMs` fade-out lengthening if it reads as unfinished.
- ~~**the backdrop using one hue.**~~ Obsolete with the cyclorama. The palette table is
  still there and nothing reads it.
- **whether the three earlier fixes actually land.** In order of how likely they are to be
  wrong: that a hidden stale model is really hidden (it is a `visible = false` on the
  root, so a second model rendering from somewhere else would defeat it); that the
  computed side distance clears the frame at whatever window this is watched in; and that
  deferring the prefetch moved the stall somewhere nobody notices rather than merely
  moving it.
- **the numbers in `DEFAULTS.carousel`** — 450 ms out, 120 ms empty, 550 ms in, 0.9 m
  back, 0.45 m of body half-width, 1.15 of clearance margin. First guesses. There is no
  longer an `offsetX` to raise: the side distance is solved from the live camera, so if
  she still fails to clear the frame the fault is in `exitClearance` or in
  `bodyHalfWidth`, not in a number to nudge.
- **whether a press that outruns the prefetch is now acceptable.** The target starts
  loading on the press rather than at the midpoint, so it gets the 450 ms exit for free —
  but on a cold cache an 18MB model will not arrive in 450 ms. The hold stretches, the
  stage is empty, and the progress readout is showing. That is honest; whether it reads
  as considered or as broken is an eye question.
- **whether 120 ms of empty stage reads as a beat or as a glitch.** It is there to hide the
  camera's head-height snap, so it cannot go to zero — but whether it wants to be longer
  is an eye question.
- **whether the camera snap is genuinely invisible.** The claim is that re-solving framing
  on an empty stage cannot be seen. If a switch between two models of very different
  heights flickers, this is it.
- **what the spring bones do.** She covers ~1.2 m in 450 ms, which is the fastest the root
  transform has ever moved in this project. Hair and skirt physics have never seen
  acceleration like that; the trade is that it should make the exit read as motion rather
  than as a slide. Watch a long-haired model — Sakura or Yoru — before judging the timings.
- **the bar's composition with a three-part control where a menu used to be.** The
  carousel is wider than the button it replaced, and the bar's behaviour below `sm` was
  already unverified before this was added to it — §1b.
- **prefetching, on a cold cache.** Both neighbours download in the background after the
  first model settles. Whether that competes with anything visible has not been watched,
  and the LRU eviction that bounds it to three resident models has only ever run in tests.

**Never observed at all:** `working` in full — in particular whether the check-in glance
reads as intended at 20–40 s, which by its nature needs a few minutes of watching.

## 3. Values still estimated rather than measured

Ranked by how likely they are to be wrong, given this project's record:

| Value | Where | Status |
|---|---|---|
| `SCRATCH.rub.lowerArm` sign | [gestures.js](../frontend/src/lib/gestures.js) | If the hand travels **off** her head rather than across it, flip this. |
| `WAVE.palmRoll` magnitude | [gestures.js](../frontend/src/lib/gestures.js) | Direction is settled (positive). The amount is still by eye. |
| `handRelax` curl direction | [postures.js](../frontend/src/lib/postures.js) | Derived, not measured. The slider spans negative for exactly this reason. |
| `neck-stretch-vertical` axis | [gestures.js](../frontend/src/lib/gestures.js) | Built on `x` (pitch). If the lateral roll was wanted instead, swap `x` and `z` in the three constants. |
| `gazeJitterAmount` | [constants.js](../frontend/src/lib/constants.js) | 0.006 rad, derived as a tenth of `gazeAmount`. The Idle tab spans 0-0.02. |
| `breathAmplitude` | [constants.js](../frontend/src/lib/constants.js) | 0.09 rad, chosen to preserve the old peak-to-peak travel through the unipolar change. Arithmetic, not observation. |
| `BEHIND_STAGGER` | [poses.js](../frontend/src/lib/poses.js) | 0.14 rad (~8°). The only estimated number in `arms-behind`. If the hands intersect, raise it; if one arm reads as not-behind, lower it. |

Everything on this list can be settled the same way: drag it in the Pose tab and read
the number off. That has worked every time it has been tried, and nothing else has.

## 4. Clip playback: running, and now being tuned

The official pixiv VRoid pack (6 of its 7 `.vrma`) sits in `frontend/public/animations/`
and the Pose tab lists it by name, one click to play.

**Clips have now actually played**, which retires the oldest gap in this file — the whole
path was untried for the entire life of the project until this point.
`VRMAnimationLoaderPlugin`, `createVRMAnimationClip`, the mixer-before-composite ordering
and the blend are all proven in practice rather than on paper.

Everything since has been tuning what running clips revealed, and each item below was
found by watching rather than by reading:

- **Clips play once and release** rather than looping — `LoopOnce`, an ease in and out
  over `clipFadeMs` (600 ms each end), then `setClip(null)`. The first cut of this eased
  only the way out and **jerked at both ends**; both causes and the fix are in
  [06-poses-and-rig.md](06-poses-and-rig.md). What still needs an eye is whether 600 ms
  is right at each end, and whether losing the clip's last 600 ms to the fade-out costs
  anything visible on a clip that ends on a distinct shape — `Peace sign` is the one to
  watch for that.
- **`clipPose` reads `CLIP_BONES`** — the whole 55-bone humanoid vocabulary. It has been
  widened twice, and both times the symptom was identical: the clip plays, most of the
  body moves, and the part you were watching does not. First it used the active preset's
  key set and dropped the **legs**, so `Squat` moved everything except the squat. Then it
  used `HUMANOID_BONES` and dropped all thirty **fingers**, so `Peace sign` made no peace
  sign and `Shoot` had no gun. The fingers one is the sharper lesson, because excluding
  them from `HUMANOID_BONES` is correct — that list drives the Pose tab. The mistake was
  reusing a list built for one purpose somewhere with different requirements.
- **The hips translation track is blended and then reset.** It was previously applied raw
  and never undone, so the body popped to the clip's root offset and stayed displaced
  after the clip ended. Whether root motion should be applied *at all* for a companion
  who is meant to stay on her mark is a judgement nobody has made yet — right now it is
  applied and returned. If she wanders off centre during `Spin`, that is this, and the
  fix is to drop the hips blend rather than to retune it.
- **Three clips were deleted** — `VRMA_04` (*Shoot*) from the pixiv pack, plus `new.vrma`
  and `another.vrma`, both dropped in and removed the same afternoon. Six remain. `.vrma`
  is gitignored, so nothing about them survives in the repo; the pixiv one can be pulled
  from the pack again, the other two cannot.

The most likely failure is the ordering one, and it has a known signature: clips appear
to do nothing at all, with no error. See [03-frame-loop.md](03-frame-loop.md).

Worth knowing before judging what you see: these are **showcase** motions — *Show full
body*, *Peace sign*, *Spin*, *Squat*. They are not idle material and were never meant to
be. They exercise the path and show what retargeted motion looks like on this rig.

Licence: commercial use permitted **with credit** ("Animation credits to pixiv Inc.'s
VRoid Project"); redistributing the motions in a form that can be rigged or extracted is
prohibited. Full terms in `animations/LICENCE-pixiv-VRoid.txt`. `.vrma` is gitignored, so
nothing is redistributed by committing.

## 4b. The measured poses no longer match the model

**This is the largest open item in the project.**

Every model that did not declare commercial use has been removed, which is correct for
something headed into a product and took `kitsaki.vrm` with it — the rig that every
measured value in `poses.js` and `gestures.js` was dragged out against. Eight models
remain, all commercially licensed, and `free-2.vrm` — **Rin** — is the default,
**chosen by eye.** That half of this item is closed.

Framing is no longer part of this problem: the camera is solved from each model's own
head height, so they all load composed the same way regardless of height. Only the
measured *arm* values are model-specific now.

What survives the swap, because normalized bones make it portable:

- `CONTRAPPOSTO` and the whole torso half of `companion`
- every state overlay, including the measured `listening`
- the entire aliveness layer — sway, breath, gaze, blink, weight shift
- the two neck stretches, which touch no arm bone

What does not, because it depends on limb proportions rather than bone names:

| Value | Where |
|---|---|
| `ARM_BEHIND_LEFT` (shoulder, upper arm, forearm) | [poses.js](../frontend/src/lib/poses.js) |
| `thinking`'s right arm chain and wrist roll | [poses.js](../frontend/src/lib/poses.js) |
| `SCRATCH` and `WAVE` arm positions | [gestures.js](../frontend/src/lib/gestures.js) |

None of it will throw, and none of it will be caught by a test — the bone names are all
still real, so the only symptom is a hand in the wrong place. Expect `scratch-head` to
put the hand inside or beside the head rather than on it, which is exactly how the first
version of that gesture failed.

The fix is the one that has worked every time: `npm run dev`, **`?dev=1`**, Pose tab,
drag it, Copy pose JSON, paste. The argument for waiting was that doing it against a
default nobody had committed to meant doing it twice. **That argument is gone — Rin is
the settled model — so this is now simply the next job.**

The production UI raises the stakes on one of these rather than changing it: `thinking` is
one of five state buttons, so the pose most likely to put a hand in the wrong place is
also one of the most reachable. `Wave` was the other, and has been removed.
Neither is hidden behind a workbench any more.

## 4c. The dropped archives contain no animation

Five archives were added to `frontend/public/` as `.vrma` and are not: `-BOOM-.zip`,
`Dustline_Mens.zip`, `FreePose_FoxPunch.zip`, `EvilFallArma_PS_filer.rar` and
`EvilFallEyeMask_v1.01.rar` are Unity/VRChat assets — `.unitypackage`, `.fbx`, `.prefab`
and `.psd`. Unpacked to `assets-source/` (gitignored, along with the archives).

Two of them do contain motion, in **Unity `.anim` format**: `FreePose_FoxPunch` has ten
humanoid poses (`Stand_04`, `Sit_11`, …) and the EyeMask package has toggle animations
for its own props. Neither is loadable here — three-vrm reads `.vrma`, which is a glTF
container, where `.anim` is a Unity-internal YAML asset.

Converting one is a real path, not a quick one: it needs Unity plus the UniVRM exporter
to bake the humanoid clip out as `.vrma`. The `FreePose` clips are **single poses**
rather than motion, so the cheaper route to the same result is the one this project
already uses everywhere — open the Pose tab, drag it, Copy pose JSON. That is also the
only route that produces something re-measurable against whichever model is settled on.

## 4d. `arms-crossed` is gone

Removed from `POSES` entirely, along with its tests and its row in the preset table. It
had been selectable-but-excluded-from-the-idle-rotation since its forearms were found to
pass through the chest during sway, and that halfway state earned nothing: nothing picked
it, and a preset carrying a known defect is a trap for the next reader.

The reasoning survives it in [06-poses-and-rig.md](06-poses-and-rig.md), in two places
worth keeping: it is the argument *for* `arms-behind`, and its left arm chain is still
the clearest evidence in the project that measuring beats solving — two of three axes
correct to two decimals, and the twist the solver could not see left at zero.

The store's bone-seeding tests used it as a fixture and now use `arms-behind`, asserting
the untouched axis against the preset's own value rather than against zero. `arms-crossed`
was the only preset with the head at exactly zero, so the old assertion would have passed
against a broken seed.

## 4e. The voice has never been heard

**This is the newest large gap and the cheapest one to close: `npm run dev` and press
Speak.** `ELEVENLABS_API_KEY` is set in `frontend/.env.local`, the account is on Starter,
and a direct synthesis call returns audio — so the thing that used to block this is
gone. `OPENAI_API_KEY` is still unset, so the OpenAI half of the menu remains untried.

What that leaves unverified — everything downstream of the provider, because `/api/tts`
itself has still never been called:

- **whether the mouth matches the sound.** This is the one that matters, and the answer
  is likely to be "roughly". A hosted synthesiser returns no phonemes, so mouth shapes
  are inferred from spelling and stretched across the measured duration — she will start
  and stop with the voice exactly, and individual words may be visibly wrong. See the
  open problem in [15](15-voice-and-tts.md) and the two fixes for it.
- **whether the comma pauses land.** Full stops are paced by a real gap between chunks;
  commas are always mid-chunk, so they are paced by a `<break>` tag inside the synthesis
  instead — two different mechanisms for what sounds like one problem, and only the first
  has been heard working. See [15](15-voice-and-tts.md).
- **whether `sentencePauseMs` is right at 380 ms.** Chunks were originally scheduled with
  a gap of exactly zero, which was heard immediately as her being in a hurry — see
  [15](15-voice-and-tts.md). 380 is the first replacement value and has not been judged;
  it is a live slider in the Speech tab for that reason. A seam that still sounds rushed
  means raise it; one that drags means lower it. What it cannot fix is pacing *inside* a
  sentence, which belongs to the synthesiser.
- **whether the API contract matches.** `response_format: 'wav'`, `speed`, and
  `instructions` are used as documented; a mismatch surfaces as the API's own error
  message, which the route passes through rather than swallowing.
- **whether `gpt-4o-mini-tts` at the default `nova` suits her.** It is a voice chosen
  from a list rather than by ear — the same mistake the model default is still making,
  in §4b, and just as cheap to fix by listening.
- **the 60 ms scheduling lead and the 200 ms release tail** at the ends of an utterance.
- **the bar with a fourth menu on it.** `Voice` joins Model, Animate and Speech in the
  same row. It wraps by construction, but the bar's composition below `sm` was already
  unverified before this was added to it — §1b.
- **every voice-to-model pairing.** Each of the eight models carries its own voice and
  there is no picker — see the table in [15](15-voice-and-tts.md). The pairings were
  reasoned from ElevenLabs' published labels and the look notes in
  [14](14-stage-and-lighting.md), which makes them a **derivation**, and
  [invariant 13](10-invariants.md) exists because derivations here have been wrong six
  times running. All eight were verified as `premade` and confirmed to synthesise, so
  they all *work*; whether any of them *suits* its character is unheard.
- **the voice register — the paid-plan blocker is gone, the decision is not.** The
  account is on **Starter**, so the Voice Library is open through the API and the
  `402 paid_plan_required` wall that forced the premade-only cast no longer applies.
  **Rin, Hana and Yoru are now mapped to Library voices** the user chose. All three were
  confirmed to synthesise (HTTP 200, real audio, `eleven_flash_v2_5`) by calling the
  provider directly — **not** through this app's `/api/tts`, and **not listened to**, so
  whether any of them suits its character is still unheard. The other five rows are still
  premade, and moving them is now a choice rather than a constraint. See
  [15](15-voice-and-tts.md).
- **Mio's male voice**, which is the one intentional asymmetry in that table and the
  only thing telling Yuki and Mio apart by ear — they are the same character model with
  a beret between them.
- **the ElevenLabs path through this app.** The provider itself is no longer a mystery:
  with `ELEVENLABS_API_KEY` set, the voice list, the subscription endpoint and a
  synthesis call on `eleven_flash_v2_5` have all run and returned what they should. What
  has **not** run is any of it through `/api/tts` and the speech engine — so the route,
  the chunk scheduling and the mouth are as unexecuted as before. A model-id or voice-id
  problem surfaces as the API's own message, which the route passes through rather than
  swallowing.
- **whether either provider's voice suits her.** This is the actual decision the two-
  provider menu exists to make, and it is the same shape as the model decision in §4b:
  cheap to make by ear, impossible to make by reading. OpenAI's were reported as
  characterless on first look, which is what ElevenLabs is there to answer.

What *is* known: 276 tests including the chunker, the IPA map, the duration normalizer
and the WAV header parser; `npm run lint` and `npm run build` clean, with `/api/tts` and
`/api/voices` registered. None of that is evidence about sound.

**The Library voices now have premade fallbacks, and that path is untested too.** Rin,
Hana and Yoru speak in Voice Library voices, which depend on the account's plan — all
three returned `402 paid_plan_required` on the free plan while looking normal in
`/v1/voices`, and the rows had to be reverted by hand. `/api/tts` now retries once on a
premade spare (Rin→Lily, Hana→Sarah, Yoru→Alice) when the provider says the voice is
unavailable, and reports `fallbackFrom` so the substitution is not silent. **The retry
has never fired against the live API**, because that needs a Library voice to actually
become unavailable; the ids were confirmed `category: 'premade'` on the account, which is
as far as reading can take it.

**Still open by design, not oversight:** `say()` interrupts on every call, which is right
for barge-in and wrong for token streaming. A host that streams deltas must buffer to
sentence boundaries, or this needs queue semantics. Decide before wiring it to the agent.

## 4f. The model cache replaced a disposal guarantee

Worth its own entry because it is the one change in the carousel work that can fail
**silently and permanently** rather than just looking wrong.

`VrmAvatar` used to `deepDispose` the model in its effect cleanup. That was airtight: a
model died with the effect that loaded it, and no leak was possible. Prefetching neighbours
makes models outlive that effect, so the guarantee is gone and
[vrmCache.js](../frontend/src/models/vrmCache.js) owns lifetime instead — keeping the model
on stage plus both neighbours, three at a time, evicting the rest.

The eviction decision is pure, lives in [carousel.js](../frontend/src/lib/carousel.js), and
is tested including the case that motivated the split: a prefetched model nobody has seen
has no `lastUsed` and must count as the *coldest* thing in the cache rather than the
warmest. Get that backwards and it evicts the model currently on stage.

What no test covers: whether `retain` is actually *called* often enough in the real app.
One case was already found and fixed by reading rather than by running — the workbench
publishes no ring, so an early return on an empty ring meant nothing was ever evicted
under `?dev=1` and every model ever selected stayed resident for the life of the tab.

**How to check it by eye:** switch through all eight models twice in the production bar
and watch the tab's memory. It should plateau at roughly three models' worth, not climb.
A climb means `retain` is not reaching something, and the symptom is otherwise invisible.

## 5. Deferred minors

None block anything.

- **`hold: true` has no user.** Same reasoning — it is the right tool the next time a
  pose needs correcting against a still target, which is what it was built for.
- **No `AbortController` on the 18 MB model fetch.** A stray Strict-Mode fetch can
  free-run in dev. A `cancelled` guard prevents state corruption, so the cost is
  bandwidth only.
- **Debug FPS is computed from the clamped `dt`**, so a long alt-tab pause reads "10 fps"
  rather than the true near-zero.
- **`useIdleMotion` recomputes `nextBlinkAt` every frame while blink is toggled off.**
  Negligible.
- **`timelineDuration` has no direct unit test**, despite `SpeechTab` depending on it.
- **`sampleTimeline` has no non-mutation test** (`dampWeights` does).
- **`idleMath.test.js` sits under `src/hooks/`** but tests `src/lib/idleMath.js`.
- **`breathDelta` in `idleMath.js` is superseded** by `breathChain` and unused. Kept
  deliberately: the contrast between the two is the lesson.

## 6. Accepted risks

Decided at design time, recorded so they are not re-litigated:

| Risk | Decision |
|---|---|
| English spelling is irregular; grapheme rules mispronounce words | **No longer acceptable, and no longer fixed.** It was accepted because without audio the error was undetectable. There is audio now and the hosted synthesiser returns no phonemes, so this is the voice layer's open quality problem rather than a risk — two fixes in [15](15-voice-and-tts.md). |
| Expression/viseme mouth collision varies by model | **Delegated** to VRM's override flags; the Debug tab makes the result legible. |
| VRM 0.x has no `'blend'` override, so emotions may fully swallow visemes | **Accepted and surfaced, not patched.** Resting warmth fades to zero during speech as the one concession. |
| `restingWarmth` at 0.6 is high enough to risk that collision | **Accepted**, because the speech fade should keep it theoretical. First number to pull down if the mouth ever looks damped. |
| 18 MB model is a visible cold-cache load | `onProgress` readout; the UI stays interactive throughout. |
| The voice is rented, not owned | **Accepted.** The hosted API has no cloning and no custom voices, so the eleven on offer are the whole set and the terms are the provider's rather than something readable in a file. A distinctive voice means changing provider. |
| Replies leave the infrastructure to be spoken | **Accepted**, as the cost of deploying to Vercel at all. A local engine was built and removed — [15](15-voice-and-tts.md) records why. |
| Per-character cost on every utterance | **Accepted and bounded.** `TTS_MAX_CHARS` caps one request; the real control is not voicing intermediate chatter or tool output. |
| Anime aesthetic may not suit production | Format decision is isolated to `VrmAvatar`; the timeline and composite contracts are format-agnostic. |
| VRM asset licensing | **Now a filter, not a footnote.** Only models whose own metadata permits commercial use are kept — the picker shows each one's terms, and one model was deleted for being author-only. Still the user's to verify against the source page. |

## 7. Out of scope

Explicitly excluded, not forgotten: microphone input, LLM integration, sentiment-driven
automatic expression selection, mobile optimization, in-browser model upload, physics
beyond VRM's built-in spring bones.

Adding any of these is a new project decision, not a continuation.

**Audio and TTS left this list**, deliberately and with the premise change that implies —
see [15-voice-and-tts.md](15-voice-and-tts.md). It was a new project decision, taken
rather than drifted into: the avatar is going into an application where the agent already
exists as a chatbot, and a body without a voice is half of that job. CMUdict stays out
back **in** scope rather than out of it: it was excluded as "not worth its weight" when
nothing could contradict a wrong guess, and it is now the leading candidate for fixing
the mouth. See [15-voice-and-tts.md](15-voice-and-tts.md).

## 8. Repository housekeeping

- `frontend/.git.disabled/` is a disabled nested repo from `create-next-app`, kept for
  recovery per `.gitignore`. Left in place deliberately.
- **`assets-source/`** holds the unpacked Unity/VRChat archives from §4c. Gitignored,
  hundreds of MB, and nothing in it is loadable by this project.
- **`reference/`** briefly held a clone of the AITuber OnAir toolkit, read as a
  comparison and then deleted. Its one transferable idea is already absorbed: blinking
  coupled to behaviour rather than to a timer, which is now in
  [blink.js](../frontend/src/lib/blink.js). Nothing else from it is needed.
- **`no-undef` is switched on** in `eslint.config.mjs` for `src/**`, which
  `eslint-config-next` turns off because it is redundant under TypeScript. This project
  is plain JS, and without it a renamed variable left a live `ReferenceError` in
  `Scene.jsx` that `npm test` and `npm run build` both reported as green. Details in
  [09-testing.md](09-testing.md). **Do not remove it.**
