# Orientation

**Job of this doc:** explain what this project is, why it exists, and how to run it.
Read it first. Everything else assumes it.

See also: [README.md](README.md) (the index) · [02-architecture.md](02-architecture.md) (how the code is arranged)

---

## What this is

A VRM avatar built to read as a **living companion** for a separate AI agent
application, and a **reference implementation** for driving one in React.

Both halves are load-bearing. The code is written to be *read and copied* into the
production implementation, so clarity of pattern matters as much as correctness. Where a
shortcut would have been smaller but less instructive, the instructive version won.
Comments explain *why*, not *what*.

The host app drives one store key:

```js
setConversationState('working');   // idle | listening | thinking | working | speaking
```

and everything else follows from it. Contract in
[12-conversational-states.md](12-conversational-states.md).

Under that, a continuous aliveness layer runs at all times: weight sway coupled through
the whole chain, weight shifting between feet, gaze that wanders and saccades rather than
locking on, breathing that travels to the shoulders, relaxed hands, and occasional idle
gestures. That layer is the difference between a companion and a mannequin, and it is
documented in [07-idle-motion.md](07-idle-motion.md).

The control panel is a development surface, not a product surface. From it you can:

- type text and watch the mouth animate through the visemes that text would produce
- switch conversational states and fire gestures by hand
- drive every expression the model exposes
- pose the character from presets, or bone by bone — which is also **how poses are
  authored**, see [06-poses-and-rig.md](06-poses-and-rig.md)
- tune every idle behaviour and the whole lighting rig live
- inspect the resulting state as it runs

## The decision that shaped everything: no audio — and what replaced it

For most of this project's life there was **no audio anywhere in it**. No
text-to-speech, no microphone, no playback, no waveform. All timing derived from the
text itself, and that was the premise rather than a limitation being worked around:

1. **It removed phoneme/waveform alignment entirely.** No forced alignment, no
   timestamp negotiation between an audio buffer and a mouth. Text in, timeline out.
2. **It made VRM's five-viseme limit acceptable.** With no sound to compare against, a
   viewer cannot judge phonetic accuracy. They judge *rhythm* and *shape variety*.

**She now has a voice** — see [15-voice-and-tts.md](15-voice-and-tts.md). The avatar is
headed for an application where an AI agent already exists as a chatbot, and giving that
agent a body without a voice was always going to be half the job. Synthesis is a hosted
API call rather than a local engine, because that application deploys to Vercel and a
serverless function cannot run a native binary.

Three consequences worth carrying into any work here:

- **The audio is the clock now.** `performance.now()` and the audio hardware drift
  apart; the mouth follows the sound, never the wall clock. This is
  [invariant 17](10-invariants.md).
- **The silent path still exists and is still tested.** It is the fallback when no API
  key is configured or the browser has not had a user gesture yet. Reasoning (1) above is
  therefore still live code, not history.
- **Reasoning (2) is weaker than it was, and it is now the open problem.** A viewer with
  sound *can* judge sync, so mouth quality went from unfalsifiable to the first thing
  anyone notices — while a hosted synthesiser returns no phonemes, so the mouth is still
  guessing from spelling. The CMUdict "future upgrade" stops being optional. See
  [15](15-voice-and-tts.md).

## Stack

| Package | Version | Note |
|---|---|---|
| `next` | 16.3.0 | **Differs from training data** — see [10-invariants.md](10-invariants.md) |
| `react` / `react-dom` | 19.2.8 | |
| `three` | 0.185.1 | |
| `@pixiv/three-vrm` | 3.5.5 | Loads VRM 0.x *and* 1.0, normalizing names |
| `@pixiv/three-vrm-animation` | ^3.5.5 | `.vrma` clip loading |
| `@react-three/fiber` | 9.7.0 | |
| `@react-three/drei` | 10.7.8 | `OrbitControls`, `Grid` |
| `zustand` | 5.0.14 | Why not React state: [08-state-and-ui.md](08-state-and-ui.md) |
| `vitest` | 4.1.10 | No jsdom — see [09-testing.md](09-testing.md) |
| `tailwindcss` | ^4 | |

## The model

Eight models sit in `frontend/public/`, and **every one of them declares that commercial
use is permitted**. That is the filter: this avatar is destined for a product, so a model
whose own metadata says otherwise is not a candidate, however good it looks.

Five are AnimeFreak's *FREE* series (`free-1`, `-2`, `-3`, `-5`, `-6`), and they carry
the most permissive terms of anything tried here — the VRoid Hub licence URL in their own
metadata spells out `corporate_commercial_use=allow`, `modification=allow`,
`redistribution=allow`, `credit=unnecessary`. `haishin-chan.vrm` is comparably free but
names a contact rather than a licence URL. The two `untitled-*` files claim the same
permissions while declaring **no author and no contact at all** — a provenance gap rather
than a licence problem, but there is nobody to check with.

`MODEL_URL` opens `free-2.vrm` — **Rin**, picked by eye. She also arrives mid-greeting
rather than simply being there; see [14](14-stage-and-lighting.md). The Stage tab switches between
all eight live, and [`/api/models`](../frontend/src/app/api/models/route.js) lists them
with the name, author and licence each file declares about itself. Adding one is a
file-drop.

> **The model every pose here was measured against is gone.** `kitsaki.vrm` was
> non-commercial, so it went with the others. Poses are authored on VRM *normalized*
> bones, so contrapposto, the torso, the neck, the shoulders and every idle behaviour
> carry across unchanged — but the measured arm chains in `thinking`, `arms-behind`,
> `scratch-head` were dragged out against a rig that is no longer in the
> repo, and depend on its limb proportions. **They need re-measuring.** See
> [06-poses-and-rig.md](06-poses-and-rig.md) and
> [11-open-questions.md](11-open-questions.md).

All eight are **VRM 0.x** (they declare the `VRM` extension, not `VRMC_vrm`).

They are **gitignored** — the user's assets, licensing theirs to verify. `*.vrm` and
`*.vrma` are both ignored, so no 18 MB binary is ever committed and nothing here
redistributes anyone's model or motion.

Two consequences run through the whole codebase, and both are covered in
[05-expressions.md](05-expressions.md):

- `@pixiv/three-vrm` v3 normalizes 0.x names to the 1.0 vocabulary on load
  (`Joy`→`happy`, `Sorrow`→`sad`, `Fun`→`relaxed`, `A`→`aa`), so **application code
  never branches on VRM version.**
- The original model shipped a non-preset `Surprised` blendshape — which is exactly why
  expressions are enumerated from the model rather than a hardcoded preset list. With
  eight interchangeable models that argument stops being a nice illustration and becomes
  load-bearing: the panel has to show whatever the loaded one happens to have.

## Running it

```sh
cd frontend
npm install
npm run dev      # http://localhost:3000
```

Other scripts: `npm test` (vitest, 422 tests, ~6s), `npm run build`, `npm run lint`.

It opens in a **waist-up framing**, which is the production target — close enough that
the face carries the scene, wide enough that shoulder and arm motion still reads. The
Stage tab switches it.

The official pixiv VRoid motion pack is installed in `frontend/public/animations/` —
six `.vrma` clips, listed by name in the Pose tab, one click to play. Drop any other
`.vrma` in there and it appears too; unknown files fall back to their filename.

They are showcase motions rather than anything a companion needs — *Show full body*,
*Peace sign*, *Spin*, *Squat* — and they are there to exercise the clip path and to show
what retargeted motion looks like on this rig. The pack ships seven; *Shoot* was deleted,
being the one least like anything a companion would ever do. Licence terms ship alongside them in
`animations/LICENCE-pixiv-VRoid.txt`: commercial use is permitted **with credit**, and
redistributing the motions in extractable form is not.

## What is deliberately not here

Microphone input, LLM integration, sentiment-driven automatic expression
selection, CMUdict phoneme lookup, mobile optimization, in-browser model upload,
physics beyond VRM's built-in spring bones.

The avatar does not decide its own state. The host application tells it what is
happening; this project renders that. Inferring state from conversation content would be
a different project.

These were scoped out at design time, not forgotten.
