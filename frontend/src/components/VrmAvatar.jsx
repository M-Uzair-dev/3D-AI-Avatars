'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { VISEMES, DEFAULTS } from '@/lib/constants.js';
import { matcapUrlFor, rigFor } from '@/lib/backgroundLibrary.js';
import { resolveLighting } from '@/lib/stageLighting.js';
import { applyMtoonResponse } from '@/lib/mtoonResponse.js';
import { applyMatcap } from '@/lib/applyMatcap.js';
import { compositeBones, lerpPoses, addPoses, blendPoseSubset, scalePose } from '@/lib/composite.js';
import { blendPosesShortest } from '@/lib/quat.js';
import { POSES } from '@/lib/poses.js';
import { smoothstep } from '@/lib/gestures.js';
import { overlayFor, statePoseFor, relaxedHandPose } from '@/lib/postures.js';
import { CLIP_BONES } from '@/lib/vrmIntrospect.js';
import { clipEnvelope, clipDispatch, arrivalHidesModel } from '@/lib/clips.js';
import { unwrapPose } from '@/lib/unwrapEuler.js';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { speechEngine } from '@/audio/speechEngine.js';
import { useVisemePlayback } from '@/hooks/useVisemePlayback.js';
import { useIdleMotion } from '@/hooks/useIdleMotion.js';
import { useVrmAnimations } from '@/hooks/useVrmAnimations.js';
import { residentUrls, ringOrder } from '@/lib/carousel.js';
import { carouselOffset, shouldSwap, carouselTotalMs, exitClearance } from '@/lib/carouselMotion.js';
import * as vrmCache from '@/models/vrmCache.js';

export default function VrmAvatar({ onLoaded, onProgress, onError }) {
  const [vrm, setVrm] = useState(null);
  const stepVisemes = useVisemePlayback();
  const stepIdle = useIdleMotion();
  const lookTarget = useRef(new Vector3());
  const headPos = useRef(new Vector3());
  const elapsed = useRef(0);
  const currentPose = useRef(null);
  const prevPoseName = useRef(null);
  const poseBlend = useRef(1);
  const currentOverlay = useRef({});
  const prevState = useRef(null);
  const overlayBlend = useRef(1);
  const statePose = useRef(null);
  const statePoseBlend = useRef(0);
  const warmth = useRef(0);
  const {
    mixerRef, actionRef, durationRef, loadClip, stop, mixerReady,
  } = useVrmAnimations(vrm);
  const clipUrlRef = useRef(null);
  // How far into the clip we are. Held here rather than in the store because it
  // moves every frame; the store's `clipWeight` is the panel's slider and gets
  // multiplied by the envelope, so dragging it keeps working throughout.
  const clipElapsed = useRef(0);
  // Last frame's clip read-back, so this frame's can be spelled the same way.
  // See unwrapEuler.js — the mixer writes quaternions and we read Euler, and
  // that conversion is not continuous.
  const prevClipPose = useRef(null);
  // The carousel's own clock, accumulated from dt rather than read off
  // performance.now(). That is what lets the hold be STRETCHED when the
  // incoming model has not finished parsing: we simply stop advancing it. A
  // wall-clock transition cannot wait for anything — it would arrive at the
  // middle of the entrance and start there.
  const carouselClock = useRef(0);
  const carouselKey = useRef(null);
  const carouselSwapped = useRef(false);
  const rootOffset = useRef(new Vector3());
  // Whether she was off screen last frame, so the frame she reappears can hand
  // the spring bones a settled rig rather than a metre of accumulated travel.
  const wasHidden = useRef(false);
  // The fade-in the RUNNING clip was started with. A property of the clip that
  // was dispatched, decided once, rather than something re-read every frame:
  // `arriving` is cleared the instant she is on screen, and re-deriving the
  // fade from it would collapse the blend to nothing on the very next frame.
  const clipFadeIn = useRef(DEFAULTS.clipFadeMs);
  // How long she has been held off screen waiting for her entrance to start.
  const arrivalWait = useRef(0);
  // WHICH MODEL IS ACTUALLY ON STAGE, as opposed to which one the store has
  // selected. The two disagree for the whole time a model is in flight, and the
  // carousel needs the difference: "a model is mounted" is not the same
  // question as "the model I am waiting for is mounted", and answering the
  // first when you meant the second starts the entrance with the outgoing
  // character still on screen.
  const loadedUrl = useRef(null);
  // A mutable handle on the model's root. Visibility is toggled through this
  // rather than through the `vrm` state value, because assigning to a property
  // of state is exactly the thing React's lint rules exist to stop — and here
  // it would be a real hazard rather than a technicality, since the same object
  // is what <primitive> is rendering.
  const stageRoot = useRef(null);

  // A SUBSCRIPTION, which invariant 2 forbids inside useFrame and permits here:
  // this is the load effect, not the render loop, and it fires once per model
  // change rather than once per frame. The frame loop below still reads the
  // store transiently.
  const modelUrl = useAvatarStore((s) => s.modelUrl);

  useEffect(() => {
    let cancelled = false;

    // Hand the panel a null vrm while the next model is in flight. Without it
    // the Expressions and Pose tabs go on enumerating the OLD model's bones
    // against a scene that no longer contains them.
    onLoaded?.(null);

    // A cached model resolves without ever calling onProgress, so the progress
    // bar has to be pre-empted here rather than reset to 0: showing "Loading
    // 0%" for one frame on an instant swap is the exact flash the carousel
    // exists to remove. Cold loads still report honestly.
    const cached = vrmCache.isReady(modelUrl);
    if (!cached) onProgress?.(0);

    vrmCache.load(modelUrl, { onProgress })
      .then(({ vrm: loaded, headY }) => {
        if (cancelled) return;
        vrmCache.touch(modelUrl);
        useAvatarStore.getState().setModelHeadY(headY);
        loadedUrl.current = modelUrl;
        stageRoot.current = loaded.scene;
        setVrm(loaded);
        onLoaded?.(loaded);
        onProgress?.(1);
      })
      .catch((err) => {
        if (!cancelled) onError?.(String(err?.message ?? err));
      });

    return () => {
      cancelled = true;
      // NOTE WHAT IS NOT HERE: deepDispose. The cache owns model lifetime now,
      // and disposing here would free a model it is still holding a reference
      // to — which does not throw, and does not show up until she is switched
      // back to and renders as an untextured smear. Freeing happens in the
      // retain() below, against the pure decision in lib/carousel.js.
    };
  }, [modelUrl, onLoaded, onProgress, onError]);

  // ---------------------------------------------------------------------------
  // PUT HER IN THE ROOM
  // ---------------------------------------------------------------------------
  // Three separate things, all of which have to happen for her to look like she
  // is standing in the photograph rather than in front of it:
  //
  //   1. RETUNE THE MATERIALS so they respond to light at all. This is the big
  //      one. An MToon surface has exactly one way to vary with light direction,
  //      and the shipped VRoid models disable it — `_ShadeColor == _Color` over
  //      most of the body, `_ShadeShift = -0.8` on every face material — so
  //      every visible pixel evaluated to `albedo * a constant`. No light rig
  //      could have fixed that, which is why it went unfound for so long. The
  //      measurements are in mtoonResponse.js.
  //
  //   2. DRESS HER IN THE ROOM'S REFLECTION via the matcap, which is the only
  //      route a room has to her surface: MToon cannot sample an environment
  //      map, so `scene.environment` does precisely nothing. See applyMatcap.js.
  //
  //   3. LET HER SHADOW HERSELF. Cast AND receive on every mesh — the depth in
  //      an anime model comes mostly from SELF-shadowing, her chin onto her neck
  //      and her fringe onto her forehead, and `receiveShadow` alone gives none
  //      of it. It is also the only shadowing that shows at all right now, since
  //      GroundShadow is deliberately not mounted.
  //
  // Keyed on the room as well as the model, so walking into another room
  // re-dresses whoever is already standing there.
  //
  // NOT keyed on `lighting`. The response tuning is read transiently, so
  // changing one of the shade* values at runtime would not re-apply here. That
  // is fine today because none of them has a slider — they are DEFAULTS, judged
  // by editing constants.js and reloading. Give one a slider and it will appear
  // to do nothing until you add it to these deps, which is the sort of silence
  // this project has paid for before.
  //
  // EVERY STEP UNDOES ITSELF, and that is load-bearing rather than tidy:
  // vrmCache keeps the whole cast parsed and hands back the SAME object every
  // time the carousel comes round to her again. Without the undo the second
  // visit retunes the result of the first — shadeDepth compounding on itself
  // until she is black — and a room change leaves the old room's bounce tint
  // sitting in her shadows.
  const room = useAvatarStore((s) => s.room);
  useEffect(() => {
    if (!vrm) return undefined;

    const { response } = resolveLighting(
      rigFor(room),
      useAvatarStore.getState().lighting,
    );
    const undoResponse = applyMtoonResponse(vrm.scene, response);

    const shadowed = [];
    vrm.scene.traverse((object) => {
      if (!object.isMesh && !object.isSkinnedMesh) return;
      shadowed.push([object, object.castShadow, object.receiveShadow]);
      object.castShadow = true;
      object.receiveShadow = true;
    });

    let live = true;
    let undoMatcap = () => {};
    let texture = null;

    const matcapUrl = matcapUrlFor(room);
    if (matcapUrl) {
      new TextureLoader().load(
        matcapUrl,
        (loaded) => {
          // She can have left the room — or the stage — while ~30 KB is in
          // flight. Applying here would dress a model nothing is rendering and
          // leave a texture with no owner left to dispose it.
          if (!live) {
            loaded.dispose();
            return;
          }
          loaded.colorSpace = SRGBColorSpace;
          texture = loaded;
          undoMatcap = applyMatcap(vrm.scene, loaded);
        },
        undefined,
        () => {
          // Loud, where the rest of this file is quiet. A matcap that fails to
          // load looks EXACTLY like one that loaded and did nothing, because
          // `matcapFactor` ships black on VRoid exports — without this line the
          // two are indistinguishable from outside.
          console.error(`[VrmAvatar] matcap failed: ${matcapUrl}`);
        },
      );
    }

    return () => {
      live = false;
      undoMatcap();
      undoResponse();
      for (const [object, cast, receive] of shadowed) {
        object.castShadow = cast;
        object.receiveShadow = receive;
      }
      texture?.dispose();
    };
  }, [vrm, room]);

  // Warm the whole cast, and let go of anything no longer in it.
  //
  // Keeping all eight rather than three neighbours is the difference between a
  // stall you can walk into and one that cannot happen: after warm-up nothing
  // loads again, ever. It costs ~18MB of source model apiece, taken knowingly —
  // see MAX_RESIDENT.
  //
  // Gated on a model already being on screen, so warming never competes with
  // the load the user is actually waiting for at startup.
  const modelRing = useAvatarStore((s) => s.modelRing);
  const modelReady = vrm !== null;
  useEffect(() => {
    // retain() runs unconditionally, including under ?dev=1 where no ring is
    // ever published. residentUrls of an empty ring is [modelUrl], which is
    // exactly the keep-one behaviour the old unconditional deepDispose had —
    // returning early here instead meant nothing was ever freed in the
    // workbench, which is a leak with no symptom.
    vrmCache.retain(residentUrls(modelRing, modelUrl));
    if (modelReady) vrmCache.warm(ringOrder(modelRing, modelUrl));
  }, [modelRing, modelUrl, modelReady]);

  // NOT WHILE SHE IS MOVING. A VRM parse is main-thread and an 18MB model is a
  // visible stall, so no new model is allowed to start loading for the length
  // of a transition. This is its own effect because it is its own concern: the
  // queue's CONTENTS depend on where she is standing, its RUNNING depends on
  // whether she is between marks.
  const transitioning = useAvatarStore((s) => s.carousel !== null);
  useEffect(() => {
    vrmCache.setWarmPaused(transitioning);
  }, [transitioning]);

  // Stop the mixer AND put the rig back to rest.
  //
  // `stopAllAction` only stops the mixer writing; it does not undo what it
  // wrote. Every bone the clip moved that the compositor does not manage — the
  // legs, the fingers, the hips translation — would otherwise keep the clip's
  // last frame forever, because the compositor only writes the bones some layer
  // names. `resetNormalizedPose` restores rotation and position for the whole
  // humanoid, and the compositor writes its own bones again the same frame.
  const releaseClip = () => {
    clipUrlRef.current = null;
    clipElapsed.current = 0;
    prevClipPose.current = null;
    stop();
    vrm?.humanoid?.resetNormalizedPose();
  };

  useFrame((state, delta) => {
    // Clamp dt so an alt-tab pause does not produce one enormous step.
    const dt = Math.min(delta, 0.1);
    const nowMs = performance.now();

    // Read transiently — subscribing here would re-render the Canvas on every
    // slider drag, which is exactly what the store exists to avoid.
    const s = useAvatarStore.getState();

    // ---------- CAROUSEL ----------
    // This block runs BEFORE the `!vrm` guard, deliberately. The middle beat of
    // a transition has nobody on stage, so a clock that only ticked while a
    // model existed would stop dead there and never finish: she would be left
    // parked off-mark with both buttons disabled, and nothing would look
    // broken enough to explain why.
    const carousel = s.carousel;
    // Decided in the carousel block, applied once below — writing visibility in
    // two places is how the first cut of this hid her and then un-hid her on
    // the same frame.
    let hideModel = false;
    if (carousel) {
      const cfg = DEFAULTS.carousel;

      // startedAt identifies the transition. A new one resets the clock rather
      // than continuing the old one's.
      if (carouselKey.current !== carousel.startedAt) {
        carouselKey.current = carousel.startedAt;
        carouselClock.current = 0;
        carouselSwapped.current = false;
      }

      // THE STRETCHY BIT. Once the swap has fired, the clock only advances
      // while there is actually a model to advance for — so a neighbour that
      // was not prefetched in time extends the hold instead of the arc
      // stuttering, or worse, the entrance starting from its middle.
      const waitingForModel = carouselSwapped.current
        && loadedUrl.current !== carousel.targetUrl;
      if (!waitingForModel) carouselClock.current += dt * 1000;

      // The swap, on an empty stage. This is the one moment modelUrl changes,
      // and it is also when the camera re-solves to the new model's head
      // height — a snap that is invisible precisely because it happens here.
      if (!carouselSwapped.current && shouldSwap(carouselClock.current, cfg)) {
        carouselSwapped.current = true;
        s.setModel(carousel.targetUrl);
      }

      if (carouselClock.current >= carouselTotalMs(cfg)) {
        rootOffset.current.set(0, 0, 0);
        carouselKey.current = null;
        // A write to the store from the frame loop, like the pose drift and the
        // clip release below: once at the end of a transition, not per frame.
        s.endCarousel();
      } else {
        // How far off to the side counts as GONE, measured against the camera
        // that is actually rendering rather than assumed. A constant was wrong
        // here: at bust framing the frame is 1.23m wide either side at this
        // depth, and the constant was 1.2. See exitClearance.
        const cam = state.camera;
        const distance = Math.abs(cam.position.z) + cfg.depth;
        const halfHeight = distance * Math.tan((cam.fov * Math.PI) / 360);
        const offsetX = exitClearance(
          halfHeight * cam.aspect,
          cfg.bodyHalfWidth,
          cfg.clearMargin,
        );
        const off = carouselOffset(carouselClock.current, carousel.direction, cfg, {
          offsetX,
          depth: cfg.depth,
        });
        rootOffset.current.set(off.x, 0, off.z);
      }

      // DO NOT RENDER A MODEL THAT IS NO LONGER THE POINT.
      //
      // The outgoing model stays mounted until the incoming one has parsed, so
      // between the swap and that moment the thing on screen is the character
      // we are leaving. Parking it off-stage was supposed to hide it and did
      // not — which is how the same model appeared to walk back on from the
      // other side, stop, and then become somebody else.
      //
      // Hiding it is the fix rather than parking it further away, because
      // "far enough" is a property of the camera and the viewport and this is
      // not a question worth making depend on either.
      hideModel = waitingForModel;
    } else if (rootOffset.current.lengthSq() !== 0) {
      rootOffset.current.set(0, 0, 0);
    }

    if (!vrm) return;

    // One place, every frame. An interrupted transition therefore cannot leave
    // her invisible: the next frame with no carousel running sets this true.
    elapsed.current += dt;
    const speaking = s.speechStartedAt !== null;

    // Load or unload a clip when the store's selection changes.
    //
    // THE SELECTION IS CLAIMED ONLY WHEN IT CAN BE ACTED ON. It used to be
    // claimed first and loaded second, so a load that did not start left the
    // store saying "playing" with nothing playing — the menu highlighted the
    // clip, she stood still, and because the ref had already moved it never
    // retried. That was not a rare race: the greeting dispatches in the same
    // tick the model lands, and the mixer is built in a passive effect that
    // React can run after the next frame, so it hit every single time.
    //
    // Not ready is a reason to WAIT, not to fail — leaving the ref alone means
    // the next frame tries again, and the mixer appears within one or two.
    const dispatch = clipDispatch({
      requested: s.clipUrl,
      current: clipUrlRef.current,
      ready: mixerReady(),
    });
    if (dispatch === 'release') {
      clipElapsed.current = 0;
      releaseClip();
    } else if (dispatch === 'load') {
      clipUrlRef.current = s.clipUrl;
      clipElapsed.current = 0;
      // A genuine failure — no such file, or a .vrma with no animation in it.
      // `.vrma` is gitignored, so a fresh clone has none at all and the greeting
      // would otherwise reject on page load. Clearing the STORE as well is what
      // stops it retrying forever and un-highlights the menu row.
      loadClip(s.clipUrl).catch(() => {
        releaseClip();
        const store = useAvatarStore.getState();
        store.setClip(null);
        // NEVER LEAVE HER INVISIBLE. If the greeting cannot load there is
        // nothing coming to reveal her, so the entrance is over before it
        // started. arrivalHidesModel guards this too; clearing the flag is the
        // belt to its braces.
        store.setArriving(false);
      });
    }
    // 'wait' does nothing on purpose: the ref is left alone so the next frame
    // asks again. 'none' is the common case.

    // The host application drives conversationState, but speaking is something
    // this component already knows about first-hand — so an active timeline
    // wins regardless of what the store says. That keeps the Speak button
    // honest without requiring the caller to sequence two updates.
    const convState = speaking ? 'speaking' : s.conversationState;

    // ---------- BONES ----------
    const {
      blink, deltas, gaze, weightDeltas, speechDeltas, gesturePose, gestureWeight,
      poseRequest,
    } = stepIdle({
      nowMs,
      tSec: elapsed.current,
      idle: s.idle,
      thinking: convState === 'thinking',
      working: convState === 'working',
      listening: convState === 'listening',
      speaking,
      // A state with a full pose already has her hands committed to something,
      // so an idle gesture would fight it for the same bones.
      // A clip counts as busy too. An idle gesture firing halfway through a
      // recorded performance fights it for the same bones, and there is no
      // arrangement of the two that looks deliberate.
      busy: statePoseFor(convState) !== null || clipUrlRef.current !== null,
      gestureRequest: s.gestureRequest,
      poseName: s.poseName,
    });

    // The one place the render loop WRITES to the store. It fires at most once
    // every thirty seconds or more, so the re-render it causes in the control
    // panel is not the per-frame churn invariant 2 exists to prevent — and the
    // Pose tab genuinely should show which pose she is in.
    if (poseRequest) s.setPose(poseRequest);

    // The mixer writes straight to the normalized bones, so run it first and
    // capture what it produced. Compositing first would overwrite the clip.
    let clipPose = null;
    let clipHips = null;
    let clipBlend = 0;
    if (actionRef.current && mixerRef.current) {
      // Decided on the FIRST FRAME THE ACTION RUNS, not when the clip was
      // dispatched. Between those two moments the file has to be fetched, and
      // if that took long enough for the arrival to give up waiting (below),
      // she is already on screen — in which case this clip must ease in like
      // any other rather than snapping to full weight on a visible character.
      if (clipElapsed.current === 0) {
        clipFadeIn.current = s.arriving ? 0 : DEFAULTS.clipFadeMs;
      }
      mixerRef.current.update(dt);
      clipElapsed.current += dt * 1000;

      // Zero at both ends, one through the middle — the same contract as a
      // gesture's envelope, and it exists for the failure that motivated it:
      // applied at full weight on the first frame, a clip cuts from the
      // standing pose to its own first frame in a single frame.
      // NO FADE-IN ON AN ARRIVAL. Easing in is right for a clip fired at a
      // character already standing in front of you; it is wrong for the clip
      // that IS her appearing, because the thing it eases FROM is a pose nobody
      // should ever see. Full weight on frame one, and she is not rendered
      // until that frame — see arrivalHidesModel.
      clipBlend = clipEnvelope(
        clipElapsed.current,
        durationRef.current,
        clipFadeIn.current,
        DEFAULTS.clipFadeMs,
      );

      // CLIP_BONES: the whole humanoid vocabulary INCLUDING the fingers, not
      // just the ones the current preset names and not just the ones the Pose
      // tab shows. A clip animates whatever its author recorded, and reading it
      // through any narrower list discards the rest without a word — that has
      // cost the legs once (`Squat` moved everything but the squat) and the
      // fingers once (`Peace sign` made no peace sign).
      clipPose = {};
      for (const name of CLIP_BONES) {
        const node = vrm.humanoid?.getNormalizedBoneNode(name);
        if (node) {
          clipPose[name] = {
            x: node.rotation.x,
            y: node.rotation.y,
            z: node.rotation.z,
          };
        }
      }

      // Spelled the same way as last frame. Without this the read-back jumps by
      // up to a full turn mid-clip — same rotation, different numbers — and
      // every layer that interpolates or adds to those numbers jumps with it.
      clipPose = unwrapPose(prevClipPose.current, clipPose);
      prevClipPose.current = clipPose;

      // A .vrma also carries a HIPS TRANSLATION track, and the compositor only
      // ever writes rotations — so the mixer's root motion was landing on the
      // model raw: snapped in on the first frame, and left there for good once
      // the mixer stopped. That was the other half of the jerk, and the half
      // that persisted after the clip was over.
      const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
      if (hips) clipHips = { x: hips.position.x, y: hips.position.y, z: hips.position.z };

      // Played its one time through. The envelope has already returned the body
      // to the idle layer by now, so there is nothing left to ease.
      if (clipElapsed.current >= durationRef.current) {
        releaseClip();
        // A write to the store from the frame loop, like the pose drift above
        // and for the same reason: once at the end of a clip rather than per
        // frame, and the Pose tab should not go on highlighting a clip that has
        // stopped running.
        s.setClip(null);
        // Her entrance is over. Everything after this is an ordinary clip.
        if (s.arriving) s.setArriving(false);
        clipPose = null;
        clipHips = null;
        clipBlend = 0;
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

    // Ease the conversational-state overlay the same way. A state change that
    // snaps is worse than no state change at all — the pop reads as a glitch,
    // where the same movement eased over half a second reads as a reaction.
    const targetOverlay = overlayFor(convState);
    if (prevState.current !== convState) {
      prevState.current = convState;
      overlayBlend.current = 0;
    }
    if (overlayBlend.current < 1) {
      overlayBlend.current = Math.min(
        1,
        overlayBlend.current + (dt * 1000) / DEFAULTS.stateTransitionMs,
      );
      currentOverlay.current = lerpPoses(
        currentOverlay.current,
        targetOverlay,
        overlayBlend.current,
      );
    } else {
      currentOverlay.current = targetOverlay;
    }

    // Base pose = preset (or clip blend) + state overlay + resting hands.
    // Summed here rather than passed as idleDeltas so none of it is subject to
    // the speaking attenuation, which exists to quiet head motion and would
    // otherwise unpick the speaking posture at exactly the wrong moment.
    // How much of the body the clip currently owns. Used twice, and the second
    // use is the important one.
    const clipInfluence = clipPose ? s.clipWeight * clipBlend : 0;

    // THE RESTING HAND CURL GETS OUT OF THE CLIP'S WAY.
    //
    // `relaxedHandPose` is ADDED, not blended — it is an offset that keeps her
    // fingers from standing out straight like a mannequin's, and adding it is
    // right for every pose in this project. It is wrong for a clip, because a
    // clip animates the fingers itself: `Peace sign` ends up with two fingers
    // extended AND a resting curl added on top of them, which is a peace sign
    // made by someone with cramp.
    //
    // Faded on the clip's own envelope rather than switched off, so the hands
    // relax back as the clip releases instead of snapping.
    // THE ADDITIVE LAYERS GET OUT OF A CLIP'S WAY, all of them, on the clip's
    // own envelope. Two reasons, and the second is why it is every layer rather
    // than just the hands:
    //
    //   1. A clip animates the whole body, fingers included. `relaxedHandPose`
    //      is an offset that keeps her fingers off a mannequin's straight —
    //      right for every pose here, wrong on top of `Peace sign`, which came
    //      out as two extended fingers with cramp.
    //   2. Near gimbal the read-back is ill-conditioned: measured on these
    //      clips, the hips move 3 degrees of real rotation while their Euler
    //      triple moves 115. A constant breath or sway delta added to numbers
    //      in that state is not a constant amount of motion — it is a jerk, at
    //      the same moment in a clip every time, which is exactly how it was
    //      reported. See scalePose and unwrapEuler.js.
    //
    // A recorded performance carries its own aliveness, so there is nothing to
    // replace.
    const idleUnderClip = 1 - clipInfluence;
    const basePose = addPoses(
      clipPose
        // SHORTEST ARC, not an Euler lerp. `clipPose` is unwrapped for
        // continuity, and unwrapping accumulates: by the end of a clip a bone
        // can sit a full turn or more past where it started, spelling the same
        // rotation with a much bigger number. Interpolating those numbers down
        // to the static pose walked `hips.z` through 360 degrees over the
        // fade-out and cartwheeled the whole body sideways at the end of every
        // wound-up clip. A quaternion has no spelling, so the blend cannot see
        // the winding at all. See lib/quat.js.
        ? blendPosesShortest(currentPose.current, clipPose, clipInfluence)
        : currentPose.current,
      scalePose(currentOverlay.current, idleUnderClip),
      relaxedHandPose(s.idle.handRelax * idleUnderClip),
      scalePose(weightDeltas, idleUnderClip),
      scalePose(speechDeltas, idleUnderClip),
    );

    // A conversational state with a FULL pose (currently only `thinking`)
    // blends over the base the same way a gesture does. The last pose is kept
    // while the weight falls back to zero, so leaving the state eases out of
    // the shape instead of dropping it.
    const targetStatePose = statePoseFor(convState);
    if (targetStatePose) statePose.current = targetStatePose;
    const stateStep = (dt * 1000) / DEFAULTS.stateTransitionMs;
    statePoseBlend.current = Math.max(
      0,
      Math.min(1, statePoseBlend.current + (targetStatePose ? stateStep : -stateStep)),
    );
    const withState = statePose.current
      ? blendPoseSubset(basePose, statePose.current, smoothstep(statePoseBlend.current))
      : basePose;

    // The gesture sits on top of everything postural, and BLENDS rather than
    // adds — it names absolute destinations ("hand at the top of the head"),
    // which only makes sense as somewhere to move to, not as an offset. Only
    // the bones it names are touched, so breathing, sway and the weight shift
    // all keep running on everything else for the duration.
    const posed = gesturePose
      ? blendPoseSubset(withState, gesturePose, gestureWeight)
      : withState;

    const bones = compositeBones({
      pose: posed,
      // Quieted under a clip for the same reason as the layers above: this is
      // the breathing and sway, and it is added to the clip's own Euler
      // numbers.
      idleDeltas: scalePose(deltas, idleUnderClip),
      manualOverrides: s.manualBones,
      speaking,
      attenuation: DEFAULTS.idleAttenuationWhileSpeaking,
    });

    for (const [name, rot] of Object.entries(bones)) {
      const node = vrm.humanoid?.getNormalizedBoneNode(name);
      if (node) node.rotation.set(rot.x, rot.y, rot.z);
    }

    // The clip's root motion, eased by the same envelope as its rotations so
    // the body does not translate in a frame ahead of the pose it belongs to.
    // Interpolated against the rig's own rest position rather than toward zero:
    // normalized rest hips sit at hip height, so zero would drop her through
    // the floor.
    if (clipHips) {
      const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
      const rest = vrm.humanoid?.normalizedRestPose?.hips?.position;
      if (hips && rest) {
        const w = clipInfluence;
        hips.position.set(
          rest[0] + (clipHips.x - rest[0]) * w,
          rest[1] + (clipHips.y - rest[1]) * w,
          rest[2] + (clipHips.z - rest[2]) * w,
        );
      }
    }

    // ---------- EXPRESSIONS ----------
    const em = vrm.expressionManager;
    if (em) {
      // A trace of expression on the resting face. A VRM neutral is genuinely
      // neutral — slack, unfocused, and read by viewers as bored or cold. A
      // little of it is the facial equivalent of the asymmetric pose.
      //
      // It ramps to zero while speaking, and that is not cosmetic: per
      // invariant 11, a raised emotion on a VRM 0.x model can suppress visemes
      // outright through the override flags. Dropping it during speech keeps
      // the mouth unambiguously ours. The ramp is exponential so the face
      // settles rather than switches.
      // Quieter while working: concentration rather than beaming. Still not
      // blank — a face that empties out completely reads as switched off, which
      // is the exact impression a minutes-long state has to avoid.
      let warmthTarget = speaking ? 0 : s.idle.restingWarmth;
      if (!speaking && convState === 'working') {
        warmthTarget *= DEFAULTS.workingPace.warmthScale;
      }
      warmth.current += (warmthTarget - warmth.current) * Math.min(1, dt * 4);
      const restName = em.getExpression?.('relaxed') ? 'relaxed' : 'happy';
      // Only when the panel is not already driving that expression by hand.
      if (s.expressions[restName] === undefined && em.getExpression?.(restName)) {
        em.setValue(restName, warmth.current);
      }

      // Emotions from the control panel, which override the above by running
      // after it.
      for (const [name, value] of Object.entries(s.expressions)) {
        em.setValue(name, value);
      }

      // Then visemes. Note we do NOT hand-suppress these when an emotion is
      // active — VRM's own override flags arbitrate that inside vrm.update().
      // Where in the timeline the mouth should be.
      //
      // The audio clock wins whenever there is audio. `performance.now()` and
      // the audio hardware run on different crystals and drift apart by tens of
      // milliseconds a minute — enough to see, and a mouth running ahead of the
      // voice is the most obvious way an avatar looks fake. positionMs()
      // returns null when no synthesised utterance is playing, which is the
      // signal to fall back to the wall clock for silent mouthing.
      const audioMs = speechEngine.positionMs();
      const tMs = audioMs ?? (s.speechStartedAt === null ? null : nowMs - s.speechStartedAt);

      const weights = stepVisemes({
        timeline: s.timeline,
        tMs,
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

      // Nudge the look target off the camera by the gaze offset, rather than
      // rotating the eyes directly — that keeps VRM's own lookAt solver in
      // charge of eye limits and of how the two eyes converge.
      //
      // Tracking the camera exactly produces a fixed, unblinking stare, which
      // is the single most unsettling thing an avatar can do. The offset is
      // small; its job is to make the eyes wander around a face the way real
      // eyes do instead of locking onto one point.
      if (s.idle.gaze) {
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        if (headNode) {
          headNode.getWorldPosition(headPos.current);
          // Scale by distance so the angular offset stays constant regardless
          // of how close the camera is framed.
          const dist = headPos.current.distanceTo(lookTarget.current) || 1;
          lookTarget.current.x += gaze.yaw * dist;
          lookTarget.current.y += gaze.pitch * dist;
        }
      }

      vrm.lookAt.lookAt(lookTarget.current);
    }

    // ---------- VISIBILITY ----------
    // Decided here rather than up with the carousel because it now depends on
    // the clip's blend as well: during an arrival she stays off screen until
    // the greeting is actually driving her. One write, one place.
    const hidden = hideModel || arrivalHidesModel({
      arriving: s.arriving,
      clipSelected: s.clipUrl !== null,
      clipBlend,
    });
    if (stageRoot.current) stageRoot.current.visible = !hidden;

    // THE ENTRANCE ENDS THE INSTANT SHE IS ON SCREEN, not when the clip does.
    //
    // Clearing it at the end of the clip put a one-frame hole in her. `s` is a
    // SNAPSHOT: a flag cleared further up this same frame still reads as set
    // down here, so on the clip's final frame `arriving` was still true, the
    // blend had just gone to zero, and this hid her for exactly one frame
    // before the next frame brought her back in her idle pose. One frame of
    // nothing in the middle of a transition reads as two models being swapped,
    // which is precisely how it was described.
    //
    // Cleared on reveal, the flag can never be true again while a clip is
    // winding down, so there is nothing left to hide her.
    if (s.arriving && !hidden) s.setArriving(false);

    // AN ENTRANCE THAT NEVER ARRIVES MUST NOT HOLD THE STAGE EMPTY. The model
    // has finished loading by this point, so the progress readout is gone and
    // there is nothing on screen at all — a blank lit room reads as broken far
    // faster than a missing flourish does. On a cold cache the .vrma is a
    // network round trip, which is exactly when this bites.
    //
    // Giving up reveals her in her idle pose; the greeting then eases in
    // normally when it lands, because the fade-in is chosen when the action
    // starts rather than when it was asked for.
    if (s.arriving && hidden) {
      arrivalWait.current += dt * 1000;
      if (arrivalWait.current > DEFAULTS.arrivalWaitMs) s.setArriving(false);
    } else {
      arrivalWait.current = 0;
    }

    // Where she is standing, which the carousel moves and nothing else does.
    //
    // The ROOT transform, not a bone: the compositor writes normalized bone
    // rotations and never touches vrm.scene, so an arc applied here cannot
    // collide with the pose, state, gesture, clip or idle layers. All of them
    // go on running throughout a transition — she breathes and sways her way
    // off stage, which is most of why the move reads as a person leaving.
    //
    // Set BEFORE vrm.update so the spring bones see the displacement this frame
    // and her hair trails the movement rather than lagging a frame behind it.
    vrm.scene.position.copy(rootOffset.current);

    // MUST be last, exactly once per frame. This is what applies the accumulated
    // expression values, resolves override flags, and advances spring bones.
    // Calling it before the setValue calls, or twice, produces subtly wrong
    // output that is painful to debug.
    vrm.update(dt);

    // SPRING BONES DO NOT GET TO REACT TO THE TRAVEL.
    //
    // Moving the root a metre and a half in half a second is, to a spring
    // joint, an acceleration nothing else in this project produces — and on
    // these models the joints that notice first are the chest ones. The result
    // read as violent rather than lively, and no amount of retiming the arc
    // fixes it, because the physics are correct about what they were given.
    //
    // reset() puts every joint back to its rest state for the current pose, so
    // calling it after each update means no velocity is ever accumulated while
    // she is between marks. Her hair is rigid for the length of the transition,
    // which costs almost nothing: the fast part of the arc happens off-screen,
    // and the pacing now brings her to a near stop before she is back on her
    // mark — so the frame the springs are handed back, there is nothing left
    // for them to discharge.
    // Also on the frame she REAPPEARS, not only while she is away. An arrival
    // snaps the whole rig from rest into the clip's opening crouch in a single
    // frame, and a spring joint handed that much change at once discharges it
    // as a whip — the same failure the carousel had, arriving by a different
    // road.
    if (carousel || hidden || wasHidden.current) vrm.springBoneManager?.reset();
    wasHidden.current = hidden;
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
