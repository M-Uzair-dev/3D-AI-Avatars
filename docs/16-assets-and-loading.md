# Assets and Loading

Why the page used to show nothing for several seconds, what was actually large, and the
pipeline that fixed it.

The short version: **the five deployed models went from 83 MB to 17.6 MB**, and the download
now starts in the first byte of HTML instead of six steps later. Nothing was resampled, no texture changed
size, and no expression was lost — [verify-models.mjs](../frontend/scripts/verify-models.mjs)
proves that on every run rather than asserting it here.

---

## What was actually large

Measured by parsing the GLB chunks rather than guessed from the file size. `free-1.vrm`,
17.52 MiB:

| bytes | share | what |
|---|---|---|
| 9.23 MB | 53% | 38 PNG textures |
| 2.72 MB | 15% | morph target POSITION deltas, 57 blendshapes |
| 2.72 MB | 15% | morph target NORMAL deltas |
| 1.90 MB | 11% | skin weights, positions, normals, UVs |
| 0.62 MB | 4% | indices |
| 0.13 MB | 1% | the glTF JSON |

**The geometry was never the problem.** Two things inside the textures are worth naming
because they are invisible from the outside:

- **A 2048×2048 `Thumbnail`, ~2 MB, in every model.** It is `meta.texture`, the preview
  tile a VRM editor shows. Nothing in this app has ever drawn it.
- **A 2048×2048 body texture, 2.82 MB, byte-identical in all five committed models.**
  Hashing confirmed it: 11.29 MB of the 87 MB was one image, five times.

## The pipeline

[optimise-models.mjs](../frontend/scripts/optimise-models.mjs) reads pristine models from
`assets-source/models-original/` — gitignored, and the **only** copy of the three models
that may not be redistributed — and writes optimised ones into `public/`. It never works in
place, so it is always re-runnable from clean input.

```
npm run models:optimise      # 146.04MB -> 40.36MB
npm run models:verify        # structure, data, textures, and a real load
```

**One model is deliberately left alone.** `untitled-6.vrm` (Yuki) carries
`modification=disallow` in her licence, and re-encoding a texture is a
modification. She is also `redistribution=disallow`, so she never leaves this
machine and the practical exposure was nil — which is precisely the reasoning that
gets a licence flag ignored, so it is not the reasoning used. The pipeline reads
the flag and copies her through at full size. Without her the other seven are
**130.85 MB → 25.17 MB**, and the five that actually deploy are 83.13 MB → 17.62 MB.

This project had already learnt the general shape of that lesson once: a VRM's
permissions are separate flags, and answering one does not answer another. See
[ASSETS.md](../frontend/public/ASSETS.md) and `npm run licences`.

Then four passes, in descending order of what they are worth:

1. **Textures to WebP.** 9.4 MB of PNG becomes ~0.8 MB. Each image is encoded *both*
   lossless and lossy-q90 and the smaller wins, so the flat two-colour masks — which
   lossless-compress better than lossy — lose nothing at all. Alpha is compressed
   losslessly in either mode, which is what makes this safe on the hair and eyelash
   cutouts that MToon alpha-tests.
2. **The thumbnail goes**, replaced by a 1×1 transparent PNG rather than deleted. See the
   index rule below for why deleting it would have been the dangerous option.
3. **Morph normals go.** This is **the one pass with a visible consequence** and therefore
   the first thing to reach for if a face looks wrong: normals now stay at the rest pose
   while the mesh deforms. On a two-tone MToon ramp that is somewhere between subtle and
   invisible, but it is not nothing. `--keep-morph-normals` puts them back.
4. **Morph positions go sparse.** 2.7 MB becomes 0.58 MB.

### The index rule, which is the whole design

A VRM 0.x file addresses itself **by index**. `materialProperties[n]` lines up positionally
with `materials[n]`; `textureProperties` holds texture indices; `blendShapeMaster` binds
each expression to a `{mesh, index}` pair where `index` is a morph target's position in its
`targets` array; `meta.texture` is a texture index; `humanoid.humanBones` hold node indices.

A general glTF optimiser knows none of that. It sees textures no *standard* material
references — the sphere-add map, the rim map, the outline width map, all of which live in
the VRM block — prunes them, renumbers what is left, and hands back a file whose VRM block
now points at the wrong things. **That does not throw.** It shows up as her outline texture
rendered as her skin.

So [lib/glb.mjs](../frontend/scripts/lib/glb.mjs) holds one rule: every array the VRM block
can index into keeps its length and its order. Nothing is removed from `images`, `textures`,
`materials`, `accessors`, `meshes` or `nodes`, ever. `bufferViews` is the single exception,
because it is the one array nothing outside `accessors` and `images` refers to — and an
accessor whose data is no longer wanted keeps its index and simply loses its `bufferView`,
which the spec defines as "initialized with zeros" rather than as an error.

That is how 456 morph normals leave a file without moving a single expression's index.

### Why the sparse pass has a threshold

The first cut tested for exact zero, so the round trip was bit-exact. **It saved nothing.**
Every vertex of every blendshape has a bit-nonzero delta — VRoid writes noise, not zeros,
and one shape was `-0.0` on all 4164 vertices — so the sparse form came out *larger* than
the dense one, 3.17 MB against 2.72 MB.

So it is a magnitude threshold, `--morph-epsilon`, defaulting to 1e-5 model units. Measured
across every model it touches, at that setting:

| | |
|---|---|
| largest delta **discarded** | 0.00999 mm |
| largest delta **kept** | 72 mm |
| vertices kept | 17–21% |

A ratio of 7200:1 between the biggest thing thrown away and the biggest thing kept is what
makes this safe. Both scripts print the discarded figure on every run, re-derived from the
written files, so it is a measurement and not a claim.

### How it is verified

`npm run models:verify` is a gate, not a report — exit 1 on any failure. It checks every
model in `public/`, including the one that was left alone, which is how a pipeline that
silently failed to write a file would be caught. Four passes, each the check for one thing
the optimiser could silently have broken:

- **Structure** — every indexable array still the same length and order, and the VRM block
  byte-identical.
- **Data** — every accessor still in use compared **value by value** against the original,
  through the same three cases the loader resolves: zero-filled, dense, sparse. Geometry,
  skinning and indices must be bit-identical; only blendshape deltas may differ, and only
  by `--morph-epsilon`.
- **Textures** — every image decoded, dimensions and channel count compared. Dropping an
  alpha channel is allowed **only** where the original's alpha was 255 everywhere, which
  the verifier checks rather than assumes; that is why the runs report "8 empty alpha
  dropped" instead of failing on it.
- **Load** — the written file goes through the real `GLTFLoader` and the real
  `@pixiv/three-vrm` plugin chain, in Node, and is asked for what this app asks for: every
  humanoid bone, the expression list, the materials, and **the head height the camera frames
  her from**. The original is loaded alongside it and the two head heights compared.

That last comparison is redundant on paper — the vertex data is verified bit-identical and
the node transforms are never touched, so the head *cannot* have moved. It is there anyway,
because this project has had the framing wrong six times and every one of them came from
reasoning about a measurement instead of taking it. See
[06-poses-and-rig.md](06-poses-and-rig.md).

Node has no `<img>`, so a stub reports each texture as loaded without decoding it. That is
the honest limit of the load pass, and why the textures pass decodes them separately.

## Delivery

Smaller files were half of it. The other half was *when* the download started.

### The waterfall, before

three.js touches `window` at import time, so `Scene` and `VrmAvatar` are `ssr: false`
dynamic imports. The model therefore could not begin downloading until:

```
HTML → JS bundle → hydrate → resolve the three.js chunk → mount VrmAvatar
     → its effect runs → NOW ask for the model
```

Six steps, and the largest file last. The greeting clip was a **seventh**: `onLoaded` is
what sets it, so the `.vrma` did not start until the `.vrm` had finished downloading *and*
parsing.

### The waterfall, now

[PreloadStage.jsx](../frontend/src/components/PreloadStage.jsx) emits `ReactDOM.preload`
hints for the default model, the default room's skybox and the greeting clip, so all of it
starts from the `<head>` of the first byte of HTML. Confirmed in the served markup rather
than assumed:

```
<link rel="preload" href="/free-1.vrm" as="fetch" crossorigin=""/>
<link rel="preload" href="/backgrounds/baked/palermo-square.webp" as="image" crossorigin=""/>
<link rel="preload" href="/animations/VRMA_02.vrma" as="fetch" crossorigin=""/>
```

The poster's thumbnail is deliberately **not** hinted: `StagePoster` is server-rendered, so
its `background-image` URL is in that same initial HTML and the browser finds it while
parsing. A hint was tried, React declined to emit it, and reading the served HTML showed the
hint was never needed.

**`crossOrigin: 'anonymous'` on same-origin files is not a mistake.** A preload is only
reused if its credentials mode matches the request that follows, and otherwise the file is
fetched **twice** — which would make the change worse than nothing. three's `FileLoader`
builds its Request with `credentials: 'same-origin'` in the default `cors` mode, and
`anonymous` is the `crossorigin` value that means exactly that. Getting `as` wrong costs the
same.

Only the defaults are hinted. The other seven models are the warm-up queue's business and
must not compete with the one she is wearing.

### Something on screen immediately

[StagePoster.jsx](../frontend/src/components/StagePoster.jsx) paints the room's own
320×160 thumbnail — 3–7 KB, already in the repository for the room picker — blown up and
blurred past recognition. It is not trying to look like the room: an equirect stretched
across a 16:9 box is the wrong picture of the right place, so the blur is doing the work.
What lands is the room's colour and the direction of its light.

It sits at `z-index: -1`, **behind** the canvas, and therefore needs no load state at all:
the canvas is transparent until `Room.jsx` sets `scene.background` and opaque from the
moment it does, so the poster is hidden by the skybox arriving — exactly when it should be,
by the same act that makes it unnecessary. Nothing fades and nothing is scheduled.

### Cache headers

Everything in `public/` was served `max-age=0, must-revalidate`, so a returning visitor
revalidated every model, skybox and clip. The bytes come back 304, so bandwidth is not
spent twice — but the round trips are, in front of a scene that cannot start until they
finish. [next.config.mjs](../frontend/next.config.mjs) now serves `.vrm`, `/animations` and
`/backgrounds` as `immutable`.

> **These filenames carry no content hash.** `free-1.vrm` is `free-1.vrm` whatever is inside
> it, so a browser that has cached one will not ask again for a year. **Re-baking an asset in
> place will not reach anyone who has already seen it.** If a model or a room is re-baked it
> needs a new name, and the `MODEL_NAMES` key in `lib/constants.js` with it.

### The directory-listing routes are prerendered

`/api/models` and `/api/animations` are `export const dynamic = 'force-static'`.

The small reason: `/api/models` opens every `.vrm` and reads a megabyte off each, so
rendering a list was megabytes of disk read per cold page load.

The large reason: **on Vercel, `public/` is uploaded as CDN assets, and a serverless
function's filesystem comes from the build's output trace** — which has no reason to include
files only the CDN serves. A `readdir` there can come back empty in production while being
correct in dev, and the failure is silent and off to one side: the first model still loads,
because `MODEL_URL` is a constant, and it is the **carousel** that quietly has nothing to
walk to. That reads as a UI bug and is a deployment one.

`force-static` moves the read to build time, where `public/` is unambiguously present. It
costs the file-drop nothing — `next dev` runs route handlers per request, so dropping a
model in still shows up on reload.

## Results

| | before | after |
|---|---|---|
| whole cast, 8 models | 146.04 MB | 40.36 MB |
| the 7 the licences permit touching | 130.85 MB | 25.17 MB |
| deployed cast, 5 models | 83.13 MB | 17.62 MB |
| largest single model | 26.48 MB | 4.03 MB |
| default model, `free-1.vrm` | 17.52 MB | 4.03 MB |
| textures per model | 8–19 MB | 0.4–1.4 MB |

## What was deliberately not done

- **KTX2/Basis, which is the one that would also cut VRAM.** A WebP decodes to the same
  RGBA surface on the GPU as the PNG did, so this work made the models **download** five
  times faster and left what they cost once resident exactly where it was. That is the
  number [11-open-questions.md](11-open-questions.md) flags for a thermally tight machine,
  and it is unchanged. KTX2 needs a `toktx` binary in the build environment, so it is a
  separate job rather than a flag.
- **Cross-model texture deduplication.** That 2.82 MB body texture shipped five times was
  11.29 MB of the original 87 MB — but after pass 1 it is ~98 KB, so hoisting it into a
  shared file would now save under half a megabyte in exchange for loading textures from
  outside the GLB. Recorded so nobody re-derives it.
- **Lowering `MAX_RESIDENT`.** Still `Infinity`, still deliberate. The download cost of
  warming the whole cast fell from ~146 MB to ~28 MB, which makes the existing policy
  cheaper rather than wrong. The decoded cost, which is the one that matters here, is
  unchanged — see above.
- **Compression on the wire.** `gzip -6` on an original model saved 40% (18.37 MB → 10.92 MB),
  almost all of it the float morph buffers. After this pipeline those buffers are 5× smaller
  and the textures are already compressed, so there is far less left to win. Whether Vercel
  brotli-compresses `application/octet-stream` has **not** been checked against a real
  deployment; `curl -I` on a deployed `.vrm` would settle it.
