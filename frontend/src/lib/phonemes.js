/**
 * IPA phonemes -> viseme timeline.
 *
 * This replaces the grapheme guessing in textToVisemes.js for the audio path.
 * The difference matters more than it sounds: English spelling is irregular, so
 * grapheme rules mispronounce words — "though", "through" and "tough" share
 * four letters and no mouth shape. That was an *accepted* risk while there was
 * no audio, because with nothing to compare against the error is undetectable.
 * With real speech playing, a viewer hears the word and watches the mouth
 * disagree with it, so the same error stops being invisible and becomes the
 * first thing they notice.
 *
 * **Nothing supplies phonemes right now.** Synthesis is a hosted API call, and
 * it returns audio without saying how it pronounced it — so the mouth currently
 * falls back to grapheme shapes stretched across the measured duration. This
 * module is the other half of the fix, kept because the fix restores it rather
 * than replacing it: a phoneme source (a pronunciation dictionary server-side,
 * or espeak-ng compiled to WASM in the browser) plugs straight in here.
 *
 * The rule that governed it still governs whatever supplies it: phonemize with
 * the *same* front end the voice speaks with, where there is a choice. Two
 * independent guesses at how a word is pronounced is how a mouth desyncs.
 *
 * Pure — no React, no three.js, no I/O.
 */

/**
 * `viseme: null` means CLOSED — lips together, all mouth weights driven to
 * zero. Same convention as visemeMap.js, and load-bearing for the same reason:
 * without visible closure on the bilabials the mouth reads as a fish.
 *
 * `units` is a *relative* duration, not milliseconds. Absolute timings come
 * from the measured length of the audio actually produced — see
 * phonemesToTimeline. A vowel is held; a consonant is passed through.
 */
const vowel = (viseme, units = 2.2, weight = 1) => ({ viseme, weight, units });
const consonant = (viseme, weight, units = 1) => ({ viseme, weight, units });
const closed = (units = 1) => ({ viseme: null, weight: 0, units });

/**
 * Longest-match-first, so a diphthong is consumed before the bare vowel that
 * starts it. Ordering inside the object does not matter — the lookup sorts by
 * length — but grouping does, for reading.
 */
export const IPA_VISEMES = {
  // ---- Diphthongs. Held longest; the mouth travels across the whole shape.
  'aɪ': vowel('aa', 3.0), 'aʊ': vowel('aa', 3.0), 'eɪ': vowel('ee', 3.0),
  'oʊ': vowel('oh', 3.0), 'əʊ': vowel('oh', 3.0), 'ɔɪ': vowel('oh', 3.0),
  'ɪə': vowel('ih', 3.0), 'eə': vowel('ee', 3.0), 'ʊə': vowel('ou', 3.0),

  // ---- Long vowels.
  'ɑː': vowel('aa', 3.0), 'iː': vowel('ih', 3.0), 'uː': vowel('ou', 3.0),
  'ɔː': vowel('oh', 3.0), 'ɜː': vowel('ee', 3.0), 'eː': vowel('ee', 3.0),
  'oː': vowel('oh', 3.0), 'aː': vowel('aa', 3.0),

  // ---- Short vowels. The open ones take `aa`, the spread ones `ee`, the
  // narrow ones `ih`, the rounded ones `ou`/`oh` — which is the whole of what
  // five visemes can express, and why they are grouped this way rather than
  // mapped one-to-one.
  'ɑ': vowel('aa'), 'a': vowel('aa'), 'ʌ': vowel('aa', 2.0),
  'ɐ': vowel('aa', 2.0), 'æ': vowel('aa', 2.2, 0.9),
  'ɛ': vowel('ee'), 'e': vowel('ee'), 'ɜ': vowel('ee', 2.0),
  'ə': vowel('ee', 1.4, 0.5),
  'ɪ': vowel('ih', 2.0), 'i': vowel('ih'), 'ɨ': vowel('ih', 2.0),
  'ʊ': vowel('ou', 2.0), 'u': vowel('ou'),
  'ɔ': vowel('oh'), 'o': vowel('oh'), 'ɒ': vowel('oh'),

  // ---- Syllabic consonants, which carry a beat like a vowel.
  'ɚ': vowel('ou', 2.0, 0.8), 'ɝ': vowel('ou', 2.4, 0.8),
  'ɫ': consonant('ih', 0.4, 1.4),

  // ---- Bilabials. Lips together. The single most important cue here.
  'p': closed(), 'b': closed(), 'm': closed(),

  // ---- Labiodentals — lower lip to teeth, mouth barely open.
  'f': consonant('ih', 0.3), 'v': consonant('ih', 0.3),

  // ---- Rounded approximants.
  'w': consonant('ou', 0.7), 'ɹ': consonant('ou', 0.45), 'r': consonant('ou', 0.45),

  // ---- Affricates and post-alveolars — one shape, not two.
  'tʃ': consonant('ou', 0.45, 1.3), 'dʒ': consonant('ou', 0.45, 1.3),
  'ʃ': consonant('ou', 0.4), 'ʒ': consonant('ou', 0.4),

  // ---- Dentals and alveolars — tongue behind the teeth, small opening.
  'θ': consonant('ih', 0.3), 'ð': consonant('ih', 0.3),
  't': consonant('ih', 0.35, 0.8), 'd': consonant('ih', 0.35, 0.8),
  's': consonant('ih', 0.3), 'z': consonant('ih', 0.3),
  'n': consonant('ih', 0.3), 'l': consonant('ih', 0.4),

  // ---- Velars — back of the tongue, jaw drops slightly.
  'k': consonant('aa', 0.35, 0.8), 'ɡ': consonant('aa', 0.35, 0.8),
  'g': consonant('aa', 0.35, 0.8), 'ŋ': consonant('aa', 0.3),
  'x': consonant('aa', 0.3),

  // ---- Palatal glide and glottals.
  'j': consonant('ih', 0.5), 'h': consonant('aa', 0.2), 'ʔ': closed(0.5),
};

/** Sorted longest-first so the diphthong is tried before the bare vowel. */
const IPA_KEYS = Object.keys(IPA_VISEMES).sort((a, b) => b.length - a.length);

/**
 * Stress and tone marks espeak emits that change nothing about mouth shape.
 * Stripped rather than mapped — they are prosody, and prosody already reached
 * us inside the audio we are aligning to.
 */
const DIACRITICS = /[ˈˌ̠̩̯̃͜͡˞̞̆]/g;

/** A word gap: the mouth relaxes briefly rather than closing outright. */
const WORD_GAP = { viseme: null, weight: 0, units: 0.5 };

/**
 * Parse a line of IPA into phoneme records.
 *
 * The expected shape is espeak-ng's `--ipa=3`: phonemes separated by `_` inside
 * a word, words separated by spaces. That level is the one worth asking for
 * because lower levels run the phonemes together, leaving them to be
 * re-segmented by guesswork — which is the guessing this module exists to
 * remove.
 *
 * Unrecognised symbols are skipped rather than thrown on. The espeak inventory
 * is larger than any five-viseme map can use, and a symbol we have no shape for
 * should cost nothing — dropping it leaves the neighbouring shapes to carry the
 * word, which is what co-articulation does anyway.
 *
 * @param {string} ipa raw stdout from espeak-ng
 * @returns {{viseme: string|null, weight: number, units: number}[]}
 */
export function parseIpa(ipa) {
  if (typeof ipa !== 'string' || ipa.trim() === '') return [];

  const out = [];
  const words = ipa.replace(DIACRITICS, '').split(/\s+/).filter(Boolean);

  words.forEach((word, wordIndex) => {
    if (wordIndex > 0) out.push({ ...WORD_GAP });

    for (const token of word.split('_')) {
      let rest = token;
      // A token may still hold more than one symbol when espeak ties them, so
      // consume it longest-match-first rather than assuming one phoneme each.
      while (rest.length > 0) {
        const key = IPA_KEYS.find((k) => rest.startsWith(k));
        if (key === undefined) {
          rest = rest.slice(1);
          continue;
        }
        out.push({ ...IPA_VISEMES[key] });
        rest = rest.slice(key.length);
      }
    }
  });

  return out;
}

/**
 * Lay phoneme records out across the real duration of the synthesised audio.
 *
 * This is where alignment happens, and it is worth being precise about what it
 * does and does not claim. No synthesiser tried here hands back per-phoneme
 * durations, so these are *proportional*: each phoneme takes its share of the
 * measured audio in the ratio of its `units`. Within a chunk of a sentence or
 * two that lands close, because the ratios come from the same phoneme sequence
 * the voice is speaking. It is not frame-accurate alignment, and the reason it
 * does not need to be is that the mouth has five shapes to aim at.
 *
 * The invariant that *is* exact: segments are contiguous and sum to `totalMs`
 * with no drift — start[n+1] === start[n] + dur[n], as textToVisemes
 * guarantees. Deriving each end from the running total rather than accumulating
 * rounded durations is what buys that.
 *
 * @param {{viseme: string|null, weight: number, units: number}[]} phonemes
 * @param {number} totalMs measured duration of the audio for this chunk
 * @param {number} [offsetMs] start of this chunk within the whole utterance
 * @returns {{viseme: string|null, weight: number, start: number, dur: number}[]}
 */
export function phonemesToTimeline(phonemes, totalMs, offsetMs = 0) {
  if (!Array.isArray(phonemes) || phonemes.length === 0) return [];
  if (!(totalMs > 0)) return [];

  const units = phonemes.reduce((sum, p) => sum + (p.units ?? 1), 0);
  if (units <= 0) return [];

  const timeline = [];
  let t = offsetMs;
  let consumed = 0;

  phonemes.forEach((p, i) => {
    consumed += p.units ?? 1;
    const end = i === phonemes.length - 1
      ? offsetMs + totalMs
      : offsetMs + Math.round((consumed / units) * totalMs);

    const dur = end - t;
    if (dur > 0) {
      timeline.push({ viseme: p.viseme, weight: p.weight, start: t, dur });
      t = end;
    }
  });

  return timeline;
}
