'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { MODEL_URL, VISEMES, DEFAULTS } from '@/lib/constants.js';
import { compositeBones } from '@/lib/composite.js';
import { POSES } from '@/lib/poses.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { useVisemePlayback } from '@/hooks/useVisemePlayback.js';
import { useIdleMotion } from '@/hooks/useIdleMotion.js';

export default function VrmAvatar({ onLoaded, onProgress, onError }) {
  const [vrm, setVrm] = useState(null);
  const stepVisemes = useVisemePlayback();
  const stepIdle = useIdleMotion();
  const lookTarget = useRef(new Vector3());
  const elapsed = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (cancelled) return;
        const loaded = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(loaded);
        loaded.scene.traverse((obj) => {
          obj.frustumCulled = false;
        });
        setVrm(loaded);
        onLoaded?.(loaded);
      },
      (event) => {
        if (!cancelled && event.total) onProgress?.(event.loaded / event.total);
      },
      (err) => {
        if (!cancelled) onError?.(String(err?.message ?? err));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [onLoaded, onProgress, onError]);

  useFrame((state, delta) => {
    if (!vrm) return;

    // Clamp dt so an alt-tab pause does not produce one enormous step.
    const dt = Math.min(delta, 0.1);
    elapsed.current += dt;
    const nowMs = performance.now();

    // Read transiently — subscribing here would re-render the Canvas on every
    // slider drag, which is exactly what the store exists to avoid.
    const s = useAvatarStore.getState();
    const speaking = s.speechStartedAt !== null;

    // ---------- BONES ----------
    const { blink, deltas } = stepIdle({ nowMs, tSec: elapsed.current, idle: s.idle });

    const bones = compositeBones({
      pose: POSES[s.poseName] ?? {},
      idleDeltas: deltas,
      manualOverrides: s.manualBones,
      speaking,
      attenuation: DEFAULTS.idleAttenuationWhileSpeaking,
    });

    for (const [name, rot] of Object.entries(bones)) {
      const node = vrm.humanoid?.getNormalizedBoneNode(name);
      if (node) node.rotation.set(rot.x, rot.y, rot.z);
    }

    // ---------- EXPRESSIONS ----------
    const em = vrm.expressionManager;
    if (em) {
      // Emotions first, from the control panel.
      for (const [name, value] of Object.entries(s.expressions)) {
        em.setValue(name, value);
      }

      // Then visemes. Note we do NOT hand-suppress these when an emotion is
      // active — VRM's own override flags arbitrate that inside vrm.update().
      const weights = stepVisemes({
        timeline: s.timeline,
        speechStartedAt: s.speechStartedAt,
        nowMs,
        dtSec: dt,
        stiffness: s.stiffness,
      });
      for (const v of VISEMES) em.setValue(v, weights[v]);

      // Auto-blink, unless the panel is driving blink manually.
      if (s.expressions.blink === undefined) em.setValue('blink', blink);

      s.setDebug({ weights, fps: Math.round(1 / dt) });
    }

    // ---------- FINALIZE ----------
    if (s.idle.lookAt && vrm.lookAt) {
      state.camera.getWorldPosition(lookTarget.current);
      vrm.lookAt.lookAt(lookTarget.current);
    }

    // MUST be last, exactly once per frame. This is what applies the accumulated
    // expression values, resolves override flags, and advances spring bones.
    // Calling it before the setValue calls, or twice, produces subtly wrong
    // output that is painful to debug.
    vrm.update(dt);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
