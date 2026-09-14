import { create } from 'zustand';
import { DEFAULTS, MODEL_URL, DEFAULT_FRAMING, modelVoiceForUrl } from '@/lib/constants.js';
import { DEFAULT_POSE, POSES } from '@/lib/poses.js';
import { DEFAULT_CONVERSATION_STATE } from '@/lib/postures.js';
import { speechEngine } from '@/audio/speechEngine.js';

const ZERO = { x: 0, y: 0, z: 0 };

const initialState = {
  // Speech
  timeline: [],
  speechStartedAt: null,

  // Whether she speaks out loud at all.
  //
  // Off does NOT mean silent-and-still: she still mouths the words, on the
  // same fallback the system uses when no voice is configured. That is the
  // point of the toggle — somewhere you cannot have sound, or do not want it,
  // she should still look like she is talking rather than freeze mid-reply.
  voiceEnabled: true,

  // How the voice is doing, for the UI to surface. `state` is one of:
  //   idle | synthesizing | speaking | blocked | unavailable | error
  // `blocked` and `unavailable` both mean she is mouthing the words silently:
  // the first because the browser has not had a user gesture yet, the second
  // because synthesis failed. Distinguishing them matters — one is fixed by
  // clicking, the other usually by setting an API key.
  speechStatus: { state: 'idle', error: null },

  // Tuning
  stiffness: DEFAULTS.stiffness,
  rate: DEFAULTS.rate,

  // The beat held after a sentence before the next one starts. Synthesisers
  // hurry a full stop; this puts the pause back. See pauseAfterChunk.
  sentencePauseMs: DEFAULTS.sentencePauseMs,

  // Expressions: sparse map of expression name -> 0..1. Absent means zero.
  expressions: {},

  // Pose
  poseName: DEFAULT_POSE,
  manualBones: {},

  // Conversational state. The host application drives this — it is the one key
  // in the store that is meant to be written from outside the control panel.
  conversationState: DEFAULT_CONVERSATION_STATE,

  // Animation clip
  // Which .vrm is loaded. Changing it tears down the model and rebuilds it.
  modelUrl: MODEL_URL,

  // The carousel's running order: model urls, as /api/models returns them.
  //
  // Shared rather than fetched twice because two unrelated things need it and
  // need it to AGREE: the buttons, to know where they point, and VrmAvatar, to
  // know which neighbours to prefetch. Two fetches could not disagree today,
  // but a ring the avatar prefetches against and a ring the buttons step
  // through are the same ring by intent, and saying so here is cheaper than
  // discovering later that they drifted.
  //
  // Empty until something fetches it, which makes both buttons inert. That is
  // the correct cold-start behaviour: there is nowhere to go until we know
  // where we are.
  modelRing: [],

  // An in-flight carousel transition, or null when she is settled on her mark.
  //
  //   { targetUrl, direction, startedAt }
  //
  // `modelUrl` deliberately does NOT change when the buttons are pressed. It
  // changes at the midpoint of this transition, on an empty stage — swapping on
  // the press would tear the current model out from under its own exit
  // animation, which is the pop the transition exists to hide. So during a
  // transition these two disagree, and that disagreement IS the feature.
  //
  // Read transiently from the frame loop via getState(), per invariant 2. The
  // buttons subscribe, because they have to disable while one is running.
  carousel: null,

  // World height of the loaded model's head bone. Written by VrmAvatar once the
  // model is up, and read by the camera rig to frame her the same way whatever
  // her height is. null until something has loaded.
  modelHeadY: null,

  // Whether she has yet to make her entrance.
  //
  // Set when the first model lands on the production surface and cleared when
  // the greeting finishes. While it is true the clip that is pending plays at
  // FULL WEIGHT from its first frame and she is not rendered until it does —
  // the greeting opens in a crouch, and fading into that from a standing idle
  // pose read as her sinking before she leapt. See arrivalHidesModel.
  arriving: false,

  clipUrl: null,
  clipWeight: 1,

  // Idle — on/off plus the tunable parameters for each behaviour.
  idle: {
    blink: true,
    blinkIntervalMin: DEFAULTS.blinkIntervalMin,
    blinkIntervalMax: DEFAULTS.blinkIntervalMax,
    breathe: true,
    breathAmplitude: DEFAULTS.breathAmplitude,
    breathRate: DEFAULTS.breathRate,
    drift: true,
    driftAmplitude: DEFAULTS.headDriftAmplitude,
    driftSpeed: DEFAULTS.headDriftSpeed,
    lookAt: true,

    // Weight sway: the whole-body chain that stops the head drifting on a
    // rigid torso. Of everything in this slice, turning this off is the most
    // visible loss.
    sway: true,
    swayAmplitude: DEFAULTS.swayAmplitude,
    swaySpeed: DEFAULTS.swaySpeed,

    // Eye saccades plus partial head follow. Requires lookAt to do anything.
    gaze: true,
    gazeIntervalMin: DEFAULTS.gazeIntervalMin,
    gazeIntervalMax: DEFAULTS.gazeIntervalMax,
    gazeAmount: DEFAULTS.gazeAmount,
    gazeHeadFollow: DEFAULTS.gazeHeadFollow,
    gazeJitterAmount: DEFAULTS.gazeJitterAmount,
    checkInIntervalMin: DEFAULTS.checkInIntervalMin,
    checkInIntervalMax: DEFAULTS.checkInIntervalMax,

    // Resting finger curl. Spans negative because the curl axis is derived
    // rather than measured — see relaxedHandPose in postures.js.
    handRelax: DEFAULTS.handRelax,

    // A trace of expression on the resting face, faded out while speaking.
    restingWarmth: DEFAULTS.restingWarmth,

    // Head motion on the rhythm of speech, active only while speaking.
    speechEmphasis: true,
    speechEmphasisAmplitude: DEFAULTS.speechEmphasisAmplitude,

    // Shifting weight between feet. The slowest behaviour in the system.
    weightShift: true,
    weightIntervalMin: DEFAULTS.weightIntervalMin,
    weightIntervalMax: DEFAULTS.weightIntervalMax,

    // Occasional idle actions, the way game characters have them. Suppressed
    // while speaking.
    gestures: true,
    gestureIntervalMin: DEFAULTS.gestureIntervalMin,
    gestureIntervalMax: DEFAULTS.gestureIntervalMax,

    // Drifting between the resting presets on its own.
    poseShift: true,
    poseIntervalMin: DEFAULTS.poseIntervalMin,
    poseIntervalMax: DEFAULTS.poseIntervalMax,
  },

  // A one-shot request to play a named gesture now. The timestamp is what makes
  // it fire: the render loop compares it against the last one it acted on, so
  // asking for the same gesture twice in a row still triggers twice.
  gestureRequest: null,

  // Stage: lighting and camera framing, live-tunable for the same reason the
  // pose values are — these are numbers you judge by eye, not by arithmetic.
  lighting: { ...DEFAULTS.lighting },
  framing: DEFAULT_FRAMING,

  // Debug readout, written from the render loop
  debug: { weights: {}, fps: 0 },
};

/**
 * Every control value in one store.
 *
 * The render loop reads this *transiently* via useAvatarStore.getState() inside
 * useFrame rather than subscribing, so dragging a slider mutates a value the
 * loop already reads each frame without triggering React reconciliation of the
 * Canvas subtree. Only the control panel subscribes reactively.
 */
export const useAvatarStore = create((set) => ({
  ...initialState,

  /**
   * Say something out loud. This is the host application's speech interface.
   *
   *   useAvatarStore.getState().say('Here is what I found.');
   *
   * One call does everything: chunking, synthesis, gapless playback, the mouth,
   * and ending the speaking state when the sound stops. Calling it again
   * interrupts whatever is running — barge-in is just the next say().
   *
   * It never throws. If no voice is configured, or the browser has not had a
   * user gesture yet, she mouths the words silently instead and `speechStatus`
   * says which. A companion that mouths a reply it cannot voice is a much
   * better failure than one that stands frozen while the chat shows text.
   *
   * There is no need to set conversationState around it: an active utterance
   * already wins over the store's state inside the frame loop, so the mouth and
   * the posture cannot disagree.
   */
  say: (text) => {
    const { modelUrl, rate, voiceEnabled, sentencePauseMs } = useAvatarStore.getState();

    // The voice follows the model. A character is a body and a voice, not a
    // body plus a setting — see MODEL_NAMES in constants.js. A model with no
    // mapping falls through to the provider's env default rather than failing.
    const voice = modelVoiceForUrl(modelUrl);
    // Deliberately not awaited. The engine reports progress through the sink
    // below, and a host that had to await speech would be blocked for the
    // length of the sentence.
    void speechEngine.say(text, {
      voice: voice ?? undefined,
      rate,
      // Muted goes straight to the silent path rather than synthesising and
      // discarding the audio — no request, no cost, no latency.
      sentencePauseMs,
      silent: !voiceEnabled,
    });
  },

  /**
   * Drive the mouth from a pre-built timeline, with no audio.
   *
   * The original interface, kept and still used by the silent fallback and by
   * the workbench. `say()` is what a host application wants; this is for when
   * you already have a timeline and want it played verbatim.
   */
  speak: (timeline) =>
    set({ timeline, speechStartedAt: performance.now() }),

  /**
   * Stop talking now — the Stop button, or barge-in when the user starts
   * typing over her.
   *
   * Routed through the engine rather than just clearing the flag, because the
   * flag is not what makes a sound: scheduled audio buffers keep playing until
   * something stops them. The engine tears down in-flight requests and
   * scheduled sources, then calls back into `onEnd` below to clear this flag —
   * which is why this action does not clear it itself and cannot recurse.
   */
  stopSpeaking: () => speechEngine.stop(),

  /**
   * Turn her voice on or off.
   *
   * Switching it off mid-sentence stops her rather than muting and letting the
   * mouth run on: continuing would mean rebuilding the timeline against a clock
   * that no longer exists, and a character who keeps mouthing after you hit
   * mute reads as a bug rather than as a feature.
   */
  setVoiceEnabled: (voiceEnabled) => {
    if (!voiceEnabled && useAvatarStore.getState().speechStartedAt !== null) {
      speechEngine.stop();
    }
    set({ voiceEnabled });
  },

  setStiffness: (stiffness) => set({ stiffness }),
  setSentencePause: (sentencePauseMs) => set({ sentencePauseMs }),
  setRate: (rate) => set({ rate }),

  setExpression: (name, value) =>
    set((state) => ({ expressions: { ...state.expressions, [name]: value } })),

  resetExpressions: () => set({ expressions: {} }),

  setPose: (poseName) => set({ poseName }),

  setConversationState: (conversationState) => set({ conversationState }),

  playGesture: (name) => set({ gestureRequest: { name, at: performance.now() } }),

  // The first edit to a bone seeds from whatever the active preset already has
  // it at, so nudging one axis does not silently zero the other two. Seeding
  // from ZERO instead makes the limb jump the instant a slider is touched,
  // which defeats the drag-then-"Copy pose JSON" authoring loop the Pose tab
  // exists for. Bones the preset does not mention still start at zero.
  setBone: (name, axis, value) =>
    set((state) => {
      const seed = state.manualBones[name]
        ?? POSES[state.poseName]?.[name]
        ?? ZERO;
      return {
        manualBones: {
          ...state.manualBones,
          [name]: { ...ZERO, ...seed, [axis]: value },
        },
      };
    }),

  clearBone: (name) =>
    set((state) => {
      const next = { ...state.manualBones };
      delete next[name];
      return { manualBones: next };
    }),

  clearAllBones: () => set({ manualBones: {} }),

  /**
   * Change who is on stage.
   *
   * Stops her first, because the voice belongs to the model: letting an
   * utterance finish through the swap would leave the previous character's
   * voice coming out of the new one's body for the rest of the sentence.
   */
  setModel: (modelUrl) => {
    if (useAvatarStore.getState().speechStartedAt !== null) speechEngine.stop();
    set({ modelUrl });
  },

  setModelHeadY: (modelHeadY) => set({ modelHeadY }),

  /**
   * Begin moving to another model.
   *
   * Ignored if one is already running. A carousel that queues presses looks
   * broken in a specific way: you press twice, watch one transition, and the
   * second fires afterwards at a moment you have stopped expecting it. Dropping
   * the extra press is the honest behaviour — the button is visibly disabled
   * while she is moving.
   *
   * Note what this does NOT do: set modelUrl. See the `carousel` key above.
   *
   * @param {string} targetUrl who to bring on
   * @param {number} direction +1 if the user asked for the next model, -1 for previous
   */
  startCarousel: (targetUrl, direction) => {
    if (!targetUrl) return;
    if (useAvatarStore.getState().carousel) return;
    set({ carousel: { targetUrl, direction, startedAt: performance.now() } });
  },

  /** She is back on her mark. */
  endCarousel: () => set({ carousel: null }),

  setModelRing: (modelRing) => set({ modelRing }),

  setClip: (clipUrl) => set({ clipUrl }),

  /**
   * Begin or end the entrance.
   *
   * Every path that could leave this true forever has to clear it, because the
   * cost of getting that wrong is an avatar nobody can see. It is cleared when
   * the greeting ends, and when the greeting fails to load at all.
   */
  setArriving: (arriving) => set({ arriving }),
  setClipWeight: (clipWeight) => set({ clipWeight }),

  setIdle: (key, value) =>
    set((state) => ({ idle: { ...state.idle, [key]: value } })),

  setLighting: (key, value) =>
    set((state) => ({ lighting: { ...state.lighting, [key]: value } })),

  setFraming: (framing) => set({ framing }),

  setDebug: (partial) =>
    set((state) => ({ debug: { ...state.debug, ...partial } })),

  resetAll: () => {
    speechEngine.stop();
    set({ ...initialState, expressions: {}, manualBones: {} });
  },
}));

/**
 * Hand the engine its write access to the store.
 *
 * Done here, once, at module load — and in this direction only. The store
 * imports the engine; the engine imports nothing from the store. That is what
 * keeps the dependency acyclic, and it is worth the small indirection: a cycle
 * between a zustand store and a module singleton resolves differently depending
 * on which one the bundler happens to evaluate first, which is the kind of bug
 * that appears only in a production build.
 *
 * Every callback writes state directly rather than calling an action, so
 * `stopSpeaking` -> `engine.stop()` -> `onEnd` cannot loop back into itself.
 */
speechEngine.configure({
  onTimeline: (timeline) => useAvatarStore.setState({ timeline }),

  // The wall-clock stamp still marks "she is speaking" and still drives the
  // silent path. While audio is playing the frame loop prefers the engine's
  // audio clock over it — see VrmAvatar.
  onStart: () => useAvatarStore.setState({ speechStartedAt: performance.now() }),

  onEnd: () => useAvatarStore.setState({ speechStartedAt: null }),

  onStatus: ({ state, error }) =>
    useAvatarStore.setState({ speechStatus: { state, error: error ?? null } }),
});
