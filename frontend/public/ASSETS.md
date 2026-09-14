# The binary assets, and which of them are in this repository

The avatar is a `.vrm` model and the clips are `.vrma` animations. Both are
third-party files with their own licences, and **those licences decide what is
committed here** — not file size, and not what is convenient.

`npm run licences` prints the table below from the models' own metadata. Run it
before adding anything to `public/`.

---

## Models

A VRM carries its licence inside the file. Two flags in it matter, and they are
**different questions**:

- `commercial_use` — may she appear in a product?
- `redistribution` — may this file be handed on?

Every model in this project permits commercial use. Three of them forbid
redistribution, so those three are **not** in git.

| File | Character | Commercial | Redistribution | In repo |
|---|---|---|---|---|
| `free-1.vrm` | Sakura | allow | allow | ✅ |
| `free-2.vrm` | Rin *(default)* | allow | allow | ✅ |
| `free-3.vrm` | Hana | allow | allow | ✅ |
| `free-5.vrm` | Yoru | allow | allow | ✅ |
| `free-6.vrm` | Kuro | allow | allow | ✅ |
| `haishin-chan.vrm` | Momiji | allow | **disallow** | ❌ |
| `untitled-6.vrm` | Yuki | allow | **disallow** | ❌ |
| `untitled-7.vrm` | Mio | allow | **disallow** | ❌ |

The five that are here are AnimeFreak's *FREE* series under the VRoid Hub
licence: `corporate_commercial_use=allow`, `modification=allow`,
`redistribution=allow`, `credit=unnecessary`.

`untitled-6.vrm` (Yuki) additionally says `modification=disallow` and
`credit=necessary` — worth knowing before anyone edits her mesh or ships her
without a credit line.

**A fresh clone is missing three models**, but has every animation. Nothing
breaks: the model list is built by reading the directory, so the carousel simply
has five stops instead of eight, and the default model is one of the five. Drop
the other three back into `public/` and they reappear, still gitignored.

## Animations

`public/animations/` holds six clips from the official **pixiv VRoid Motion Pack**, and
they **are committed** — for the demo phase, at the project owner's explicit direction,
to be removed when the demo is over.

**This is a deliberate exception, not the rule.** The pack's terms prohibit:

> Distributing these motions or their alterations without permission in a way that can be
> rigged or extracted.

A `.vrma` in a public repository is that. It was taken knowingly, with the tradeoff
understood. Do not read it as evidence the terms allow it, and do not copy the pattern
for the next asset without making the same decision deliberately.

**Undoing it is not a `git rm`.** Removing the files from the working tree leaves them in
git history, in every fork, and in GitHub's caches. Cleaning up properly means rewriting
history or making the repository private. Worth knowing now rather than at the end of the
demo.

Full terms: `animations/LICENCE-pixiv-VRoid.txt`.

### The credit line is required

Using these clips at all — committed or not — obliges the product to carry:

> Animation credits to pixiv Inc.'s VRoid Project

That is a condition of the licence's commercial-use grant, not a courtesy. **Nothing in
the UI displays it yet.**

`VRMA_04` (*Shoot*) was deliberately removed from this project; the numbering has a hole
in it rather than a gap someone forgot to fill.

## If you add a model

1. Check its metadata: `npm run licences`.
2. Redistribution `allow` → add a `!public/<file>.vrm` line to **both**
   `.gitignore` files. The nearest one wins, so the root exception alone is
   silently overridden by `frontend/.gitignore`.
3. Anything else — `disallow`, or `unstated` — leave it ignored. Silence is not
   permission.
4. Give it a row in `MODEL_NAMES` in `src/lib/constants.js`: a name, a blurb, a
   voice and a palette. Without one it still loads, under whatever name the file
   declares about itself, and speaks in the env default voice.
