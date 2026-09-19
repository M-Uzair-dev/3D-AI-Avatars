'use client';

import { useEffect, useState } from 'react';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { modelName, modelBlurb } from '@/lib/constants.js';
import { stepUrl } from '@/lib/carousel.js';
import * as vrmCache from '@/models/vrmCache.js';

/**
 * Who is on stage — her name at the top, and an arrow at each edge.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT ON THE BAR
 * ---------------------------------------------------------------------------
 * It was, as a menu, and then as a carousel wedged between Animate and Speech.
 * Both were wrong in the same way: changing who is on stage is not a setting
 * alongside the other settings, it is the frame around everything else. The bar
 * is for driving the character you have; this is for choosing her.
 *
 * Putting the arrows at the edges of the screen also says something the bar
 * could not — that there is somebody off to either side. The gesture is the
 * same one you would use on a photo, and it points at where she actually goes.
 *
 * ---------------------------------------------------------------------------
 * THE ARROWS ARE REAL TARGETS NOW. THE NAME IS STILL BARE.
 * ---------------------------------------------------------------------------
 * Both used to be bare — no panel on either — and the argument was good: two
 * lit chips at the left and right edges would put bright rectangles in the
 * DARKEST CORNERS OF THE CYCLORAMA and frame her like a slideshow. A soft scrim
 * appeared under an arrow only on hover, because at rest it sat over a dark
 * gradient and needed nothing.
 *
 * EVERY WORD OF THAT DEPENDED ON THE BACKDROP BEING A DARK GRADIENT. It is a
 * photograph now, and a photograph has no reliably dark corners: the left edge
 * of a sunrise is a bright sky, and a thin chevron at 45% opacity over it is
 * simply not there. A hover scrim cannot help, because you have to find the
 * control before you can hover it.
 *
 * So the arrows are round glass buttons — a real border, a real blur, legible
 * over anything behind them. The sibling project reached the identical
 * conclusion from the identical starting point, which is worth knowing before
 * anyone argues them back to bare chevrons: it is not a style preference, it is
 * camouflage over a photographic backdrop.
 *
 * THE NAME STAYS BARE, and that is not an inconsistency. It sits at the top
 * centre, over sky in every room, and it is text rather than a target — nobody
 * has to find it to use it. Its own text shadow carries it.
 *
 * The one motion here is the name changing, and it is allowed for a specific
 * reason: it happens at the midpoint of a transition, while she is off stage.
 * Nothing it could compete with is on screen. See docs/08.
 */
function Chevron({ direction }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7">
      <path
        d={direction < 0 ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EdgeButton({ direction, onClick, disabled, label }) {
  const side = direction < 0 ? 'left-0' : 'right-0';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`group pointer-events-auto absolute ${side} top-1/2 z-10 flex h-28 w-16 -translate-y-1/2 items-center justify-center sm:w-20 ${
        disabled ? 'cursor-not-allowed' : ''
      }`}
    >
      {/* The target itself. Round rather than square: a circle at the edge of a
          photograph reads as a control laid on the scene, where a rectangle
          reads as the scene being cropped.

          It holds a low opacity at rest so it never competes with her, and the
          BORDER AND BLUR are what keep it findable at that opacity — over a
          bright sky a 45%-opacity chevron alone disappears, but the disc it
          sits on still reads as an object. */}
      <span
        aria-hidden="true"
        className={`absolute grid size-11 place-items-center rounded-full border transition-all duration-200 ${
          disabled
            ? 'border-white/5 bg-black/15 opacity-30'
            : 'border-white/15 bg-black/25 opacity-70 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.8)] group-hover:border-white/30 group-hover:bg-black/40 group-hover:opacity-100 group-focus-visible:border-white/30 group-focus-visible:bg-black/40 group-focus-visible:opacity-100'
        }`}
        style={{
          backdropFilter: 'blur(12px) saturate(120%)',
          WebkitBackdropFilter: 'blur(12px) saturate(120%)',
        }}
      />
      <span
        className={`relative transition-colors duration-200 ${
          disabled
            ? 'text-white/25'
            : 'text-white/80 group-hover:text-white group-focus-visible:text-white'
        }`}
      >
        <Chevron direction={direction} />
      </span>
    </button>
  );
}

export default function ModelNav() {
  const modelUrl = useAvatarStore((s) => s.modelUrl);
  const modelRing = useAvatarStore((s) => s.modelRing);
  const carousel = useAvatarStore((s) => s.carousel);
  const startCarousel = useAvatarStore((s) => s.startCarousel);
  const setModelRing = useAvatarStore((s) => s.setModelRing);

  const models = useModelList(setModelRing);

  // Resolved from the URL rather than from the fetched list, so her name is on
  // screen in the first paint instead of appearing a beat later.
  const currentFile = modelUrl.replace(/^\//, '');
  const current = models.find((m) => m.url === modelUrl);
  const currentName = modelName(currentFile, current?.label);
  const blurb = modelBlurb(currentFile) ?? current?.label;

  const busy = carousel !== null;
  const canStep = modelRing.length > 1 && !busy;

  const step = (direction) => {
    const target = stepUrl(modelRing, modelUrl, direction);
    if (!target) return;

    // Start fetching on the PRESS rather than at the midpoint where the model
    // is swapped in, which hands the download the 450ms of exit animation for
    // free. Once the cast is warm this is a no-op, which is the usual case.
    vrmCache.load(target).catch(() => {});

    startCarousel(target, direction);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <EdgeButton
        direction={-1}
        label="Previous model"
        disabled={!canStep}
        onClick={() => step(-1)}
      />
      <EdgeButton
        direction={+1}
        label="Next model"
        disabled={!canStep}
        onClick={() => step(+1)}
      />

      {/* Keyed on the name so React remounts it and the fade re-runs. The name
          changes while she is off stage, so this is the one piece of unprompted
          motion in the production UI that cannot compete with her. */}
      <div className="absolute inset-x-0 top-0 flex justify-center px-16 pt-6 sm:pt-8">
        <div key={currentName} className="model-nameplate max-w-full text-center">
          <div className="truncate text-[21px] font-medium leading-tight tracking-[-0.01em] text-[var(--text)]">
            {currentName}
          </div>
          {blurb && (
            /* NOT `--text-quiet`. That token is #7a7e86, a mid grey tuned for
               the dark chrome of the bar and the workbench, where it reads as
               quiet against a near-black panel. This line has no panel under it
               — it sits on the photograph, at the top of the frame, which is
               sky in all six rooms — so the same grey lands mid-tone on
               mid-tone and disappears. Translucent white instead: it keeps the
               step down from her name, and the nameplate's text shadow carries
               it over anything behind it. Same conclusion the edge arrows
               reached, for the same reason. */
            <div className="truncate text-[12px] leading-snug text-white/85">
              {blurb}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Fetch the cast once and publish the running order to the store.
 *
 * The store gets urls only — that is all the avatar needs to warm the cache
 * against, and handing it the labels too would put display strings in the
 * render loop's line of sight.
 */
function useModelList(setModelRing) {
  const [models, setModels] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list = d.models ?? [];
        setModels(list);
        setModelRing(list.map((m) => m.url));
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [setModelRing]);

  return models;
}
