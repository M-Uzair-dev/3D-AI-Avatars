'use client';

import { useState } from 'react';
import { useAvatarStore } from '@/stores/avatarStore.js';
import VoiceToggle from './VoiceToggle.jsx';

/**
 * Type something and hear her say it.
 *
 * This used to own an utterance stop timer, because with no audio nothing else
 * knew when she had finished. It does not any more: `say()` hands the whole
 * utterance to the speech engine, which knows when the last sample has played
 * and ends the state itself. That is a real simplification rather than a moved
 * responsibility — the timer was always a stand-in for the thing that makes the
 * sound, and now there is one.
 *
 * Stiffness and rate are not on this surface. They are mouth-shape tuning,
 * settled, and both are still reachable in the dev panel.
 */
export default function SpeechBar() {
  const say = useAvatarStore((s) => s.say);
  const stopSpeaking = useAvatarStore((s) => s.stopSpeaking);
  const speaking = useAvatarStore((s) => s.speechStartedAt !== null);
  const status = useAvatarStore((s) => s.speechStatus);
  const [text, setText] = useState('');

  const handleSpeak = () => {
    if (text.trim() === '') return;
    say(text);
  };

  // Only the two states a person can act on are surfaced. `synthesizing` is a
  // sub-second wait and labelling it would make the bar flicker on every
  // utterance; `error` is already covered by the silent mouth continuing.
  const notice = NOTICES[status.state] ?? null;

  return (
    <div className="flex flex-1 items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSpeak();
          }
        }}
        placeholder="Say something"
        aria-label="Words for her to say"
        className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--edge-cool)] bg-black/30 px-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-quiet)] focus:border-[var(--accent)]/50"
      />

      {notice && (
        // aria-live so the reason her voice is missing reaches a screen reader
        // too — it is the kind of thing that is otherwise only visible.
        <span
          aria-live="polite"
          title={status.error ?? notice.title}
          className="hidden shrink-0 text-[11px] text-[var(--text-quiet)] sm:inline"
        >
          {notice.label}
        </span>
      )}

      <VoiceToggle />

      <button
        onClick={speaking ? stopSpeaking : handleSpeak}
        // Disabled only when there is nothing to say AND nothing to stop.
        disabled={!speaking && text.trim() === ''}
        className="h-10 shrink-0 rounded-lg bg-[var(--accent)] px-4 text-[13px] font-medium text-[#1a1505] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {speaking ? 'Stop' : 'Speak'}
      </button>
    </div>
  );
}

const NOTICES = {
  // Note there is deliberately no `muted` entry. The toggle sitting next to
  // this already shows that state, and a caption repeating a choice the user
  // just made reads as the UI arguing with them.
  blocked: {
    label: 'Silent — click to enable sound',
    title: 'The browser blocks audio until you interact with the page. Click anywhere, then speak again.',
  },
  unavailable: {
    // Deliberately does NOT name a cause.
    //
    // This used to read "no voice configured", which is only the most COMMON
    // reason synthesis fails, not the reason it failed. When the real cause was
    // a provider rejecting a voice as needing a paid plan, the label sent the
    // reader off checking environment variables for a key that was already
    // there. A status that guesses is worse than one that admits it does not
    // know — the actual message is on the element's title, and in full in the
    // dev panel.
    label: 'Silent — voice unavailable',
    title: 'Speech synthesis failed, so she is mouthing the words instead. '
      + 'The dev panel (?dev=1) shows the message the provider returned. '
      + 'See docs/15-voice-and-tts.md.',
  },
};
