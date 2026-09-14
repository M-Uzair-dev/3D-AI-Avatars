'use client';

import { useAvatarStore } from '@/stores/avatarStore.js';
import { CONVERSATION_STATES } from '@/lib/postures.js';

/**
 * The five conversational states, all visible at once.
 *
 * Deliberately NOT a dropdown, unlike the two menus beside it. The states are
 * shaped as opposites of one another and the only way to judge one is against
 * its neighbours — hiding four of them behind a trigger makes the one
 * comparison this control exists to support impossible. See
 * docs/12-conversational-states.md.
 *
 * `speaking` engages itself from an active timeline, so while she is talking
 * the selection here is not what is driving her. The row says so rather than
 * silently disagreeing with the body.
 */
export default function StateBar() {
  const conversationState = useAvatarStore((s) => s.conversationState);
  const setConversationState = useAvatarStore((s) => s.setConversationState);
  const speaking = useAvatarStore((s) => s.speechStartedAt !== null);

  return (
    // Wraps on its own rather than relying on the parent: this is one flex item
    // in that row, so the parent's flex-wrap cannot break it up — narrow
    // viewports would overflow instead. Five states you have to scroll through
    // cannot be compared against each other, and comparing them is the point.
    <div
      className="flex flex-wrap items-center justify-center gap-0.5"
      role="group"
      aria-label="Conversational state"
    >
      {CONVERSATION_STATES.map((name) => {
        const active = conversationState === name;
        // While speech is running the body is in `speaking` whatever is
        // selected, so show that rather than the stale selection.
        const overridden = speaking && name === 'speaking' && !active;

        return (
          <button
            key={name}
            onClick={() => setConversationState(name)}
            aria-pressed={active}
            className={`h-9 rounded-lg px-3 text-[13px] capitalize transition-colors ${
              active
                ? 'bg-white/10 text-[var(--accent)]'
                : overridden
                  ? 'text-[var(--accent)]/60'
                  : 'text-[var(--text-quiet)] hover:bg-white/5 hover:text-[var(--text)]'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
