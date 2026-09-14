/**
 * Body-wide procedural motion: weight sway, a breath that travels, and gaze.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------
 * idleMath.js moves the head and the chest. Nothing else in the rig ever moves.
 * That is worse than total stillness, because a head drifting on a rigid torso
 * reads as a bobblehead — the viewer's eye picks up that exactly one part is
 * animated and the illusion collapses.
 *
 * Aliveness is not amplitude. It is COUPLING and LAG. A real body is a chain:
 * the hips shift, the spine counters to keep the head level, the shoulders
 * counter again, and the arms arrive last because they are hanging. Every link
 * is late by a few tens of milliseconds. That lag is the entire effect. Drive
 * every bone from the same sine with the same phase and you get a mannequin on
 * a boat — all parts moving in lockstep, which is a different kind of wrong.
 *
 * Everything here is a pure function of time. No React, no three.js, no clock
 * of its own — the caller owns the clock. That is what keeps it testable.
 */

/**
 * The sway oscillator: two incommensurable sines, normalized to roughly +/-1.
 *
 * Same trick as driftDeltas — the frequency ratio is irrational enough that the
 * pattern never visibly repeats, which is all a noise library would have bought
 * us at this amplitude.
 */
function swayPhase(tSec, speed) {
  const t = tSec * speed;
  return (Math.sin(t * 0.7) + Math.sin(t * 0.31 + 1.3) * 0.6) / 1.6;
}

/**
 * Weight sway propagating up the chain, each link later than the one below it.
 *
 * The counter-rotation is what makes it read as balance rather than as swaying.
 * When the hips roll one way the spine and chest roll BACK (note the negated
 * coefficients), which is what a body does to keep its head over its feet. Skip
 * the counter and the whole torso tips like a felled tree.
 *
 * Arms take the doubled lag and share the SAME sign on z, which looks wrong on
 * paper and is right in practice: z is mirrored between the arms, so one signed
 * value raises the left arm while lowering the right — exactly what a roll
 * does to a pair of hanging arms.
 *
 * @param {number} tSec seconds since start
 * @param {number} amplitude radians at the hips; every other link is a fraction
 * @param {number} speed multiplier on the oscillator
 * @param {number} lagSec how late each link is relative to the one below
 * @returns {Record<string, {x:number,y:number,z:number}>}
 */
export function swayDeltas(tSec, amplitude, speed, lagSec = 0.35) {
  if (!amplitude) return {};

  const w = swayPhase(tSec, speed);
  const w1 = swayPhase(tSec - lagSec, speed);
  const w2 = swayPhase(tSec - lagSec * 2, speed);
  const a = amplitude;

  return {
    hips: { x: 0, y: w * a * 0.55, z: w * a },
    spine: { x: 0, y: -w1 * a * 0.3, z: -w1 * a * 0.45 },
    chest: { x: 0, y: -w1 * a * 0.22, z: -w1 * a * 0.3 },
    // Shoulders trail the chest and stay very small; shoulder bones have short
    // lever arms and a little rotation travels a long way down to the hand.
    leftShoulder: { x: 0, y: 0, z: w2 * a * 0.18 },
    rightShoulder: { x: 0, y: 0, z: w2 * a * 0.18 },
    leftUpperArm: { x: 0, y: w2 * a * 0.5, z: w2 * a * 0.55 },
    rightUpperArm: { x: 0, y: w2 * a * 0.5, z: w2 * a * 0.55 },
    // The head gets a small counter so it stays roughly level through the sway.
    // Without this the sway drags the face around and you notice the machinery.
    neck: { x: 0, y: 0, z: -w1 * a * 0.2 },
  };
}

/**
 * Shifting weight from one foot to the other.
 *
 * Contrapposto fixes the mannequin problem but creates a smaller one: a body
 * that holds the SAME asymmetry forever is still a held shape. Nobody stands on
 * one leg for ten minutes. Every twenty seconds or so a real person rolls their
 * weight across to the other foot, and it is a whole-body event — the pelvis
 * tips the other way, the spine re-curves, the shoulder line inverts.
 *
 * The maths is a negation, not a second pose. The base asymmetry is authored
 * for weight on her LEFT leg; standing on the right is that exact shape
 * mirrored, and mirroring a roll or a yaw is just flipping its sign.
 *
 *   side = +1  weight left, as authored   -> delta 0
 *   side = -1  weight right, mirrored     -> delta -2 x base
 *
 * so `delta = base * (side - 1)` covers both ends and every eased point
 * between. Pitch (x) is deliberately excluded: leaning forward stays leaning
 * forward regardless of which leg carries you, and flipping it would make her
 * rock backwards every time she shifted.
 *
 * @param {number} side -1..+1, where +1 is the pose as authored
 * @param {Record<string, {x:number,y:number,z:number}>} base the CONTRAPPOSTO
 * @param {number} scale how completely the shift mirrors; 1 is a full transfer
 */
export function weightShiftDeltas(side, base, scale = 1) {
  const factor = (side - 1) * scale;
  if (factor === 0) return {};

  const out = {};
  for (const [bone, rot] of Object.entries(base)) {
    out[bone] = { x: 0, y: rot.y * factor, z: rot.z * factor };
  }
  return out;
}

/**
 * Smootherstep — Perlin's variant, zero first AND second derivative at both
 * ends.
 *
 * Used for the weight shift specifically. Plain smoothstep still has a visible
 * kink in acceleration at the endpoints, and over a two-second move across the
 * whole body that kink is exactly the thing that reads as "animation" rather
 * than as someone getting comfortable.
 */
export function smootherstep(t) {
  const k = Math.max(0, Math.min(1, t));
  return k * k * k * (k * (k * 6 - 15) + 10);
}

/** The breath oscillator: 0 at rest, 1 at the top of a full breath. */
function breathWave(tSec, rate) {
  const p = Math.sin(tSec * rate * Math.PI);
  return p * p;
}

/**
 * Where in the breath she is, 0 to 1, for anything that wants to run ON the
 * breath rather than alongside it.
 *
 * 0 to 0.5 is the inhale, 0.5 to 1 the exhale. Exported because the alternative
 * is every layer that wants to sync to the breath keeping its own clock, and
 * two clocks that are supposed to agree eventually will not.
 */
export function breathPhase(tSec, rate) {
  const p = (tSec * rate) % 1;
  return p < 0 ? p + 1 : p;
}

/**
 * Breathing that travels beyond the chest.
 *
 * A chest bone rotating on its own is almost invisible on a clothed model. What
 * actually reads as breath is the shoulders rising a little and the head
 * floating on top of it, because those silhouette edges are against the
 * background where the eye can see them move.
 *
 * The shoulders lag the chest slightly — the ribcage leads, the shoulders ride.
 */
export function breathChain(tSec, amplitude, rate) {
  if (!amplitude) return {};

  // Squared, which makes it UNIPOLAR: the breath runs from rest upward and
  // never below. The plain sine this replaced spent half of every cycle
  // rotating the chest BACKWARDS past the pose, which is not something a
  // resting body does — quiet breathing starts from empty and comes back to
  // it. Rest is the floor of the cycle, not its middle.
  //
  // Squaring also halves the travel for a given amplitude, which is why
  // DEFAULTS.breathAmplitude was doubled when this changed.
  const w = breathWave(tSec, rate);
  const wLag = breathWave(tSec - 0.18, rate);

  return {
    chest: { x: amplitude * w, y: 0, z: 0 },
    spine: { x: -amplitude * 0.25 * w, y: 0, z: 0 },
    leftShoulder: { x: 0, y: 0, z: -wLag * amplitude * 0.5 },
    rightShoulder: { x: 0, y: 0, z: wLag * amplitude * 0.5 },
    head: { x: -wLag * amplitude * 0.2, y: 0, z: 0 },
  };
}

/**
 * Head motion while speaking.
 *
 * A pose cannot carry `speaking` on its own, because speaking is not a shape —
 * it is a behaviour. People move their heads constantly while they talk, on the
 * rhythm of what they are saying, and a head that holds still through a
 * sentence is the single most obvious tell that something is being played back
 * rather than said.
 *
 * Faster than every other oscillator here: speech head motion sits around
 * 1-3 Hz, where sway is 0.2 and breath 0.25. That gap in TEMPO is what makes
 * the state read even before the shape registers.
 *
 * This works against the original decision to quiet idle motion during speech.
 * That decision was half right — undirected drift does compete with the mouth,
 * so it stays damped — but the answer was never stillness. It was motion of a
 * different kind, which is what this adds back.
 */
export function speechEmphasis(tSec, amplitude) {
  if (!amplitude) return {};

  const p = (f, phase) => Math.sin(tSec * f + phase);
  const a = amplitude;

  return {
    head: {
      x: (a * (p(2.9, 0) + p(4.7, 1.3) * 0.5)) / 1.5,
      y: (a * 1.2 * (p(2.1, 2.2) + p(3.7, 0.4) * 0.5)) / 1.5,
      z: a * 0.4 * p(1.7, 1.9),
    },
    // The torso joins in at a quarter of the amplitude. Speech emphasis starts
    // below the neck — people lean into a point — and a head bobbing alone on a
    // still body is the bobblehead problem again, in miniature.
    chest: { x: a * 0.25 * p(2.3, 0.7), y: a * 0.3 * p(1.9, 2.6), z: 0 },
  };
}

// ---------------------------------------------------------------------------
// GAZE
// ---------------------------------------------------------------------------

/**
 * Saccade easing.
 *
 * Real eye movements are ballistic: they launch fast and arrive slowly, and
 * they are FAST — a full saccade is 30-80ms, which at 60fps is two to five
 * frames. Damping the eyes exponentially the way the mouth is damped produces
 * a slow glide that reads as sedated. This curve is why the eyes snap and the
 * head follows rather than everything sliding together.
 *
 * Cubic ease-out, clamped.
 */
export function saccadeEase(t) {
  const k = Math.max(0, Math.min(1, t));
  return 1 - (1 - k) ** 3;
}

/**
 * Where the eyes should go next, as a yaw/pitch offset in radians.
 *
 * Two behaviours share one function, because the difference between them is
 * the whole point:
 *
 *   engaged  — small offsets clustered near the viewer. The eyes wander around
 *              a face rather than locking on a point; a perfectly fixed stare
 *              is the single creepiest thing an avatar can do, and it is what
 *              you get from naive camera tracking.
 *   averted  — a large offset, biased up and to one side. This is the "looking
 *              into the middle distance" of someone thinking. Sustained eye
 *              contact during silence reads as staring; breaking it is what
 *              makes a pause read as thought.
 *
 * @param {boolean} averted whether to break contact
 * @param {number} amount scale on the offset, in radians
 * @param {() => number} rng injectable for tests; defaults to Math.random
 */
export function pickGazeOffset(averted, amount, rng = Math.random) {
  if (averted) {
    // Up and off to one side. Down-and-away reads as evasive rather than
    // thoughtful, so the pitch is biased upward — and POSITIVE is upward here,
    // because the caller adds pitch to the look target's height.
    //
    // This was negative until the work gaze was added, so the avert had been
    // looking DOWN in contradiction of the sentence above it. Nothing caught it
    // because the comment and the code were only ever read together, and both
    // sounded right. It surfaced the moment a second gaze behaviour needed to
    // point the OTHER way and a test compared the two directions — a difference
    // between two things is checkable in a way that one thing's correctness is
    // not.
    const side = rng() < 0.5 ? -1 : 1;
    return {
      yaw: side * amount * (1.6 + rng() * 1.2),
      pitch: amount * (0.8 + rng() * 0.9),
    };
  }

  return {
    yaw: (rng() * 2 - 1) * amount,
    pitch: (rng() * 2 - 1) * amount * 0.6,
  };
}

/**
 * Gaze for a long task: down, and staying down.
 *
 * This is the single strongest signal that separates `working` from `thinking`,
 * and it is a direction rather than a shape. Both states break eye contact, but
 * they break it differently and people read the difference without being told:
 *
 *   UP and briefly   — retrieving something. The middle-distance look of a
 *                      person about to answer you. That is `thinking`.
 *   DOWN and staying — absorbed in something in front of them. That is working,
 *                      and sustained downward gaze is the clearest way a body
 *                      says "you do not need to wait on me".
 *
 * The yaw wanders a little wider than idle because eyes working over something
 * move across it, while eyes resting on a face stay near the middle.
 *
 * @param {number} amount the same base scale idle gaze uses
 */
export function pickWorkGazeOffset(amount, rng = Math.random) {
  return {
    yaw: (rng() * 2 - 1) * amount * 1.3,
    // Well below the horizon. The multiplier is large because `amount` is tuned
    // for wandering around a face, and this is looking at a different thing
    // entirely rather than a bigger version of the same thing.
    pitch: -amount * (2.6 + rng() * 1.4),
  };
}

/**
 * Microsaccades: the small, constant tremor underneath the big flicks.
 *
 * The gaze scheduler holds a point for one to two seconds and then flicks to
 * another. Between those flicks the eyes were PERFECTLY still, which is the one
 * thing real eyes never are — an eye fixating still drifts and corrects several
 * times a second, and its absence is a large part of why a rendered stare feels
 * dead even when the flicks are right.
 *
 * A time function rather than a scheduled target, unlike everything else about
 * gaze. There is no decision here to hold state for: it is a tremor, not a
 * behaviour, and the same summed-incommensurable-sines trick that drives head
 * drift gives a signal that never visibly repeats for free.
 *
 * Eyes only, deliberately. The head does NOT follow this — a head that tracks
 * microsaccades is a head with a tremor. The caller applies this after taking
 * the head's share of the gaze.
 */
export function gazeJitter(tSec, amount) {
  if (!amount) return { yaw: 0, pitch: 0 };

  // Around 1-2 Hz, which is the real rate of fixational correction and roughly
  // five times anything else in this module. That gap is the point.
  const t = tSec;
  return {
    yaw: (amount * (Math.sin(t * 7.3) + Math.sin(t * 11.9 + 2.1) * 0.5)) / 1.5,
    pitch: (amount * (Math.sin(t * 9.1 + 0.7) + Math.sin(t * 13.7 + 3.4) * 0.5)) / 1.5,
  };
}

/**
 * Interpolate a saccade in progress.
 *
 * @returns {{yaw:number, pitch:number}} the gaze offset at this instant
 */
export function sampleGaze(from, to, elapsedMs, durationMs) {
  const k = saccadeEase(durationMs > 0 ? elapsedMs / durationMs : 1);
  return {
    yaw: from.yaw + (to.yaw - from.yaw) * k,
    pitch: from.pitch + (to.pitch - from.pitch) * k,
  };
}

/**
 * The head's share of a gaze shift.
 *
 * Eyes lead, head follows, and the head only follows PART of the way. This is
 * a real and very visible property of how people look at things: for a small
 * shift the head barely moves, and for a large one it takes maybe a quarter of
 * the angle. Driving the head 1:1 with the eyes looks robotic; not driving it
 * at all looks like the eyes are loose in the skull.
 */
export function headFollowDelta(gaze, follow) {
  if (!follow) return { x: 0, y: 0, z: 0 };
  return {
    // Positive yaw is her left, and positive head y is her left too, so this
    // passes straight through.
    y: gaze.yaw * follow,
    // Positive pitch is upward gaze; positive head x tips the chin DOWN, so
    // this one inverts.
    x: -gaze.pitch * follow,
    // A tiny roll along with a big turn. Heads do not yaw on a perfect axis.
    z: gaze.yaw * follow * 0.15,
  };
}
