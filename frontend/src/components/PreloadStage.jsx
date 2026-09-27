'use client';

import ReactDOM from 'react-dom';
import { GREETING_CLIP, MODEL_URL, DEFAULT_ROOM } from '@/lib/constants.js';
import { skyUrlFor } from '@/lib/backgroundLibrary.js';

/**
 * Start the big downloads before the code that wants them exists.
 *
 * ---------------------------------------------------------------------------
 * THE WATERFALL THIS FLATTENS
 * ---------------------------------------------------------------------------
 * Nothing about the stage is server-rendered — three.js touches `window` at
 * import time, so Scene and VrmAvatar are `ssr: false` dynamic imports. That
 * means the model could not begin downloading until:
 *
 *   HTML -> JS bundle -> hydrate -> resolve the three.js chunk -> mount
 *   VrmAvatar -> its effect runs -> NOW ask for the model
 *
 * Six steps, and the 4MB one is last. Worse, the greeting clip was a SEVENTH:
 * `onLoaded` is what sets it, so the .vrma did not start until the .vrm had
 * finished downloading AND parsing.
 *
 * These hints go in the `<head>` of the first byte of HTML, so all of it starts
 * at once instead. The JS still arrives first — it is an order of magnitude
 * smaller — and by the time it has hydrated the model is already part-way in.
 *
 * ---------------------------------------------------------------------------
 * WHY crossOrigin ON SAME-ORIGIN FILES
 * ---------------------------------------------------------------------------
 * A preload is only reused if its credentials mode matches the request that
 * follows, and otherwise the file is downloaded TWICE — which would make this
 * change worse than nothing. three's FileLoader builds its Request with
 * `credentials: 'same-origin'` in the default `cors` mode, and `anonymous` is the
 * `crossorigin` value that means exactly that. TextureLoader is the same, via
 * Loader's `crossOrigin = 'anonymous'` default.
 *
 * So `as: 'fetch'` for the two glTF files, which three fetches, and `as: 'image'`
 * for the skybox, which it loads through an <img>. Getting `as` wrong has the
 * same double-download cost as getting the credentials wrong.
 *
 * Only the DEFAULTS are hinted. The other seven models are the warm-up queue's
 * business and must not compete with the one she is actually wearing.
 *
 * THE POSTER THUMBNAIL IS NOT HERE, and that is not an omission. StagePoster is
 * server-rendered, so its `background-image` URL is already in the initial HTML —
 * the browser finds it while parsing the same document a hint would have been in.
 * A preload was tried and React did not emit it; checking the served HTML showed
 * why it did not matter, which is a better outcome than a line that looks like it
 * does something.
 */
export default function PreloadStage({ dev = false }) {
  ReactDOM.preload(MODEL_URL, { as: 'fetch', crossOrigin: 'anonymous' });

  // Neither of these exists on the workbench: it paints a flat background instead
  // of a room, and it deliberately does not play the greeting.
  if (!dev) {
    const sky = skyUrlFor(DEFAULT_ROOM);
    if (sky) ReactDOM.preload(sky, { as: 'image', crossOrigin: 'anonymous' });
    if (GREETING_CLIP) ReactDOM.preload(GREETING_CLIP, { as: 'fetch', crossOrigin: 'anonymous' });
  }

  return null;
}
