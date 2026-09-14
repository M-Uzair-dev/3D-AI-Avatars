# The Speech Pipeline

**Job of this doc:** explain how text becomes mouth movement, and why each stage is
shaped the way it is.

See also: [15-voice-and-tts.md](15-voice-and-tts.md) (the voice that drives this now) ·
[03-frame-loop.md](03-frame-loop.md) (where playback is called from)

---

## Two paths into the same mouth

There are now two ways a timeline gets built, and they share everything downstream of it
— the sampler, the damping, and the `setValue` calls.

| | Source of the segments | Source of the timing |
|---|---|---|
| **Voice** (default) | grapheme rules, stretched to fit — see [15](15-voice-and-tts.md) | the measured audio, via the audio clock |
| **Silent** (fallback) | grapheme rules, below | `performance.now()` |

The silent path is what this whole document described, and it is unchanged. It runs when
no API key is configured or the browser has not had a user gesture yet. Everything in
stages 1 and 2 below applies to **both** paths today, because the hosted synthesiser
returns no phonemes — which is the open problem in [15](15-voice-and-tts.md). Stages 3
to 5 apply to both regardless.

**The clock is the part that differs and the part that matters.** See
[invariant 17](10-invariants.md).

## The chain

```
  text
    │  textToVisemes()          lib/textToVisemes.js
    ▼
  timeline  [{ viseme, weight, start, dur }, ...]   contiguous, ms
    │  store.speak(timeline)    records speechStartedAt = performance.now()
    ▼
  per frame:
    sampleTimeline(timeline, now - startedAt)   → hard step-function target
    dampWeights(current, target, dt, stiffness) → smoothed weights
    │
    ▼
  em.setValue('aa'|'ih'|'ou'|'ee'|'oh', weight)
```

Five visemes. That is all VRM offers, and with no audio it is enough — see
[01-orientation.md](01-orientation.md).

## Stage 1 — graphemes to segments

[visemeMap.js](../frontend/src/lib/visemeMap.js) holds two lookup tables and a
duration table. Everything else in the pipeline reads from them.

**`viseme: null` means CLOSED** — lips together, all mouth weights driven to zero.
This is the single most important cue in silent lip animation. Without visible lip
closure on the bilabials `b`, `p`, `m`, the mouth reads as a fish rather than as
speech. That is why those three entries exist as their own category.

**Consonant weights are deliberately partial** (0.2–0.7, not 1.0). A consonant is a
*transition*, not a held shape, so it only nudges the mouth toward its viseme. Vowels
get the full 1.0.

**Digraphs are matched before single letters.** `th`, `sh`, `ch`, `ph`, `wh`, `ck`,
`ng`, `qu` are one mouth shape, not two — so `"the"` tokenizes as `[th][e]`, never
`[t][h][e]`. Vowel digraphs (`oo`, `ea`, `ai`, `ow`…) are in the same table.

### Duration table

| Key | ms | Meaning |
|---|---|---|
| `vowelMin` / `vowelMax` | 110 / 140 | vowels are held |
| `consonantMin` / `consonantMax` | 50 / 70 | consonants pass through |
| `word` | 40 | whitespace |
| `comma` | 150 | `,` `;` `:` |
| `sentence` | 350 | `.` `!` `?` |

Each segment's duration is picked randomly inside its range, which keeps the rhythm
from sounding metronomic.

## Stage 2 — laying out the timeline

[textToVisemes.js](../frontend/src/lib/textToVisemes.js) runs two passes.

**Pass 1 — tokenize.** Longest-match-first over digraphs then letters. Separators do
not emit segments immediately; they accumulate into `pendingPause`, and the **longest
applicable pause wins**. So `"a. a"` yields one sentence pause, not a sentence pause
followed by a word pause. A trailing pause animates nothing and is dropped.

Anything that is not a speech sound or a separator — digits, emoji, unknown
punctuation — is silently skipped. Empty and whitespace-only input yields an empty
timeline rather than throwing.

**Pass 2 — apply rate and lay out contiguously.**

```js
const dur = Math.max(1, Math.round(seg.base / rate));
timeline.push({ ..., start: t, dur });
t += dur;
```

Rounding each duration to an integer *before* accumulating into the running start
keeps `start[n+1] === start[n] + dur[n]` exactly true, with no float drift. Tests
assert this invariant directly.

`rate` is a speed multiplier: 2 is twice as fast, durations halved. It is applied at
`Speak` time, not live — changing the slider affects the next utterance.

`rng` is injectable so tests are deterministic.

## Stage 3 — sampling

[sampleTimeline](../frontend/src/lib/visemePlayback.js) is a **hard step function**
with no interpolation whatsoever. Given a time in ms, it finds the segment covering
it (start-inclusive, end-exclusive) and returns a weight set with exactly one viseme
raised — or all zeros for a CLOSED segment.

Keeping it dumb is the point: sampling stays trivially testable, and all smoothing is
one other function's job.

## Stage 4 — damping, and where co-articulation comes from

```js
const alpha = 1 - Math.exp(-stiffness * dtSec);
out[v] = c + (t - c) * alpha;
```

This single line is the most valuable one in the pipeline.

Because weights *decay* toward their target rather than snapping, each mouth shape
bleeds into its neighbours the way real speech does. **Co-articulation is a free side
effect of exponential damping** — there is no blending logic anywhere else in the
codebase. Tuning the entire mouth is one number.

Putting `dt` in the exponent makes the result frame-rate independent: one 16 ms step
and two 8 ms steps land in the same place, so a 144 Hz monitor does not animate
differently from a 60 Hz one. There is a test for exactly this.

`stiffness` defaults to 18; the Speech tab exposes 2–60. Low is mushy, high is crisp.

## Stage 5 — driving it

[useVisemePlayback.js](../frontend/src/hooks/useVisemePlayback.js) is 26 lines and
holds one ref: the damped weight set surviving between frames. All arithmetic is
delegated to `lib/`. When `speechStartedAt` is `null`, the target is all-zeros, so the
mouth damps closed rather than freezing mid-shape.

## Ending an utterance

The speech engine owns this now. It knows when the last scheduled sample has played out
and ends the state itself, so neither `SpeechBar` nor `SpeechTab` carries a stop timer
any more.

That is a responsibility removed rather than moved. The timer was always standing in for
the thing that makes the sound, and there is one now:

```js
// speechEngine.js — the same 200ms tail, against the audio clock
setTimeout(() => this.stop(), remainingMs + RELEASE_TAIL_MS);
```

The 200 ms tail survives unchanged, and for the original reason: the mouth damps closed
rather than snapping, so ending on the exact final sample cuts that release off
mid-decay. The silent fallback schedules the same way off `timelineDuration`.
