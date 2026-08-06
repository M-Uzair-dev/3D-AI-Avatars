import { LETTERS, DIGRAPHS, DURATION } from './visemeMap.js';

const SENTENCE_ENDS = new Set(['.', '!', '?']);
const CLAUSE_ENDS = new Set([',', ';', ':']);

const CLOSED = { viseme: null, weight: 0 };

/** Pick an integer in [min, max] using an injectable rng. */
function pick(min, max, rng) {
  return min + (max - min) * rng();
}

/**
 * Convert text into a contiguous timeline of viseme segments.
 *
 * There is no audio anywhere in this system, so timing is derived entirely from
 * the text. That also means phonetic accuracy is not the bar — with no sound to
 * compare against, a viewer judges rhythm and shape variety, not correctness.
 * Grapheme rules are therefore good enough and a pronunciation dictionary is not
 * worth its weight.
 *
 * @param {string} text
 * @param {{ rate?: number, rng?: () => number }} [opts]
 *   rate — global speed multiplier; 2 is twice as fast (durations halved).
 *   rng  — injectable randomness so tests are deterministic.
 * @returns {Array<{viseme: string|null, weight: number, start: number, dur: number}>}
 */
export function textToVisemes(text, opts = {}) {
  const { rate = 1, rng = Math.random } = opts;
  const src = String(text ?? '').toLowerCase();

  // Pass 1 — tokenize into untimed segments with a duration hint.
  const raw = [];
  let pendingPause = 0; // collapses runs of spaces/punctuation into one pause

  const flushPause = () => {
    if (pendingPause > 0) {
      raw.push({ ...CLOSED, base: pendingPause });
      pendingPause = 0;
    }
  };

  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    const one = src[i];

    // Longest match first: digraphs before single letters, so "the" is [th][e].
    const entry = (two.length === 2 && DIGRAPHS[two]) || LETTERS[one];

    if (entry) {
      flushPause();
      const isDigraph = two.length === 2 && DIGRAPHS[two] === entry;
      const base =
        entry.type === 'vowel'
          ? pick(DURATION.vowelMin, DURATION.vowelMax, rng)
          : pick(DURATION.consonantMin, DURATION.consonantMax, rng);
      raw.push({ viseme: entry.viseme, weight: entry.weight, base });
      i += isDigraph ? 2 : 1;
      continue;
    }

    // Not a speech sound. Longest applicable pause wins, and consecutive
    // separators collapse — "a. a" yields one sentence pause, not a sentence
    // pause followed by a word pause.
    if (SENTENCE_ENDS.has(one)) {
      pendingPause = Math.max(pendingPause, DURATION.sentence);
    } else if (CLAUSE_ENDS.has(one)) {
      pendingPause = Math.max(pendingPause, DURATION.comma);
    } else if (/\s/.test(one)) {
      pendingPause = Math.max(pendingPause, DURATION.word);
    }
    // Anything else (digits, emoji, unknown punctuation) is silently skipped.
    i += 1;
  }

  // A trailing pause animates nothing, so drop it.

  // Pass 2 — apply rate and lay out contiguously.
  // Integer durations accumulated into a running start keeps
  // start[n+1] === start[n] + dur[n] exactly true, with no float drift.
  const timeline = [];
  let t = 0;
  for (const seg of raw) {
    const dur = Math.max(1, Math.round(seg.base / rate));
    timeline.push({ viseme: seg.viseme, weight: seg.weight, start: t, dur });
    t += dur;
  }

  return timeline;
}

/** Total timeline length in milliseconds. */
export function timelineDuration(timeline) {
  if (timeline.length === 0) return 0;
  const last = timeline[timeline.length - 1];
  return last.start + last.dur;
}
