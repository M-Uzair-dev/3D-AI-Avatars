'use client';

/**
 * The trigger for a popover menu.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LOOKS LIKE A CONTROL AND NOT LIKE TEXT
 * ---------------------------------------------------------------------------
 * The first cut of this bar rendered both menus as bare text with a hover
 * background. It was reported straight back: *"the model is hard to see where
 * to change"*. Bare text on a dark bar is indistinguishable from a caption, and
 * a control nobody recognises as a control is not discoverable at any contrast.
 *
 * Three things fix it, and all three are doing work:
 *
 *   border     a visible edge is what separates "control" from "label"
 *   label      says what the control CHANGES, not just its current value —
 *              "Momiji" alone never told you it was the model
 *   chevron    the conventional promise that something opens
 *
 * The open state borrows the accent border so the trigger stays visibly tied to
 * the panel hanging off it.
 */
function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3 shrink-0 text-[var(--text-quiet)] transition-transform duration-150 ${
        open ? 'rotate-180' : ''
      }`}
    >
      {/* Points UP at rest, because the menu opens upward — the bar is pinned to
          the bottom of the window. A chevron promising a downward panel would be
          lying about where to look. */}
      <path
        d="M2.5 7.5 L6 4 L9.5 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MenuButton({ open, onClick, label, value }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="menu"
      className={`flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors ${
        open
          ? 'border-[var(--accent)]/60 bg-white/[0.08]'
          : 'border-[var(--edge-cool)] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.07]'
      }`}
    >
      <span className="text-[var(--text-quiet)]">{label}</span>
      {value && <span className="font-medium text-[var(--text)]">{value}</span>}
      <Chevron open={open} />
    </button>
  );
}
