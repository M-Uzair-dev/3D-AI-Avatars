'use client';

import { useEffect, useRef } from 'react';

/**
 * A menu that opens above its trigger, and the trigger with it.
 *
 * Above, always: this bar is pinned to the bottom of the window, so a menu
 * opening downward would open off-screen.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TRIGGER LIVES IN HERE
 * ---------------------------------------------------------------------------
 * It did not, at first, and that caused a real bug: clicking an open menu's own
 * button reopened it instead of closing it.
 *
 * The sequence is worth writing down, because it is quick to reintroduce and
 * the symptom looks like the toggle "not working" rather than like a
 * dismiss problem:
 *
 *   1. `mousedown` on the trigger
 *   2. the dismiss handler sees a target outside the PANEL — the trigger was a
 *      sibling, not a descendant — and closes:            open = false
 *   3. `click` on the trigger fires the toggle:           open = true
 *
 * So the menu closed and reopened within one press and never appeared to shut.
 * The original comment here claimed `mousedown` AVOIDED that, which was exactly
 * backwards — `mousedown` is what makes it happen, because it lands before the
 * toggle rather than after it.
 *
 * The fix is structural rather than a guard: this component owns the wrapper,
 * so the trigger is INSIDE the element the dismiss handler tests. A press on
 * the trigger is now "inside", the dismiss handler ignores it, and the toggle is
 * the only thing that acts — which is what makes it close. Anything genuinely
 * outside still dismisses.
 *
 * Keeping `mousedown` is still right for the outside case: dismissing on press
 * feels immediate, and it fires even if the pointer moves before release.
 */
export default function Popover({ open, onClose, trigger, children, align = 'left' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e) => {
      // `ref` wraps the trigger AND the panel — see above.
      if (!ref.current?.contains(e.target)) onClose();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {trigger}

      {open && (
        <div
          role="menu"
          className={`lit-surface absolute bottom-full mb-2 z-20 max-h-[52vh] w-72 overflow-y-auto rounded-[var(--radius)] p-1.5 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
