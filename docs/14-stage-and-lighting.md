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

## The rig

| Light | Value | Job |
|---|---|---|
| `ambientLight` | 0.06 | A floor under the darkest shadows. **Not** fill. |
| `hemisphereLight` | 0.36 | Directional fill — cool `#b9c7ff` above, warm `#4a3a42` bounce below |
| key `directionalLight` | 0.82 | From `[2.6, 3.2, 2.4]`, well off-axis so the face gets a terminator rather than flat frontal light |
| fill `directionalLight` | 0.2 | `#cfd8ff`, keeps the shadow side off black |
| **rim** `directionalLight` | 1.0 | `#dfe6ff` from `[-1.6, 2.6, -3]` — behind and above |
| `toneMappingExposure` | 0.78 | Stops near-white surfaces clipping |
| key warmth | 0.35 | Tints the key toward candlelight |

**The rim is the single biggest improvement in the file.** A light from behind and
above catches the edge of the hair and the shoulders and draws a bright line around the
character. It is most of the reason good VTuber renders look the way they do, and it
costs one light. Drag it to zero in the Stage tab to see how much it was doing.

Splitting colour temperature between a warm key and a cool fill is a photographic
habit, and it does a surprising amount of the "this feels friendly" work on its own.

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

## The backdrop

Two different backgrounds, chosen by surface.

The **workbench** paints `#16161b` into the scene and draws the reference grid. Both are
right for a workbench: the grid gives the eye a ground plane while you are dragging
bones around.

The **production** view uses neither. The canvas is transparent (`gl={{ alpha: true }}`,
no `<color attach="background">`) and a CSS layer shows through from behind — the
`.cyclorama` class in [globals.css](../frontend/src/app/globals.css).

It is built as a photographic sweep rather than a linear gradient, which is the whole
idea: a studio backdrop is not a flat wash and not a top-to-bottom fade, it is a **pool
of light behind the subject falling off to darkness at the corners**. Two layers do it —
a large radial pool centred just above and behind her head, plus a slight vertical grade
because the air in a real room is lighter than the floor.

It earns its place twice over. The rim light — the single biggest win in the lighting
rig — now separates her against dark corners instead of flat grey, and a centred pool
pulls the eye to her face for free.

Being DOM rather than scene, it costs nothing per frame and is tuned in CSS.

**The first cut was invisible.** `--pool` was `#232026` against a `#08090b` void, which
measured on screen as very nearly the void itself. A gradient you have to be told is
there is not a gradient; it is now `#3a3340` with a hotter `#4a4152` centre. The same
mistake as the conversational-state overlays, in a different medium — see
[12-conversational-states.md](12-conversational-states.md).

The grid is dev-only for a second reason beyond looking like a 3D editor: a horizon line
across the lower frame contradicts the seamless sweep the backdrop is imitating.

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

### The backdrop is the character's, not the app's

**Each model brings her own colours to it.** The pool was one fixed plum for everybody,
tuned against whichever model happened to be default at the time — which is a lighting
choice with one character and an accident with eight. A pink-haired girl in a white coat
and a black-twintailed one do not want the same room.

`palette` in [MODEL_NAMES](../frontend/src/lib/constants.js) carries the hues and the
backdrop uses **only the first one**. The rest of her palette is hers but not the room's:
two hues in one sweep read as a gradient effect, where one hue at three strengths reads as
light falling off — which is the entire thing this backdrop is imitating. The secondary
and any third are stored for other uses.

**The hues are in the table and the ratios are in the CSS**, and that split is the point.
What arrives from `constants.js` are hair and outfit colours — fully saturated, picked to
be seen on a character. Painted at strength behind her they win: she is supposed to be the
brightest, most saturated thing in frame, and a wall the same pink as her hair erases her
silhouette. So `.cyclorama` mixes it down toward `--void` before it reaches a pixel — 34% at the
centre, 20% at the mid-field, 8% beyond, void at the corners regardless of who is standing
there. Retune those three numbers in one place rather than eight.

The colour **crossfades over 900 ms** rather than cutting. A CSS gradient cannot be
transitioned, so `--backdrop-main` is registered with `@property` as `<color>` — that is
what tells the browser to interpolate it rather than swap strings. It is timed to land inside a carousel transition: the model swaps on an empty
stage, so the room has finished changing colour before she walks into it. A browser
without `@property` gets an instant change, which is what this did before.

A model with no `palette` row falls through to the CSS defaults — the original plum this
rig was lit against — so dropping in a new `.vrm` still works with no edit here.

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
