'use client';

import { useEffect, useState } from 'react';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { modelVoiceForUrl } from '@/lib/constants.js';
import Slider from './Slider.jsx';

/**
 * The workbench speech surface: say something, tune the mouth, pick a voice.
 *
 * The stop timer that used to live here is gone — `say()` owns the utterance
 * now and ends it when the audio does.
 *
 * The voice picker is here and deliberately not on the production bar: which
 * voice she has is a deployment decision the host app makes once in env, not
 * something an end user should be flipping mid-conversation. This surface is
 * for auditioning them.
 */
export default function SpeechTab() {
  const [text, setText] = useState(
    'Hello there. I am a talking avatar, and my mouth moves with the words.',
  );
  const say = useAvatarStore((s) => s.say);
  const stopSpeaking = useAvatarStore((s) => s.stopSpeaking);
  const speaking = useAvatarStore((s) => s.speechStartedAt !== null);
  const status = useAvatarStore((s) => s.speechStatus);
  const stiffness = useAvatarStore((s) => s.stiffness);
  const setStiffness = useAvatarStore((s) => s.setStiffness);
  const rate = useAvatarStore((s) => s.rate);
  const setRate = useAvatarStore((s) => s.setRate);
  const sentencePauseMs = useAvatarStore((s) => s.sentencePauseMs);
  const setSentencePause = useAvatarStore((s) => s.setSentencePause);
  const modelUrl = useAvatarStore((s) => s.modelUrl);
  const voiceEnabled = useAvatarStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useAvatarStore((s) => s.setVoiceEnabled);

  // Which voice is talking is now a property of the model rather than a
  // control, so this is a readout: it names what you are about to hear and
  // where to change it, and offers no way to change it from here.
  const [voices, setVoices] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/voices')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setVoices(data.voices ?? []); })
      .catch(() => { if (!cancelled) setVoices([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full resize-none rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-500"
      />

      <button
        onClick={speaking ? stopSpeaking : () => say(text)}
        className="rounded bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
      >
        {speaking ? 'Stop' : 'Speak'}
      </button>

      <StatusLine status={status} />

      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={voiceEnabled}
          onChange={(e) => setVoiceEnabled(e.target.checked)}
          className="size-3.5 accent-zinc-300"
        />
        Speak out loud
        <span className="text-zinc-500">— off still mouths the words</span>
      </label>

      <VoiceReadout modelUrl={modelUrl} voices={voices} />

      <Slider
        label="Stiffness" value={stiffness} min={2} max={60} step={1}
        onChange={setStiffness}
        format={(v) => v.toFixed(0)}
        hint="Low is mushy, high is crisp."
      />

      <Slider
        label="Sentence pause" value={sentencePauseMs} min={0} max={900} step={10}
        onChange={setSentencePause}
        format={(v) => `${v} ms`}
        hint="The beat after a full stop. Zero is back-to-back, which reads as hurried."
      />

      <Slider
        label="Rate" value={rate} min={0.5} max={2} step={0.05}
        onChange={setRate}
        format={(v) => `${v.toFixed(2)}×`}
        hint="Applied when you press Speak. Changes the OpenAI voice speed; ElevenLabs ignores it."
      />
    </div>
  );
}

/**
 * What the voice is doing right now.
 *
 * The workbench gets the full state including the error text, where the
 * production bar gets two words. This is the surface you are on when you are
 * trying to find out why there is no sound.
 */
function StatusLine({ status }) {
  const LABELS = {
    idle: 'Idle',
    synthesizing: 'Synthesising…',
    speaking: 'Speaking',
    muted: 'Silent by choice — mouthing the words, no audio requested.',
    blocked: 'Silent — the browser has not had a user gesture yet. Click the page.',
    unavailable: 'Silent — synthesis failed, mouthing the words instead. The reason is below.',
    error: 'Voice failed mid-utterance.',
  };

  const quiet = ['idle', 'speaking', 'synthesizing', 'muted'].includes(status.state);

  return (
    <div className="text-xs">
      <span className={quiet ? 'text-zinc-500' : 'text-amber-400'}>
        {LABELS[status.state] ?? status.state}
      </span>
      {status.error && (
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">{status.error}</p>
      )}
    </div>
  );
}

/**
 * Which voice the current model speaks in.
 *
 * A readout, not a control. The voice belongs to the model — see MODEL_NAMES in
 * constants.js — so the only thing this surface owes you is the name of what
 * you are about to hear and where to go to change it. Offering a dropdown that
 * silently disagreed with the character on screen is the state this replaced.
 */
function VoiceReadout({ modelUrl, voices }) {
  const mapped = modelVoiceForUrl(modelUrl);
  const name = voices?.find((v) => v.id === mapped)?.name ?? null;
  const description = voices?.find((v) => v.id === mapped)?.description ?? null;

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">
      <p className="text-zinc-400">
        Voice{' '}
        <span className="text-zinc-200">
          {name ?? (mapped ? 'loading…' : 'provider default — this model has no mapping')}
        </span>
      </p>
      {description && (
        <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-zinc-500">{description}</p>
      )}
      <p className="mt-1.5 leading-relaxed text-zinc-500">
        Follows the model. Change it in{' '}
        <code className="font-mono text-[10px]">MODEL_NAMES</code> in{' '}
        <code className="font-mono text-[10px]">lib/constants.js</code> —{' '}
        <code className="font-mono text-[10px]">/api/voices</code> lists the ids.
      </p>
    </div>
  );
}
