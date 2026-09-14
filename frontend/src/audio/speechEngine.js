'use client';

/**
 * The voice. Turns text into scheduled audio and the mouth timeline that runs
 * against it.
 *
 * ---------------------------------------------------------------------------
 * THE ONE IDEA IN THIS FILE: the audio is the clock.
 * ---------------------------------------------------------------------------
 *
 * Before there was a voice, the mouth *was* the clock — the frame loop asked
 * `performance.now() - speechStartedAt` where it had got to, and since nothing
 * else made a sound, whatever it answered was right by definition.
 *
 * With real audio there are two clocks, and they do not agree. `performance.now`
 * is the wall clock; the audio hardware runs on its own crystal, resamples, and
 * drifts. Tens of milliseconds per minute is enough to see, and a mouth that
 * runs ahead of the voice is the single most obvious way an avatar looks fake.
 *
 * So the AudioContext clock wins, always. `positionMs()` reports where the
 * *sound* has got to, and the frame loop samples the timeline at that point.
 * If audio is not playing, it returns null and the frame loop falls back to the
 * wall clock for the silent path.
 *
 * ---------------------------------------------------------------------------
 * Why this is a module singleton rather than a hook
 * ---------------------------------------------------------------------------
 *
 * `say()` has to be callable by the host application — the separate agent app
 * that owns the chat — through `useAvatarStore.getState().say(text)`, from
 * anywhere, at any time, including before any of this project's components have
 * mounted. That rules out a hook. It is plain JS with no React in it, and it
 * reaches the store through an injected sink rather than importing it, so the
 * dependency runs one way: store -> engine, never back.
 */

import { chunkText, pauseAfterChunk, CLAUSE_PAUSE_RATIO } from '@/lib/chunkText.js';
import { phonemesToTimeline } from '@/lib/phonemes.js';
import { textToVisemes, timelineDuration } from '@/lib/textToVisemes.js';

/**
 * How far ahead of "now" the first chunk is scheduled.
 *
 * Scheduling at exactly ctx.currentTime is a race the browser sometimes loses,
 * and the loss is audible as a clipped first consonant. A few tens of ms of
 * lead costs nothing a listener can perceive and removes the whole class.
 */
const SCHEDULE_LEAD_SEC = 0.06;

/**
 * Tail held after the last sample before the utterance is declared over.
 *
 * The mouth damps closed rather than snapping, so ending the state on the exact
 * final sample cuts that release off mid-decay. Same 200ms the silent path has
 * always used.
 */
const RELEASE_TAIL_MS = 200;

class SpeechEngine {
  /** @type {AudioContext|null} */
  #ctx = null;

  /** Where store writes go. Injected by avatarStore.js at module load. */
  #sink = null;

  /**
   * Bumped by every say() and every stop().
   *
   * This is the barge-in mechanism and it is the reason this class is safe
   * under interruption. Every await in here is a point where the user may have
   * cut her off and started a new reply, so each continuation checks that the
   * utterance it belongs to is still the current one before touching anything.
   * Without it, a slow chunk from an abandoned sentence arrives late and
   * schedules itself on top of the new one.
   */
  #utterance = 0;

  /** @type {AbortController|null} in-flight synthesis requests */
  #abort = null;

  /** @type {AudioBufferSourceNode[]} everything scheduled and not yet ended */
  #sources = [];

  /** AudioContext time at which this utterance began. */
  #startedAtCtx = 0;

  /** AudioContext time the next chunk should begin, for gapless playback. */
  #nextStartCtx = 0;

  /** Accumulated viseme segments across every chunk of this utterance. */
  #timeline = [];

  /** @type {ReturnType<typeof setTimeout>|null} */
  #endTimer = null;

  /** True once a silent fallback has taken over this utterance. */
  #silent = false;

  /**
   * Wire the engine to the store.
   *
   * @param {{
   *   onTimeline: (timeline: object[]) => void,
   *   onStart: () => void,
   *   onEnd: () => void,
   *   onStatus: (status: {state: string, error?: string|null}) => void,
   * }} sink
   */
  configure(sink) {
    this.#sink = sink;
  }

  // ---------------------------------------------------------------- the clock

  /**
   * Where the audio has got to, in ms from the start of the utterance.
   *
   * Returns null when no audio utterance is active, which is the frame loop's
   * signal to use the wall clock instead. A *negative* result is normal and
   * meaningful: it is the scheduling lead before the first sample plays, and
   * sampleTimeline answers a negative time with a closed mouth, which is
   * exactly right — she should not start moving before the sound starts.
   */
  positionMs() {
    if (this.#ctx === null || this.#silent || this.#startedAtCtx === 0) return null;
    return (this.#ctx.currentTime - this.#startedAtCtx) * 1000;
  }

  // ------------------------------------------------------------ the interface

  /**
   * Say something. The whole contract, in one call.
   *
   * Chunks the text, synthesises each chunk, schedules the audio gaplessly,
   * builds the mouth timeline against the real decoded duration, and ends the
   * speaking state when the sound stops. Interrupting is just calling it again.
   *
   * It never throws and never rejects. Every failure path degrades to the
   * silent mouth this project shipped before there was a voice, because an
   * avatar that mouths a reply it cannot voice is a far better failure than one
   * that stands frozen while the chat shows text.
   *
   * @param {string} text
   * @param {{voice?: string, rate?: number, silent?: boolean,
   *          sentencePauseMs?: number}} [opts]
   */
  async say(text, opts = {}) {
    const chunks = chunkText(text);
    if (chunks.length === 0) return;

    const id = this.#beginUtterance();
    this.#reportedFallback = false;

    // Muted. Take the silent path without touching the network or the audio
    // device at all — a synthesised utterance nobody hears still costs a round
    // trip and a per-character charge.
    if (opts.silent) {
      this.#fallbackToSilent(text, opts, id, 'muted');
      return;
    }

    // Web Audio cannot start without a user gesture. If we are still locked,
    // the words go out silently rather than not at all, and a gesture listener
    // is armed so the *next* utterance has a voice.
    const ready = await this.#ensureContext();
    if (id !== this.#utterance) return;
    if (!ready) {
      this.#fallbackToSilent(text, opts, id, 'blocked');
      return;
    }

    this.#status('synthesizing');

    for (let i = 0; i < chunks.length; i += 1) {
      let chunk;
      try {
        chunk = await this.#synthesize(chunks[i], opts);
      } catch (err) {
        if (id !== this.#utterance) return;       // interrupted mid-flight
        if (err.name === 'AbortError') return;

        if (i === 0) {
          // Nothing has been heard yet, so the whole utterance can still fall
          // back cleanly to silent mouthing.
          this.#fallbackToSilent(text, opts, id, 'unavailable', err.message);
        } else {
          // Audio is already playing. Cutting the rest is the honest outcome —
          // splicing a silent mouth onto the end of real speech would look like
          // she kept talking after her voice gave out.
          console.warn('[speech] chunk %d failed, ending utterance early: %s', i, err.message);
          this.#status('error', err.message);
          this.#scheduleEnd(id);
        }
        return;
      }

      if (id !== this.#utterance) return;

      // The beat between sentences. Zero after the last one — a trailing pause
      // is silence nobody hears and it only delays the end of the speaking
      // state.
      const isLast = i === chunks.length - 1;
      const pauseAfterMs = isLast
        ? 0
        : pauseAfterChunk(chunks[i], opts.sentencePauseMs ?? 0);

      this.#scheduleChunk({ ...chunk, pauseAfterMs }, id);
    }

    if (id !== this.#utterance) return;
    this.#scheduleEnd(id);
  }

  /**
   * Stop immediately: barge-in, or the Stop button.
   *
   * Everything is torn down in one place — in-flight requests aborted, every
   * scheduled source stopped, the end timer cleared — because a partial stop is
   * how an abandoned sentence comes back thirty seconds later.
   */
  stop() {
    this.#utterance += 1;

    this.#abort?.abort();
    this.#abort = null;

    if (this.#endTimer !== null) {
      clearTimeout(this.#endTimer);
      this.#endTimer = null;
    }

    for (const source of this.#sources) {
      try {
        source.onended = null;   // detach first: stop() fires it synchronously
        source.stop();
      } catch {
        // Already ended. Stopping a finished source throws in some browsers and
        // means nothing in any of them.
      }
    }
    this.#sources = [];

    this.#timeline = [];
    this.#startedAtCtx = 0;
    this.#nextStartCtx = 0;
    this.#silent = false;

    this.#sink?.onEnd();
    this.#status('idle');
  }

  /**
   * Resume audio after a user gesture.
   *
   * Safe to call as often as you like. The host app should call it from its
   * own first click or keypress if it wants the very first reply to have a
   * voice — otherwise the listener armed below catches the next interaction.
   */
  async unlock() {
    if (this.#ctx === null) return false;
    if (this.#ctx.state !== 'suspended') return true;
    try {
      await this.#ctx.resume();
      return this.#ctx.state === 'running';
    } catch {
      return false;
    }
  }

  /** Release the audio device. For unmount in a single-page host. */
  async dispose() {
    this.stop();
    const ctx = this.#ctx;
    this.#ctx = null;
    await ctx?.close().catch(() => {});
  }

  // ------------------------------------------------------------------ internal

  #beginUtterance() {
    this.stop();                 // stop() bumps the counter; this is the new id
    this.#abort = new AbortController();
    return this.#utterance;
  }

  /**
   * Create the AudioContext on demand and get it running.
   *
   * Deliberately lazy. Constructing an AudioContext at module load starts a
   * suspended one in every tab that merely *renders* the avatar, and some
   * browsers count that against autoplay policy later.
   */
  async #ensureContext() {
    if (typeof window === 'undefined') return false;

    if (this.#ctx === null) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;                   // no Web Audio: silent path
      this.#ctx = new Ctor();
    }

    if (this.#ctx.state === 'running') return true;

    if (await this.unlock()) return true;

    this.#armGestureUnlock();
    return false;
  }

  /**
   * Arm a one-shot listener that resumes audio on the next user interaction.
   *
   * `once` on each listener plus removing the others on the first hit means
   * this cannot accumulate across repeated blocked utterances — which it would
   * otherwise do once per reply, silently, for the life of the page.
   */
  #armGestureUnlock() {
    if (typeof window === 'undefined' || this.#gestureArmed) return;
    this.#gestureArmed = true;

    const events = ['pointerdown', 'keydown', 'touchstart'];
    const handler = async () => {
      for (const e of events) window.removeEventListener(e, handler);
      this.#gestureArmed = false;
      if (await this.unlock()) this.#status('idle');
    };
    for (const e of events) window.addEventListener(e, handler, { once: true, passive: true });
  }

  #gestureArmed = false;

  /** Whether this utterance has already reported a substituted voice. */
  #reportedFallback = false;

  /** POST one chunk to the TTS route and decode what comes back. */
  async #synthesize(text, opts) {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: opts.voice ?? undefined,
        rate: opts.rate ?? 1,
        // Commas are always mid-chunk — chunkText only splits on sentence
        // terminators — so the gap between chunks cannot reach them. The
        // provider holds this one inside the synthesis instead.
        clausePauseMs: Math.round((opts.sentencePauseMs ?? 0) * CLAUSE_PAUSE_RATIO),
      }),
      signal: this.#abort?.signal,
    });

    if (!response.ok) {
      // The route answers failures with { error, hint } precisely so this
      // message is actionable in a console rather than being "500".
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.hint ? `${detail.error} ${detail.hint}` : (detail.error ?? `TTS returned ${response.status}`));
    }

    const payload = await response.json();

    // The route substitutes a premade voice when a character's Voice Library
    // one is unavailable, and that degradation SOUNDS FINE — a different woman
    // says the sentence perfectly. Nothing about the audio reveals it, so this
    // is the only place it can be noticed. Warned once per utterance rather
    // than once per chunk, or a long reply reports it a dozen times.
    if (payload.fallbackFrom && !this.#reportedFallback) {
      this.#reportedFallback = true;
      console.warn(
        `[speech] ${payload.fallbackFrom} is unavailable; speaking as ${payload.voice}. `
        + 'See docs/15-voice-and-tts.md.',
      );
    }

    const bytes = base64ToBytes(payload.audio);

    // decodeAudioData is the authority on duration, not the WAV header the
    // server measured: the header describes the file, this describes what will
    // actually be played, and resampling to the device rate can change it.
    const buffer = await this.#ctx.decodeAudioData(bytes.buffer);

    return { buffer, phonemes: payload.phonemes ?? [], text };
  }

  /**
   * Schedule one chunk's audio and append its share of the mouth timeline.
   *
   * Scheduling against `#nextStartCtx` rather than calling `start()` with no
   * argument is what makes the timing deliberate instead of incidental.
   * Starting each chunk "now" as it arrives leaves a gap the length of the
   * network round trip — which varies per sentence and sounds like she is
   * reading a list. Scheduling means the only silence between two sentences is
   * the silence we asked for.
   */
  #scheduleChunk({ buffer, phonemes, text, pauseAfterMs = 0 }, id) {
    const ctx = this.#ctx;
    const earliest = ctx.currentTime + SCHEDULE_LEAD_SEC;

    // A chunk that arrived after its slot passed (a slow synthesis, a long
    // stall) starts as soon as it can instead of in the past.
    const startAt = this.#startedAtCtx === 0 ? earliest : Math.max(this.#nextStartCtx, earliest);

    if (this.#startedAtCtx === 0) {
      this.#startedAtCtx = startAt;
      this.#sink?.onStart();
      this.#status('speaking');
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(startAt);

    this.#sources.push(source);
    source.onended = () => {
      this.#sources = this.#sources.filter((s) => s !== source);
    };

    // Where this chunk sits inside the whole utterance, in mouth-timeline time.
    const offsetMs = (startAt - this.#startedAtCtx) * 1000;
    const durationMs = buffer.duration * 1000;

    // The hosted synthesiser returns audio and nothing about how it was
    // pronounced, so `phonemes` is empty and this takes the second branch
    // today. Grapheme shapes stretched over the measured duration keep her
    // starting and stopping with the voice; the shapes between are inferred
    // from spelling. The first branch is live and waiting for a phoneme
    // source — see docs/15-voice-and-tts.md for what would supply one.
    const segments = phonemes.length > 0
      ? phonemesToTimeline(phonemes, durationMs, offsetMs)
      : stretchTimeline(textToVisemes(text), durationMs, offsetMs);

    this.#timeline = this.#timeline.concat(segments);
    if (id === this.#utterance) this.#sink?.onTimeline(this.#timeline);

    // Where the next chunk begins: the end of this audio, plus the pause the
    // punctuation asks for. Scheduling them truly back to back was the bug this
    // fixes — it removed the accidental network gap and the deliberate
    // sentence beat along with it, which reads as someone in a hurry.
    //
    // The mouth follows for free: the next chunk's segments are offset from
    // this same value, and sampleTimeline answers an uncovered time with a
    // closed mouth. So she holds her lips together through the pause rather
    // than freezing mid-shape.
    this.#nextStartCtx = startAt + buffer.duration + pauseAfterMs / 1000;
  }

  /** End the speaking state when the last scheduled sample has played out. */
  #scheduleEnd(id) {
    if (this.#endTimer !== null) clearTimeout(this.#endTimer);

    const remainingMs = Math.max(0, (this.#nextStartCtx - this.#ctx.currentTime) * 1000);
    this.#endTimer = setTimeout(() => {
      this.#endTimer = null;
      if (id !== this.#utterance) return;   // superseded while playing out
      this.stop();
    }, remainingMs + RELEASE_TAIL_MS);
  }

  /**
   * Drop to the original silent pipeline for this utterance.
   *
   * This is the path the whole project used before it had a voice, unchanged
   * and still tested — which is why it is a genuine fallback rather than a
   * degraded imitation of one. She mouths the words on grapheme timing and the
   * conversational state behaves exactly as it always did.
   */
  #fallbackToSilent(text, opts, id, reason, detail = null) {
    if (id !== this.#utterance) return;

    this.#silent = true;
    const timeline = textToVisemes(text, { rate: opts.rate ?? 1 });
    if (timeline.length === 0) return;

    this.#timeline = timeline;
    this.#sink?.onTimeline(timeline);
    this.#sink?.onStart();
    this.#status(reason, detail);

    this.#endTimer = setTimeout(() => {
      this.#endTimer = null;
      if (id !== this.#utterance) return;
      this.stop();
    }, timelineDuration(timeline) + RELEASE_TAIL_MS);
  }

  #status(state, error = null) {
    this.#sink?.onStatus({ state, error });
  }
}

/**
 * Stretch a grapheme timeline onto a known audio duration.
 *
 * Only used when phonemization failed but synthesis did not. The grapheme
 * durations were never real timings — they are a plausible rhythm — so scaling
 * them to the measured length is no less principled than they already were, and
 * it at least makes the mouth start and stop with the voice.
 */
function stretchTimeline(timeline, totalMs, offsetMs) {
  const span = timelineDuration(timeline);
  if (span <= 0 || totalMs <= 0) return [];
  const scale = totalMs / span;

  return timeline.map((seg) => ({
    ...seg,
    start: offsetMs + Math.round(seg.start * scale),
    dur: Math.max(1, Math.round(seg.dur * scale)),
  }));
}

/** Base64 -> bytes. The audio arrives encoded so phonemes can travel with it. */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * One engine per page. The avatar has one mouth, so a second engine could only
 * ever mean two voices talking over each other.
 */
export const speechEngine = new SpeechEngine();
