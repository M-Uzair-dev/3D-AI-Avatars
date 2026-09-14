# Expressions

**Job of this doc:** explain how emotions are discovered and driven, and how VRM
arbitrates between an emotion and the mouth.

See also: [04-speech-pipeline.md](04-speech-pipeline.md) (the mouth side of the
conflict) · [03-frame-loop.md](03-frame-loop.md) (where `setValue` is called)

---

## Enumerate from the model, never hardcode

```js
export function listExpressions(vrm) {
  const expressions = vrm?.expressionManager?.expressions;
  if (!Array.isArray(expressions)) return [];
  return expressions.map((e) => e.expressionName).filter(Boolean);
}
```

[vrmIntrospect.js](../frontend/src/lib/vrmIntrospect.js) reads the expression list off
the *loaded model*. [ExpressionTab.jsx](../frontend/src/components/ControlPanel/ExpressionTab.jsx)
renders one slider per name it returns.

This is **the central pattern the reference exists to demonstrate**, and it is not
theoretical. This project's model ships a non-preset `Surprised` blendshape. A
hardcoded VRM preset list would work perfectly against one model and then silently
drop capability on the next — the worst kind of bug, because nothing fails.

The same rule governs bones: `listBones(vrm)` filters the humanoid vocabulary down to
what the model actually has. See [06-poses-and-rig.md](06-poses-and-rig.md).

## Version normalization is already handled

`@pixiv/three-vrm` v3 loads both VRM 0.x and 1.0 and normalizes 0.x names to the 1.0
vocabulary at load time:

| VRM 0.x | → normalized |
|---|---|
| `Joy` | `happy` |
| `Sorrow` | `sad` |
| `Fun` | `relaxed` |
| `Angry` | `angry` |
| `Blink` | `blink` |
| `A` `I` `U` `E` `O` | `aa` `ih` `ou` `ee` `oh` |

So application code targets the 1.0 names and stays version-agnostic. **Do not branch
on VRM version anywhere.** The current model is 0.x and nothing in `src/` knows that.

## Conflict resolution: use the format's own mechanism

An emotion and a viseme both want the mouth. VRM already has an answer, so this
project does not invent one.

Each expression declares `overrideMouth`, `overrideBlink`, and `overrideLookAt`.
`vrm.update()` resolves them. The frame loop therefore writes emotions, then writes
visemes, and lets the format arbitrate:

```js
for (const [name, value] of Object.entries(s.expressions)) em.setValue(name, value);

// Then visemes. Note we do NOT hand-suppress these when an emotion is
// active — VRM's own override flags arbitrate that inside vrm.update().
for (const v of VISEMES) em.setValue(v, weights[v]);
```

> **Do not add manual suppression logic.** If a raised emotion swallows the mouth,
> that is the model declaring it, not a bug in the pipeline.

## The VRM 0.x limitation

VRM 0.x has only boolean `ignoreMouth` / `ignoreBlink` flags. three-vrm maps them to
`'block'` or `'none'` — **there is no `'blend'`.**

So on this model an emotion either fully suppresses visemes or fully collides with
them. There is no partial mixing available.

This is a **model-format property to surface, not a bug to patch.** A VRM 1.0 model
would offer `'blend'` and the same code would use it with no changes.

## How that is surfaced

[DebugTab.jsx](../frontend/src/components/ControlPanel/DebugTab.jsx) resolves the
override flags for every currently-raised expression and prints them in a table,
amber where a flag is not `'none'`:

```js
const e = vrm.expressionManager.getExpression?.(name);
return { name, mouth: e?.overrideMouth ?? 'none', blink: ..., lookAt: ... };
```

An amber `block` under *mouth* means that expression suppresses visemes entirely.
Making that legible was the whole reason the Debug tab exists — it turns "why did the
mouth stop moving" from a debugging session into a glance.

## Store shape

`expressions` is a **sparse map** of name → `0..1`. Absent means zero. Nothing
pre-populates it with the model's expression list, so the store stays small and
model-agnostic.

## Resting warmth

The one expression this system raises on its own. A VRM neutral face is *genuinely*
neutral — slack, unfocused, and read by viewers as bored or cold — so `relaxed` (or
`happy`, if the model lacks it) is held at a low weight whenever she is not speaking.
Her default becomes *content* rather than *absent*. It is the facial counterpart of the
asymmetric standing pose.

It ramps to **zero while speaking**, and that is not cosmetic. Per the override-flag
limitation above, a raised emotion on a VRM 0.x model can suppress visemes outright, and
this is the only emotion the system raises without being asked. Fading it during speech
keeps the mouth unambiguously ours.

It also stands aside if the panel drives that expression by hand — the same ownership
rule as blink, below.

If the mouth ever looks damped or reluctant to open, `restingWarmth` is the first number
to pull down. See [07-idle-motion.md](07-idle-motion.md).

## Panel ownership

Auto-blink is applied only when the panel is *not* driving blink manually.

```js
if (s.expressions.blink === undefined) em.setValue('blink', blink);
```

Touching the blink slider therefore takes ownership of the eyelids; `resetExpressions()`
hands them back to the idle layer. See [07-idle-motion.md](07-idle-motion.md).
