# 3D AI Avatars

A VRM avatar built to read as a living companion for an AI agent, rather than as a
character model sitting in a viewport. She breathes, shifts her weight, glances around
the room, blinks when something catches her attention, and speaks out loud with the mouth
driven off the audio rather than off a wall clock.

The host application drives one value:

```js
setConversationState('thinking');   // idle | listening | thinking | working | speaking
```

and everything else follows from it. There is also `say(text)` for speech. That is the
whole integration surface.

Built with Next.js, React Three Fiber and `@pixiv/three-vrm`.

---

## Running it

```sh
cd frontend
npm install
npm run dev          # http://localhost:3000
```

**Five models are in the repository and work out of the box**, including the default.
Three more and all the animation clips are not, because their own licences forbid
redistributing the file — so a fresh clone gives you five characters, an empty Animate
menu and no entrance animation. Nothing errors; both lists are built by reading the
directory.

Which models, which flags, and how to restore the rest:
[frontend/public/ASSETS.md](frontend/public/ASSETS.md).

### Adding your own

Drop any `.vrm` into `frontend/public/` and it appears in the picker automatically —
`/api/models` reads the directory and pulls each file's declared name, author and licence
out of its own metadata. No code change needed.

**Check what it permits before committing it: `npm run licences`.** A VRM's licence
carries `commercial_use` and `redistribution` as *separate* flags, and they disagree more
often than you would expect — three of the eight models here permit commercial use and
forbid redistribution. The script prints the table and fails if git is tracking a file
that does not allow it.

`frontend/src/lib/constants.js` carries a small table of human names, look notes, voice
ids and backdrop colours per filename. Models not in that table still work; they fall
back to whatever the file says about itself.

Animations go in `frontend/public/animations/` as `.vrma` and are listed by name in the
Animate menu. The official pixiv VRoid motion pack is what this was built against.

### Giving her a voice (optional)

```sh
cp frontend/.env.example frontend/.env.local
```

Fill in `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` and restart. Both can be set at once.

With no key she still mouths the words silently on a timeline derived from the text,
which is how the whole project worked before it had audio. Nothing breaks; the UI just
says why there is no sound.

### Deploying

The app is in `frontend/`, so Vercel's **Root Directory must be `frontend`**. See
[DEPLOY.md](DEPLOY.md) — including what a build that passes and then 404s means.

---

## Two surfaces

**`/` is the product.** She fills the window against a lit backdrop, with one control bar
floated over her: conversational state, animations, speech. Arrows at the edges of the
screen move through the cast, and she walks off one side while the next one walks on.

**`/?dev=1` is the workbench.** Seven tabs of sliders over the same scene: every
expression the loaded model exposes, per-bone rotation, the whole idle-motion system, the
lighting rig, and a debug readout of resolved viseme weights. This is also how poses are
authored — you drag the bones until it looks right and copy the JSON out.

---

## How it works

Pure functions in `frontend/src/lib/` compute everything. One component, `VrmAvatar.jsx`,
applies the result to the rig once per frame in a fixed order:

```
bones (pose → state overlay → hands → weight → gesture → idle) →
expressions (warmth → emotions → visemes → blink) →
lookAt →
vrm.update(dt)
```

`lib/` imports neither React nor three.js, which is why the 454 tests run in about six
seconds with no browser and no GPU. It is also what makes the logic portable — the
interesting parts can be lifted into another renderer wholesale.

A few things that turned out to matter more than expected, all written up in `docs/`:

- **Nothing on a body moves alone.** Every aliveness bug here has been one joint isolated
  from its chain.
- **Rig axes cannot be reasoned about.** They have to be measured in the Pose tab.
- **The audio is the clock.** A mouth running on `performance.now()` drifts away from the
  voice within a minute.
- **An animation clip read back off the rig arrives as Euler angles, and that conversion
  is not continuous.** Near gimbal it jumps a full turn while the real rotation moves
  three degrees. Keeping those numbers continuous means the spelling *accumulates*, so a
  clip can end a full turn from where it started — which is why a clip is blended back
  into the body as quaternions, where spelling does not exist.

---

## Documentation

`docs/` is a proper set rather than an afterthought, because the code is meant to be read
and copied:

| | |
|---|---|
| [docs/README.md](docs/README.md) | Index, and where to start |
| [01-orientation](docs/01-orientation.md) · [02-architecture](docs/02-architecture.md) · [03-frame-loop](docs/03-frame-loop.md) | Enough to work anywhere in the codebase |
| [10-invariants](docs/10-invariants.md) | Read before changing anything. Every rule on it has already cost someone a debugging session |
| [11-open-questions](docs/11-open-questions.md) | What is unverified, unfinished or deliberately excluded |
| [12-conversational-states](docs/12-conversational-states.md) · [15-voice-and-tts](docs/15-voice-and-tts.md) | The contract for driving her from your own app |

---

## Credits and licensing

The code here is mine. The assets are not, and what is in this repository is exactly
what its own licence permits to be — no more.

- **Models.** Five are committed, all declaring `redistribution=allow`. Three are not,
  because they declare `redistribution=disallow` while still permitting commercial use.
  Those are different flags and conflating them is how models end up published that
  should not be. `npm run licences` reads each file and answers it;
  [frontend/public/ASSETS.md](frontend/public/ASSETS.md) is the table. Verify against the
  source page before shipping regardless — metadata is the author's claim, not a warranty.
- **Animations.** None are committed. The pixiv VRoid pack permits commercial use *with
  credit* ("Animation credits to pixiv Inc.'s VRoid Project") and prohibits redistributing
  the motions in a form that can be extracted or re-rigged — which a `.vrma` in a public
  repository is. Its terms file is committed and says where to get the pack.
- **Voices.** Rented from whichever provider you configure, under their terms.
