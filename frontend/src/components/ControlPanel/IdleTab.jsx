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
      { key: 'breathAmplitude', label: 'Amplitude', min: 0, max: 0.16, step: 0.002, format: (v) => `${((v * 180) / Math.PI).toFixed(1)}°`, hint: 'Travel upward from rest, not either side of it.' },
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
  {
    key: 'sway',
    label: 'Weight sway',
    hint: 'Hips lead, spine and chest counter, arms arrive last. The lag between links is the whole effect — turn this off and the head goes back to drifting on a rigid torso.',
    params: [
      { key: 'swayAmplitude', label: 'Amplitude', min: 0, max: 0.12, step: 0.001, format: (v) => `${((v * 180) / Math.PI).toFixed(1)}°` },
      { key: 'swaySpeed', label: 'Speed', min: 0.03, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
    ],
  },
  {
    key: 'weightShift',
    label: 'Weight shift',
    hint: 'Rolls her weight onto the other foot every 14-34s. The pelvis tips the other way, the spine re-curves, the shoulder line inverts. Slowest thing here on purpose.',
    params: [
      { key: 'weightIntervalMin', label: 'Interval min', min: 3000, max: 40000, step: 500, format: (v) => `${(v / 1000).toFixed(0)}s` },
      { key: 'weightIntervalMax', label: 'Interval max', min: 3000, max: 90000, step: 500, format: (v) => `${(v / 1000).toFixed(0)}s` },
    ],
  },
  {
    key: 'gestures',
    label: 'Idle gestures',
    hint: 'Scratches, stretches, shoulder rolls. What games have done for thirty years: something happens that the user did not cause. Suppressed while speaking. Trigger them by hand in the State tab.',
    params: [
      { key: 'gestureIntervalMin', label: 'Interval min', min: 3000, max: 60000, step: 500, format: (v) => `${(v / 1000).toFixed(0)}s` },
      { key: 'gestureIntervalMax', label: 'Interval max', min: 3000, max: 120000, step: 500, format: (v) => `${(v / 1000).toFixed(0)}s` },
    ],
  },
  {
    key: 'speechEmphasis',
    label: 'Speech emphasis',
    hint: 'Head motion on the rhythm of speech, only while speaking. Faster than anything else here (1-3Hz vs 0.2 for sway) — that tempo gap is what makes the state read. A head that holds still through a sentence is the clearest tell that something is being played back rather than said.',
    params: [
      { key: 'speechEmphasisAmplitude', label: 'Amplitude', min: 0, max: 0.16, step: 0.002, format: (v) => `${((v * 180) / Math.PI).toFixed(1)}°` },
    ],
  },
  {
    key: 'poseShift',
    label: 'Pose drift',
    hint: 'Folds and unfolds her arms every 30-90s. Unlike sway, this does not return to where it started — it reads as a decision rather than an oscillation. Held off mid-gesture, mid-sentence, and while thinking.',
    params: [
      { key: 'poseIntervalMin', label: 'Interval min', min: 5000, max: 120000, step: 1000, format: (v) => `${(v / 1000).toFixed(0)}s` },
      { key: 'poseIntervalMax', label: 'Interval max', min: 5000, max: 240000, step: 1000, format: (v) => `${(v / 1000).toFixed(0)}s` },
    ],
  },
  {
    key: 'lookAt',
    label: 'Eye contact',
    hint: 'Eyes track the camera. Required for gaze below to do anything.',
    params: [],
  },
  {
    key: 'gaze',
    label: 'Gaze saccades',
    hint: 'Holds a point for a second or two, then flicks. Tracking the camera exactly gives a fixed stare, which is the most unsettling thing an avatar can do.',
    params: [
      { key: 'gazeIntervalMin', label: 'Hold min', min: 300, max: 6000, step: 100, format: (v) => `${(v / 1000).toFixed(1)}s` },
      { key: 'gazeIntervalMax', label: 'Hold max', min: 300, max: 10000, step: 100, format: (v) => `${(v / 1000).toFixed(1)}s` },
      { key: 'gazeAmount', label: 'Wander', min: 0, max: 0.25, step: 0.002, format: (v) => `${((v * 180) / Math.PI).toFixed(1)}°` },
      { key: 'gazeHeadFollow', label: 'Head follow', min: 0, max: 1, step: 0.01, hint: 'Eyes lead, head follows part of the way. 1:1 looks robotic.' },
      { key: 'gazeJitterAmount', label: 'Microsaccades', min: 0, max: 0.02, step: 0.001, format: (v) => `${((v * 180) / Math.PI).toFixed(2)}°`, hint: 'The tremor between flicks. Zero is a perfectly still eye, which is the effect this removes.' },
      { key: 'checkInIntervalMin', label: 'Check-in min', min: 5000, max: 60000, step: 1000, format: (v) => `${(v / 1000).toFixed(0)}s`, hint: 'Working only: how often she looks up from the task. Too often reads as unable to concentrate.' },
      { key: 'checkInIntervalMax', label: 'Check-in max', min: 5000, max: 120000, step: 1000, format: (v) => `${(v / 1000).toFixed(0)}s` },
    ],
  },
];

// Two always-on values that are not behaviours with an on/off, just amounts.
const AMOUNTS = [
  {
    key: 'handRelax',
    label: 'Hand relax',
    min: -0.5,
    max: 0.7,
    step: 0.01,
    hint: 'Resting finger curl. Straight splayed fingers are a mannequin tell. The range goes negative because the curl axis was derived rather than measured — if the fingers bend backwards, drag past zero.',
  },
  {
    key: 'restingWarmth',
    label: 'Resting warmth',
    min: 0,
    max: 0.6,
    step: 0.01,
    hint: 'A trace of expression on the neutral face. Fades to zero while speaking, because on a VRM 0.x model a raised emotion can suppress visemes outright.',
  },
];

export default function IdleTab() {
  const idle = useAvatarStore((s) => s.idle);
  const setIdle = useAvatarStore((s) => s.setIdle);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Turn them all off to see why idle motion matters — the avatar goes
        completely inert, and no amount of lip-sync quality compensates. Turn
        off only <span className="text-zinc-400">Weight sway</span> to see the
        second lesson: a head that moves on a still body is worse than stillness.
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

      <div className="flex flex-col gap-3 border-t border-zinc-800 pt-4">
        {AMOUNTS.map((a) => (
          <Slider
            key={a.key}
            label={a.label}
            value={idle[a.key]}
            min={a.min}
            max={a.max}
            step={a.step}
            hint={a.hint}
            onChange={(v) => setIdle(a.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
