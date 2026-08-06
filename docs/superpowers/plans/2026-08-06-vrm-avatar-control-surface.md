# VRM Avatar Control Surface — Implementation Plan (2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the full control surface — per-expression sliders generated from model introspection, pose presets with smooth transitions, per-bone manipulation with JSON export, `.vrma` clip playback, and a live debug readout.

**Architecture:** Every control binds to the zustand store built in Plan 1; the compositor already consumes `manualBones`, `poseName`, and `expressions`, so this plan mostly wires UI to existing contracts. The one new piece of pure logic is `lerpPoses`, which serves double duty: smoothing preset transitions and blending animation-clip output against a static pose.

**Tech Stack:** Same as Plan 1, plus `@pixiv/three-vrm-animation` 3.5.5.

**Prerequisite:** `docs/superpowers/plans/2026-08-06-vrm-avatar-core.md` complete and its 80 tests passing.

**Spec:** `docs/superpowers/specs/2026-08-06-vrm-avatar-reference-design.md`

## Global Constraints

- **No git.** The user has explicitly declined version control. Every task ends with a **verification step** instead of a commit. Do not run `git init`, `git add`, or `git commit`.
- **No audio, ever.**
- All work happens in `frontend/`. Run all commands from `frontend/`.
- **`src/lib/**` must never import React or three.js.**
- **Read `node_modules/next/dist/docs/` before writing Next-specific code.** Next 16.3 differs from training data; `AGENTS.md` mandates this.
- **`vrm.update(delta)` stays exactly once per frame, last.** Adding the animation mixer does not change this — `mixer.update()` runs *before* compositing, `vrm.update()` stays at the very end.
- **Do not rename any store action from Plan 1.** This plan binds to them.
- Enumerate expressions and bones **from the loaded model**, never from a hardcoded list. This is the central pattern the reference exists to demonstrate.
- **Do not hand-roll expression/viseme mouth suppression.** VRM's own override flags arbitrate inside `vrm.update()`. On this VRM 0.x model only `'block'`/`'none'` are available — that is a model-format property to surface in the Debug tab, not a bug to patch.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/composite.js` | *(modified)* adds `lerpPoses` |
| `src/lib/poses.js` | *(modified)* adds five more presets |
| `src/lib/constants.js` | *(modified)* adds `POSE_TRANSITION_MS` |
| `src/components/ControlPanel/index.jsx` | Tab shell |
| `src/components/ControlPanel/Slider.jsx` | Shared labelled slider |
| `src/components/ControlPanel/SpeechTab.jsx` | Moved from `SpeechInput.jsx` |
| `src/components/ControlPanel/ExpressionTab.jsx` | Auto-generated expression sliders |
| `src/components/ControlPanel/PoseTab.jsx` | Preset select, per-bone sliders, JSON export |
| `src/components/ControlPanel/IdleTab.jsx` | Idle toggles |
| `src/components/ControlPanel/DebugTab.jsx` | Live weights, FPS, override flags |
| `src/hooks/useVrmAnimations.js` | `.vrma` loading and mixer control |
| `src/app/api/animations/route.js` | Lists `.vrma` files in `public/animations/` |

---

## Task 1: Pose interpolation

**Files:**
- Modify: `frontend/src/lib/composite.js`
- Modify: `frontend/src/lib/constants.js`
- Modify: `frontend/src/components/VrmAvatar.jsx`
- Test: `frontend/src/lib/composite.test.js`

**Interfaces:**
- Produces: `lerpPoses(a, b, t) => Record<string, {x,y,z}>` — pure; `t` clamped to 0..1; the union of both key sets, missing bones treated as zero rotation.
- Produces: `POSE_TRANSITION_MS: number`

`lerpPoses` is used twice: smoothing preset switches, and blending clip output
against a static pose in Task 6. One primitive, two jobs.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/composite.test.js`:

```js
import { compositeBones, lerpPoses } from './composite.js';

describe('lerpPoses', () => {
  const a = { head: { x: 0, y: 0, z: 0 }, chest: { x: 0, y: 0, z: 0 } };
  const b = { head: { x: 1, y: 2, z: 4 }, chest: { x: 1, y: 1, z: 1 } };

  it('returns the first pose at t=0', () => {
    expect(lerpPoses(a, b, 0)).toEqual(a);
  });

  it('returns the second pose at t=1', () => {
    expect(lerpPoses(a, b, 1)).toEqual(b);
  });

  it('interpolates every axis at the midpoint', () => {
    expect(lerpPoses(a, b, 0.5).head).toEqual({ x: 0.5, y: 1, z: 2 });
  });

  it('clamps t outside 0..1', () => {
    expect(lerpPoses(a, b, -3)).toEqual(a);
    expect(lerpPoses(a, b, 7)).toEqual(b);
  });

  it('treats a bone missing from one pose as zero rotation', () => {
    const out = lerpPoses({ head: { x: 1, y: 0, z: 0 } }, {}, 0.5);
    expect(out.head).toEqual({ x: 0.5, y: 0, z: 0 });
  });

  it('includes bones present in only one pose', () => {
    const out = lerpPoses({ head: { x: 1, y: 0, z: 0 } }, { jaw: { x: 2, y: 0, z: 0 } }, 0.5);
    expect(out.head).toBeDefined();
    expect(out.jaw).toBeDefined();
  });

  it('does not mutate its inputs', () => {
    lerpPoses(a, b, 0.5);
    expect(a.head.x).toBe(0);
    expect(b.head.x).toBe(1);
  });

  it('tolerates two empty poses', () => {
    expect(lerpPoses({}, {}, 0.5)).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/lib/composite.test.js`
Expected: FAIL — `lerpPoses is not a function`

- [ ] **Step 3: Add `lerpPoses` to `src/lib/composite.js`**

```js
/**
 * Linearly interpolate between two pose maps.
 *
 * Used for two things: smoothing preset switches so a pose change eases in
 * rather than snapping, and blending animation-clip output against a static
 * pose. A bone present in only one side is interpolated against zero rotation,
 * so poses that touch different bone sets still blend cleanly.
 *
 * Euler lerp rather than quaternion slerp is deliberate — these are small
 * rotations on a humanoid rig, and the difference is not visible at this scale.
 */
export function lerpPoses(a = {}, b = {}, t) {
  const k = Math.max(0, Math.min(1, t));
  const zero = { x: 0, y: 0, z: 0 };
  const out = {};

  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const from = a[bone] ?? zero;
    const to = b[bone] ?? zero;
    out[bone] = {
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      z: from.z + (to.z - from.z) * k,
    };
  }

  return out;
}
```

- [ ] **Step 4: Add the transition constant**

Add to `DEFAULTS` in `src/lib/constants.js`:

```js
  poseTransitionMs: 400,
```

- [ ] **Step 5: Run tests and confirm they pass**

Run: `npm test src/lib/composite.test.js`
Expected: PASS, 21 tests in this file

- [ ] **Step 6: Use it for pose transitions in `VrmAvatar.jsx`**

Change the existing `composite.js` import to pull in `lerpPoses`:

```jsx
import { compositeBones, lerpPoses } from '@/lib/composite.js';
```

Add refs alongside the existing ones:

```jsx
  const currentPose = useRef(null);
  const prevPoseName = useRef(null);
  const poseBlend = useRef(1);
```

In `useFrame`, replace the line that reads:

```jsx
    const bones = compositeBones({
      pose: POSES[s.poseName] ?? {},
```

with this block:

```jsx
    // Ease between presets rather than snapping. currentPose holds where we
    // actually are; the target is where the store says we should be.
    const targetPose = POSES[s.poseName] ?? {};
    if (prevPoseName.current !== s.poseName) {
      currentPose.current = currentPose.current ?? targetPose;
      prevPoseName.current = s.poseName;
      poseBlend.current = 0;
    }
    if (poseBlend.current < 1) {
      poseBlend.current = Math.min(
        1,
        poseBlend.current + (dt * 1000) / DEFAULTS.poseTransitionMs,
      );
      currentPose.current = lerpPoses(
        currentPose.current ?? targetPose,
        targetPose,
        poseBlend.current,
      );
    } else {
      currentPose.current = targetPose;
    }

    const bones = compositeBones({
      pose: currentPose.current,
```

- [ ] **Step 7: Verify the full suite**

Run: `npm test`
Expected: PASS, 90 tests total

- [ ] **Step 8: Verify nothing regressed visually**

Run: `npm run dev`
Expected: the avatar still stands in `relaxed`, blinks, breathes, and speaks exactly as
at the end of Plan 1. No visible change yet — pose switching has no UI until Task 4.

---

## Task 2: Control panel shell

**Files:**
- Create: `frontend/src/components/ControlPanel/index.jsx`
- Create: `frontend/src/components/ControlPanel/Slider.jsx`
- Create: `frontend/src/components/ControlPanel/SpeechTab.jsx`
- Create: `frontend/src/components/ControlPanel/IdleTab.jsx`
- Delete: `frontend/src/components/SpeechInput.jsx`
- Modify: `frontend/src/components/AvatarStage.jsx`

**Interfaces:**
- Consumes: `useAvatarStore`
- Produces:
  - `<ControlPanel vrm={vrm|null} />`
  - `<Slider label={string} value={number} min max step onChange hint? />`

**No unit tests** — presentational components whose logic is already covered by the
store tests.

- [ ] **Step 1: Write `src/components/ControlPanel/Slider.jsx`**

```jsx
'use client';

export default function Slider({
  label, value, min, max, step, onChange, hint, format = (v) => v.toFixed(2),
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-zinc-400"
      />
      {hint && <span className="text-[11px] text-zinc-600">{hint}</span>}
    </label>
  );
}
```

- [ ] **Step 2: Write `src/components/ControlPanel/SpeechTab.jsx`**

Move the body of `SpeechInput.jsx` here, converted to use `Slider`:

```jsx
'use client';

import { useState } from 'react';
import { textToVisemes, timelineDuration } from '@/lib/textToVisemes.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import Slider from './Slider.jsx';

export default function SpeechTab() {
  const [text, setText] = useState(
    'Hello there. I am a talking avatar, and my mouth moves with the words.',
  );
  const speak = useAvatarStore((s) => s.speak);
  const stopSpeaking = useAvatarStore((s) => s.stopSpeaking);
  const stiffness = useAvatarStore((s) => s.stiffness);
  const setStiffness = useAvatarStore((s) => s.setStiffness);
  const rate = useAvatarStore((s) => s.rate);
  const setRate = useAvatarStore((s) => s.setRate);

  const handleSpeak = () => {
    const timeline = textToVisemes(text, { rate });
    if (timeline.length === 0) return;
    speak(timeline);
    // No audio to end the utterance, so schedule the stop ourselves.
    setTimeout(stopSpeaking, timelineDuration(timeline) + 200);
  };

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full resize-none rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-500"
      />

      <button
        onClick={handleSpeak}
        className="rounded bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
      >
        Speak
      </button>

      <Slider
        label="Stiffness" value={stiffness} min={2} max={60} step={1}
        onChange={setStiffness}
        format={(v) => v.toFixed(0)}
        hint="Low is mushy, high is crisp."
      />

      <Slider
        label="Rate" value={rate} min={0.5} max={2} step={0.05}
        onChange={setRate}
        format={(v) => `${v.toFixed(2)}×`}
        hint="Applied when you press Speak."
      />
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/ControlPanel/IdleTab.jsx`**

```jsx
'use client';

import { useAvatarStore } from '@/stores/avatarStore.js';
import Slider from './Slider.jsx';

// Each behaviour is a toggle plus its own tunable parameters, so every idle
// value in the system is reachable from the UI rather than baked into DEFAULTS.
const BEHAVIOURS = [
  {
    key: 'blink',
    label: 'Blink',
    hint: 'Randomized interval, so it never looks metronomic.',
    params: [
      { key: 'blinkIntervalMin', label: 'Interval min', min: 200, max: 6000, step: 100, format: (v) => `${(v / 1000).toFixed(1)}s` },
      { key: 'blinkIntervalMax', label: 'Interval max', min: 200, max: 12000, step: 100, format: (v) => `${(v / 1000).toFixed(1)}s` },
    ],
  },
  {
    key: 'breathe',
    label: 'Breathing',
    hint: 'Slow chest rise and fall.',
    params: [
      { key: 'breathAmplitude', label: 'Amplitude', min: 0, max: 0.08, step: 0.001, format: (v) => v.toFixed(3) },
      { key: 'breathRate', label: 'Rate', min: 0.05, max: 1.5, step: 0.01, format: (v) => `${v.toFixed(2)}Hz` },
    ],
  },
  {
    key: 'drift',
    label: 'Head drift',
    hint: 'Summed out-of-phase sines — cheaper than noise, and identical at this scale.',
    params: [
      { key: 'driftAmplitude', label: 'Amplitude', min: 0, max: 0.3, step: 0.002, format: (v) => `${((v * 180) / Math.PI).toFixed(1)}°` },
      { key: 'driftSpeed', label: 'Speed', min: 0.05, max: 2, step: 0.01, format: (v) => v.toFixed(2) },
    ],
  },
  { key: 'lookAt', label: 'Eye contact', hint: 'Eyes track the camera.', params: [] },
];

export default function IdleTab() {
  const idle = useAvatarStore((s) => s.idle);
  const setIdle = useAvatarStore((s) => s.setIdle);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Turn all four off to see why idle motion matters — the avatar goes
        completely inert, and no amount of lip-sync quality compensates.
      </p>

      {BEHAVIOURS.map(({ key, label, hint, params }) => (
        <div key={key} className="flex flex-col gap-2 border-t border-zinc-800 pt-4 first:border-0 first:pt-0">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={idle[key]}
              onChange={(e) => setIdle(key, e.target.checked)}
              className="mt-0.5 accent-zinc-400"
            />
            <span className="flex flex-col">
              <span className="text-xs text-zinc-300">{label}</span>
              <span className="text-[11px] text-zinc-600">{hint}</span>
            </span>
          </label>

          {idle[key] && params.length > 0 && (
            <div className="flex flex-col gap-3 pl-7">
              {params.map((p) => (
                <Slider
                  key={p.key}
                  label={p.label}
                  value={idle[p.key]}
                  min={p.min} max={p.max} step={p.step}
                  format={p.format}
                  onChange={(v) => setIdle(p.key, v)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/ControlPanel/index.jsx`**

```jsx
'use client';

import { useState } from 'react';
import SpeechTab from './SpeechTab.jsx';
import IdleTab from './IdleTab.jsx';

const TABS = [
  { id: 'speech', label: 'Speech', Component: SpeechTab },
  { id: 'idle', label: 'Idle', Component: IdleTab },
];

export default function ControlPanel({ vrm }) {
  const [active, setActive] = useState('speech');
  const Active = TABS.find((t) => t.id === active)?.Component ?? SpeechTab;

  return (
    <div className="flex h-full flex-col">
      <nav className="flex shrink-0 flex-wrap border-b border-zinc-800">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-3 py-2 text-xs transition-colors ${
              active === id
                ? 'border-b-2 border-zinc-200 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Active vrm={vrm} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Swap the panel into `AvatarStage.jsx`**

Replace the `SpeechInput` import with:

```jsx
import ControlPanel from './ControlPanel/index.jsx';
```

Change the vrm state so the instance is actually kept:

```jsx
  const [vrm, setVrm] = useState(null);
```

Replace the `<aside>` contents:

```jsx
      <aside className="w-full shrink-0 border-t border-zinc-800 bg-zinc-900 lg:h-screen lg:w-80 lg:border-l lg:border-t-0">
        <ControlPanel vrm={vrm} />
      </aside>
```

- [ ] **Step 6: Delete the old component**

```bash
rm src/components/SpeechInput.jsx
```

- [ ] **Step 7: Verify visually**

Run: `npm run dev`

Expected:
- Two tabs, Speech and Idle; clicking switches between them
- Speech still works exactly as before
- Unchecking **Blink** stops blinking; unchecking **Eye contact** makes the eyes stop
  tracking as you orbit; unchecking all four makes the avatar go completely inert
- Each enabled behaviour reveals its parameter sliders, and they are **live** —
  raising **Head drift → Amplitude** to 15° makes the head sway obviously; dropping
  **Blink → Interval max** to 1s makes it blink constantly
- No console errors

- [ ] **Step 8: Verify the suite still passes**

Run: `npm test`
Expected: PASS, 90 tests

---

## Task 3: Expression tab

**Files:**
- Create: `frontend/src/components/ControlPanel/ExpressionTab.jsx`
- Modify: `frontend/src/components/ControlPanel/index.jsx`

**Interfaces:**
- Consumes: `listExpressions(vrm)`, `useAvatarStore`
- Produces: `<ExpressionTab vrm={vrm|null} />`

- [ ] **Step 1: Write `src/components/ControlPanel/ExpressionTab.jsx`**

```jsx
'use client';

import { useMemo } from 'react';
import { listExpressions } from '@/lib/vrmIntrospect.js';
import { VISEMES } from '@/lib/constants.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import Slider from './Slider.jsx';

// Visemes are driven by the speech timeline, so exposing them as manual sliders
// would just fight the playback loop.
const HIDDEN = new Set(VISEMES);

export default function ExpressionTab({ vrm }) {
  const expressions = useAvatarStore((s) => s.expressions);
  const setExpression = useAvatarStore((s) => s.setExpression);
  const resetExpressions = useAvatarStore((s) => s.resetExpressions);

  // Read from the loaded model, not from a hardcoded preset list. This model
  // ships a non-preset `Surprised` group that a hardcoded list would drop.
  const names = useMemo(
    () => listExpressions(vrm).filter((n) => !HIDDEN.has(n)),
    [vrm],
  );

  if (!vrm) {
    return <p className="text-xs text-zinc-500">Waiting for the model to load…</p>;
  }

  if (names.length === 0) {
    return <p className="text-xs text-zinc-500">This model defines no expressions.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">
          {names.length} expressions, read from the model
        </span>
        <button
          onClick={resetExpressions}
          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        >
          Reset all
        </button>
      </div>

      {names.map((name) => (
        <Slider
          key={name}
          label={name}
          value={expressions[name] ?? 0}
          min={0} max={1} step={0.01}
          onChange={(v) => setExpression(name, v)}
        />
      ))}

      <p className="mt-2 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-600">
        This model is VRM 0.x, which has only boolean override flags — an
        expression that claims the mouth blocks visemes outright rather than
        blending with them. Raise an emotion while speaking to see it. The Debug
        tab shows each expression&apos;s resolved override values.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Register the tab**

In `ControlPanel/index.jsx`, add the import and the entry:

```jsx
import ExpressionTab from './ExpressionTab.jsx';
```

```jsx
  { id: 'expressions', label: 'Expressions', Component: ExpressionTab },
```

Place it after `speech` in the `TABS` array.

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Expected:
- The Expressions tab lists sliders named `happy`, `angry`, `sad`, `relaxed`,
  `neutral`, `surprised`, `blink`, and any lookAt entries — **normalized to the
  VRM 1.0 vocabulary** even though the file stores VRM 0.x names like `Joy`
- Dragging `happy` visibly changes the face
- **Reset all** returns everything to neutral
- Dragging a slider while the avatar speaks does **not** cause stutter — proof the
  transient store read is working
- No viseme sliders (`aa`, `ih`…) appear

- [ ] **Step 4: Confirm the VRM 0.x override behaviour**

Set `happy` to 1.0, then press Speak.

Expected: the mouth either animates normally or is fully blocked, with no partial
blend. **Either outcome is correct** — it depends on whether the model's `Joy`
blendshape sets `ignoreMouth`. Note which one you observe; Task 7 surfaces the flag
that explains it. Do not "fix" this.

- [ ] **Step 5: Verify the suite**

Run: `npm test`
Expected: PASS, 90 tests

---

## Task 4: Pose presets

**Files:**
- Modify: `frontend/src/lib/poses.js`
- Create: `frontend/src/components/ControlPanel/PoseTab.jsx`
- Modify: `frontend/src/components/ControlPanel/index.jsx`
- Test: `frontend/src/lib/composite.test.js`

**Interfaces:**
- Produces: `POSES` gains `arms-crossed`, `hands-on-hips`, `waving`, `pointing`, `thinking`
- Produces: `<PoseTab vrm={vrm|null} />`

- [ ] **Step 1: Write the failing test**

Append to the `describe('poses', ...)` block in `src/lib/composite.test.js`:

```js
  it('defines all seven presets', () => {
    for (const name of [
      't-pose', 'relaxed', 'arms-crossed', 'hands-on-hips',
      'waving', 'pointing', 'thinking',
    ]) {
      expect(POSES[name], `missing pose: ${name}`).toBeDefined();
    }
    expect(POSE_NAMES).toHaveLength(7);
  });

  it('only references real VRM humanoid bone names', () => {
    const valid = new Set(HUMANOID_BONES);
    for (const [name, pose] of Object.entries(POSES)) {
      for (const bone of Object.keys(pose)) {
        expect(valid.has(bone), `${name} references unknown bone: ${bone}`).toBe(true);
      }
    }
  });

  it('keeps every rotation within one full turn', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      for (const [bone, rot] of Object.entries(pose)) {
        for (const axis of ['x', 'y', 'z']) {
          expect(Math.abs(rot[axis]), `${name}.${bone}.${axis}`).toBeLessThan(Math.PI * 2);
        }
      }
    }
  });
```

Add to the imports at the top of the file:

```js
import { HUMANOID_BONES } from './vrmIntrospect.js';
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test src/lib/composite.test.js`
Expected: FAIL — `missing pose: arms-crossed`

- [ ] **Step 3: Add the presets to `src/lib/poses.js`**

Insert these into the `POSES` object, after `relaxed`:

```js
  'arms-crossed': {
    leftUpperArm: { x: 0, y: -0.35, z: 1.15 },
    rightUpperArm: { x: 0, y: 0.35, z: -1.15 },
    leftLowerArm: { x: 0, y: -1.5, z: 0.2 },
    rightLowerArm: { x: 0, y: 1.5, z: -0.2 },
    spine: { x: 0.02, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
  },

  'hands-on-hips': {
    leftUpperArm: { x: 0, y: -0.5, z: 1.0 },
    rightUpperArm: { x: 0, y: 0.5, z: -1.0 },
    leftLowerArm: { x: 0, y: -1.4, z: 0.5 },
    rightLowerArm: { x: 0, y: 1.4, z: -0.5 },
    spine: { x: 0, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
  },

  // Left arm down, right arm raised above horizontal.
  waving: {
    leftUpperArm: { x: 0, y: 0, z: 1.25 },
    rightUpperArm: { x: 0, y: 0, z: 0.6 },
    leftLowerArm: { x: 0, y: -0.15, z: 0.15 },
    rightLowerArm: { x: 0, y: 0.6, z: 0.9 },
    spine: { x: 0, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0.1, z: 0 },
  },

  // Left arm down, right arm angled forward toward the viewer.
  pointing: {
    leftUpperArm: { x: 0, y: 0, z: 1.25 },
    rightUpperArm: { x: -0.15, y: -0.4, z: -1.0 },
    leftLowerArm: { x: 0, y: -0.15, z: 0.15 },
    rightLowerArm: { x: 0, y: 0.2, z: -0.1 },
    spine: { x: 0, y: -0.05, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: -0.15, z: 0 },
  },

  // Left arm down, right forearm folded up toward the chin.
  thinking: {
    leftUpperArm: { x: 0, y: 0, z: 1.3 },
    rightUpperArm: { x: 0, y: -0.3, z: -0.75 },
    leftLowerArm: { x: 0, y: -0.2, z: 0.2 },
    rightLowerArm: { x: 0, y: 1.3, z: -0.9 },
    spine: { x: 0.03, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0.12, y: 0.18, z: 0.08 },
  },
```

**Sign convention**, established by eye against the real model during Plan 1: on
the **left** arm a positive `z` rotates it **down** toward the body; the right arm
mirrors. Plan 1's first pass had this inverted and stood the avatar in a permanent
cheer — the values above already carry the correction.

The non-`z` components are still guesses and **will need tuning**. That is exactly
what Task 5's per-bone sliders and **Copy Pose JSON** are for: adjust in the panel,
paste the result back here. Expect to do this at least for `arms-crossed` and
`thinking`, whose forearm folds are the hardest to guess blind.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test src/lib/composite.test.js`
Expected: PASS, 24 tests in this file

- [ ] **Step 5: Write `src/components/ControlPanel/PoseTab.jsx`**

```jsx
'use client';

import { POSE_NAMES } from '@/lib/poses.js';
import { useAvatarStore } from '@/stores/avatarStore.js';

export default function PoseTab() {
  const poseName = useAvatarStore((s) => s.poseName);
  const setPose = useAvatarStore((s) => s.setPose);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500">Preset</span>
        <div className="grid grid-cols-2 gap-2">
          {POSE_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => setPose(name)}
              className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
                poseName === name
                  ? 'border-zinc-300 bg-zinc-200 text-zinc-900'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-zinc-600">
          Transitions ease over 400 ms rather than snapping.
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Register the tab**

In `ControlPanel/index.jsx`:

```jsx
import PoseTab from './PoseTab.jsx';
```

```jsx
  { id: 'pose', label: 'Pose', Component: PoseTab },
```

Place it after `expressions`.

- [ ] **Step 7: Verify visually**

Run: `npm run dev`

Expected:
- Seven preset buttons; clicking one **eases** the avatar into it over ~400 ms
- `t-pose` gives arms straight out; `relaxed` brings them down
- Head drift and breathing continue on top of every pose — proof the idle layer is
  additive rather than replacing the pose
- Speaking works from any pose

If arms clip through the body on `arms-crossed`, adjust the `y` values. These are
starting guesses, and tuning them is expected.

- [ ] **Step 8: Verify the suite**

Run: `npm test`
Expected: PASS, 93 tests total

---

## Task 5: Per-bone manipulation and JSON export

**Files:**
- Modify: `frontend/src/components/ControlPanel/PoseTab.jsx`

**Interfaces:**
- Consumes: `listBones(vrm)`, `useAvatarStore` (`manualBones`, `setBone`, `clearBone`, `clearAllBones`)
- Produces: no new exports

- [ ] **Step 1: Rewrite `src/components/ControlPanel/PoseTab.jsx`**

```jsx
'use client';

import { useMemo, useState } from 'react';
import { POSE_NAMES, POSES } from '@/lib/poses.js';
import { listBones } from '@/lib/vrmIntrospect.js';
import { compositeBones } from '@/lib/composite.js';
import { useAvatarStore } from '@/stores/avatarStore.js';

const AXES = ['x', 'y', 'z'];
const ZERO = { x: 0, y: 0, z: 0 };

export default function PoseTab({ vrm }) {
  const poseName = useAvatarStore((s) => s.poseName);
  const setPose = useAvatarStore((s) => s.setPose);
  const manualBones = useAvatarStore((s) => s.manualBones);
  const setBone = useAvatarStore((s) => s.setBone);
  const clearBone = useAvatarStore((s) => s.clearBone);
  const clearAllBones = useAvatarStore((s) => s.clearAllBones);
  const [copied, setCopied] = useState(false);

  // Only the bones this model actually has.
  const bones = useMemo(() => listBones(vrm), [vrm]);

  const copyPoseJson = async () => {
    // Export what the compositor would produce with idle switched off — the
    // static pose, not a momentary frame of head drift.
    const resolved = compositeBones({
      pose: POSES[poseName] ?? {},
      idleDeltas: {},
      manualOverrides: manualBones,
      speaking: false,
      attenuation: 1,
    });
    const rounded = Object.fromEntries(
      Object.entries(resolved).map(([bone, r]) => [
        bone,
        { x: +r.x.toFixed(3), y: +r.y.toFixed(3), z: +r.z.toFixed(3) },
      ]),
    );
    await navigator.clipboard.writeText(JSON.stringify(rounded, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500">Preset</span>
        <div className="grid grid-cols-2 gap-2">
          {POSE_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => setPose(name)}
              className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
                poseName === name
                  ? 'border-zinc-300 bg-zinc-200 text-zinc-900'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={copyPoseJson}
          className="flex-1 rounded border border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        >
          {copied ? 'Copied' : 'Copy pose JSON'}
        </button>
        <button
          onClick={clearAllBones}
          className="flex-1 rounded border border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        >
          Reset bones
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Editing a bone overrides the preset for that bone only. Paste the copied
        JSON into <code className="text-zinc-500">src/lib/poses.js</code> as a new
        preset.
      </p>

      <div className="flex flex-col gap-4 border-t border-zinc-800 pt-4">
        {bones.map((bone) => {
          const edited = manualBones[bone];
          const value = edited ?? POSES[poseName]?.[bone] ?? ZERO;
          return (
            <div key={bone} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${edited ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  {bone}
                  {edited && <span className="ml-1.5 text-[10px] text-amber-500">edited</span>}
                </span>
                {edited && (
                  <button
                    onClick={() => clearBone(bone)}
                    className="text-[10px] text-zinc-600 hover:text-zinc-300"
                  >
                    reset
                  </button>
                )}
              </div>
              {AXES.map((axis) => (
                <div key={axis} className="flex items-center gap-2">
                  <span className="w-3 font-mono text-[10px] text-zinc-600">{axis}</span>
                  <input
                    type="range" min={-Math.PI} max={Math.PI} step={0.01}
                    value={value[axis] ?? 0}
                    onChange={(e) => setBone(bone, axis, Number(e.target.value))}
                    className="flex-1 accent-zinc-400"
                  />
                  <span className="w-10 text-right font-mono text-[10px] text-zinc-500">
                    {(value[axis] ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`

Expected:
- The Pose tab lists every humanoid bone the model has, each with X/Y/Z sliders
- Dragging `head` Y turns the head; the label gains an amber **edited** marker
- **Head drift continues on top of an edited head bone**? No — a manual override
  replaces the pose *and* idle for that bone. This is the documented precedence;
  confirm the head stops drifting once edited.
- Per-bone **reset** clears only that bone; **Reset bones** clears all
- Switching preset while a bone is edited leaves the edited bone where it is
- **Copy pose JSON** puts valid JSON on the clipboard — paste it somewhere to confirm

- [ ] **Step 3: Verify the suite**

Run: `npm test`
Expected: PASS, 93 tests

---

## Task 6: VRMA animation clips

**Files:**
- Create: `frontend/src/app/api/animations/route.js`
- Create: `frontend/src/hooks/useVrmAnimations.js`
- Modify: `frontend/src/components/VrmAvatar.jsx`
- Modify: `frontend/src/components/ControlPanel/PoseTab.jsx`
- Modify: `frontend/src/stores/avatarStore.js`

**Interfaces:**
- Store gains: `clipUrl: string|null`, `clipWeight: number`, `setClip(url)`, `setClipWeight(n)`
- Produces: `useVrmAnimations(vrm)` returning `{ mixer, loadClip(url), stop() }`
- `GET /api/animations` returns `{ files: string[] }`

- [ ] **Step 1: Install the package**

```bash
npm install @pixiv/three-vrm-animation@3.5.5
```

- [ ] **Step 2: Read the Next.js route handler docs**

Run: `ls node_modules/next/dist/docs/01-app/03-api-reference/ && cat node_modules/next/dist/docs/01-app/03-api-reference/02-file-conventions/route.md | head -60`

Confirm the `route.js` export shape before writing it.

- [ ] **Step 3: Write `src/app/api/animations/route.js`**

```js
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// The browser cannot list a directory, so the server does it. This keeps adding
// an animation to a file-drop rather than a code edit.
export async function GET() {
  try {
    const dir = join(process.cwd(), 'public', 'animations');
    const entries = await readdir(dir);
    const files = entries.filter((f) => f.toLowerCase().endsWith('.vrma'));
    return Response.json({ files });
  } catch {
    // Directory absent is the normal empty case, not an error.
    return Response.json({ files: [] });
  }
}
```

- [ ] **Step 4: Add clip state to `src/stores/avatarStore.js`**

Add to `initialState`:

```js
  clipUrl: null,
  clipWeight: 1,
```

Add the actions:

```js
  setClip: (clipUrl) => set({ clipUrl }),
  setClipWeight: (clipWeight) => set({ clipWeight }),
```

- [ ] **Step 5: Write `src/hooks/useVrmAnimations.js`**

```js
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

/**
 * Loads .vrma clips and drives them through an AnimationMixer.
 *
 * The mixer writes directly to the VRM's normalized bones, so VrmAvatar must
 * call mixer.update() *before* compositing and then read the resulting rotations
 * as the pose base. Compositing first would have the compositor immediately
 * overwrite everything the clip just did.
 */
export function useVrmAnimations(vrm) {
  const mixerRef = useRef(null);
  const actionRef = useRef(null);
  const [available, setAvailable] = useState([]);

  useEffect(() => {
    fetch('/api/animations')
      .then((r) => r.json())
      .then((d) => setAvailable(d.files ?? []))
      .catch(() => setAvailable([]));
  }, []);

  useEffect(() => {
    if (!vrm) return undefined;
    mixerRef.current = new AnimationMixer(vrm.scene);
    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [vrm]);

  const loadClip = async (url) => {
    if (!vrm || !mixerRef.current) return;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);

    const animation = gltf.userData.vrmAnimations?.[0];
    if (!animation) return;

    const clip = createVRMAnimationClip(animation, vrm);
    mixerRef.current.stopAllAction();
    actionRef.current = mixerRef.current.clipAction(clip);
    actionRef.current.play();
  };

  const stop = () => {
    mixerRef.current?.stopAllAction();
    actionRef.current = null;
  };

  return { mixerRef, actionRef, available, loadClip, stop };
}
```

- [ ] **Step 6: Wire the mixer into `VrmAvatar.jsx`**

Add the import:

```jsx
import { useVrmAnimations } from '@/hooks/useVrmAnimations.js';
```

Inside the component, after the other hooks:

```jsx
  const { mixerRef, actionRef, loadClip, stop } = useVrmAnimations(vrm);
  const clipUrlRef = useRef(null);
```

In `useFrame`, immediately after `const s = useAvatarStore.getState();`:

```jsx
    // Load or unload a clip when the store's selection changes.
    if (s.clipUrl !== clipUrlRef.current) {
      clipUrlRef.current = s.clipUrl;
      if (s.clipUrl) loadClip(s.clipUrl);
      else stop();
    }
```

Then, immediately *before* the pose-transition block:

```jsx
    // The mixer writes straight to the normalized bones, so run it first and
    // capture what it produced. Compositing first would overwrite the clip.
    let clipPose = null;
    if (actionRef.current && mixerRef.current) {
      mixerRef.current.update(dt);
      clipPose = {};
      for (const name of Object.keys(POSES[s.poseName] ?? {})) {
        const node = vrm.humanoid?.getNormalizedBoneNode(name);
        if (node) {
          clipPose[name] = {
            x: node.rotation.x,
            y: node.rotation.y,
            z: node.rotation.z,
          };
        }
      }
    }
```

And change the `compositeBones` call's `pose` argument from `currentPose.current` to:

```jsx
      pose: clipPose
        ? lerpPoses(currentPose.current, clipPose, s.clipWeight)
        : currentPose.current,
```

- [ ] **Step 7: Add clip controls to `PoseTab.jsx`**

Add the imports:

```jsx
import { useEffect } from 'react';
import Slider from './Slider.jsx';
```

Add to the store selectors:

```jsx
  const clipUrl = useAvatarStore((s) => s.clipUrl);
  const setClip = useAvatarStore((s) => s.setClip);
  const clipWeight = useAvatarStore((s) => s.clipWeight);
  const setClipWeight = useAvatarStore((s) => s.setClipWeight);
  const [clips, setClips] = useState([]);

  useEffect(() => {
    fetch('/api/animations')
      .then((r) => r.json())
      .then((d) => setClips(d.files ?? []))
      .catch(() => setClips([]));
  }, []);
```

Insert this section between the preset grid and the copy/reset buttons:

```jsx
      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <span className="text-xs text-zinc-500">Animation clip</span>
        {clips.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-zinc-600">
            No clips found. Drop <code className="text-zinc-500">.vrma</code> files
            into <code className="text-zinc-500">frontend/public/animations/</code>
            and reload.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setClip(null)}
                className={`rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
                  clipUrl === null
                    ? 'border-zinc-300 bg-zinc-200 text-zinc-900'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                none
              </button>
              {clips.map((file) => {
                const url = `/animations/${file}`;
                return (
                  <button
                    key={file}
                    onClick={() => setClip(url)}
                    className={`rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
                      clipUrl === url
                        ? 'border-zinc-300 bg-zinc-200 text-zinc-900'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {file}
                  </button>
                );
              })}
            </div>
            <Slider
              label="Clip blend" value={clipWeight} min={0} max={1} step={0.01}
              onChange={setClipWeight}
              hint="0 is the static pose, 1 is the clip."
            />
          </>
        )}
      </div>
```

- [ ] **Step 8: Verify visually**

Run: `npm run dev`

Expected **with no clips present** (the normal case):
- The Pose tab shows the "No clips found" note with the expected path
- Everything else works exactly as before
- `curl http://localhost:3000/api/animations` returns `{"files":[]}`

Expected **with a clip present** — create `public/animations/` and drop in any `.vrma`
(VRoid Hub and Booth both distribute them):
- The filename appears as a button
- Selecting it animates the body
- **Clip blend** at 0 returns to the static pose, at 1 is fully the clip
- The mouth still lip-syncs while a clip plays
- Selecting **none** stops it

- [ ] **Step 9: Verify the suite and the build**

Run: `npm test`
Expected: PASS, 93 tests

Run: `npm run build`
Expected: succeeds, including the new route handler.

---

## Task 7: Debug tab

**Files:**
- Create: `frontend/src/components/ControlPanel/DebugTab.jsx`
- Modify: `frontend/src/components/ControlPanel/index.jsx`

**Interfaces:**
- Consumes: `useAvatarStore` (`debug`, `speechStartedAt`, `expressions`), `listExpressions(vrm)`

This tab is what makes the VRM 0.x override limitation legible rather than
mysterious. It is the reason the spec refuses to patch that behaviour.

- [ ] **Step 1: Write `src/components/ControlPanel/DebugTab.jsx`**

```jsx
'use client';

import { useMemo } from 'react';
import { VISEMES } from '@/lib/constants.js';
import { useAvatarStore } from '@/stores/avatarStore.js';

function Bar({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 font-mono text-[10px] text-zinc-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-zinc-300"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
      <span className="w-9 text-right font-mono text-[10px] text-zinc-500">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

export default function DebugTab({ vrm }) {
  const debug = useAvatarStore((s) => s.debug);
  const speechStartedAt = useAvatarStore((s) => s.speechStartedAt);
  const expressions = useAvatarStore((s) => s.expressions);

  // Resolved override flags for whatever expressions are currently raised. This
  // is what explains an emotion swallowing the mouth animation.
  const overrides = useMemo(() => {
    if (!vrm?.expressionManager) return [];
    return Object.entries(expressions)
      .filter(([, v]) => v > 0)
      .map(([name]) => {
        const e = vrm.expressionManager.getExpression?.(name);
        return {
          name,
          mouth: e?.overrideMouth ?? 'none',
          blink: e?.overrideBlink ?? 'none',
          lookAt: e?.overrideLookAt ?? 'none',
        };
      });
  }, [vrm, expressions]);

  return (
    <div className="flex flex-col gap-5 font-mono text-[11px]">
      <div className="flex justify-between text-zinc-500">
        <span>FPS</span>
        <span className="text-zinc-300">{debug.fps}</span>
      </div>

      <div className="flex justify-between text-zinc-500">
        <span>speaking</span>
        <span className={speechStartedAt !== null ? 'text-emerald-400' : 'text-zinc-600'}>
          {speechStartedAt !== null ? 'yes' : 'no'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-zinc-500">viseme weights (damped)</span>
        {VISEMES.map((v) => (
          <Bar key={v} label={v} value={debug.weights?.[v] ?? 0} />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <span className="text-zinc-500">active expression overrides</span>
        {overrides.length === 0 ? (
          <span className="text-zinc-600">none raised</span>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-zinc-600">
                <th className="text-left font-normal">expr</th>
                <th className="text-left font-normal">mouth</th>
                <th className="text-left font-normal">blink</th>
                <th className="text-left font-normal">look</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.name} className="text-zinc-400">
                  <td>{o.name}</td>
                  <td className={o.mouth !== 'none' ? 'text-amber-500' : ''}>{o.mouth}</td>
                  <td className={o.blink !== 'none' ? 'text-amber-500' : ''}>{o.blink}</td>
                  <td className={o.lookAt !== 'none' ? 'text-amber-500' : ''}>{o.lookAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="font-sans text-[11px] leading-relaxed text-zinc-600">
          An amber <span className="text-amber-500">block</span> under mouth means
          that expression suppresses visemes entirely. VRM 0.x has no{' '}
          <span className="text-zinc-500">blend</span> option, so this is the
          model&apos;s own declaration, not a bug.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the tab**

In `ControlPanel/index.jsx`:

```jsx
import DebugTab from './DebugTab.jsx';
```

```jsx
  { id: 'debug', label: 'Debug', Component: DebugTab },
```

Place it last in the `TABS` array.

- [ ] **Step 3: Verify visually**

Run: `npm run dev`

Expected:
- The Debug tab shows a live FPS number
- Pressing Speak flips `speaking` to **yes** and the five viseme bars animate
- The bars visibly **ease** rather than snapping — that is the exponential damping
- Raising `happy` in the Expressions tab adds a row to the overrides table
- If that row shows `block` under mouth, speaking with `happy` raised produces no
  mouth movement — **and the table now explains exactly why**

- [ ] **Step 4: Final verification**

Run: `npm test`
Expected: PASS, 93 tests

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Walk the whole reference once**

Confirm each of these works, since this is the artifact a production implementation
will be copied from:

- Type text, press Speak, mouth animates and settles closed
- "mama bapa mumble" produces visible lip closures
- Stiffness and Rate change the character of the speech
- Every expression slider moves the face; Reset all clears them
- All seven poses ease in; idle motion continues on top
- A bone edit overrides its pose value and shows the amber marker
- Copy pose JSON produces pasteable output
- Idle toggles each do what they claim; all four off makes the avatar inert
- Debug reflects everything live

---

## Done

The reference now covers the full surface: text-driven visemes, model-introspected
expressions, poses both preset and hand-edited, optional clip playback, a complete
idle layer, and a debug view that explains the layer interactions rather than hiding
them.

**Load-bearing patterns for the production implementation to carry across:**

1. Pure logic in `src/lib/` — no React, no three.js. 93 tests run in milliseconds with no browser.
2. Enumerate expressions and bones from the loaded model, never from a hardcoded list.
3. Transient store reads inside `useFrame` so controls never re-render the Canvas.
4. One fixed layer order, absolute writes, `vrm.update(delta)` last and exactly once.
5. Surface format limitations in the UI rather than papering over them.
