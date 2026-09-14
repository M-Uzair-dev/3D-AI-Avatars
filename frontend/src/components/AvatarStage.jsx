'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { modelPaletteForUrl, GREETING_CLIP } from '@/lib/constants.js';
import MissingModelNotice from './MissingModelNotice.jsx';
import ControlPanel from './ControlPanel/index.jsx';
import Controls from './Controls/index.jsx';
import ModelNav from './Controls/ModelNav.jsx';

// three.js touches `window` at import time, so the Canvas subtree must never be
// server-rendered. `ssr: false` is only permitted inside a 'use client' file —
// calling it from a Server Component is an error in the App Router.
const Scene = dynamic(() => import('./Scene.jsx'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-[var(--text-quiet)]">
      Loading scene…
    </div>
  ),
});

const VrmAvatar = dynamic(() => import('./VrmAvatar.jsx'), { ssr: false });

/**
 * Two surfaces over one scene.
 *
 * `dev` (from ?dev=1) picks between them:
 *
 *   production  she fills the window against a lit backdrop, with one control
 *               bar floated over her. Four things: state, model, animation,
 *               speech.
 *   dev         the original seven-tab workbench in a side panel, with the
 *               reference grid and the flat scene background it was tuned
 *               against.
 *
 * The dev panel is not a debug leftover — it is the only place the per-bone
 * sliders live, and those are how every measured arm value in this project was
 * authored. See docs/06-poses-and-rig.md; anything putting a hand at a point on
 * the body has to be dragged out there rather than reasoned about.
 */
export default function AvatarStage({ dev = false }) {
  const [progress, setProgress] = useState(0);
  // The room takes its colour from whoever is standing in it. Subscribed here
  // rather than read in the frame loop because it is a DOM layer behind the
  // canvas, not something the renderer touches — see the cyclorama note below.
  const modelUrl = useAvatarStore((s) => s.modelUrl);
  const [error, setError] = useState(null);
  const [vrm, setVrm] = useState(null);

  // Whether she has already said hello. A ref rather than state because nothing
  // renders from it, and it must survive the re-render that setting the clip
  // causes — as state it would reset the guard it exists to be.
  const greeted = useRef(false);

  const handleLoaded = useCallback((loaded) => {
    setVrm(loaded);
    setProgress(1);

    // She arrives mid-greeting rather than simply being there. Fired on the
    // FIRST model to land and never again: switching models later is the
    // carousel's business, and being greeted afresh every time you press an
    // arrow would turn a welcome into a tic.
    //
    // Not in the workbench. That surface is for authoring poses, and a clip
    // that starts playing on its own is fighting the person using it.
    if (loaded && !dev && !greeted.current && GREETING_CLIP) {
      greeted.current = true;
      // `arriving` first, then the clip. The frame loop reads both together, so
      // the order only matters in that it must never see the clip without the
      // flag — that would fade her into the greeting's opening crouch from a
      // standing pose, which is the thing this exists to prevent.
      useAvatarStore.getState().setArriving(true);
      useAvatarStore.getState().setClip(GREETING_CLIP);
    }
  }, [dev]);

  const scene = (
    <Scene dev={dev}>
      <VrmAvatar
        onLoaded={handleLoaded}
        onProgress={setProgress}
        onError={setError}
      />
    </Scene>
  );

  if (dev) {
    return (
      <div className="stage-height flex w-full flex-col bg-zinc-900 lg:flex-row">
        <div className="relative min-h-0 flex-1">
          {scene}
          <MissingModelNotice progress={progress} error={error} />
        </div>
        <aside className="w-full shrink-0 border-t border-zinc-800 bg-zinc-900 lg:stage-height lg:w-80 lg:border-l lg:border-t-0">
          <ControlPanel vrm={vrm} />
        </aside>
      </div>
    );
  }

  // Her main colour only. The rest of the palette is hers but not the room's —
  // one hue at three strengths reads as a lit sweep, two hues read as a
  // gradient effect. A model with no palette row falls through to the CSS
  // default, the plum this lighting rig was originally tuned against.
  const palette = modelPaletteForUrl(modelUrl);
  const backdrop = palette ? { '--backdrop-main': palette[0] } : undefined;

  return (
    // The cyclorama is a DOM layer BEHIND a transparent canvas rather than a
    // scene background, so it costs nothing per frame and can be tuned in CSS —
    // including being recoloured per character, which as a three.js background
    // would have meant touching the renderer.
    <div className="cyclorama stage-height relative w-full overflow-hidden" style={backdrop}>
      {scene}
      <MissingModelNotice progress={progress} error={error} />
      {/* Stage furniture rather than bar controls: her name above her, and an
          arrow at each edge pointing at where she actually goes. */}
      <ModelNav />
      <Controls />
    </div>
  );
}
