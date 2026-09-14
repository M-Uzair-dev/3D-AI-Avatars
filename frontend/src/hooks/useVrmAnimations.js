'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimationMixer, LoopOnce } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

/**
 * Loads .vrma clips and drives them through an AnimationMixer.
 *
 * The mixer writes directly to the VRM's normalized bones, so VrmAvatar must
 * call mixer.update() *before* compositing and then read the resulting rotations
 * as the pose base. Compositing first would have the compositor immediately
 * overwrite everything the clip just did.
 *
 * Clips play ONCE. These are punctuation — a greeting, a peace sign — not idle
 * material, and a looping greeting is the same mistake as a companion who waves
 * hello every thirty seconds. When the action finishes, `finishedRef` goes true
 * and VrmAvatar eases the body back to whatever the idle layer was doing.
 */
export function useVrmAnimations(vrm) {
  const mixerRef = useRef(null);
  const actionRef = useRef(null);
  // The loaded clip's own length, in ms. The frame loop needs it to shape the
  // fade in and out, and it is the single source of truth for when the clip is
  // over — the mixer's 'finished' event says the same thing one frame later,
  // and two signals that are supposed to agree eventually will not.
  //
  // A ref rather than state because the consumer is the frame loop, and a
  // setState here would re-render the whole Canvas subtree.
  const durationRef = useRef(0);
  const [available, setAvailable] = useState([]);

  useEffect(() => {
    fetch('/api/animations')
      .then((r) => r.json())
      .then((d) => setAvailable(d.files ?? []))
      .catch(() => setAvailable([]));
  }, []);

  useEffect(() => {
    if (!vrm) return undefined;
    mixerRef.current = new AnimationMixer(vrm.scene);
    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
      durationRef.current = 0;
    };
  }, [vrm]);

  /**
   * Fetch a .vrma and start it.
   *
   * THROWS rather than returning quietly, and that is the whole point of the
   * change. It used to bail silently when there was no mixer or no animation in
   * the file, which left the caller believing a clip was running when nothing
   * was — the menu said "playing" and she stood still, forever, with no way
   * back. A caller that has already committed to a clip needs to hear that it
   * did not start.
   *
   * The no-mixer case is now the caller's to avoid entirely: it is a transient
   * startup condition worth retrying, not a failure. See `mixerReady`.
   */
  const loadClip = async (url) => {
    if (!vrm) throw new Error('No model loaded');
    if (!mixerRef.current) throw new Error('Animation mixer is not ready');

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);

    const animation = gltf.userData.vrmAnimations?.[0];
    if (!animation) throw new Error(`No animation in ${url}`);

    const clip = createVRMAnimationClip(animation, vrm);
    mixerRef.current.stopAllAction();
    durationRef.current = clip.duration * 1000;

    const action = mixerRef.current.clipAction(clip);
    // Once through, then hold the last frame. `clampWhenFinished` is what makes
    // the hand-back possible: without it the action snaps back to frame 0 the
    // instant it ends, so the release would ease out of a pose she was never
    // seen in. With it she holds where the clip left her while the blend
    // returns her to the idle layer.
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    actionRef.current = action;
  };

  const stop = () => {
    mixerRef.current?.stopAllAction();
    actionRef.current = null;
    durationRef.current = 0;
  };

  /**
   * Whether a clip can be started right now.
   *
   * The mixer is built in an effect, and React runs passive effects AFTER the
   * commit that sets `vrm` — potentially after the next paint. react-three-fiber
   * drives useFrame from its own rAF, so a frame can land in the gap with a
   * model on screen and no mixer behind it. Anything dispatched in the same tick
   * as the model finishing loading — the greeting — hits that gap every time.
   *
   * A function rather than a boolean because the frame loop must read it live;
   * a value captured at render time is exactly one render too old.
   */
  const mixerReady = () => Boolean(vrm && mixerRef.current);

  return { mixerRef, actionRef, durationRef, available, loadClip, stop, mixerReady };
}
