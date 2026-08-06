/**
 * Grapheme -> viseme tables.
 *
 * `viseme: null` means CLOSED — lips together, all mouth weights driven to zero.
 * This is the single most important cue in silent lip animation: without visible
 * lip closure on bilabials (b, p, m) the mouth reads as a fish rather than speech.
 *
 * Weights are deliberately partial for consonants. A consonant is a transition,
 * not a held shape, so it only nudges the mouth toward its viseme.
 */

const vowel = (viseme) => ({ viseme, weight: 1, type: 'vowel' });
const consonant = (viseme, weight) => ({ viseme, weight, type: 'consonant' });
const closed = () => ({ viseme: null, weight: 0, type: 'consonant' });

export const LETTERS = {
  a: vowel('aa'),
  e: vowel('ee'),
  i: vowel('ih'),
  o: vowel('oh'),
  u: vowel('ou'),
  y: { viseme: 'ih', weight: 0.8, type: 'vowel' },

  // Bilabials — lips together. Load-bearing.
  b: closed(),
  p: closed(),
  m: closed(),

  // Labiodentals — lower lip to teeth, mouth barely open.
  f: consonant('ih', 0.3),
  v: consonant('ih', 0.3),

  // Rounded.
  w: consonant('ou', 0.7),
  r: consonant('ou', 0.45),
  j: consonant('ou', 0.4),
  q: consonant('ou', 0.5),

  // Alveolars — tongue behind teeth, small opening.
  l: consonant('ih', 0.4),
  n: consonant('ih', 0.3),
  d: consonant('ih', 0.35),
  t: consonant('ih', 0.35),
  s: consonant('ih', 0.3),
  z: consonant('ih', 0.3),
  c: consonant('ih', 0.35),
  x: consonant('ih', 0.35),

  // Velars — back of tongue, jaw drops slightly.
  k: consonant('aa', 0.35),
  g: consonant('aa', 0.35),

  // Glottal — mouth stays near the neighbouring vowel.
  h: consonant('aa', 0.2),
};

export const DIGRAPHS = {
  // Consonant clusters that are one mouth shape, not two.
  th: consonant('ih', 0.3),
  sh: consonant('ou', 0.4),
  ch: consonant('ou', 0.4),
  ph: consonant('ih', 0.3),
  wh: consonant('ou', 0.6),
  ck: consonant('aa', 0.35),
  ng: consonant('ih', 0.3),
  qu: consonant('ou', 0.6),

  // Vowel digraphs.
  oo: vowel('ou'),
  ee: vowel('ee'),
  ea: vowel('ee'),
  ou: vowel('ou'),
  ow: vowel('oh'),
  oa: vowel('oh'),
  oi: vowel('oh'),
  oy: vowel('oh'),
  ai: vowel('aa'),
  au: vowel('aa'),
  ay: vowel('ee'),
  ie: vowel('ih'),
};

export const DURATION = {
  vowelMin: 110,
  vowelMax: 140,
  consonantMin: 50,
  consonantMax: 70,
  word: 40,
  comma: 150,
  sentence: 350,
};
