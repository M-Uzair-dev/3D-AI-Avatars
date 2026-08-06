'use client';

import { useEffect, useRef, useState } from 'react';
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
  const stopTimer = useRef(null);

  const handleSpeak = () => {
    const timeline = textToVisemes(text, { rate });
    if (timeline.length === 0) return;
    clearTimeout(stopTimer.current);
    speak(timeline);
    // No audio to end the utterance, so schedule the stop ourselves.
    stopTimer.current = setTimeout(stopSpeaking, timelineDuration(timeline) + 200);
  };

  useEffect(() => () => clearTimeout(stopTimer.current), []);

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
