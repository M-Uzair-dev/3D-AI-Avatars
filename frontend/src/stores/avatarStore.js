import { create } from 'zustand';
import { DEFAULTS } from '@/lib/constants.js';
import { DEFAULT_POSE } from '@/lib/poses.js';

const ZERO = { x: 0, y: 0, z: 0 };

const initialState = {
  // Speech
  timeline: [],
  speechStartedAt: null,

  // Tuning
  stiffness: DEFAULTS.stiffness,
  rate: DEFAULTS.rate,

  // Expressions: sparse map of expression name -> 0..1. Absent means zero.
  expressions: {},

  // Pose
  poseName: DEFAULT_POSE,
  manualBones: {},

  // Animation clip
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
  },

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

  speak: (timeline) =>
    set({ timeline, speechStartedAt: performance.now() }),

  stopSpeaking: () => set({ speechStartedAt: null }),

  setStiffness: (stiffness) => set({ stiffness }),
  setRate: (rate) => set({ rate }),

  setExpression: (name, value) =>
    set((state) => ({ expressions: { ...state.expressions, [name]: value } })),

  resetExpressions: () => set({ expressions: {} }),

  setPose: (poseName) => set({ poseName }),

  setBone: (name, axis, value) =>
    set((state) => ({
      manualBones: {
        ...state.manualBones,
        [name]: { ...ZERO, ...state.manualBones[name], [axis]: value },
      },
    })),

  clearBone: (name) =>
    set((state) => {
      const next = { ...state.manualBones };
      delete next[name];
      return { manualBones: next };
    }),

  clearAllBones: () => set({ manualBones: {} }),

  setClip: (clipUrl) => set({ clipUrl }),
  setClipWeight: (clipWeight) => set({ clipWeight }),

  setIdle: (key, value) =>
    set((state) => ({ idle: { ...state.idle, [key]: value } })),

  setDebug: (partial) =>
    set((state) => ({ debug: { ...state.debug, ...partial } })),

  resetAll: () => set({ ...initialState, expressions: {}, manualBones: {} }),
}));
