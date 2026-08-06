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
