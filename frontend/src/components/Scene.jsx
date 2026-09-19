'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { NeutralToneMapping } from 'three';
import { DEFAULT_FRAMING, FOV_DEG, DEFAULTS } from '@/lib/constants.js';
import { solveFraming, zoomForWidth } from '@/lib/framing.js';
import { rigFor } from '@/lib/backgroundLibrary.js';
import { resolveLighting } from '@/lib/stageLighting.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import Room from './Room.jsx';
// import GroundShadow from './GroundShadow.jsx';   // see the call site below

/** A resolved [r, g, b] in 0..1 as a colour three will accept. */
function rgb([r, g, b]) {
  const to255 = (c) => Math.round(Math.max(0, Math.min(1, c)) * 255);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

/**
 * Lighting, resolved from the room she is standing in.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED WHEN THE ROOMS ARRIVED
 * ---------------------------------------------------------------------------
 * These five lights used to be hand-placed constants tuned against a flat CSS
 * gradient. They are derived per room now: each HDRI was reduced at bake time
 * to a key DIRECTION, a key COLOUR, a sky and a ground colour and an exposure,
 * and stageLighting.js turns that into positions and colours.
 *
 * The division of labour, which is the thing to keep straight:
 *
 *   the ROOM decides   key and fill POSITION, every light COLOUR, exposure
 *   the STORE decides  every INTENSITY, and the material response tuning
 *
 * So the Stage tab's sliders still do what they always did — they set how much,
 * not from where. Changing room reseeds exposure and nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OLD RIG WASHED HER OUT, WHICH IS STILL WORTH KNOWING
 * ---------------------------------------------------------------------------
 * The setup before this was ambient 0.6 + key 1.4 + fill 0.4 of flat white
 * light on an MToon material whose albedo is already near-white. Two mistakes
 * compounded:
 *
 *   1. AMBIENT WAS DOING THE FILL. Ambient adds the same amount to every
 *      surface regardless of which way it faces, so it cannot shade anything —
 *      it only raises the black point. At 0.6 it erased the form shading and
 *      left a flat cutout. A hemisphere light fills the same shadows but has
 *      direction, so the shading survives.
 *   2. NOTHING SEPARATED HER FROM THE BACKGROUND. A dark scene lit only from
 *      the front gives a silhouette that dissolves into the backdrop. The rim
 *      is the fix, and it is still the biggest single win in this file.
 *
 * ---------------------------------------------------------------------------
 * AND A THIRD, FOUND LATER AND LARGER THAN BOTH
 * ---------------------------------------------------------------------------
 * Neither of those was why she looked like a sticker on a photograph. An MToon
 * surface has exactly ONE way to vary with the direction of the light, and the
 * shipped VRoid models disable it — so no rig here could have lit her, however
 * well placed. That fix is in the MATERIAL, not in this file: see
 * mtoonResponse.js, applied in VrmAvatar.jsx.
 */
function Lights({ dev = false }) {
  const lighting = useAvatarStore((s) => s.lighting);
  const room = useAvatarStore((s) => s.room);

  // The workbench is the studio. It keeps the hand-tuned rig, the flat
  // background and the reference grid it was built with, because it is for
  // authoring poses against a stable reference rather than for judging a look —
  // and a key light that moves with the backdrop is the wrong tool for that
  // job. Passing a null rig is what asks for the studio fallback.
  const resolved = useMemo(
    () => resolveLighting(dev ? null : rigFor(room), lighting),
    [dev, room, lighting],
  );

  // Exposure is a renderer property rather than a light, so it has to be poked
  // directly — and from inside the frame loop, reading the store transiently,
  // for the same reason everything else here does: the renderer is not
  // React-owned state, and assigning to it from an effect is both a lint error
  // under the compiler's immutability rule and a frame late.
  //
  // THIS ONLY WORKS BECAUSE `toneMapping` IS SET ON THE CANVAS BELOW.
  // `toneMappingExposure` is consulted by a tone mapping operator and by
  // nothing else, so under three's `NoToneMapping` default this line is
  // silently inert. That exact bug — a carefully tuned exposure wired to
  // nothing — survived an entire milestone in the sibling project, because a
  // tuned constant next to an unset mode looks completely fine in a grep.
  useFrame(({ gl }) => {
    gl.toneMappingExposure = useAvatarStore.getState().lighting.exposure;
  });

  // Warmth tints the key toward candlelight. STUDIO ONLY: in a room the key's
  // colour is the room's own, measured off its HDRI, and tinting that would be
  // overruling the thing we went and measured.
  const keyColor = dev
    ? `rgb(255, ${Math.round(255 - lighting.warmth * 26)}, ${Math.round(255 - lighting.warmth * 58)})`
    : rgb(resolved.keyColor);

  // Sized to a person. three's default 10-unit ortho box spreads a 1.5m model's
  // shadow over so few texels that it arrives as a grey smear.
  const half = DEFAULTS.lighting.contactSize / 2;

  return (
    <>
      {/* Kept only as a floor under the darkest shadows, not as fill. */}
      <ambientLight intensity={resolved.ambient} />

      {/* Directional fill: the room's sky above, its ground bounce below. The
          one light that survived the rewrite unchanged in shape, and took its
          colours from the room instead of from a guess. */}
      <hemisphereLight
        intensity={resolved.hemisphere}
        color={rgb(resolved.skyColor)}
        groundColor={rgb(resolved.groundColor)}
      />

      {/* Key. Its direction is the luminance-weighted centroid of the room's
          own HDRI, so she is lit from wherever that room's sun or streetlight
          actually is. */}
      <directionalLight
        position={resolved.keyPosition}
        intensity={resolved.key}
        color={keyColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-radius={resolved.shadowRadius}
        // normalBias rather than bias: these are skinned meshes, and a depth
        // bias on a skinned mesh detaches the shadow from the surface casting it.
        shadow-normalBias={0.02}
      />

      {/* Fill, opposite the key and pulled toward the horizon — derived rather
          than fixed, because a fixed fill is only a fill for a key that happens
          to be on the other side. See stageLighting.js. */}
      <directionalLight
        position={resolved.fillPosition}
        intensity={resolved.fill}
        color={rgb(resolved.fillColor)}
      />

      {/* Rim. Behind, above, opposite the key. This is the one that matters,
          and its colour OPPOSES the room rather than matching it — a white rim
          on a snowy field is the one case this light exists for and the one
          case a fixed cool white could not handle. */}
      <directionalLight
        position={[-1.6, 2.6, -3]}
        intensity={resolved.rim}
        color={rgb(resolved.rimColor)}
      />
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
 * The 3D stage: camera, lights, room, orbit controls.
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
      // PCFShadowMap, which is what a bare `shadows` gives.
      //
      // NOT `shadows="soft"`. That asks for PCFSoftShadowMap, which three 0.185
      // has DEPRECATED — it warns once per frame batch and silently downgrades
      // to PCF anyway, so the only thing it bought was the warning.
      //
      // Nothing is lost: PCF absorbed the soft sampling, which is why PCFSoft
      // went away. `SHADOWMAP_TYPE_PCF` is now a five-tap Vogel disk scaled by
      // `shadowRadius * texelSize`, so the penumbra dial above is live and a
      // hard shadow edge on a flat-shaded anime surface — which reads as a
      // texture seam rather than as a shadow — is still avoided.
      shadows
      gl={{
        /**
         * THE TONE CURVE, NAMED RATHER THAN LEFT TO DEFAULT.
         *
         * Three things depend on this exact value:
         *
         * 1. NEUTRAL, NEVER ACES. R3F defaults to ACESFilmic, which desaturates
         *    saturated hues on the way to the highlight — and saturated hues are
         *    most of what an anime model is made of. It turns pink hair grey.
         *    Khronos PBR Neutral rolls the highlight off while holding the hue,
         *    which is the entire reason it exists. MToon honours it: its
         *    `postCorrection()` includes <tonemapping_fragment>, so this reaches
         *    the character and not merely the backdrop.
         *
         * 2. THE SKYBOXES WERE BAKED THROUGH THIS CURVE. Each room's .webp had
         *    NeutralToneMapping and its own exposure applied at bake time. The
         *    backdrop and the character agree only because the renderer finishes
         *    with the operator the bake started with. Change this and every
         *    room is mis-exposed against the person standing in it.
         *
         * 3. It switches `toneMappingExposure` on at all — under three's
         *    NoToneMapping default that value is read by nothing.
         */
        toneMapping: NeutralToneMapping,
      }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* The workbench paints its own flat background and keeps the grid: it is
          for authoring poses against a stable reference. Production stands her
          in a real room instead — and the canvas is OPAQUE now, where it used to
          be alpha so that a CSS layer could show through from behind it. */}
      {dev && <color attach="background" args={['#16161b']} />}
      {!dev && <Room />}

      <Lights dev={dev} />

      {/* NOT MOUNTED, AND NOT AN OVERSIGHT. She has nothing to stand on, so she
          throws no contact shadow and reads as pasted onto the photograph. The
          fix is written and switched off: with a low key the cast streak runs
          off the edge of the shadow frustum and stops dead, which reads as a
          torn rectangle lying on the floor and is worse than no shadow at all.
          GroundShadow.jsx documents the real fix — size the shadow camera to
          the CAST rather than to the disc — and mounting this before doing that
          will look like a rendering fault rather than a missing feature. */}
      {/* {!dev && <GroundShadow />} */}

      {/* The reference grid reads as a 3D editor, which is exactly right for
          the workbench and exactly wrong for a product. It also fights the
          room: a horizon line across the lower frame contradicts the real one
          behind her. */}
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

      {/* ROTATE SPEED IS A FUNCTION OF HOW CLOSE THE CAMERA IS.

          OrbitControls' default of 1.0 maps a drag across the viewport to a
          half turn, which is calibrated for orbiting an object you are looking
          at from across a room. This camera sits roughly a metre from her face
          in the production framing, so the same wrist movement swung her most
          of the way round and the gesture read as twitchy rather than as
          turning her. Slowing the mapping is the fix, not clamping the range —
          the whole orbit is still reachable, it just takes the drag it should. */}
      <OrbitControls
        makeDefault
        target={initial.target}
        maxPolarAngle={Math.PI / 1.8}
        rotateSpeed={0.35}
      />
      <CameraRig />
    </Canvas>
  );
}
