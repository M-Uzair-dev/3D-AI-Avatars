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
