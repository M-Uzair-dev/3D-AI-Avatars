'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

/**
 * Loads .vrma clips and drives them through an AnimationMixer.
 *
 * The mixer writes directly to the VRM's normalized bones, so VrmAvatar must
 * call mixer.update() *before* compositing and then read the resulting rotations
 * as the pose base. Compositing first would have the compositor immediately
 * overwrite everything the clip just did.
 */
export function useVrmAnimations(vrm) {
  const mixerRef = useRef(null);
  const actionRef = useRef(null);
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
    };
  }, [vrm]);

  const loadClip = async (url) => {
    if (!vrm || !mixerRef.current) return;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);

    const animation = gltf.userData.vrmAnimations?.[0];
    if (!animation) return;

    const clip = createVRMAnimationClip(animation, vrm);
    mixerRef.current.stopAllAction();
    actionRef.current = mixerRef.current.clipAction(clip);
    actionRef.current.play();
  };

  const stop = () => {
    mixerRef.current?.stopAllAction();
    actionRef.current = null;
  };

  return { mixerRef, actionRef, available, loadClip, stop };
}
