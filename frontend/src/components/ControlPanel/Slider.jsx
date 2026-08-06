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
