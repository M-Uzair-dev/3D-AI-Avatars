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
