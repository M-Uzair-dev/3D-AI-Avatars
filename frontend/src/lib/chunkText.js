/**
 * Split an utterance into synthesis chunks.
 *
 * Why chunk at all: time-to-first-audio. Synthesising a whole paragraph before
 * playing a single sample puts a silence in front of every reply that scales
 * with its length — which is the one thing an agent's voice must never do. We
 * synthesise a sentence, start playing it, and synthesise the next one while it
 * plays. The user hears the first word about as fast as one sentence takes.
 *
 * Why there is a *floor* as well as a ceiling: each chunk costs an HTTP round
 * trip, so "Hi." need not be a request of its own when the clause after it is
 * coming anyway. Short sentences are merged forward until they clear
 * `minChars`.
 *
 * That floor used to be 60 and is now 25, because merging has a cost that was
 * not visible until there was a voice: **a merged sentence boundary is one the
 * synthesiser paces, and an unmerged one is one we pace.** Synthesisers tend to
 * hurry a full stop; the gap inserted between chunks does not. Lowering the
 * floor buys natural pauses for the price of a few more short requests, which
 * on a hosted API is a round trip rather than a process spawn.
 *
 * Pure — no React, no three.js, no I/O. See 02-architecture.md.
 */

/**
 * Sentence terminators, plus the closing quotes/brackets that may trail them.
 * Kept as one regex so "He said \"stop.\" Then left." splits after the quote
 * rather than between the period and it.
 */
const SENTENCE_END = /([.!?\u2026]+["'\u201d\u2019)\]]*)\s+/;

/** Where an over-long chunk may be broken, best candidate first. */
const SOFT_BREAKS = [/[,;:]\s+/g, /\s+/g];

/**
 * Break `text` into chunks suitable for one synthesis request each.
 *
 * @param {string} text
 * @param {{minChars?: number, maxChars?: number}} [opts]
 *   minChars — merge a sentence forward if the chunk is still shorter than this
 *   maxChars — hard split beyond this, so one runaway sentence cannot stall
 *              first audio the way a whole paragraph would
 * @returns {string[]} non-empty, trimmed chunks. `[]` for empty input.
 */
export function chunkText(text, { minChars = 25, maxChars = 240 } = {}) {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (trimmed === '') return [];

  // Pass 1 — split on sentence boundaries, keeping the terminator with the
  // sentence it ends. A capturing split interleaves [body, terminator, ...].
  const parts = trimmed.split(SENTENCE_END);
  const sentences = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = (parts[i] ?? '') + (parts[i + 1] ?? '');
    if (body.trim() !== '') sentences.push(body.trim());
  }

  // Pass 2 — merge forward until each chunk clears the floor.
  const merged = [];
  for (const sentence of sentences) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && prev.length < minChars && prev.length + sentence.length + 1 <= maxChars) {
      merged[merged.length - 1] = `${prev} ${sentence}`;
    } else {
      merged.push(sentence);
    }
  }

  // Pass 3 — hard split anything still over the ceiling.
  const out = [];
  for (const chunk of merged) out.push(...splitLong(chunk, maxChars));
  return out;
}

/**
 * Break one over-long chunk at the best available seam.
 *
 * Tries clause punctuation first, then any whitespace, and only gives up and
 * cuts mid-word if the text contains no break at all (a pasted URL, say).
 * Splitting mid-word is audible, so it is genuinely the last resort.
 */
function splitLong(chunk, maxChars) {
  if (chunk.length <= maxChars) return [chunk];

  for (const pattern of SOFT_BREAKS) {
    const seam = lastSeamBefore(chunk, pattern, maxChars);
    if (seam > 0) {
      return [chunk.slice(0, seam).trim(), ...splitLong(chunk.slice(seam).trim(), maxChars)];
    }
  }

  return [chunk.slice(0, maxChars), ...splitLong(chunk.slice(maxChars), maxChars)];
}

/** Index just past the last match of `pattern` that starts before `limit`. */
function lastSeamBefore(chunk, pattern, limit) {
  let seam = -1;
  // Fresh regex each call: /g patterns carry lastIndex between uses.
  const re = new RegExp(pattern.source, 'g');
  let m;
  while ((m = re.exec(chunk)) !== null) {
    if (m.index >= limit) break;
    seam = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex += 1; // guard against zero-width matches
  }
  return seam;
}

/**
 * How long to hold silence after a chunk, from how it ends.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Chunks were originally scheduled back to back — the next sentence began on
 * the sample after the previous one ended. That was right about the problem it
 * was solving (a gap the length of a network round trip sounds like she is
 * reading a list) and wrong about the amount: the correct gap between two
 * sentences is not zero, it is the beat a person takes. Removing the accidental
 * gap removed the deliberate one with it, and the result was reported exactly
 * as it sounds — like she is in a hurry.
 *
 * The pause is chosen from the punctuation the chunk ends on, because that is
 * what a reader pauses for. A chunk ending in nothing is a mid-sentence split
 * forced by length, where a pause would be *wrong* — the sentence has not
 * finished, and holding silence in the middle of one is worse than rushing.
 *
 * Pure, and the mouth follows it for free: the next chunk's timeline is offset
 * by the gap, and sampleTimeline answers an uncovered time with a closed mouth.
 */

/** Clause pauses as a fraction of the sentence pause. A comma is not a stop. */
export const CLAUSE_PAUSE_RATIO = 0.45;

/**
 * @param {string} chunk the text that was just spoken
 * @param {number} sentenceMs the pause after a full stop; everything else scales off it
 * @returns {number} milliseconds of silence to hold before the next chunk
 */
export function pauseAfterChunk(chunk, sentenceMs) {
  if (typeof chunk !== 'string' || !(sentenceMs > 0)) return 0;

  const trimmed = chunk.trimEnd();
  if (trimmed === '') return 0;

  // Trailing quotes and brackets close after the punctuation that matters.
  const ending = trimmed.replace(/["'”’)\]]+$/, '');
  const last = ending.slice(-1);

  if ('.!?…'.includes(last)) return sentenceMs;
  if (',;:'.includes(last)) return Math.round(sentenceMs * CLAUSE_PAUSE_RATIO);

  // No terminal punctuation: a length-forced split mid-sentence. Run on.
  return 0;
}

/**
 * Insert clause pauses into text, as synthesiser break tags.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS AND NOT SPLITTING ON COMMAS
 * ---------------------------------------------------------------------------
 * `pauseAfterChunk` above puts a real beat between chunks, and it fixed full
 * stops because chunks end on them. It did nothing for commas, and could not:
 * chunkText only ever splits on sentence terminators, so a comma is always
 * *inside* a chunk and paced by the synthesiser — which hurries it. The clause
 * branch of pauseAfterChunk fires only on a length-forced split, which is rare
 * enough that it was effectively dead code.
 *
 * The obvious fix — split on commas too — is worse than the problem. Each
 * clause would be synthesised as its own utterance and get sentence-final
 * falling intonation, so "I went to the shop," would sound finished rather than
 * continuing. Prosody belongs to the sentence, so the sentence has to stay in
 * one request.
 *
 * A break tag holds silence *inside* one synthesis instead. The sentence keeps
 * its intonation and the comma gets its beat.
 *
 * Two deliberate limits:
 *
 *   - only after a comma FOLLOWED BY WHITESPACE, so "1,000" is left alone
 *   - at most MAX_BREAKS per chunk, because the provider warns that many break
 *     tags in one request can destabilise the audio. A sentence wanting seven
 *     pauses is better served by the ones it gets than by risking artefacts.
 *
 * Provider-specific by nature: this is ElevenLabs' syntax. Sending it to a
 * synthesiser that does not parse it would have the tag **read aloud**, which
 * is why it is applied inside that provider rather than in shared code.
 */

/** Break tags beyond this are dropped; the provider warns about instability. */
export const MAX_BREAKS = 6;

/**
 * @param {string} text one chunk, already sentence-sized
 * @param {number} clausePauseMs silence to hold at each comma
 * @returns {string} the text with break tags after clause punctuation
 */
export function withClausePauses(text, clausePauseMs) {
  if (typeof text !== 'string' || !(clausePauseMs > 0)) return text ?? '';

  const seconds = (clausePauseMs / 1000).toFixed(2);
  let used = 0;

  // Whitespace after the punctuation is what distinguishes a clause break from
  // a thousands separator or a time. No lookbehind: it is still patchy in some
  // JS engines this may end up running on, and requiring the space is enough.
  return text.replace(/([,;:])(\s)/g, (match, mark, space) => {
    if (used >= MAX_BREAKS) return match;
    used += 1;
    return `${mark}<break time="${seconds}s" />${space}`;
  });
}
