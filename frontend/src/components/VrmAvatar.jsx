'use client';

import { useEffect, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { MODEL_URL } from '@/lib/constants.js';

export default function VrmAvatar({ onLoaded, onProgress, onError }) {
  const [vrm, setVrm] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (cancelled) return;
        const loaded = gltf.userData.vrm;

        // Strips unused joints/morphs. Meaningful on an 18MB model.
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);

        // VRM 0.x models face +Z; rotate so the avatar faces the camera.
        VRMUtils.rotateVRM0(loaded);

        loaded.scene.traverse((obj) => {
          obj.frustumCulled = false; // avoids pop-out when morphs move vertices
        });

        setVrm(loaded);
        onLoaded?.(loaded);
      },
      (event) => {
        if (cancelled || !event.total) return;
        onProgress?.(event.loaded / event.total);
      },
      (err) => {
        if (cancelled) return;
        onError?.(String(err?.message ?? err));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [onLoaded, onProgress, onError]);

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
