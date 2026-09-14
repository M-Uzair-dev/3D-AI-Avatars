'use client';

import { useEffect, useMemo, useState } from 'react';
import { POSE_NAMES, POSES } from '@/lib/poses.js';
import { listBones } from '@/lib/vrmIntrospect.js';
import { compositeBones } from '@/lib/composite.js';
import { clipLabel } from '@/lib/constants.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import Slider from './Slider.jsx';

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
                onClick={() => { setClip(null); setClipWeight(0); }}
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
                  // Playing a clip is one click: selecting it and then dragging
                  // the blend to 1 was two steps for what is nearly always the
                  // same intent — watch this one.
                  <button
                    key={file}
                    onClick={() => { setClip(url); setClipWeight(1); }}
                    className={`rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
                      clipUrl === url
                        ? 'border-zinc-300 bg-zinc-200 text-zinc-900'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {clipLabel(file)}
                  </button>
                );
              })}
            </div>
            <Slider
              label="Clip blend" value={clipWeight} min={0} max={1} step={0.01}
              onChange={setClipWeight}
              hint="0 is the static pose, 1 is the clip. Clicking a clip sets it to 1. A clip plays once, then hands the body back to the idle layer and deselects itself."
            />
          </>
        )}
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
