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
 * WHY NEITHER PIECE HAS A PANEL
 * ---------------------------------------------------------------------------
 * Everything else in this UI sits on `lit-surface`, and both of these
 * deliberately do not. Two lit chips at the left and right edges would put
 * bright rectangles in the darkest corners of the cyclorama and frame her like
 * a slideshow; a plate behind the name would cut a hole in the backdrop's
 * gradient at its most visible point. Bare text and bare chevrons, with a soft
 * scrim appearing under an arrow only while it is hovered — which is the one
 * moment it has to stay legible against a brightly lit dress.
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
      className={`group pointer-events-auto absolute ${side} top-1/2 z-10 flex h-28 w-16 -translate-y-1/2 items-center justify-center transition-opacity duration-200 sm:w-20 ${
        disabled
          ? 'cursor-not-allowed opacity-20'
          : 'opacity-45 hover:opacity-100 focus-visible:opacity-100'
      }`}
    >
      {/* The scrim is the only thing standing between a thin chevron and a
          white apron. It appears on hover rather than sitting there, because at
          rest the arrow is over the dark edge of the cyclorama and needs
          nothing. */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 opacity-0 transition-opacity duration-200 ${
          disabled ? '' : 'group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
        style={{
          background: `radial-gradient(60% 50% at ${
            direction < 0 ? '20%' : '80%'
          } 50%, rgba(8,9,11,0.55) 0%, transparent 100%)`,
        }}
      />
      <span className="relative text-[var(--text-quiet)] transition-colors duration-200 group-hover:text-[var(--text)] group-focus-visible:text-[var(--text)]">
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
            <div className="truncate text-[12px] leading-snug text-[var(--text-quiet)]">
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
