import { describe, it, expect } from 'vitest';
import {
  chunkText, pauseAfterChunk, withClausePauses, CLAUSE_PAUSE_RATIO, MAX_BREAKS,
} from '@/lib/chunkText.js';

describe('chunkText', () => {
  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
    expect(chunkText(null)).toEqual([]);
    expect(chunkText(undefined)).toEqual([]);
  });

  it('keeps a single sentence whole', () => {
    expect(chunkText('Hello there.')).toEqual(['Hello there.']);
  });

  it('splits on sentence boundaries', () => {
    const long = 'a'.repeat(70);
    const chunks = chunkText(`${long}. ${long}.`);
    expect(chunks).toHaveLength(2);
  });

  it('keeps the terminator with the sentence it ends', () => {
    const long = 'x'.repeat(70);
    for (const chunk of chunkText(`${long}? ${long}!`)) {
      expect(chunk).toMatch(/[?!]$/);
    }
  });

  it('keeps a closing quote with its sentence rather than starting the next one with it', () => {
    const long = 'word '.repeat(14).trim();
    const chunks = chunkText(`He said "${long}." Then ${long}.`);
    expect(chunks[0]).toMatch(/\."$|"$/);
    expect(chunks[1]?.startsWith('"')).toBe(false);
  });

  // The floor is the point of the merge pass: a two-word sentence need not be
  // a round trip of its own.
  it('merges a very short sentence forward rather than making it its own request', () => {
    expect(chunkText('Hi. There.')).toEqual(['Hi. There.']);
  });

  // Merging has a cost that only appeared once there was a voice: a merged
  // sentence boundary is paced by the synthesiser, and synthesisers hurry a
  // full stop. An unmerged one is paced by pauseAfterChunk. So the floor is
  // deliberately low enough that ordinary sentences stand alone.
  it('leaves ordinary sentences unmerged so their boundaries stay ours to pace', () => {
    const chunks = chunkText('The build finished cleanly. I have pushed the branch.');
    expect(chunks).toHaveLength(2);
  });

  // Merging continues while the accumulated chunk is still under the floor, so
  // "Hi. There." (10 chars) keeps absorbing. What stops it is the chunk itself
  // clearing the floor — not the number of sentences in it.
  it('stops merging once the chunk itself clears the floor', () => {
    const long = 'This sentence is comfortably past the merge floor on its own.';
    const chunks = chunkText(`${long} Hi. There.`);
    expect(chunks[0]).toBe(long);
    expect(chunks[1]).toBe('Hi. There.');
  });

  // Bounded from both sides deliberately. An upper bound alone would pass while
  // the splitter emitted one chunk per character.
  it('splits an over-long sentence without going under a usable size', () => {
    const runOn = 'word '.repeat(300).trim();
    const chunks = chunkText(runOn, { maxChars: 100 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
    expect(chunks.length).toBeLessThan(runOn.length / 10);
  });

  it('prefers clause punctuation over bare whitespace when it has to split', () => {
    const clause = `${'a'.repeat(40)}, ${'b'.repeat(40)} ${'c'.repeat(40)}`;
    const chunks = chunkText(clause, { maxChars: 60 });
    expect(chunks[0]).toMatch(/,$/);
  });

  // The last resort, and it has to exist: a pasted URL contains no seam at all,
  // and returning it whole would blow the route's character limit.
  it('cuts mid-word only when there is no seam at all', () => {
    const unbroken = 'z'.repeat(250);
    const chunks = chunkText(unbroken, { maxChars: 100 });
    expect(chunks).toEqual(['z'.repeat(100), 'z'.repeat(100), 'z'.repeat(50)]);
  });

  it('never emits an empty or untrimmed chunk', () => {
    const messy = '  One.   Two!    Three?  ' + 'tail '.repeat(60);
    for (const chunk of chunkText(messy)) {
      expect(chunk).toBe(chunk.trim());
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it('loses no words', () => {
    const text = 'First sentence here. Second one follows it. And a third to finish, at length.';
    const rejoined = chunkText(text).join(' ').replace(/\s+/g, ' ');
    expect(rejoined).toBe(text.replace(/\s+/g, ' '));
  });
});

describe('pauseAfterChunk', () => {
  const SENTENCE = 400;

  it('is zero for nothing to pause after', () => {
    expect(pauseAfterChunk('', SENTENCE)).toBe(0);
    expect(pauseAfterChunk('   ', SENTENCE)).toBe(0);
    expect(pauseAfterChunk(null, SENTENCE)).toBe(0);
    expect(pauseAfterChunk('Done.', 0)).toBe(0);
  });

  it('holds a full beat after a sentence', () => {
    for (const ending of ['Done.', 'Really!', 'Right?', 'Well…']) {
      expect(pauseAfterChunk(ending, SENTENCE)).toBe(SENTENCE);
    }
  });

  it('holds a shorter beat after a clause', () => {
    const clause = pauseAfterChunk('First,', SENTENCE);
    expect(clause).toBe(Math.round(SENTENCE * CLAUSE_PAUSE_RATIO));
    expect(clause).toBeGreaterThan(0);
    expect(clause).toBeLessThan(SENTENCE);
  });

  // A chunk with no terminal punctuation is a length-forced split in the MIDDLE
  // of a sentence. Pausing there is worse than rushing — it puts a silence
  // where the speaker had not finished the thought.
  it('does not pause mid-sentence after a length-forced split', () => {
    expect(pauseAfterChunk('and then we went to the', SENTENCE)).toBe(0);
    expect(pauseAfterChunk('zzzzzzzzzz', SENTENCE)).toBe(0);
  });

  it('looks past a closing quote to the punctuation that matters', () => {
    expect(pauseAfterChunk('He said "stop."', SENTENCE)).toBe(SENTENCE);
    expect(pauseAfterChunk("It was 'fine',", SENTENCE))
      .toBe(Math.round(SENTENCE * CLAUSE_PAUSE_RATIO));
  });

  it('ignores trailing whitespace', () => {
    expect(pauseAfterChunk('Done.   ', SENTENCE)).toBe(SENTENCE);
  });

  // Bounded from both sides. An upper bound alone passes while the pause is
  // zero, which is the exact bug this function was added to fix.
  it('scales with the configured beat in both directions', () => {
    expect(pauseAfterChunk('Done.', 200)).toBe(200);
    expect(pauseAfterChunk('Done.', 800)).toBe(800);
    expect(pauseAfterChunk('Done.', 800)).toBeGreaterThan(pauseAfterChunk('Done.', 200));
  });
});

describe('withClausePauses', () => {
  it('leaves text alone when there is no pause to insert', () => {
    expect(withClausePauses('One, two.', 0)).toBe('One, two.');
    expect(withClausePauses('One, two.', -5)).toBe('One, two.');
    expect(withClausePauses(null, 200)).toBe('');
  });

  it('inserts a break after a comma', () => {
    expect(withClausePauses('Yes, of course.', 200))
      .toBe('Yes,<break time="0.20s" /> of course.');
  });

  it('handles semicolons and colons too', () => {
    expect(withClausePauses('One; two', 300)).toContain('<break time="0.30s" />');
    expect(withClausePauses('Note: this', 300)).toContain('<break time="0.30s" />');
  });

  // The whole reason the pattern requires whitespace after the punctuation.
  // Breaking "1,000" would read the number as two.
  it('does not break a thousands separator', () => {
    expect(withClausePauses('It cost 1,000 pounds.', 200)).toBe('It cost 1,000 pounds.');
  });

  it('does not touch a full stop, which the chunk gap already handles', () => {
    expect(withClausePauses('Done. Next.', 200)).toBe('Done. Next.');
  });

  // The provider warns that many break tags in one request can destabilise the
  // audio, so a sentence wanting a dozen pauses gets the ones it is allowed.
  it('caps the number of breaks in one chunk', () => {
    const many = Array.from({ length: 20 }, (_, i) => `word${i}`).join(', ');
    const out = withClausePauses(many, 200);
    expect(out.match(/<break/g) ?? []).toHaveLength(MAX_BREAKS);
  });

  it('scales the break with the pause it is given', () => {
    expect(withClausePauses('a, b', 150)).toContain('0.15s');
    expect(withClausePauses('a, b', 450)).toContain('0.45s');
  });

  // The clause pause is derived from the sentence pause, so the two stay in a
  // fixed relationship rather than drifting apart as separate settings.
  it('is shorter than the sentence pause it derives from', () => {
    const sentence = 400;
    const clause = Math.round(sentence * CLAUSE_PAUSE_RATIO);
    expect(clause).toBeLessThan(sentence);
    expect(clause).toBeGreaterThan(0);
  });
});
