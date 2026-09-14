'use client';

import AnimationMenu from './AnimationMenu.jsx';
import StateBar from './StateBar.jsx';
import SpeechBar from './SpeechBar.jsx';

/**
 * The production control surface: one bar, floated over her.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------
 * Three things, in the order you reach for them. State changes constantly while
 * you are driving her, so it is the row you never have to open anything to
 * hit. Animate is occasional, so it is a menu. Speech is the one thing you type
 * into, so it gets the width.
 *
 * WHO is on stage is deliberately not here. It was, first as a menu and then as
 * a carousel wedged between Animate and Speech, and both were wrong the same
 * way: this bar is for driving the character you have, and choosing her is the
 * frame around that rather than another setting inside it. It lives on the
 * stage itself now — see ModelNav.jsx.
 *
 * There is no voice control, deliberately: the voice belongs to the model, so
 * picking Momiji picks her voice too. See MODEL_NAMES in constants.js.
 *
 * The bar holds just under full opacity and comes to full on hover. It never moves or
 * fades on its own: this thing sits on screen for hours next to a character
 * whose entire job is to be the one moving thing in the frame, and a control
 * surface that animates unprompted competes with her for exactly the attention
 * she is supposed to be getting.
 *
 * Below `sm` the state row wraps above the rest rather than scrolling, because
 * five states that you have to swipe through cannot be compared, and comparing
 * them is the point.
 */
export default function Controls() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
      <div className="lit-surface pointer-events-auto w-full max-w-3xl rounded-[var(--radius)] p-2 opacity-95 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100">
        <div className="flex flex-wrap items-center justify-center gap-1 border-b border-[var(--edge-cool)] pb-2">
          <StateBar />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <AnimationMenu />
          <SpeechBar />
        </div>
      </div>
    </div>
  );
}
