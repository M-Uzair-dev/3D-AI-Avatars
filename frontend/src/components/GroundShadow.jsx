'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color } from 'three';
import { DEFAULTS } from '@/lib/constants.js';
import { rigFor } from '@/lib/backgroundLibrary.js';
import { resolveLighting } from '@/lib/stageLighting.js';
import { useAvatarStore } from '@/stores/avatarStore.js';

/**
 * Something for her shadow to land on.
 *
 * ---------------------------------------------------------------------------
 * NOT MOUNTED. READ THE CAVEAT BEFORE YOU MOUNT IT.
 * ---------------------------------------------------------------------------
 * The call site in Scene.jsx is commented out. This is ported and wired and
 * deliberately switched off — see the bottom of this comment for why, and do
 * not turn it on without reading it, because the failure looks like a rendering
 * fault rather than a missing feature.
 *
 * ---------------------------------------------------------------------------
 * WHY SHE FLOATS WITHOUT IT
 * ---------------------------------------------------------------------------
 * The key has cast shadows since the rooms arrived and the meshes receive them,
 * so she self-shadows — her chin darkens her neck. But the scene contains HER
 * AND NOTHING ELSE. A cast shadow needs a surface to fall on, and with no
 * surface there is no contact shadow at any setting of anything.
 *
 * That is most of "she looks pasted onto the photograph": every other cue can
 * be right and the eye still reads a figure with no relationship to the ground
 * as a cutout.
 *
 * ---------------------------------------------------------------------------
 * WHY A REAL SHADOW AND NOT A BLOB
 * ---------------------------------------------------------------------------
 * The cheap version is a dark radial-gradient sprite under the feet. It is
 * wrong in the way that matters here: it does not move when the light moves.
 * Every room has its own key direction baked from its HDRI, and an evening
 * street lit from one side wants a shadow thrown to the other.
 *
 * A `ShadowMaterial` plane gets that for free because it IS the shadow map. The
 * shadow points where the room says it should, lengthens when the key is low
 * and shortens under an overhead sun, with nothing here to keep in sync.
 *
 * `ShadowMaterial` renders ONLY the shadowed region and is fully transparent
 * everywhere else, so the plane itself is invisible against the skybox. It is
 * not a floor; it is a place for a shadow to exist.
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS THAT ARE DELIBERATE
 * ---------------------------------------------------------------------------
 * It does not cast. A plane that casts into its own receiver is the classic way
 * to get a shadow-acne'd grey wash across the whole ground.
 *
 * It is tinted toward the room's ground colour rather than black. A shadow is a
 * region lit only by bounce, and bounce on a warm cobbled street is warm. Pure
 * black is the giveaway of a composited shadow and costs nothing to avoid.
 *
 * ---------------------------------------------------------------------------
 * THE CAVEAT, WHICH IS WHY IT IS OFF
 * ---------------------------------------------------------------------------
 * The shadow ends where the key's shadow camera ends, and Scene.jsx sizes that
 * frustum to this disc. With a low key the cast streak is long enough to reach
 * the edge and STOPS DEAD at it — a straight line across the floor with the
 * shadow continuing on one side of it and not the other. Driven, that reads as
 * a torn rectangle lying on the ground, which is worse than no shadow at all.
 *
 * At `bust` and `close` her feet are out of frame anyway. At `full` the part in
 * frame is the near end, which is the part that does the grounding.
 *
 * THE REAL FIX is to size the shadow camera to the CAST rather than to the
 * disc — project the key direction against the model height, take the resulting
 * streak length, and fit the ortho box to that. It is not hard; it was simply
 * never done. Do that, then mount this.
 */
export default function GroundShadow({ size = DEFAULTS.lighting.contactSize }) {
  const room = useAvatarStore((s) => s.room);
  const tint = useMemo(() => {
    const { groundColor } = resolveLighting(rigFor(room), DEFAULTS.lighting);
    return new Color(...groundColor);
  }, [room]);

  // Opacity is written from the frame loop, reading the store transiently, for
  // the same reason exposure is: it belongs with the light that casts it, and
  // driving it from a prop would put the shadow's darkness and the rig that
  // decides it in two places free to disagree.
  //
  // Through a REF, not through `scene.userData`. Stashing the mesh on the scene
  // and reading it back would work and would also be a global keyed by string,
  // reachable from anywhere and owned by nobody — and since this component is
  // currently unmounted, nothing would ever exercise it to prove it right.
  const material = useRef(null);
  useFrame(() => {
    if (material.current) {
      material.current.opacity = useAvatarStore.getState().lighting.contact;
    }
  });

  return (
    <mesh
      // CircleGeometry is built in the XY plane facing +Z. Lay it flat.
      rotation={[-Math.PI / 2, 0, 0]}
      // The VRM stands with its feet at the origin, so the ground is y = 0.
      position={[0, 0, 0]}
      receiveShadow
      castShadow={false}
      // Behind her in the transparent pass, so her own silhouette is never
      // composited under her shadow.
      renderOrder={-1}
    >
      {/* A disc rather than a square: nothing here is axis-aligned, and a
          square receiver clipped by the shadow frustum shows its corners. */}
      <circleGeometry args={[size / 2, 48]} />
      <shadowMaterial
        ref={material}
        transparent
        opacity={DEFAULTS.lighting.contact}
        color={tint}
      />
    </mesh>
  );
}
