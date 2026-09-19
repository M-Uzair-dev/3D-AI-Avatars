'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { EquirectangularReflectionMapping, SRGBColorSpace, TextureLoader } from 'three';
import { rigFor, skyUrlFor } from '@/lib/backgroundLibrary.js';
import { useAvatarStore } from '@/stores/avatarStore.js';

/**
 * The room, as the scene's background.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS AND NOT THE CSS LAYER IT REPLACED
 * ---------------------------------------------------------------------------
 * The `.cyclorama` put a gradient behind a transparent canvas, which was
 * cheaper and was right while the backdrop was a flat wash. It cannot do this
 * job: a DOM layer does not move when the camera moves, so with a photographed
 * room behind her, orbiting reads as her spinning inside a photograph.
 *
 * On `scene.background` the equirect is world-fixed and the parallax is free —
 * it falls out of moving the camera rather than being a second thing to
 * animate and keep in sync.
 *
 * ---------------------------------------------------------------------------
 * THE TEXTURE IS LDR ON PURPOSE
 * ---------------------------------------------------------------------------
 * It is a .webp, not an .exr. The tone mapping was already applied at bake time
 * using the same curve the renderer uses, so the backdrop and the character
 * agree without the backdrop being HDR — and without every visitor paying to
 * decode a 30 MB float image. `backgroundIntensity` is the one dial left, and
 * it is baked per room.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------
 * It does not set `scene.environment`. That is not an oversight and not an
 * optimisation to revisit: MToon cannot sample an environment map at all — the
 * `envmap_fragment` include is commented out in its own shader and the indirect
 * path is gated on `defined( STANDARD )`, which MToon never defines. A PMREM
 * here would cost a convolution every room change and light exactly nothing.
 * The room reaches her through applyMatcap.js instead.
 */
export default function Room() {
  const scene = useThree((s) => s.scene);
  const room = useAvatarStore((s) => s.room);

  useEffect(() => {
    const url = skyUrlFor(room);
    if (!url) return undefined;

    let live = true;
    let texture = null;

    new TextureLoader().load(
      url,
      (loaded) => {
        // The room can change again while ~800 KB is in flight. Without this
        // the old room lands on top of the new one and stays there, which looks
        // like the picker ignoring every second click.
        if (!live) {
          loaded.dispose();
          return;
        }
        loaded.mapping = EquirectangularReflectionMapping;
        loaded.colorSpace = SRGBColorSpace;
        texture = loaded;
        scene.background = loaded;
        scene.backgroundIntensity = rigFor(room)?.backgroundIntensity ?? 1;
      },
      undefined,
      () => {
        // A missing skybox is a blank stage and nothing else reports it. The
        // library test asserts every generated URL has a file behind it, so
        // reaching here means the assets and backgroundRigs.json have drifted.
        console.error(`[Room] failed to load ${url} — assets and backgroundRigs.json disagree`);
      },
    );

    return () => {
      live = false;
      // Only clear what we put there. A later room that has already landed owns
      // the slot, and blanking it here would race the swap to black.
      if (scene.background === texture) scene.background = null;
      scene.backgroundIntensity = 1;
      texture?.dispose();
    };
  }, [scene, room]);

  return null;
}
