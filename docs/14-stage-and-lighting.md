# Stage and Lighting

**Job of this doc:** record the lighting rig, why the first one washed the character
out, and how camera framing is chosen.

All of it is in [Scene.jsx](../frontend/src/components/Scene.jsx), driven live from the
store so it can be judged by eye — the same reason the Pose tab exists.

See also: [08-state-and-ui.md](08-state-and-ui.md) (the Stage tab)

---


## Full height on a phone: `svh`, not `vh`

The control bar sat **below the fold on mobile**. `100vh` is the *large* viewport
height — it assumes the browser's chrome is retracted — so with a URL bar showing, the
stage is taller than the window and anything anchored to its bottom is off screen.

`100svh` is the *small* viewport: the height with the chrome expanded. The bar is
reachable whether the URL bar is showing or not.

**`dvh` is the wrong tool here**, though it is the one that sounds right. It tracks the
chrome as it slides, so the stage would resize mid-scroll — and the camera re-frames on
resize, so she would breathe in and out with the address bar.

It is an `@utility` in [globals.css](../frontend/src/app/globals.css) rather than a plain
class, because the workbench needs `lg:stage-height` and Tailwind variants only apply to
real utilities. The `100vh` fallback written above it is **stripped by the build** —
Lightning CSS knows every browser in Tailwind v4's target range supports `svh`. If that
ever has to change, the lever is the browser targets, not the stylesheet.

Menus opening upward off the bar are capped at `52svh` for the same reason.

## Why the first rig washed her out

```js
ambientLight     0.6
directionalLight 1.4   // key
directionalLight 0.4   // fill
```

About 2.4 of flat white light on an MToon anime material whose albedo is already
near-white — pale skin, white blouse, white jeans. Two separate mistakes compounded.

**1. Ambient was doing the fill.** This is the one worth internalising. Ambient light
adds the same amount to every surface regardless of which way it faces, so it *cannot
shade anything* — it only raises the black point. At 0.6 it erased the form shading and
left a flat cutout.

> A hemisphere light fills the same shadows but has **direction**, so the shading
> survives.

**2. Nothing separated her from the background.** A dark scene lit only from the front
gives a silhouette that dissolves into the backdrop.

### And a third one, found much later, larger than both

Neither of those was why she looked like **a sticker colour-matched to a photograph**.
That complaint survived every fix above, and the cause was not in the lighting at all.

**MToon's diffuse term never multiplies by `dotNL`.**

```glsl
shading       = linearstep( -1.0 + toony, 1.0 - toony, dotNL + shift );
directDiffuse = lightColor * BRDF_Lambert( mix( shadeColor, litColor, shading ) );
```

Unlike a Lambert surface, an MToon surface has **exactly one** way to vary with the
direction of the light: that ramp between two colours. Make the two colours equal, or
saturate the ramp, and the surface renders a constant — whatever the lights are doing.

Both are true of the shipped VRoid bodies, measured from their own glTF:

- **`_ShadeColor == _Color`** on hair, brows, eyes, shoes and bottoms, and within 3% on
  most cloth. The shade side *is* the lit side. On the `Tops` materials it is **inverted**
  (lit 0.49, shade 0.96), so the sweater was brighter in shadow than in light.
- **`_ShadeShift = -0.8`** on every face material. After three-vrm's v0 conversion that is
  `linearstep(-0.09, 0.09, dotNL - 0.8)` — the face is fully in shade colour below
  `dotNL` 0.71, which is everywhere except a patch pointing within 27 degrees of the key.

So every visible pixel evaluated to `albedo * a constant tint`. **No light rig on this
page could ever have lit her**, and that is why the problem outlived so many attempts to
fix it by moving lights around.

The fix is a four-uniform retune in
[mtoonResponse.js](../frontend/src/lib/mtoonResponse.js), applied in `VrmAvatar.jsx`.
**Never a material swap** — `MeshStandardMaterial` would light her correctly and destroy
the art style, which is the one thing that must not change.

Two things about it worth not re-deriving:

- The shade colour is derived from the material's **own lit colour**, not from its
  authored shade colour. That is what makes one dial work across materials whose authored
  ratios run from 0.97 to 1.96, and it un-inverts the sweater for free. The authored
  **hue** is kept and only its magnitude renormalised, because VRoid shades skin pink on
  purpose.
- Darkening the shade side is only safe because **`_ShadeTexture === _MainTex`** on all 87
  measured materials — the shade side samples the same albedo, so the factor multiplies
  rather than replaces. `shadeTextureFor` checks per material anyway.

**This was measured on five of the eight models** (`free-1/2/3/5/6`). `haishin-chan`,
`untitled-6` and `untitled-7` have never been through it. Every uniform is derived from
each material's own values and every clamp is one-directional, so it should generalise —
but that is reasoning, and reasoning about this renderer is what produced the bug.

**The debugging lesson, which is the transferable part.** Eyeballing said better; two
metrics said worse; *both metrics were wrong*. Left-right luminance spread went down
because most of the old spread was the additive matcap — **view space**, varying with the
camera and not the room, which is exactly what an overlay looks like numerically. And the
spread did not flip between a left-lit and a right-lit room because the samples were on
the flat frontal chest, where a frontal key lights everything and a rear key shades
everything. Isolating the key — every other light to zero — settled it in one
measurement. **Isolate the variable before trusting a metric over your eyes.**

## The rig

**Every position and colour in it is derived from the room now.** What follows is the
studio fallback — what the workbench gets, and what a null rig resolves to.

| Light | Value | Job |
|---|---|---|
| `ambientLight` | 0.018 | A floor under the darkest shadows. **Not** fill. |
| `hemisphereLight` | 0.132 | Directional fill — the room's sky above, its ground bounce below |
| key `directionalLight` | 1.05 | The room's own key direction; in the studio, `[2.6, 3.2, 2.4]` |
| fill `directionalLight` | 0.072 | Opposite the key and nearer the horizon, derived |
| **rim** `directionalLight` | 1.0 | From `[-1.6, 2.6, -3]` — behind and above, colour opposing the room |
| `toneMappingExposure` | per room | Baked with the skybox; 0.78 in the studio |
| key warmth | 0.35 | Tints the key toward candlelight. **Studio only** |

The first four were scaled to **0.6x** when the rooms arrived (they were 0.06 / 0.36 /
0.82 / 0.2). Against a flat gradient they were right; against a photograph the fill was
doing so much work that her shadow side was nearly as bright as her lit side, so there
was no form left to see.

**Contrast on an MToon model is the ratio between the key and everything else, not the
exposure.** Exposure moves both ends together and changes nothing about the separation.
To make her read harder, widen the gap: raise `key`, lower `hemisphere` and `fill`. The
key is deliberately *not* scaled with the other three — dividing the two is what raises
contrast rather than merely darkening her.

**The rim is the single biggest improvement in the file.** A light from behind and
above catches the edge of the hair and the shoulders and draws a bright line around the
character. It is most of the reason good VTuber renders look the way they do, and it
costs one light. Drag it to zero in the Stage tab to see how much it was doing.

It is kept at full strength now there are rooms rather than scaled with the rest: a
photograph is a far busier thing to be lost against than a gradient was, so the light
separating her silhouette matters *more*, not less. Its **colour opposes the room**
rather than matching it — a white rim on a snowy field is the one case this light exists
for and the one case a fixed cool white could not handle. See `rimColorFor` in
[stageLighting.js](../frontend/src/lib/stageLighting.js).

### The division of labour

| | decides |
|---|---|
| the **room** | key and fill *position*, every light *colour*, exposure |
| the **store** | every *intensity*, and the material response tuning |

So the Stage tab's sliders still do what they always did: they set how much, not from
where. Changing room reseeds `exposure` and nothing else, which is what keeps the slider
honest rather than silently fighting a value it cannot see.

## Two implementation details

**Exposure and the camera are poked from inside `useFrame`,** reading the store
transiently:

```js
useFrame(({ gl }) => {
  gl.toneMappingExposure = useAvatarStore.getState().lighting.exposure;
});
```

Not from an effect. The renderer and the camera are three.js objects rather than React
state, so assigning to them from an effect is both a lint error under the React
compiler's immutability rule and a frame late. `CameraRig` uses the same approach and
gets a second benefit: `controls` does not exist on the first render, so an effect
would have to re-run to catch it, where a per-frame ref comparison just works.

**`Lights` subscribes to the store, and that is fine.** The transient-read rule
([invariant 2](10-invariants.md)) is about `useFrame`, not about ordinary components.
`children` passes through by element identity, so a lighting change re-renders five
lights and nothing else.

## The backdrop is a room she is standing in

**This replaced the cyclorama**, which was a CSS sweep painted behind a transparent
canvas and tinted per character from her own palette. That is gone: the class, the
`@property` crossfade, the `--pool` variables and the `palette` wiring in `AvatarStage`.

It was good and it was cheap, and it could not survive a real room. **A DOM layer does
not move when the camera moves**, so with a photograph behind her, orbiting reads as her
spinning inside it. On `scene.background` the equirect is world-fixed and the parallax is
free — it falls out of moving the camera rather than being a second thing to animate and
keep in sync.

The canvas is **opaque** now. `gl={{ alpha: true }}` existed only so the CSS layer could
show through from behind it.

### Six rooms, and what each one ships

Each room is three files in `public/backgrounds/baked/`, plus a row in
[backgroundRigs.json](../frontend/src/lib/backgroundRigs.json):

| file | what it is |
|---|---|
| `<id>.webp` | the equirect skybox, already tone-mapped to LDR |
| `<id>-matcap.png` | the diffuse convolution MToon samples instead of an env map |
| `<id>-thumb.webp` | the picker tile |

The rig row is the HDRI reduced to numbers: a key **direction**, a key **colour**, a
**sky** and a **ground** colour, an **exposure** and a **backgroundIntensity**.
[backgroundLibrary.js](../frontend/src/lib/backgroundLibrary.js) generates the room list
from that file, so the list and the assets cannot drift apart through someone editing one
and forgetting the other. A test asserts every generated URL has a real file behind it.

**There is no bake script in this repo.** The `.exr` sources, the equirect / lightRig /
matcap modules and `bake-backgrounds.mjs` all live in the host project. So **the room set
here is fixed at six**, and `backgroundRigs.json` is a committed artifact rather than
something you can regenerate. Adding a room means baking it over there and copying four
files across.

### The tone curve is load-bearing in two directions

`Scene.jsx` names `NeutralToneMapping` explicitly. Three separate things depend on it:

1. **Neutral, never ACES.** R3F defaults to ACESFilmic, which desaturates saturated hues
   on the way to the highlight — and saturated hues are most of what an anime model is
   made of. **It turns pink hair grey.** Khronos PBR Neutral rolls the highlight off
   while holding the hue, which is the entire reason it exists.
2. **The skyboxes were baked through this curve**, with each room's own exposure already
   applied. The backdrop and the character agree only because the renderer finishes with
   the operator the bake started with. Change it and every room is mis-exposed against
   the person standing in it.
3. It is what switches `toneMappingExposure` on at all. Under three's `NoToneMapping`
   default that value is read by nothing — **a tuned exposure wired to nothing survived
   an entire milestone in the host project**, because a tuned constant sitting next to an
   unset mode looks completely fine in a grep.

### MToon cannot sample an environment map. Check before trying again.

`scene.environment` does **nothing** to an MToon material: the `envmap_fragment` include
is commented out in its own shader and the indirect path is gated on
`defined( STANDARD )`, which MToon never defines. That is why this is a light rig plus a
matcap rather than IBL, and why a PMREM here would cost a convolution per room change and
light exactly zero pixels.

The matcap is the room's only route to her surface, and it goes on at `0.10` strength —
low on purpose. MToon **adds** the matcap, and a convolved room is a mid-grey disc, so the
slot adds a constant to every pixel whichever way it faces. That is the definition of
raising the black point, which is the same mistake `ambient` was dropped from 0.6 to undo,
arriving back through a different door. At the host project's original 0.22 a black frill
rendered at RGB 50 and a sixth of the tonal range was gone.

The matcap is **view-space** and does not rotate when you orbit. Accepted deliberately.

### Two dials both read as "the environment on her"

They fail differently, and telling them apart is most of tuning this:

| dial | where | what too much of it looks like |
|---|---|---|
| `shadeTintAmount` | `DEFAULTS.lighting` | her **shadows are the wrong colour** — the room reads as a cast ON her |
| `MATCAP_STRENGTH` | [applyMatcap.js](../frontend/src/lib/applyMatcap.js) | a **film over all of her**, blacks lifted, whichever way a surface faces |

`shadeTintAmount` went **0.30 -> 0.18** after one look in a browser: the room was reading
as a colour cast rather than as bounce inside the shadows, which is the exact failure this
whole milestone exists to undo, arriving through the one door still open to it. Her
shadows keep the room's hue; they no longer take its saturation.

`MATCAP_STRENGTH` is `0.10` and has not needed moving.

**Neither is live-tunable.** Both are read when the material effect runs, which is keyed
on `[vrm, room]` in `VrmAvatar.jsx` — so editing a constant needs a **hard reload**, not a
Fast Refresh, and stepping to another room and back also works. Give one of them a slider
and it will appear to do nothing until it is added to those deps.

### The shadow map is PCF, and that is not a downgrade

`Scene.jsx` passes a bare `shadows`, which is `PCFShadowMap`. **Not `shadows="soft"`.**

`PCFSoftShadowMap` is deprecated in three 0.185: it warns and silently downgrades to PCF
anyway, so the only thing asking for it bought was a console warning on every frame batch.

Nothing is lost, because PCF is what absorbed the soft sampling —
`SHADOWMAP_TYPE_PCF` is now a **five-tap Vogel disk** scaled by
`shadowRadius * texelSize`. So `shadowRadius: 4` in `DEFAULTS.lighting` is live and is
still the penumbra dial. Above about 8 the penumbra grows wider than the features casting
it and her chin stops shadowing her neck.

This was found by reading the browser console, not by a test — a deprecation that
downgrades rather than throws is invisible to everything else.

`shadow-normalBias` rather than `shadow-bias`: these are **skinned** meshes, and a depth
bias on a skinned mesh detaches the shadow from the surface casting it.

### She still has nothing to stand on

`GroundShadow` is ported, wired and **commented out** at the call site in `Scene.jsx`.

The scene contains her and nothing else, so `castShadow` has no surface to fall on and no
setting of anything produces a contact shadow. She self-shadows — chin onto neck, fringe
onto forehead, which is where most of her depth comes from — but she casts nothing onto
the world, and a figure with no relationship to the ground reads as a cutout.

The reason it is off: the cast streak runs off the edge of the key's shadow frustum and
**stops dead**, which reads as a torn rectangle lying on the floor and is worse than no
shadow at all. The real fix is to size the shadow camera to the *cast* rather than to the
disc. [GroundShadow.jsx](../frontend/src/components/GroundShadow.jsx) says so at the top.

### What it opens with

| | | why |
|---|---|---|
| `MODEL_URL` | `/free-1.vrm` (Sakura) | Pink hair and a white coat are the hardest thing in the cast for a room to light without washing out, so the default is also the one that shows a lighting fault soonest |
| `DEFAULT_ROOM` | `palermo-square` | Hard noon sun. A high, hard key is the room that best SHOWS the retune — real terminator, real shadow side — and the harshest test of it |

Soft daylight flatters everyone and proves nothing, which makes `suburban-garden` the
safer default and the worse first impression. Both are one constant in
[constants.js](../frontend/src/lib/constants.js).

Sakura carries **no voice fallback** and needs none: her voice is a premade, which works on
every plan and cannot be withdrawn. Only the three Library voices carry a spare. A test
used to assert the default model *had* a fallback — that was a proxy for "the default
happens to use a Library voice", and it went red the day the default changed with nothing
about the lookup broken. It asserts the two spellings agree now.

### Picking a room

A menu on the control bar, showing the baked thumbnails rather than the names — "Spruit
Sunrise" and "Palermo Square" tell you nothing about what either will do to the picture,
and the difference between them is entirely visual.

It is **on the bar**, where the model picker deliberately is not. `ModelNav` argues that
choosing *who* is on stage is the frame around everything else; the room is the opposite
case. It is scenery, you change it rarely, and there is nothing at the edge of the screen
for an arrow to point at, because the room is already everywhere.

The choice is **global rather than per-model**: walking the carousel does not redecorate
the room, which is what a per-model room would do five times in ten seconds.

### The arrows had to become real buttons

A knock-on, and not a style preference. The nav chevrons were bare at 45% opacity with a
scrim that appeared only on hover, and the stated argument for that was *"at rest the
arrow is over the dark edge of the cyclorama and needs nothing"*.

**Every word of that depended on the backdrop being a dark gradient.** A photograph has no
reliably dark corners — the left edge of a sunrise is bright sky — and a hover scrim
cannot help, because you have to find a control before you can hover it. They are round
glass discs now. The host project reached the identical conclusion from the identical
starting point, which is worth knowing before anyone argues them back to bare chevrons.

The nameplate stays bare, but it gained a **text shadow**: it sits at the top centre,
and every one of the six is an outdoor HDRI, so that is sky. Near-white text on a bright
sky is not readable.

### She arrives mid-greeting

The first model to land plays [`GREETING_CLIP`](../frontend/src/lib/constants.js) — the
pixiv pack's `Greeting` — once, automatically.

The reason is the same one behind everything else on this page. A character already
standing in position the instant the page paints reads as **an asset that finished
loading**. One who waves hello reads as someone who just walked in, and being the second
thing is this avatar's entire job.

**The clip does not open standing, and that shapes the whole design.** `Greeting` begins
in a crouch and springs up — a fine entrance and a terrible transition. Played the
ordinary way she appeared standing in her idle pose, sank into the crouch across the
clip's 600 ms fade-in, then leapt: three movements where the point was one, and the first
two read as a glitch.

So an arrival is not an ordinary clip:

- **She is not rendered until the clip is driving her.** The store's `arriving` flag
  holds her off screen until the blend is non-zero, so the first frame anyone sees is the
  clip's own first frame.
- **It plays at full weight from frame one.** Easing in is right for a clip fired at a
  character already standing in front of you; it is wrong for the clip that *is* her
  appearing, because the thing it eases from is a pose nobody should ever see.
- **The spring bones are reset on the frame she reappears.** The rig snaps from rest into
  the opening crouch in one frame, and a spring joint handed that much change at once
  discharges it as a whip — the carousel's problem arriving by a different road.

`arrivalHidesModel` in [clips.js](../frontend/src/lib/clips.js) is the decision, and it is
written so that **every way out reveals her**: hiding requires a clip to be pending. A
greeting that fails to load clears the selection and she appears; a greeting that was
never dispatched leaves it null and she appears; and `DEFAULTS.arrivalWaitMs` gives up
after 1.2 s so a slow `.vrma` fetch cannot hold an empty lit room — by then the model has
loaded and the progress readout is gone, so blank reads as broken. An avatar nobody can
see would be a far worse bug than the one this fixes.

**The entrance ends when she appears, not when the clip does**, and getting that backwards
put a one-frame hole in her that read as two models being swapped. The frame loop takes
one `getState()` snapshot per frame, so a flag cleared at the end of the clip was still
set when the visibility check ran later in the same frame — blend already zero, flag still
true, so she was hidden for exactly one frame before coming back in her idle pose.
Clearing it on reveal means it can never be true again while a clip is winding down.

The fade-in is chosen **when the action first runs**, not when the clip was dispatched.
Between those is the fetch, and if that outlasts the wait above she is already on screen —
at which point the greeting has to ease in like any other clip rather than snapping to
full weight on a visible character.

Three further constraints, each of which is a bug if broken:

- **Once, on the first model only.** Switching models later belongs to the carousel;
  being greeted afresh every time you press an arrow turns a welcome into a tic. Guarded
  by a ref in `AvatarStage`, not by state — as state the re-render that setting the clip
  causes would reset the guard it exists to be.
- **Production only.** The workbench is for authoring poses, and a tool that starts
  playing animations at you is a tool fighting you.
- **It must be allowed to fail.** `.vrma` is gitignored, so a fresh clone has no
  animations at all. `loadClip` is async, and this is the change that made an unhandled
  rejection reachable on page load rather than only by clicking a clip. It fails quietly:
  she simply appears without it.

`GREETING_CLIP` may be set to `null`, which means "just appear".

### The per-character backdrop is gone

This section used to describe the backdrop taking its colour from whoever was standing in
it: `palette` in `MODEL_NAMES` supplied one hue, `.cyclorama` mixed it down toward
`--void` at three strengths, and it crossfaded over 900 ms via `@property`.

The rooms replaced all of it. A photographed room has its own colour and does not want a
second one mixed in, and there is nothing left here for a per-character hue to tint.

**The `palette` data is still in `MODEL_NAMES` and its tests still pass.** Nothing reads
it. It was kept rather than deleted because it is measured data — eight models loaded and
looked at — which is cheap to keep and tedious to reproduce. `modelPalette` and
`modelPaletteForUrl` are live exports with no callers.

## The model picker

The Stage tab lists every `.vrm` in `public/` with the name, author and licence the file
declares about itself, and switching is live — the old model is disposed explicitly,
because three.js does not free GPU resources on garbage collection and these are ~18 MB
of mesh and texture apiece.

The panel is handed a null `vrm` while the next one is in flight, so the Expressions and
Pose tabs stop enumerating bones against a scene that no longer contains them.

### The production picker names them instead

Declared metadata is the right thing for the workbench and useless in a product. Five of
the eight models call themselves `FREE`, `FREE 2`, `FREE 3`, `FREE 5` and `FREE 6` (all
by *AnimeFreak*), two declare no name or author at all, and only `haishin-chan` carries a
real one (*Rurune*).

So `MODEL_NAMES` in [constants.js](../frontend/src/lib/constants.js) gives each a human
name and a one-line look note, **assigned by loading every model and looking at it** —
not by reading filenames.

| File | Name | Look |
|---|---|---|
| `free-1.vrm` | Sakura | Pink hair, cat ears, white coat |
| **`free-2.vrm`** *(default)* | **Rin** | Purple hair, red eyes, school uniform |
| `free-3.vrm` | Hana | Brown hair, pink hoodie, headband |
| `free-5.vrm` | Yoru | Black twintails, striped dress |
| `free-6.vrm` | Kuro | As Yoru, with skull cuffs |
| `haishin-chan.vrm` | Momiji | Lilac hair, cat ears, red apron dress |
| `untitled-6.vrm` | Yuki | Lavender bob, bunny ears |
| `untitled-7.vrm` | Mio | As Yuki, with a beret |

**Two of the four pairs are the same character twice.** `free-5`/`free-6` differ only by
purple skull cuffs, and `untitled-6`/`untitled-7` only by a beret. Nothing in the
filenames says so — they sort as though unrelated — which is exactly why the look note is
a disambiguator rather than decoration, and why this had to be done by rendering all
eight rather than by reading the directory. The same lesson as everywhere else here: the
filename is not the asset.

Licence terms are deliberately absent from the production picker. Every installed model
permits commercial use, and that is enforced by which files are in `public/` at all
rather than by a caption. The workbench still shows the declared terms.

## Framing

**A framing is an intention, not a coordinate.**

```js
FRAMINGS = {
  bust:  { coverage: 0.67, headAt: 0.33 },   // default
  close: { coverage: 0.31, headAt: 0.33 },
  full:  { coverage: 1.18, headAt: 0.14 },
}
```

- `coverage` — the vertical slice to show, as a multiple of **this model's own head
  height**. Bigger shows more of her.
- `headAt` — where the head bone should sit, as a fraction down from the top edge.
  Smaller puts her head higher in frame.

[framing.js](../frontend/src/lib/framing.js) solves the camera position from those and
the model's measured head height, every time a model or a framing changes.

### Why it stopped being coordinates

The old version was three literal camera positions, solved from the fov for the one
model in the project and pasted in. That was correct arithmetic and it did not survive
contact with a second model: with eight of them at different heights, **the same
coordinates put a short model's head in the middle of the frame and pushed a tall one's
out through the top.** One loaded neck-deep, the next was decapitated.

Solving per model fixes the class rather than the instance. It also subsumes the older
cropping bug this section used to describe — the first `bust` covered only 0.62 m and
the model's ears reached past the top of it. With the head anchored a third of the way
down there is a third of the frame above it by construction, which is more headroom than
any hair or ear has needed.

### The arithmetic

For a vertical fov `t`, a camera `d` away sees a slice of height `V = 2·d·tan(t/2)` at
the target plane. The camera looks horizontally, so the view runs `Ty ± V/2`, and putting
the head a fraction `f` down from the top means:

```
Ty = headY − V(0.5 − f)
```

Both directions are implemented: `solveFraming` goes intention → coordinates, and
`headScreenFraction` goes back. That second one exists for the tests — asserting the head
lands a third of the way down at three different model heights is a real claim, where
asserting the formula against itself is not.

### The head sits a third of the way down

Centred reads as a passport photo. Much higher and she feels like she is leaving the
frame. `full` is the exception at `0.14`, and has to be: it is the one framing bounded at
the **bottom** instead, because the feet have to fit, and that is only possible with the
head much closer to the top edge. A test checks the feet actually make it in at every
model height.

The anchor is the **head bone**, not the top of the hair. Hair and ears vary wildly
between models — cat ears, tall styles, accessories — while the head bone sits
predictably around the ears on every VRM. Anchoring on the stable thing and leaving
generous headroom is what makes it work across models without tuning.

**`bust` is the default** because the production target is a waist-up companion
framing: close enough that the face carries the scene, wide enough that shoulder and
arm motion still reads.

Orbiting with the mouse still works. Reselecting a framing snaps back to it.

### Phones get the same framing, further back

At `sm` and below (<= 640 px canvas width) she is pulled back to **0.6x** apparent size,
via `zoomForWidth` and the optional fourth argument to `solveFraming`. A viewport that
narrow cannot give both the character and the control bar the room they want, and at full
size the bar lands across her waist.

Two things worth keeping straight:

- **`zoom` is apparent size, not distance.** 0.6 shows *more* of the scene and stands the
  camera *further* back. The inversion is the easy mistake, so the solver divides rather
  than multiplies and a test asserts the direction rather than the arithmetic.
- **Moving the camera, not scaling the model.** Every pose, overlay and gesture then
  reads at the same proportions; only the distance changes. `headAt` is applied after the
  zoom, so it is genuinely the same composition further away rather than a second
  framing.

It keys off the **canvas** width rather than a CSS media query, because the canvas is
what the framing is composed against — and it is the same 640 px breakpoint the control
bar wraps at, so the two cannot drift apart. A width of zero falls back to full size: the
camera is solved before the canvas has been measured at least once per session, and
guessing "phone" there would shrink her on every desktop for a frame.
