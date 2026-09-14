'use client';

import { useAvatarStore } from '@/stores/avatarStore.js';
import { CONVERSATION_STATES } from '@/lib/postures.js';
import { GESTURES } from '@/lib/gestures.js';

// What each state is FOR, in the host application. These notes are the contract
// as much as the function signature is — a caller that sets 'thinking' while
// streaming a reply will get an avatar looking away from the user mid-sentence.
const NOTES = {
  idle: 'Nothing happening. Settled weight, wandering gaze, slow blinks.',
  listening: 'User is typing or speaking. Leans in, holds gaze, head tilts.',
  thinking: 'Request sent, no reply yet. Takes the full hand-to-chin pose, and the eyes break away.',
  working: 'Long task running — generating an image, building an app. Gaze goes down and stays there, with a glance up at you every 20-40s. Fidgets more, breathes slower.',
  speaking: 'Reply is being delivered. Squares up and opens the chest.',
};

export default function StateTab() {
  const conversationState = useAvatarStore((s) => s.conversationState);
  const setConversationState = useAvatarStore((s) => s.setConversationState);
  const speaking = useAvatarStore((s) => s.speechStartedAt !== null);
  const playGesture = useAvatarStore((s) => s.playGesture);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        The host app drives this. Most states are a small additive overlay on
        top of the selected pose, eased in over about half a second, so the Pose
        tab keeps working and they compose with it. <span className="text-zinc-400">Thinking</span> is
        the exception: it takes over the arms with a full pose, and idle gestures
        are suppressed while it is held.
      </p>

      <div className="flex flex-col gap-2">
        {CONVERSATION_STATES.map((name) => {
          const active = conversationState === name;
          return (
            <button
              key={name}
              onClick={() => setConversationState(name)}
              className={`flex flex-col gap-0.5 rounded border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <span className="text-xs capitalize">{name}</span>
              <span className="text-[11px] leading-snug text-zinc-600">{NOTES[name]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <span className="text-xs text-zinc-300">Gestures</span>
        <span className="text-[11px] leading-relaxed text-zinc-600">
          These fire on their own every 16&ndash;46s in any state except
          speaking. <span className="text-zinc-400">Wave</span> is excluded from
          that rotation &mdash; it is a greeting for the agent&rsquo;s first
          appearance, and a greeting on a timer stops being one. Trigger it from
          the host app when she arrives.
        </span>
        <div className="flex flex-wrap gap-1.5">
          {/* A gesture marked `hold` parks at its peak and never expires, so
              there has to be a way out of it. Releasing is just a request that
              names no gesture. */}
          <button
            onClick={() => playGesture(null)}
            className="rounded border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            Release
          </button>
          {Object.entries(GESTURES).map(([name, g]) => (
            <button
              key={name}
              onClick={() => playGesture(name)}
              className={`rounded border px-2.5 py-1.5 text-[11px] transition-colors hover:text-zinc-100 ${
                g.idle
                  ? 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  : 'border-sky-900/70 text-sky-500/80 hover:border-sky-700'
              }`}
            >
              {g.label}{g.hold ? ' ●' : ''}
            </button>
          ))}
        </div>
      </div>

      {speaking && (
        <p className="rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-500/90">
          Speech is active, so the speaking posture is overriding this selection.
          An active timeline always wins — the component knows it is speaking
          first-hand and does not need to be told.
        </p>
      )}
    </div>
  );
}
