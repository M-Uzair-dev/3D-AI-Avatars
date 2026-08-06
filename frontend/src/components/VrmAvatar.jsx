'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { MODEL_URL, VISEMES, DEFAULTS } from '@/lib/constants.js';
import { compositeBones, lerpPoses } from '@/lib/composite.js';
import { POSES } from '@/lib/poses.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { useVisemePlayback } from '@/hooks/useVisemePlayback.js';
import { useIdleMotion } from '@/hooks/useIdleMotion.js';
import { useVrmAnimations } from '@/hooks/useVrmAnimations.js';

export default function VrmAvatar({ onLoaded, onProgress, onError }) {
  const [vrm, setVrm] = useState(null);
  const stepVisemes = useVisemePlayback();
  const stepIdle = useIdleMotion();
  const lookTarget = useRef(new Vector3());
  const elapsed = useRef(0);
  const currentPose = useRef(null);
  const prevPoseName = useRef(null);
  const poseBlend = useRef(1);
  const { mixerRef, actionRef, loadClip, stop } = useVrmAnimations(vrm);
  const clipUrlRef = useRef(null);

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

    // Load or unload a clip when the store's selection changes.
    if (s.clipUrl !== clipUrlRef.current) {
      clipUrlRef.current = s.clipUrl;
      if (s.clipUrl) loadClip(s.clipUrl);
      else stop();
    }

    // ---------- BONES ----------
    const { blink, deltas } = stepIdle({ nowMs, tSec: elapsed.current, idle: s.idle });

    // The mixer writes straight to the normalized bones, so run it first and
    // capture what it produced. Compositing first would overwrite the clip.
    let clipPose = null;
    if (actionRef.current && mixerRef.current) {
      mixerRef.current.update(dt);
      clipPose = {};
      for (const name of Object.keys(POSES[s.poseName] ?? {})) {
        const node = vrm.humanoid?.getNormalizedBoneNode(name);
        if (node) {
          clipPose[name] = {
            x: node.rotation.x,
            y: node.rotation.y,
            z: node.rotation.z,
          };
        }
      }
    }

    // Ease between presets rather than snapping. currentPose holds where we
    // actually are; the target is where the store says we should be.
    const targetPose = POSES[s.poseName] ?? {};
    if (prevPoseName.current !== s.poseName) {
      currentPose.current = currentPose.current ?? targetPose;
      prevPoseName.current = s.poseName;
      poseBlend.current = 0;
    }
    if (poseBlend.current < 1) {
      poseBlend.current = Math.min(
        1,
        poseBlend.current + (dt * 1000) / DEFAULTS.poseTransitionMs,
      );
      currentPose.current = lerpPoses(
        currentPose.current ?? targetPose,
        targetPose,
        poseBlend.current,
      );
    } else {
      currentPose.current = targetPose;
    }

    const bones = compositeBones({
      pose: clipPose
        ? lerpPoses(currentPose.current, clipPose, s.clipWeight)
        : currentPose.current,
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
