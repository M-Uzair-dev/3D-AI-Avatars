/**
 * What the five lights should be doing, given the room she is standing in.
 *
 * DECIDES; it does not apply. `Scene.jsx` applies. The half that can get the
 * answer wrong needs no GPU to test, and the half that needs a GPU has no
 * answers in it — the same split as framing.js, and for the same reason.
 *
 * Handed a null rig it returns the hand-tuned studio rig unchanged. That is
 * reachable from a bad room id and from an asset that failed to load, not from
 * anything the user can pick: in this project she is always in a room.
 */

/** How far out to push the key. Direction matters; distance does not, for a directional light. */
const KEY_DISTANCE = 4;

function unitOr(v, fallback) {
  if (!Array.isArray(v) || v.length !== 3) return fallback;
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len < 1e-9) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function rgbOr(v, fallback) {
  return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v : fallback;
}

/** The rim's hand-tuned colour, used with no room and as the neutral to tint from. */
const DEFAULT_RIM_COLOR = [0.875, 0.902, 1];

/**
 * How far the rim is allowed to swing away from white, and the sky saturation
 * at which it swings that far.
 *
 * Measured, not guessed, on the twelve-room candidate set this six was cut
 * from. With the rim at its fixed cool white, the luminance step across her
 * silhouette at head height was 26 in a cool studio and 29 in snow — a white
 * edge on a white room, which is the one case this whole light exists to
 * handle and the one case it could not.
 *
 * More INTENSITY does not fix that: the backdrop is already near the top of the
 * range, so a brighter rim just clips against it. A different HUE does, and
 * costs nothing.
 */
const RIM_TINT = 0.32;
const RIM_TINT_SAT_REF = 0.1;

/**
 * A rim colour that opposes the room instead of matching it.
 *
 * The sky's chroma is its departure from its own mean; negating that and adding
 * it to white gives the complement, which is what separates an edge by hue
 * rather than by brightness.
 *
 * The saturation ramp is the part that is not optional. A neutral grey sky has
 * a chroma of almost exactly zero, and normalising almost exactly zero
 * amplifies whatever rounding noise is in the bake — a warm studio's sky
 * measured [1, 0.985, 0.989] and the raw complement of that is a vivid cyan,
 * from a room that is visibly not tinted at all. Scaling the tint by how
 * saturated the sky actually is keeps a neutral room's rim neutral and still
 * gives a genuinely cool room the full swing.
 */
function rimColorFor(skyColor) {
  const mean = (skyColor[0] + skyColor[1] + skyColor[2]) / 3;
  const chroma = [skyColor[0] - mean, skyColor[1] - mean, skyColor[2] - mean];
  const peak = Math.max(Math.abs(chroma[0]), Math.abs(chroma[1]), Math.abs(chroma[2]));
  if (!Number.isFinite(peak) || peak < 1e-6) return DEFAULT_RIM_COLOR;

  // skyColor is peak-normalised, so 1 - min is its saturation.
  const saturation = 1 - Math.min(skyColor[0], skyColor[1], skyColor[2]);
  const tint = RIM_TINT * Math.min(1, saturation / RIM_TINT_SAT_REF);

  const raw = chroma.map((c) => 1 - (tint * c) / peak);
  const top = Math.max(raw[0], raw[1], raw[2]);
  return raw.map((c) => Math.max(0, c / top));
}

/**
 * Where the fill goes, given where the key went.
 *
 * It used to be a fixed studio position, `[-3, 1.2, 1.6]`, which is only a fill
 * for a key that happens to be on the other side. For an orchard room whose
 * baked key lands at `[1.8, 1.8, 3.1]` the "fill" sat 50 degrees away from it,
 * so the two lights piled onto the same side of her and NOTHING lit the other
 * one. A fill has to be defined relative to the key or it is just a second key.
 *
 * Opposite in azimuth, and pulled down toward the horizon: a fill is bounce off
 * the ground and the walls, so it comes from below the key rather than
 * mirroring its elevation. The floor on `y` keeps it from passing under the
 * floor for a key that is itself low, which would uplight her like a torch.
 */
function fillPositionFor(dir, distance) {
  const y = Math.max(0.2, dir[1] * 0.35);
  const raw = [-dir[0], y, -dir[2]];
  const len = Math.hypot(raw[0], raw[1], raw[2]) || 1;
  return raw.map((c) => (c / len) * distance);
}

/**
 * The tuning handed to mtoonResponse.js, assembled in one place.
 *
 * The shadow side is tinted toward the room's GROUND colour rather than its
 * sky: the light reaching a surface that faces away from the key is bounce off
 * what is underneath and around her, not the sky she is already being lit by.
 * On an overcast field that distinction is invisible; on a night street, where
 * the ground is the only warm thing, it is most of why the shadow reads as
 * belonging to that street.
 */
function responseFor(defaults, bounce) {
  return {
    terminator: defaults.shadeTerminator,
    softness: defaults.shadeSoftness,
    shadeDepth: defaults.shadeDepth,
    shadeTint: bounce,
    shadeTintAmount: defaults.shadeTintAmount,
    rimLightingMix: defaults.rimLightingMix,
  };
}

/**
 * @param {object|null} rig      a baked light rig, or null for the studio fallback
 * @param {object} defaults      DEFAULTS.lighting — the hand-tuned rig
 */
export function resolveLighting(rig, defaults) {
  if (!rig) {
    const groundColor = [0.29, 0.23, 0.26];
    return {
      ...defaults,
      keyColor: [1, 1, 1],
      skyColor: [0.725, 0.78, 1],
      groundColor,
      rimColor: DEFAULT_RIM_COLOR,
      // The hand-tuned key and fill positions, verbatim. With no room there is
      // nothing to derive them from, and the fill was chosen against this key
      // and is therefore already opposite it.
      keyPosition: [2.6, 3.2, 2.4],
      fillPosition: [-3, 1.2, 1.6],
      // 0xcfd8ff, the hand-tuned cool fill.
      fillColor: [0.812, 0.847, 1],
      response: responseFor(defaults, [1, 1, 1]),
    };
  }

  const dir = unitOr(rig.keyDirection, [0.5, 0.7071067811865476, 0.5]);
  const skyColor = rgbOr(rig.skyColor, [0.725, 0.78, 1]);
  const groundColor = rgbOr(rig.groundColor, [0.29, 0.23, 0.26]);

  return {
    // Ambient stays near zero whatever the room. It cannot shade anything — it
    // only raises the black point — and the hemisphere light is what fills the
    // shadows with something that still has direction.
    ambient: defaults.ambient,
    hemisphere: defaults.hemisphere,
    key: defaults.key,
    fill: defaults.fill,
    // Kept at full strength deliberately. A room gives her a backdrop to be
    // lost against, so the light that separates her silhouette from it matters
    // MORE than it did over a flat gradient, not less.
    rim: defaults.rim,
    warmth: defaults.warmth,
    // Not derived from the room — they are tuning, and a room has no opinion
    // about them. Listed field by field rather than spread on purpose: a spread
    // here would also carry `keyPosition` and friends in from the caller, and
    // the whole point of this function is that the ROOM decides those.
    //
    // Every one of these MUST appear in both branches. A value present in the
    // no-room branch and missing here is the one-branch asymmetry that has cost
    // this class of code more than any other single mistake.
    shadowRadius: defaults.shadowRadius,
    contact: defaults.contact,
    contactSize: defaults.contactSize,
    exposure: Number.isFinite(rig.exposure) ? rig.exposure : defaults.exposure,
    keyColor: rgbOr(rig.keyColor, [1, 1, 1]),
    skyColor,
    groundColor,
    rimColor: rimColorFor(skyColor),
    keyPosition: [dir[0] * KEY_DISTANCE, dir[1] * KEY_DISTANCE, dir[2] * KEY_DISTANCE],
    fillPosition: fillPositionFor(dir, KEY_DISTANCE),
    // Bounce off the room's own ground. It is peak-normalised, so this is a hue
    // and not a brightness — `fill` stays in charge of how much.
    fillColor: groundColor,
    response: responseFor(defaults, groundColor),
  };
}
