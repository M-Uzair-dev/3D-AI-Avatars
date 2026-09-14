'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { DEFAULT_FRAMING, FOV_DEG } from '@/lib/constants.js';
import { solveFraming, zoomForWidth } from '@/lib/framing.js';
import { useAvatarStore } from '@/stores/avatarStore.js';

/**
 * Lighting, driven from the store so it can be judged by eye.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OLD RIG WASHED HER OUT
 * ---------------------------------------------------------------------------
 * The previous setup was ambient 0.6 + key 1.4 + fill 0.4 of flat white light,
 * on an MToon anime material whose albedo is already near-white. Two separate
 * mistakes compounded:
 *
 *   1. AMBIENT WAS DOING THE FILL. Ambient light adds the same amount to every
 *      surface regardless of which way it faces, so it cannot shade anything —
 *      it only raises the black point. At 0.6 it erased the form shading and
 *      left a flat cutout. A hemisphere light fills the same shadows but has
 *      direction, so the shading survives.
 *   2. NOTHING SEPARATED HER FROM THE BACKGROUND. A dark scene with only front
 *      light gives a silhouette that dissolves into the backdrop.
 *
 * The rim light is the fix for (2) and it is the biggest single improvement in
 * this file. A light from behind and above catches the edge of the hair and the
 * shoulders and draws a bright line around the character. It is most of the
 * reason good VTuber renders look like they do, and it costs one light.
 *
 * This subscribes to the store, which is fine and is NOT a violation of the
 * "read via getState" rule — that rule is about `useFrame`. This is an ordinary
 * component, and `children` is passed through by element identity, so a
 * lighting change re-renders these five lights and nothing else.
 */
function Lights() {
  const lighting = useAvatarStore((s) => s.lighting);

  // Exposure is a renderer property rather than a light, so it has to be poked
  // directly — and it is applied from inside the frame loop, reading the store
  // transiently, for the same reason everything else here does: the renderer is
  // not React-owned state, and assigning to it from an effect is both a lint
  // error under the compiler's immutability rule and a frame late.
  // Pulling it below 1 is what stops near-white surfaces clipping.
  useFrame(({ gl }) => {
    gl.toneMappingExposure = useAvatarStore.getState().lighting.exposure;
  });

  // Warmth tints the key toward candlelight and the fill toward sky. Splitting
  // the temperature between key and fill is a photographic habit and it does a
  // surprising amount of the "this feels friendly" work on its own.
  const keyColor = `rgb(255, ${Math.round(255 - lighting.warmth * 26)}, ${Math.round(255 - lighting.warmth * 58)})`;

  return (
    <>
      {/* Kept only as a floor under the darkest shadows, not as fill. */}
      <ambientLight intensity={lighting.ambient} />

      {/* Directional fill: cool from above, warm bounce from below. */}
      <hemisphereLight
        intensity={lighting.hemisphere}
        color="#b9c7ff"
        groundColor="#4a3a42"
      />

      {/* Key, from her left and well off-axis so the face gets a shading
          terminator instead of flat frontal light. */}
      <directionalLight
        position={[2.6, 3.2, 2.4]}
        intensity={lighting.key}
        color={keyColor}
        castShadow
      />

      {/* Cool fill on the shadow side, to keep it from going black. */}
      <directionalLight position={[-3, 1.2, 1.6]} intensity={lighting.fill} color="#cfd8ff" />

      {/* Rim. Behind, above, opposite the key. This is the one that matters. */}
      <directionalLight position={[-1.6, 2.6, -3]} intensity={lighting.rim} color="#dfe6ff" />
    </>
  );
}

/**
 * Moves the camera to the selected framing.
 *
 * The Canvas `camera` prop only applies once at construction, so switching
 * framings live has to be done imperatively.
 *
 * It re-applies on a change of MODEL as well as of framing, because the
 * position is solved from the model's own head height — that is what keeps a
 * short model and a tall one composed identically instead of one sitting
 * mid-frame and the other pushing out of the top. See framing.js.
 */
function CameraRig() {
  const applied = useRef(null);

  // Driven from the frame loop rather than an effect. Two reasons: the camera
  // and the OrbitControls instance are three.js objects, not React state, so
  // writing to them from an effect trips the compiler's immutability rule; and
  // `controls` does not exist on the first render, so an effect would have to
  // re-run to catch it. Checking a ref here costs one comparison per frame and
  // sidesteps both.
  useFrame(({ camera, controls, size }) => {
    const { framing, modelHeadY } = useAvatarStore.getState();
    // On a phone she is pulled back to ~0.6x so the control bar is not sitting
    // across her waist. Driven off the CANVAS width rather than a CSS media
    // query, because the canvas is what the framing is actually composed
    // against — and it is the same breakpoint the bar wraps at.
    const zoom = zoomForWidth(size.width);
    // Keyed on all three, so loading a model of a different height or rotating
    // a phone re-frames her without the user having to reselect the framing
    // they are already on.
    const key = `${framing}:${modelHeadY}:${zoom}`;
    if (applied.current === key) return;

    const view = solveFraming(framing, modelHeadY, FOV_DEG, zoom);
    camera.position.set(...view.position);
    if (controls) {
      controls.target.set(...view.target);
      controls.update();
    } else {
      camera.lookAt(...view.target);
    }
    camera.updateProjectionMatrix();

    // Only latch once controls are live, so the very first frames do not mark
    // the framing as applied before OrbitControls can receive its target.
    if (controls) applied.current = key;
  });

  return null;
}

/**
 * The 3D stage: camera, lights, ground, orbit controls.
 *
 * Framing defaults to a waist-up bust shot, which is the production target —
 * close enough that the face carries the scene, wide enough that shoulder and
 * arm motion still reads. The Stage tab switches it.
 */
export default function Scene({ children, dev = false }) {
  // Nominal height: the camera is constructed before any model has downloaded,
  // and CameraRig re-solves it the moment one is measured.
  const initial = solveFraming(DEFAULT_FRAMING, null, FOV_DEG);

  return (
    <Canvas
      camera={{ position: initial.position, fov: FOV_DEG }}
      shadows
      // `alpha` lets the CSS cyclorama behind the canvas show through. Without
      // it three.js clears to opaque black and the backdrop is never seen.
      gl={{ alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Only the workbench paints its own background. In production the
          backdrop is a DOM layer behind a transparent canvas, which is both
          cheaper and tunable in CSS — see AvatarStage. */}
      {dev && <color attach="background" args={['#16161b']} />}

      <Lights />

      {/* The reference grid reads as a 3D editor, which is exactly right for
          the workbench and exactly wrong for a product. It also fights the
          cyclorama: a horizon line across the lower frame contradicts the
          seamless sweep the backdrop is imitating. */}
      {dev && (
        <Grid
          args={[10, 10]}
          cellColor="#26262e"
          sectionColor="#33333f"
          fadeDistance={12}
          infiniteGrid
        />
      )}

      {children}

      <OrbitControls makeDefault target={initial.target} maxPolarAngle={Math.PI / 1.8} />
      <CameraRig />
    </Canvas>
  );
}
