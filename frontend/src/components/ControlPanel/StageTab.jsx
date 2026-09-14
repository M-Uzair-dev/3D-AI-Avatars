'use client';

import { useEffect, useState } from 'react';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { FRAMINGS, DEFAULTS } from '@/lib/constants.js';
import Slider from './Slider.jsx';

// Lighting is judged by eye, never by arithmetic — same reason the Pose tab
// exists. Every value in the rig is reachable here so the numbers in
// DEFAULTS.lighting can be re-derived by dragging rather than by guessing.
const LIGHTS = [
  {
    key: 'exposure',
    label: 'Exposure',
    min: 0.4,
    max: 1.6,
    step: 0.01,
    hint: 'Renderer-wide. Pull below 1 to stop near-white surfaces clipping.',
  },
  {
    key: 'ambient',
    label: 'Ambient',
    min: 0,
    max: 0.8,
    step: 0.01,
    hint: 'Adds equally to every surface, so it flattens rather than lights. Keep it low — this was the cause of the washed-out look.',
  },
  {
    key: 'hemisphere',
    label: 'Sky fill',
    min: 0,
    max: 1.5,
    step: 0.01,
    hint: 'Cool from above, warm bounce from below. Fill that still has direction.',
  },
  { key: 'key', label: 'Key', min: 0, max: 3, step: 0.01, hint: 'Main light, off-axis so the face gets a terminator.' },
  { key: 'fill', label: 'Fill', min: 0, max: 1.5, step: 0.01, hint: 'Keeps the shadow side from going black.' },
  {
    key: 'rim',
    label: 'Rim',
    min: 0,
    max: 3,
    step: 0.01,
    hint: 'From behind and above. Separates her from the background — drag it to zero to see how much it was doing.',
  },
  { key: 'warmth', label: 'Key warmth', min: 0, max: 1, step: 0.01, hint: 'Tints the key toward candlelight.' },
];

export default function StageTab() {
  const lighting = useAvatarStore((s) => s.lighting);
  const setLighting = useAvatarStore((s) => s.setLighting);
  const modelUrl = useAvatarStore((s) => s.modelUrl);
  const setModel = useAvatarStore((s) => s.setModel);
  const [models, setModels] = useState([]);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(() => setModels([]));
  }, []);

  const framing = useAvatarStore((s) => s.framing);
  const setFraming = useAvatarStore((s) => s.setFraming);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-300">Model</span>
        <span className="text-[11px] leading-relaxed text-zinc-600">
          Every <code className="text-zinc-500">.vrm</code> in{' '}
          <code className="text-zinc-500">public/</code>, named and licensed as the
          file itself declares. Poses carry across on the torso; anything putting a
          hand on the body needs re-measuring per model.
        </span>
        <div className="flex flex-col gap-1.5">
          {models.map((m) => (
            <button
              key={m.file}
              onClick={() => setModel(m.url)}
              className={`rounded border px-3 py-1.5 text-left text-xs transition-colors ${
                modelUrl === m.url
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <span className="block">{m.label}</span>
              <span className="block text-[10px] text-zinc-600">
                {m.author ? `by ${m.author}` : 'author not declared'}
                {m.authorOnly ? ' · author-only licence' : ''}
                {!m.authorOnly && m.commercial ? ' · commercial ok' : ''}
                {!m.authorOnly && !m.commercial ? ' · non-commercial' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <span className="text-xs text-zinc-300">Framing</span>
        <span className="text-[11px] leading-relaxed text-zinc-600">
          Distances are solved from the 30&deg; fov, not guessed. Orbiting with
          the mouse still works; reselecting a framing snaps back.
        </span>
        <div className="flex flex-col gap-1.5">
          {Object.entries(FRAMINGS).map(([key, f]) => (
            <button
              key={key}
              onClick={() => setFraming(key)}
              className={`rounded border px-3 py-1.5 text-left text-xs transition-colors ${
                framing === key
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-800 pt-4">
        <span className="text-xs text-zinc-300">Lighting</span>
        {LIGHTS.map((l) => (
          <Slider
            key={l.key}
            label={l.label}
            value={lighting[l.key]}
            min={l.min}
            max={l.max}
            step={l.step}
            hint={l.hint}
            onChange={(v) => setLighting(l.key, v)}
          />
        ))}
      </div>

      <button
        onClick={() => {
          for (const [k, v] of Object.entries(DEFAULTS.lighting)) setLighting(k, v);
        }}
        className="rounded border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
      >
        Reset lighting
      </button>
    </div>
  );
}
