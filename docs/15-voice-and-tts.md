# Voice and TTS

**Job of this doc:** explain how she speaks out loud — the setup, the pipeline, and the
one rule everything else here follows from.

See also: [04-speech-pipeline.md](04-speech-pipeline.md) (the mouth, which this drives) ·
[03-frame-loop.md](03-frame-loop.md) (where the clock is read) ·
[12-conversational-states.md](12-conversational-states.md) (what `speaking` means)

---

## The premise changed

This project was built on *"there is no audio anywhere in this system"*, and that was
load-bearing rather than incidental — it is why the mouth timing could be derived from
text, why five visemes were enough, and why a pronunciation dictionary was not worth its
weight. All of that reasoning was sound, and all of it assumed there was nothing to
compare the mouth against.

There is now. The avatar is going into a separate application where an AI agent already
exists as a chatbot, and the job here is to give that agent a body and a voice.

**What did not change:** the silent path still exists, still runs, and is still tested.
It is the fallback now rather than the product, which makes it a genuine fallback rather
than a degraded imitation of one. With no API key she mouths the words exactly the way
she used to.

## Setup

```
cp frontend/.env.example frontend/.env.local
```

Fill in at least one key and **restart the dev server** — Next reads env at startup only,
which is the most common reason a key that looks right appears not to work.

**Both providers can be configured at once**, and both appear in the same voice menu.
That is the point: the only way to settle which voice is right is to hear the same
sentence in both, and if switching means editing env and restarting, the comparison never
gets made. This project has a standing example of what that costs — the default VRM model
is *still* the one picked by licence rather than by eye, months on, because comparing them
was never one click.

| Provider | Cost | Character |
|---|---|---|
| **OpenAI** | ~$0.015/min | Eleven fixed voices, no cloning. Competent and neutral. |
| **ElevenLabs** | ~5-10× that | Voice library, cloning and voice design — the one that can sound like a character rather than a narrator. |

ElevenLabs' free tier is ~10k credits/month — about **20 minutes on Flash**, or ~40 short
replies. Enough to audition properly, and **non-commercial**, so shipping on it is not an
option.

Everything is defaulted in [ttsConfig.js](../frontend/src/lib/ttsConfig.js):

| Variable | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` | — | Absent is a supported state: silent mouthing, and the UI says why |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | The one that follows tone instructions |
| `OPENAI_TTS_VOICE` | `nova` | alloy · ash · ballad · coral · echo · fable · nova · onyx · sage · shimmer · verse |
| `OPENAI_TTS_INSTRUCTIONS` | warm, unhurried | Plain-language delivery direction; only the `gpt-4o` models read it |
| `ELEVENLABS_API_KEY` | — | |
| `ELEVENLABS_MODEL` | `eleven_flash_v2_5` | **Half the credit cost of Multilingual v2 *and* lower latency** — better on both axes that matter here |
| `ELEVENLABS_VOICE` | first on the account | The opaque id, not the name |
| `ELEVENLABS_STABILITY` / `_SIMILARITY` | 0.5 / 0.75 | Judged by ear |
| `TTS_PROVIDER` | whichever key exists | Handles a voice id with no `provider:` prefix |
| `TTS_TIMEOUT_MS` / `TTS_MAX_CHARS` | 20000 / 1000 | |

Keys are read server-side and never reach the browser. That is most of why `/api/tts`
exists as a route rather than the client calling either API directly.

### A voice carries its provider

`voiceId` is qualified — `openai:nova`, `elevenlabs:21m00Tcm4TlvDq8ikWAM` — rather than
sitting beside a separate provider setting. One store key, one menu, and no way for the
two to disagree about who is speaking. An **unprefixed** id resolves to `TTS_PROVIDER`,
which is what keeps a bare `OPENAI_TTS_VOICE=nova` working without anyone learning the
scheme. [voiceId.js](../frontend/src/lib/voiceId.js) is pure and tested, including the
case that matters: an unknown prefix is treated as part of the id, because ElevenLabs ids
are opaque and breaking a working voice is worse than failing to recognise a provider.

### Two things to know before building on the voice

**OpenAI has no voice cloning and no custom voices.** Its eleven are the whole set, and
they are all fairly neutral in character — which is exactly why ElevenLabs is wired up
beside it rather than instead of it.

**This is not Advanced Voice Mode.** ChatGPT's conversational voice is the *Realtime*
API — a speech-to-speech model, which is where the breathing, the laughs and the natural
interruptions come from. `gpt-4o-mini-tts` is good text-to-speech that follows tone
direction well; it is not that. Reaching AVM-level realism means adopting the Realtime
API, which replaces the agent's loop rather than sitting beside it and locks the agent to
OpenAI's realtime models. That is a rewrite, not an upgrade.

## The one rule

> **The audio is the clock.**

Before the voice, the mouth *was* the clock. The frame loop asked
`performance.now() - speechStartedAt` where it had got to, and because nothing else made
a sound, whatever it answered was correct by definition.

With real audio there are two clocks and they do not agree. `performance.now()` is the
wall clock; the audio hardware runs on its own crystal, resamples to the device rate, and
drifts. Tens of milliseconds a minute is enough to see, and a mouth running ahead of the
voice is the most obvious way an avatar looks fake.

So [speechEngine.js](../frontend/src/audio/speechEngine.js) exposes `positionMs()` —
where the *sound* has got to — and the frame loop samples the timeline at that point:

```js
const audioMs = speechEngine.positionMs();
const tMs = audioMs ?? (s.speechStartedAt === null ? null : nowMs - s.speechStartedAt);
```

`null` means no synthesised utterance is playing, which is the signal to fall back to the
wall clock for silent mouthing. A **negative** result is normal and meaningful: it is the
scheduling lead before the first sample plays, and `sampleTimeline` answers a negative
time with a closed mouth — which is exactly right, because she should not start moving
before the sound starts.

The reason this was a cheap change is the purity boundary. `useVisemePlayback` already
took time as a parameter, so `lib/` did not change at all — only *which number* gets
passed in.

## The host contract

One call. Everything else follows from it.

```js
useAvatarStore.getState().say('Here is what I found.');
```

`say()` chunks the text, synthesises each chunk, schedules the audio gaplessly, builds
the mouth timeline against the real decoded duration, and ends the speaking state when
the sound stops. **Calling it again interrupts whatever is running** — barge-in is just
the next `say()`.

It never throws and never rejects. There is no need to set `conversationState` around it:
an active utterance already wins over the store's state inside the frame loop, so the
mouth and the posture cannot disagree.

| Action | Does |
|---|---|
| `say(text)` | The whole utterance: synthesis, audio, mouth, state |
| `stopSpeaking()` | Stops now — aborts in-flight synthesis and scheduled audio |
| `setVoice(id)` | Override the env default; `null` restores it |
| `setVoiceEnabled(bool)` | Voice on/off. Off still mouths the words |
| `speak(timeline)` | The original silent interface, kept for the fallback and the workbench |

`speechStatus` reports back: `idle`, `synthesizing`, `speaking`, `muted`, `blocked`,
`unavailable`, `error`. The two worth surfacing in a UI are **`blocked`** (the browser
has not had a user gesture yet — fixed by clicking) and **`unavailable`** (synthesis
failed). Both mean she is mouthing silently, and they are kept distinct because they have
completely different fixes.

> **`unavailable` deliberately does not name a cause.** It used to read "no voice
> configured", which is the most *common* reason rather than the reason — and when the
> real cause was a provider demanding a paid plan, that label sent the reader checking
> environment variables for a key that was already set. A status that guesses is worse
> than one that admits it does not know. The provider's own message is on the element's
> title and in full in the dev panel.

### Integrating with a streaming agent

Two things bite, and neither is about the avatar:

**Every `say()` interrupts the last one.** That is correct for barge-in and wrong for
token streaming — calling it per delta means each call cancels the previous and you hear
only the final fragment. The host must buffer deltas and flush at sentence boundaries, or
this needs queue semantics. **This is still open.**

**Markdown, code blocks, JSON and URLs are read aloud literally.** The chat renderer
handles those visually; speech needs its own stripping pass. Worth deciding separately
whether intermediate chatter is voiced at all, or only final user-facing replies — every
call is latency and per-character cost.

### The voice toggle

`setVoiceEnabled(false)` routes `say()` straight to the silent path — **no request is
made**, so a muted utterance costs nothing and adds no latency.

Two behaviours worth knowing, both deliberate:

- **Off still mouths the words.** It is not a mute button over a frozen character. In a
  room where sound is not possible, an avatar that stops moving mid-reply is worse than
  one that talks quietly, and the fallback that makes this work is the same one that
  covers a missing key.
- **Toggling off mid-sentence stops her.** Scheduled audio keeps playing until something
  stops it, so a toggle that only flipped the flag would leave the current utterance
  audible and mute the *next* one — which reads as a broken button. A test pins it.

The toggle is on the production bar ([VoiceToggle.jsx](../frontend/src/components/Controls/VoiceToggle.jsx))
and in the workbench Speech tab. It is **not persisted**: it resets to on with the page.

### The voice belongs to the model

**There is no voice control.** Each model carries its own voice id in `MODEL_NAMES` in
[constants.js](../frontend/src/lib/constants.js), and switching the model switches the
voice with it.

A character is a body and a voice, not a body plus a setting. Leaving the two
independently selectable let you put a sixty-year-old broadcaster behind a pink-haired,
cat-eared avatar — not a configuration anyone wants, and a menu everyone has to think
about. Deriving it removes both the control and the class of bug where it silently
disagrees with who is on screen.

| Model | Voice | Published labels |
|---|---|---|
| Sakura | Laura | young · sassy |
| **Rin** *(default)* | `XiPS9cXxAVbaIWtGDHDh` | Voice Library — chosen by the user, labels not published to the API |
| Hana | `BZgkqPqms7Kj9ulSkVzn` | Voice Library — chosen by the user, labels not published to the API |
| Yoru | `n7534fCgBXcPEM82JQYu` | Voice Library — chosen by the user, labels not published to the API |
| Kuro | Matilda | american · upbeat |
| Momiji | Jessica | young · cute · warm |
| Yuki | Bella | bright · warm |
| **Mio** | **Will** | **male** · young · chill |

Mio is deliberately the one male voice, which is also the only reason Yuki and Mio — the
same character model with a beret between them — are told apart by ear at all.

Consequences worth knowing:

- **`setModel` stops a running utterance.** Letting one finish through the swap would
  leave the previous character's voice coming out of the new one's body for the rest of
  the sentence.
- **A model with no row still speaks**, on the provider's env default. Dropping in a new
  `.vrm` does not need a voice before it works.
- **`/api/voices` is now a developer endpoint**, not a picker feed. It is how you find an
  id to put in a row. The Speech tab shows the current model's voice as a readout and
  offers no way to change it.

**Rin, Hana and Yoru are Voice Library voices**, picked by ear rather than from the
premade list, which is why their rows carry an id rather than a name: a voice that is not
on the account does not appear in `/v1/voices`, so there is nothing to read a name or a
label off. All three were confirmed by **synthesising through them** — the only check
that means anything here, see below. The other five rows are still premade voices
reasoned from published labels.

> **Nobody has heard the five premade ones against the models.** They are reasoned from
> the labels ElevenLabs publishes and the look notes beside them, which makes them a
> *derivation* — and this project's record on derivations is bad enough to be written
> into its invariants. Expect to move some after listening. One line per row.

### Free plans cannot use Voice Library voices — the account is no longer on one

**Resolved.** The account is now on **Starter**, and the two Voice Library voices in the
table above synthesise through the API and return audio. The history below is kept
because the diagnostic lesson in it outlived the restriction.

This was the constraint that shaped the table above, and it cost a round of confusion
worth recording.

Voices come in two categories. **Premade** — the 21 that come with any account — work on
any plan. **Professional** — everything in the Voice Library, including every anime voice
— return `402 paid_plan_required` through the API on a free plan:

> *"Free users cannot use library voices via the API. Please upgrade your subscription to
> use this voice."*

**Adding a library voice to the account does not help.** That was the assumption that
wasted the time: Rin and Hana were both set to library voices that had been added and
appeared perfectly normal in `/v1/voices`, and both returned 402 at synthesis. Being on
the account and being usable through the API are different things, and only a synthesis
call distinguishes them. The two were reverted to premade voices.

That was why every row in the table was once drawn from the 21 premade voices, **none of
which is anime in character** — the register this avatar actually wants. Starter is the
smallest plan that lifts the restriction, and it is the plan the account is on, so the
Library is open. Rin, Hana and Yoru use it.

Worth knowing for the next one: a Library voice that has **not** been added to the
account still synthesises, but `/v1/voices/{id}` returns `voice_not_found` for it. So the
voice list cannot be used to check an id either way — presence does not prove usable, and
absence does not prove unusable. Only a synthesis call answers it.

A quick way to check a voice before mapping it: `category` from `/v1/voices` must be
`premade`, or synthesis must be tried outright. Presence in the list proves nothing.

## The pipeline

```
  say(text)
    │  chunkText()                     lib/chunkText.js      pure
    ▼
  chunks, one sentence-ish each
    │  POST /api/tts, one per chunk, pipelined
    │     └─ OpenAI /audio/speech  →  WAV
    ▼
  { audio, phonemes: [], durationMs }
    │  decodeAudioData          ← the authority on duration
    │  stretchTimeline()        grapheme shapes over the real duration
    ▼
  scheduled AudioBufferSourceNode  +  viseme segments offset to match
    │
    ▼
  frame loop samples the timeline against the audio clock
```

### Why chunk

Time-to-first-audio. Synthesising a whole paragraph before playing a sample puts a
silence in front of every reply that scales with its length, which is the one thing an
agent's voice must never do. A sentence is synthesised, starts playing, and the next one
is synthesised while it plays.

There is a **floor** as well as a ceiling: a two-word sentence is not worth a round trip
of its own, so short sentences merge forward until the chunk clears 60 characters.

### Pacing — the beat between sentences

Chunks are scheduled against a running `nextStartCtx` rather than started on arrival.
Starting each one "now" as it lands makes the gap between two sentences equal to a
network round trip, which varies per sentence and sounds like she is reading a list.

**The first version of that went too far and set the gap to exactly zero** — one
sentence's last sample followed immediately by the next one's first. It was reported
exactly as it sounds: *like she is in a hurry*. Removing the accidental gap had removed
the deliberate one with it. The right gap between two sentences is not zero, it is the
beat a person takes.

`pauseAfterChunk` in [chunkText.js](../frontend/src/lib/chunkText.js) picks it from the
punctuation the chunk ends on:

| Ends with | Pause |
|---|---|
| `.` `!` `?` `…` | `sentencePauseMs` (default **380 ms**, live in the Speech tab) |
| `,` `;` `:` | 45% of it — a comma is not a stop |
| nothing | **zero** — a length-forced split mid-sentence, where a pause would be *wrong* |

That last row is the one worth keeping: a chunk with no terminal punctuation is a split
the length ceiling forced in the middle of a sentence, and holding silence where the
speaker has not finished the thought is worse than rushing.

**The mouth follows for free.** The next chunk's segments are offset from the same
`nextStartCtx`, and `sampleTimeline` answers an uncovered time with a closed mouth — so
she holds her lips together through the pause rather than freezing mid-shape.

A chunk that arrives after its slot has passed starts as soon as it can rather than in
the past, so a slow synthesis degrades to a longer pause rather than to silence.

#### The merge floor is part of pacing

`chunkText`'s floor dropped from 60 characters to **25** in the same change, and the
reason is not cost:

> A merged sentence boundary is one the **synthesiser** paces. An unmerged one is one
> **we** pace.

Every synthesiser tried here hurries a full stop, and there is no way to reach inside a
chunk and slow one down. Keeping ordinary sentences unmerged puts their boundaries under
`sentencePauseMs`, and costs only a few more short requests. Really short fragments still
merge, because "Hi." on its own is not worth a request.

#### Commas need a different mechanism

Fixing full stops did nothing for commas, and could not. `chunkText` **only splits on
sentence terminators**, so a comma is always *inside* a chunk, where the gap between
chunks cannot reach it. The clause branch of `pauseAfterChunk` fires only after a
length-forced split — rare enough that it was effectively dead code, which is exactly how
it was found: the full stops improved and the commas did not.

Splitting on commas as well would be worse than the problem. Each clause would be
synthesised as its own utterance and get sentence-final *falling* intonation, so "I went
to the shop," would sound finished rather than continuing. **Prosody belongs to the
sentence, so the sentence has to stay in one request.**

So the pause goes *inside* the synthesis instead, as a break tag:

```
Yes, of course.   →   Yes,<break time="0.17s" /> of course.
```

`withClausePauses` in [chunkText.js](../frontend/src/lib/chunkText.js) inserts them, at
`sentencePauseMs × 0.45`. Two limits are deliberate:

- **Only after punctuation followed by whitespace**, so `1,000` is left alone — breaking
  a thousands separator would read the number as two.
- **At most six per chunk.** ElevenLabs warns that many break tags in one request can
  destabilise the audio; a sentence wanting a dozen pauses is better served by the six it
  gets than by risking artefacts.

> **This is ElevenLabs syntax and is applied inside that provider, never in the route.**
> A synthesiser that does not parse break tags would **read them aloud**. That is why it
> lives in `providers.js` beside the request it belongs to rather than in shared code.

One honest cost: the mouth timeline is stretched proportionally across the whole chunk,
and break tags add silence *inside* it. So her lips keep moving slightly through a comma
pause. It is small against the existing approximation — the shapes are already inferred
from spelling — and it goes away entirely once there is a phoneme source.

## The open problem: the mouth has no phonemes

**This is the known quality gap and it is worth stating plainly.**

A hosted synthesiser returns audio and says nothing about how it pronounced it. A local
engine could be asked for the exact phoneme sequence it was about to speak, and the mouth
was built on that. This one cannot, so `phonemes` comes back empty and the client falls
back to `stretchTimeline`: grapheme-derived mouth shapes, scaled to the measured duration
of each chunk.

What that means in practice:

- She **starts and stops with the voice**, always. Chunk boundaries are exact.
- The shapes *between* those points are inferred from spelling. English spelling is
  irregular — "though", "through" and "tough" share four letters and no mouth shape — so
  individual words can be visibly wrong even while the rhythm is right.
- Expressive delivery makes this worse, not better. Variable pacing is exactly what
  proportional grapheme timing handles least well.

[phonemes.js](../frontend/src/lib/phonemes.js) is kept, tested and wired into the engine's
first branch, waiting for a source. Two would work, and neither needs a binary on the
server:

1. **A pronunciation dictionary, server-side.** CMUdict is a few megabytes of pure data,
   bundles fine into a serverless function, and maps words to phonemes directly. Unknown
   words (names, neologisms) fall back to graphemes, which is how such systems normally
   work. This is the option the docs have pointed at since before there was audio — it
   was filed as "not worth its weight" precisely because nothing could contradict a wrong
   guess. Something can now.
2. **espeak-ng compiled to WASM, in the browser.** Small, runs per sentence, negligible
   against the render loop. Adds a dependency and a download.

The alignment would stay **proportional** either way — each phoneme taking its share of
the measured audio by ratio — because no synthesiser here returns per-phoneme durations.
What changes is that the shapes would be right.

## How it fails

Every failure degrades rather than throwing, and the ordering is deliberate.

| Failure | Result |
|---|---|
| Voice needs a paid plan (`402`) | Silent mouthing, `unavailable`, with the provider's own message in the dev panel |
| Voice toggled off | Silent mouthing, `muted`. No request is made at all — no latency, no cost |
| No user gesture yet | Silent mouthing, `blocked`, and a listener armed so the *next* utterance has a voice |
| No API key | Silent mouthing, `unavailable`, with the fix named in the UI |
| API error on the first chunk | Silent mouthing for the whole utterance |
| API fails mid-utterance | Audio already heard, so the rest is **cut** rather than continued silently |
| Interrupted by a new `say()` | Everything torn down — in-flight requests aborted, scheduled sources stopped |

The fourth row is a judgement rather than a mechanism: splicing a silent mouth onto the
end of real speech would look like she kept talking after her voice gave out, which reads
worse than stopping.

## A local engine lived here first

Piper — local, MIT, free, offline — was built and then removed. It is worth recording why,
because the reasoning applies to anything else that might be reached for:

**A Vercel serverless function cannot execute a native binary.** The host application
deploys there, and piper plus espeak-ng plus a voice model is both a large bundle and a
cold start per invocation. It would have needed a container somewhere, which is a service
to run and pay for — at which point the "local and free" argument that recommended it in
the first place had mostly evaporated.

What the local path did have, and what its removal cost, is the phoneme sequence above.
That is the whole of the trade.

The route is the seam that made each swap cheap: `speechEngine` sends text and receives
`{ audio, mimeType, phonemes }`, and has no opinion about what produced them. The backend
has now been a local binary, then one hosted API, then two — and **not one line of client
code changed across any of it.** A third provider is one file in
[tts/providers.js](../frontend/src/lib/tts/providers.js) implementing `listVoices` and
`synthesize`.

### Why ElevenLabs returns mp3 and OpenAI returns WAV

OpenAI is asked for WAV so the duration can be read off the header server-side, catching a
truncated response before it becomes a mouth running to the wrong length. ElevenLabs'
`pcm_*` formats are gated behind higher plans, so asking for them would turn a free-tier
audition into a confusing 400 — mp3 is available on every tier and the browser decodes it
natively. Either way the **decoded** buffer is what the mouth is laid out against, so the
difference costs nothing but a server-side sanity check.

`rate` is also deliberately not sent to ElevenLabs: speed control there lives inside
`voice_settings`, is model-dependent and narrowly bounded, and an unsupported field fails
the whole request rather than being ignored — taking the voice down instead of degrading.
The mouth stays in sync regardless, because it is laid out against the measured duration
of whatever comes back. The Rate slider therefore affects the OpenAI voice and only the
mouth on ElevenLabs, and its hint says so.

## What a test cannot tell you

The pure parts are covered — chunking, the IPA map, duration normalization, WAV header
parsing. What no test here can answer is **whether the mouth looks like it is saying what
you hear**, and that is the only question that matters.

Same limit as everything else in this project: `composite.test.js` once asserted the arms
mirror each other, which was true while she stood in a permanent cheer.
