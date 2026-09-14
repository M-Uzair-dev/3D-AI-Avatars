// The model the app opens with, and the clip she opens with.
//
// CHOSEN BY EYE. That matters, because it closes the oldest open question in
// the project: every previous default was picked for its LICENCE and nobody had
// compared the eight on screen. Rin was picked by looking at them.
//
// The licence filter still applies and still comes first — every model in
// public/ declares that commercial use is permitted, which is what the host app
// needs. Rin is one of AnimeFreak's FREE series, whose own metadata spells out
// `corporate_commercial_use=allow`, `modification=allow`,
// `redistribution=allow`, `credit=unnecessary`.
//
// WHAT THIS DOES NOT SETTLE. Every hand-on-body value in poses.js and
// gestures.js was measured against `kitsaki.vrm`, which was deleted for being
// non-commercial. Those are measurements of a rig that is no longer in the
// repo, and they depend on limb proportions rather than bone names — so nothing
// throws, the hands are simply in the wrong place. Now that there IS a settled
// model, re-measuring them against her is worth doing once rather than twice.
// See docs/06-poses-and-rig.md.
export const MODEL_URL = '/free-2.vrm';

/**
 * What she does when she first appears.
 *
 * She arrives mid-greeting rather than simply being there. A character who is
 * already standing in position the instant the page paints reads as an asset
 * that finished loading; one who waves hello reads as someone who just walked
 * in, and this avatar's whole job is to be the second thing.
 *
 * Fired once, on the first model to land, and only on the production surface —
 * the workbench is a tool and a tool that starts playing animations at you is
 * a tool fighting you.
 *
 * Null would be a valid value here and means "just appear".
 */
export const GREETING_CLIP = '/animations/VRMA_02.vrma';

/**
 * Human names for the official pixiv VRoid motion pack, which ships its clips
 * as VRMA_01..07 and puts the names in a readme. VRMA_04 ("Shoot") was deleted
 * from the project and its entry went with it, which is why this table has a
 * hole in it rather than a gap someone forgot to fill.
 *
 * A filename is not a label, and "VRMA_04" tells you nothing about whether you
 * want to watch it. Unknown clips fall back to their filename, so dropping any
 * other .vrma into public/animations/ still works with no edit here.
 */
export const VRMA_LABELS = {
  VRMA_01: 'Show full body',
  VRMA_02: 'Greeting',
  VRMA_03: 'Peace sign',
  VRMA_05: 'Spin',
  VRMA_06: 'Model pose',
  VRMA_07: 'Squat',
};

/** What to call a clip file in the panel. */
export function clipLabel(file) {
  const stem = file.replace(/\.vrma$/i, '');
  return VRMA_LABELS[stem] ?? stem;
}

/**
 * Human names for the models, and a one-line note on how each one looks.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS TABLE EXISTS
 * ---------------------------------------------------------------------------
 * The files declare almost nothing usable. Five of the eight call themselves
 * "FREE", "FREE 2", "FREE 3", "FREE 5" and "FREE 6" (all by AnimeFreak), two
 * declare no name or author at all, and only `haishin-chan` carries a real one.
 * `modelLabel` faithfully surfaces that, which is correct for the dev panel —
 * it is reporting what the asset says about itself — and useless in a product,
 * where "FREE 5" tells you nothing about whether you want to look at her.
 *
 * So these names were assigned by LOADING EACH MODEL AND LOOKING AT IT, not by
 * reading the filenames. That matters for the same reason it matters everywhere
 * else in this project: the filename is not the asset. `untitled-6` and
 * `untitled-7` sort as if they were unrelated and are in fact the same bunny
 * girl in two outfits, which you cannot know without rendering both.
 *
 * `blurb` is the disambiguator, not decoration — two pairs here are the same
 * character twice, and the note is what tells them apart in a menu.
 *
 * Adding a model without adding a row still works: it falls back to whatever
 * the file declares about itself.
 */
export const MODEL_NAMES = {
  'free-1.vrm': { name: 'Sakura', blurb: 'Pink hair, cat ears, white coat', voice: 'elevenlabs:FGY2WhTYpPnrIDTdsKH5', palette: ['#ff8fb8', '#ffffff'] },
  'free-2.vrm': { name: 'Rin', blurb: 'Purple hair, red eyes, school uniform', voice: 'elevenlabs:XiPS9cXxAVbaIWtGDHDh', voiceFallback: 'elevenlabs:pFZP5JQG7iQjIQuC4Bku', palette: ['#7c3aed', '#e23d4c'] },
  'free-3.vrm': { name: 'Hana', blurb: 'Brown hair, pink hoodie, headband', voice: 'elevenlabs:BZgkqPqms7Kj9ulSkVzn', voiceFallback: 'elevenlabs:EXAVITQu4vr4xnSDxMaL', palette: ['#ffb6ce', '#8a5a3b'] },
  'free-5.vrm': { name: 'Yoru', blurb: 'Black twintails, striped dress', voice: 'elevenlabs:n7534fCgBXcPEM82JQYu', voiceFallback: 'elevenlabs:Xb7hH8MSUJpSbSDYk0k2', palette: ['#5b21b6', '#f2f0ff'] },
  'free-6.vrm': { name: 'Kuro', blurb: 'As Yoru, with skull cuffs', voice: 'elevenlabs:XrExE9yKIg1WjnnlVkGX', palette: ['#dc2626', '#f5f5f5'] },
  'haishin-chan.vrm': { name: 'Momiji', blurb: 'Lilac hair, cat ears, red apron dress', voice: 'elevenlabs:cgSgspJ2msm6clMCkdW9', palette: ['#e0344b', '#ffb3c7', '#f7c9b0'] },
  'untitled-6.vrm': { name: 'Yuki', blurb: 'Lavender bob, bunny ears', voice: 'elevenlabs:hpp4J3VqNfWAUOO0d1Us', palette: ['#8b5cf6', '#ffc2de', '#e04a5f'] },
  'untitled-7.vrm': { name: 'Mio', blurb: 'As Yuki, with a beret', voice: 'elevenlabs:bIHbv24MWmeRgasZH58o', palette: ['#8b5e3c', '#1a1a1f'] },
};

/**
 * Which voice each model speaks in.
 *
 * ---------------------------------------------------------------------------
 * WHY THE VOICE BELONGS TO THE MODEL
 * ---------------------------------------------------------------------------
 * A character is a body and a voice, not a body plus a setting. Leaving the two
 * independently selectable let you put a sixty-year-old broadcaster behind a
 * pink-haired cat-eared avatar, which is not a configuration anyone wants and
 * is a menu everyone has to think about. Switching the model now switches the
 * voice with it, and there is no second control to keep in agreement.
 *
 * The ids are ElevenLabs' and were read off the account rather than guessed —
 * `/api/voices` lists them, which is now the way to find an id when changing a
 * row here. The genders and ages in the comments below are the labels the
 * voices are published with, not impressions.
 *
 *   Sakura   Laura      premade   young · sassy               pink hair, cat ears
 *   Rin      Brittney   LIBRARY   american · young · cute     cool, red eyes, uniform
 *   Hana     Eve        LIBRARY   american · young · upbeat   casual, hoodie
 *   Yoru     Pipi       LIBRARY   japanese · cute · anime     night, twintails
 *   Kuro     Matilda    premade   american · upbeat            Yoru's louder twin
 *   Momiji   Jessica    premade   young · cute · warm         the default companion
 *   Yuki     Bella      premade   bright · warm                soft, bunny ears
 *   Mio      Will       premade   MALE · young · chill         the one male voice here
 *
 * ---------------------------------------------------------------------------
 * WHY THREE ROWS CARRY A FALLBACK AND FIVE DO NOT
 * ---------------------------------------------------------------------------
 * Rin, Hana and Yoru speak in **Voice Library** voices, chosen by ear. The
 * other five are **premade** — the 21 that come with any account, none of them
 * anime in character, which is the register this avatar actually wants.
 *
 * That difference is an availability difference, not a taste one. A premade
 * voice works on every plan and cannot be withdrawn; a Library voice depends on
 * the account's plan and on the voice still being published. This project has
 * already been bitten by exactly that: on the free plan all three returned
 * `402 paid_plan_required` at synthesis while looking perfectly normal in
 * `/v1/voices`, and the rows had to be reverted by hand. The account is on
 * Starter now and they work — but a lapsed plan, a downgrade or a voice pulled
 * from the Library puts it straight back, and the failure is a mute avatar.
 *
 * So each Library row names the premade voice it falls back to. `/api/tts`
 * retries once with it when — and only when — the provider says the *voice*
 * is unavailable. The three fallbacks are the premade voices these rows held
 * before the Library was open, and all three were confirmed `category:
 * 'premade'` on the account rather than recalled from the docs:
 *
 *   Rin  → Lily   pFZP5JQG7iQjIQuC4Bku   british · confident
 *   Hana → Sarah  EXAVITQu4vr4xnSDxMaL   american · young · professional
 *   Yoru → Alice  Xb7hH8MSUJpSbSDYk0k2   british · clear
 *
 * A premade row needs no fallback: there is nothing for it to fall back FROM.
 * Adding one would be a second id to keep correct for a failure that cannot
 * happen.
 *
 * > **Nobody has heard any of these against the models.** The three Library
 * > voices were picked by ear from the Library and confirmed to synthesise; the
 * > five premade ones are reasoned from published labels, which makes them a
 * > *derivation*, and this project's record on those is written into its
 * > invariants. One line each to change, by design.
 *
 * A model with no row falls back to the provider's env default, so dropping in
 * a new .vrm still speaks.
 */

/**
 * The voice for a model file, or null to let the server decide.
 *
 * @param {string} file filename, e.g. 'free-1.vrm'
 */
export function modelVoice(file) {
  return MODEL_NAMES[file]?.voice ?? null;
}

/** The voice for a model URL as the store holds it, e.g. '/free-1.vrm'. */
export function modelVoiceForUrl(modelUrl) {
  if (typeof modelUrl !== 'string') return null;
  return modelVoice(modelUrl.replace(/^\//, ''));
}

/**
 * The premade voice a model's Library voice falls back to, or null.
 *
 * Null is the ordinary answer, not an error: five of the eight rows speak in a
 * premade voice already and have nothing to fall back from.
 *
 * @param {string} file filename, e.g. 'free-2.vrm'
 */
export function modelVoiceFallback(file) {
  return MODEL_NAMES[file]?.voiceFallback ?? null;
}

/** The fallback voice for a model URL as the store holds it. */
export function modelVoiceFallbackForUrl(modelUrl) {
  if (typeof modelUrl !== 'string') return null;
  return modelVoiceFallback(modelUrl.replace(/^\//, ''));
}

/**
 * The fallback for a voice id, looked up by the id itself.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS KEYED ON THE VOICE AND NOT ON THE MODEL
 * ---------------------------------------------------------------------------
 * /api/tts is handed a voice id and nothing else — by design, since the
 * provider travels with the id so no second piece of state can disagree about
 * who is speaking. Sending the model alongside it would reintroduce exactly
 * that pair. So the fallback has to be reachable from the id, which is what
 * this reverse lookup is for.
 *
 * Built once at module load rather than per request: the table is eight rows
 * and never changes at runtime.
 *
 * @param {string|null|undefined} voiceId a qualified id, e.g. 'elevenlabs:XiPS9...'
 * @returns {string|null} the qualified fallback id, or null if there is none
 */
export function voiceFallbackFor(voiceId) {
  if (typeof voiceId !== 'string') return null;
  return VOICE_FALLBACKS.get(voiceId) ?? null;
}

const VOICE_FALLBACKS = new Map(
  Object.values(MODEL_NAMES)
    .filter((row) => row.voice && row.voiceFallback)
    .map((row) => [row.voice, row.voiceFallback]),
);

/**
 * What to call a model in the production picker.
 *
 * Falls back to the label the API derived from the file's own metadata, so a
 * newly dropped .vrm appears under its declared name rather than vanishing.
 *
 * @param {string} file filename, e.g. 'free-1.vrm'
 * @param {string} [declared] the label /api/models produced from the metadata
 */
export function modelName(file, declared) {
  return MODEL_NAMES[file]?.name ?? declared ?? file.replace(/\.vrm$/i, '');
}

/**
 * Each model's own colours, driving the backdrop she stands against.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BACKDROP IS HERS AND NOT THE APP'S
 * ---------------------------------------------------------------------------
 * The cyclorama was one fixed plum for everybody, tuned against whichever model
 * happened to be default at the time. With eight interchangeable characters
 * that stops being a lighting choice and becomes an accident: a pink-haired
 * character in a white coat and a black-twintailed one do not want the same
 * room behind them.
 *
 * The FIRST colour is the main one and lands in the centre of the bloom, behind
 * her head. The second is the mid-field. A third is stored but deliberately not
 * used by the backdrop — Momiji and Yuki have one, and it is there for the aura
 * idea that is still on the shelf.
 *
 * These are hair and outfit colours, so they arrive far too saturated to stand
 * a character in front of. globals.css mixes each one down toward `--void`
 * before it reaches a pixel, and the ratios live there rather than here on
 * purpose: how far to pull a colour back is a lighting decision, and this table
 * is only the hues.
 *
 * Mio's near-black second colour is the one that looks like a mistake in the
 * table and is not: it makes her mid-field fall away almost at once, which is
 * what a brown-and-black character wants behind her.
 *
 * @param {string} file filename, e.g. 'free-1.vrm'
 * @returns {string[]|null} hex colours, main first, or null with no row here
 */
export function modelPalette(file) {
  return MODEL_NAMES[file]?.palette ?? null;
}

/** The palette for a model URL as the store holds it, e.g. '/free-1.vrm'. */
export function modelPaletteForUrl(modelUrl) {
  if (typeof modelUrl !== 'string') return null;
  return modelPalette(modelUrl.replace(/^\//, ''));
}

/** The look note for a model, or null if it has no row here. */
export function modelBlurb(file) {
  return MODEL_NAMES[file]?.blurb ?? null;
}

export const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh'];

export const DEFAULTS = {
  /**
   * Silence held after a sentence before the next one begins, in ms.
   *
   * Synthesisers hurry a full stop — every one tried here has — and chunks used
   * to be scheduled back to back, so the gap between two sentences was exactly
   * zero. This is the beat that puts back. Clause and paragraph pauses scale
   * off it; see pauseAfterChunk in chunkText.js.
   *
   * Judged by ear, so it is live in the Speech tab rather than a constant. Pull
   * it down if she sounds ponderous; push it up if she still sounds rushed.
   */
  sentencePauseMs: 380,

  stiffness: 18,
  rate: 1,
  // Raised from 0.4. Damping undirected drift during speech is right — it does
  // compete with the mouth — but 0.4 made her visibly STILLER while talking,
  // which is backwards. Speech emphasis supplies directed motion instead.
  idleAttenuationWhileSpeaking: 0.7,
  // Blink interval. Longer than it looks like it should be: a human at rest
  // blinks every few seconds, and 2-6s read as nervous once the blink itself
  // stopped being a symmetric 120ms flick. The envelope and the double-blink
  // odds live in blink.js, which is where the shape is explained.
  blinkIntervalMin: 3000,
  blinkIntervalMax: 12000,
  headDriftAmplitude: 0.14, // 8 degrees
  headDriftSpeed: 0.35,
  // DOUBLED when breathing became unipolar. The old value was a half-travel
  // either side of rest; this one is the full travel UPWARD from rest, so the
  // visible movement is unchanged and the resting silhouette is not. If she
  // looks like she is heaving, this is the one number to pull down.
  breathAmplitude: 0.09, // ~5 degrees at the chest, at the top of a breath
  breathRate: 0.25,
  // Eased pose changes. 400 -> 900 -> 1800, and each raise was for the same
  // reason: a move she decides to make herself has to look considered. At 900
  // she still arrived at the new shape faster than a person would commit to it,
  // which reads as a snap rather than a decision — the giveaway being that you
  // notice the arrival rather than the movement.
  //
  // It also sets the lead-in and lead-out when a gesture stages through
  // `companion`, so raising it lengthens that whole sequence.
  poseTransitionMs: 1800,

  // How long a clip takes to fade in at its start and out at its end.
  //
  // Both ends, symmetrically. The clip used to be applied at full weight on the
  // first frame its action existed, which cut from the standing pose straight
  // to the clip's first frame — a visible jerk, and the only layer in the
  // system that did not ease. `clipEnvelope` in lib/clips.js is the shape.
  //
  // The fade-out runs inside the clip's own duration, so the last 600 ms of
  // recorded motion is traded for a seamless return. That is cheap: the tail of
  // a clip is a character settling back toward rest anyway.
  clipFadeMs: 600,

  /**
   * How long to hold an empty stage waiting for her entrance clip to start.
   *
   * She is not rendered until the greeting is driving her, so that nobody sees
   * her standing in an idle pose before it. That is right when the clip is
   * already cached and wrong the moment it is not: the model has finished
   * loading by then, the progress readout is gone, and what is left is a blank
   * lit room — which reads as broken much faster than a missing flourish does.
   *
   * Past this, she simply appears and the greeting eases in when it arrives.
   */
  arrivalWaitMs: 1200,

  // --- Carousel ----------------------------------------------------------
  /**
   * How the cast changes on the production bar.
   *
   * `hold` is the beat with NOBODY on stage, and it is the load-bearing one.
   * The camera is solved from the loaded model's own head height and CameraRig
   * snaps rather than eases, so a model of a different height arriving mid-arc
   * would yank the whole frame. On an empty stage that snap cannot be seen. It
   * is also the slack that absorbs a neighbour which has not finished parsing:
   * the clock is held here rather than letting the arc stutter.
   *
   * THERE IS NO `offsetX`, and that is the fix for the first bug this feature
   * had. It was 1.2 metres, which is INSIDE a frame that is 1.23m wide either
   * side of centre at bust framing — so the exit finished with her still at the
   * edge of shot. How far is far enough depends on the framing, the aspect
   * ratio and the mobile zoom, so it is computed from the live camera each
   * frame by `exitClearance` rather than written down here.
   *
   * `depth` is in metres, against a model roughly 1.4-1.6m tall.
   *
   * Unwatched. Every number here is a first guess and the whole thing is an eye
   * question; see docs/11-open-questions.md.
   */
  carousel: {
    exitMs: 450,
    holdMs: 120,
    enterMs: 550,
    depth: 0.9,
    // Roughly half a shoulder span, so an outstretched arm does not stay in
    // frame after the rest of her has left it.
    bodyHalfWidth: 0.45,
    // A little past merely gone: the tail of the easing curve is slow, and
    // landing exactly on the frame edge means she lingers there.
    clearMargin: 1.15,
  },

  // --- Aliveness ---------------------------------------------------------
  // Tuned for the "warm and calm" register: small amplitudes, long periods.
  // This avatar is meant to sit on screen for hours, and motion that reads as
  // charming in a ten-second demo becomes fatiguing at that duration. When in
  // doubt these numbers should go DOWN, not up.
  swayAmplitude: 0.026, // ~1.5deg at the hips, less at every link above
  swaySpeed: 0.22,
  swayLag: 0.35, // seconds each link trails the one below it

  handRelax: 0.26, // resting finger curl, radians at the knuckle

  // Weight shift. The slowest thing in the system on purpose: if you can
  // predict when the next one is due, it is firing far too often.
  weightIntervalMin: 14000,
  weightIntervalMax: 34000,
  weightShiftMs: 2100,

  // Idle gestures. Long gaps, because the charm is entirely in the surprise —
  // a head-scratch every eight seconds reads as a twitch, not a mood.
  gestureIntervalMin: 16000,
  gestureIntervalMax: 46000,

  // Drifting between resting poses. Rarer still than a gesture: this changes
  // her silhouette, which is the most noticeable thing a body can do, so it
  // should feel like a decision rather than a cycle.
  poseIntervalMin: 30000,
  poseIntervalMax: 90000,

  // Gaze. The interval is how long she holds one point before flicking to
  // another; the duration is the flick itself, which is deliberately far
  // shorter than anything else in this system because saccades really are
  // near-instant.
  gazeIntervalMin: 1400,
  gazeIntervalMax: 4200,
  gazeDuration: 90,
  gazeAmount: 0.06,
  gazeHeadFollow: 0.28,
  // Microsaccades under the flicks: the tremor of an eye holding a fixation.
  // A tenth of the wander, so it never competes with a real saccade. Zero is a
  // perfectly still eye, which is the effect this exists to remove.
  gazeJitterAmount: 0.006, // ~0.35 degrees

  // Odds that a gaze shift while thinking breaks contact entirely.
  gazeAvertChance: 0.75,

  // Head motion on the rhythm of speech. ~3 degrees.
  speechEmphasisAmplitude: 0.052,

  // While listening, the eyes settle ON the viewer: a smaller wander held for
  // longer. Attention is the whole content of the state, and wandering eyes
  // contradict the lean.
  listeningGazeScale: 0.45,
  listeningHoldScale: 1.7,

  // The check-in glance, while working. She looks up from the task, holds the
  // viewer for about a second, and goes back down.
  //
  // It is the state's progress indicator, and a better one than a spinner: it
  // says "still running" and "still yours" in the same beat, without any UI.
  // The interval has to stay long — a companion who keeps glancing up reads as
  // unable to concentrate, which is the opposite of the point.
  checkInIntervalMin: 20000,
  checkInIntervalMax: 40000,
  checkInDuration: 1100,

  // How `working` paces differently. It is a minutes-long state, and every
  // number here exists because something tuned for a short state is wrong over
  // that span: someone concentrating for minutes fidgets MORE, not less, and
  // breathes slower and deeper rather than faster.
  workingPace: {
    gestureScale: 0.55,
    weightScale: 0.7,
    breathRateScale: 0.8,
    breathAmplitudeScale: 1.15,
    // Concentration, not beaming. The resting face quiets down without going
    // blank.
    warmthScale: 0.55,
  },

  // A resting expression weight, so her neutral face is not stone. Fades out
  // while speaking — see the note on invariant 11 in VrmAvatar.
  //
  // At the slider's maximum. Worth knowing what that costs: on this VRM 0.x
  // model the expression it drives carries an override flag, so holding it this
  // high is the most likely thing in the system to interfere with the mouth.
  // The speech fade is what keeps that theoretical — if the visemes ever look
  // damped, this is the first number to pull down.
  restingWarmth: 0.6,

  // How long a conversational-state overlay takes to ease in. Raised from 550
  // to sit alongside the slower pose transition: a state change arriving in
  // half a second reads as a cut, and the states are held for long enough that
  // nothing is lost by taking the time. It is still well under the pose
  // transition, because a state is a change of attitude rather than a decision
  // to move.
  stateTransitionMs: 1400,

  // --- Stage -------------------------------------------------------------
  lighting: {
    // Ambient is kept very low on purpose. Ambient light adds equally to every
    // surface, so it does not light a character — it raises the black point and
    // flattens all form shading. The old 0.6 here was the single biggest cause
    // of the washed-out look. Fill comes from the hemisphere light instead,
    // which has direction and therefore still shades.
    ambient: 0.06,
    hemisphere: 0.36,
    key: 0.82,
    fill: 0.2,
    // The rim is the biggest single win for an anime model. A light from behind
    // and above separates the silhouette from a dark background and catches the
    // hair. It is most of why VTuber renders look good.
    rim: 1.0,
    exposure: 0.78,
    // Slight warmth on the key does a lot of the "friendly" work for free.
    warmth: 0.35,
  },
};

/**
 * Camera framings, as intentions rather than coordinates.
 *
 * These used to be literal camera positions, solved from the fov for the one
 * model in the project and pasted in. That stopped working the moment there
 * were eight models of different heights: the same coordinates put a short
 * model's head in the middle of the frame and a tall model's head out through
 * the top of it.
 *
 * So a framing now says what it wants and [framing.js](framing.js) solves the
 * coordinates per model:
 *
 *   coverage  vertical slice to show, as a multiple of the model's own head
 *             height. Bigger shows more of her.
 *   headAt    where the head bone should sit, as a fraction down from the top
 *             edge. Smaller puts her head higher in frame.
 *
 * The head sits a THIRD of the way down in both close framings. Centred reads
 * as a passport photo; higher than a third starts to feel like she is leaving
 * the frame. `full` is the exception and has to be, because it is bounded at
 * the bottom instead — the feet have to fit, and that is only possible with the
 * head much closer to the top edge.
 *
 * The production target is the waist-up `bust` shot: close enough that the face
 * carries the scene, wide enough that shoulder and arm motion still reads.
 */
export const FRAMINGS = {
  bust: { coverage: 0.67, headAt: 0.33, label: 'Medium (head to thigh)' },
  close: { coverage: 0.31, headAt: 0.33, label: 'Close (chest up)' },
  full: { coverage: 1.18, headAt: 0.14, label: 'Full body' },
};

/** Vertical field of view, in degrees. The framing maths needs it too. */
export const FOV_DEG = 30;

export const DEFAULT_FRAMING = 'bust';
