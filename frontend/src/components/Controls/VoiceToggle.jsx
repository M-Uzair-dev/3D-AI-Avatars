'use client';

import { useAvatarStore } from '@/stores/avatarStore.js';

/**
 * Voice on/off.
 *
 * Off does not silence her — she keeps mouthing the words on the same fallback
 * the system uses when no voice is configured. Somewhere you cannot have sound,
 * a character who freezes mid-reply is worse than one who talks quietly.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS AN ICON WHEN EVERYTHING ELSE ON THIS BAR IS LABELLED
 * ---------------------------------------------------------------------------
 * The menus next to it had to grow borders and labels because bare text read as
 * a caption rather than a control. This is the opposite case and the exception
 * holds: a struck-through speaker is one of the few genuinely universal icons,
 * it is a two-state toggle rather than a menu hiding a list, and the bar is
 * already tight at phone width where the state row wraps.
 *
 * What keeps it honest is that the state is legible without hovering — the
 * muted icon changes shape rather than only dimming, so it reads at a glance
 * and not only by comparison with how it looked a moment ago.
 */
export default function VoiceToggle() {
  const enabled = useAvatarStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useAvatarStore((s) => s.setVoiceEnabled);

  return (
    <button
      type="button"
      onClick={() => setVoiceEnabled(!enabled)}
      // aria-pressed rather than a label that flips: a screen reader should hear
      // one control whose state changed, not two different buttons.
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn her voice off' : 'Turn her voice on'}
      title={enabled
        ? 'Voice on. Turn off and she will mouth the words silently.'
        : 'Voice off — she is mouthing the words. Turn on to hear her.'}
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        enabled
          ? 'border-[var(--edge-cool)] bg-white/[0.03] text-[var(--text)] hover:border-white/20 hover:bg-white/[0.07]'
          : 'border-[var(--edge-cool)] bg-white/[0.03] text-[var(--text-quiet)] hover:border-white/20 hover:bg-white/[0.07]'
      }`}
    >
      <SpeakerIcon muted={!enabled} />
    </button>
  );
}

function SpeakerIcon({ muted }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[18px]">
      {/* The cone. Shared by both states so the toggle reads as one object
          changing rather than as two unrelated glyphs swapping places. */}
      <path
        d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
      {muted ? (
        // A cross, not a slash across the whole icon: a diagonal line over the
        // cone obscures the shape it is meant to be modifying.
        <path
          d="M13.5 7.5 L17 11 M17 7.5 L13.5 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        // Two arcs rather than one, so "on" is visibly busier than "off" at a
        // glance — the difference has to survive being seen in peripheral
        // vision on a dark bar.
        <path
          d="M12.8 7.2a4 4 0 0 1 0 5.6 M15 5.2a7 7 0 0 1 0 9.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
