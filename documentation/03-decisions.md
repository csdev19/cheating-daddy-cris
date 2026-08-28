# 03 — Decision log

Every decision with its context and its reasoning. It includes the ones that were
**reversed** halfway through the analysis, with the reason for the change — those
are the most useful to keep.

---

## D1 — Reactive, not proactive

**Decision:** the app only shows an answer when you press a shortcut. It
accumulates context quietly the rest of the time.

**Why:** in an interview, with someone looking you in the face, anything that
appears on its own is a distraction. It also decouples transcription (continuous
and cheap) from reasoning (occasional and expensive), which incidentally removes
the daily-limit burn the app has today calling the model on every turn.

---

## D2 — One app, this repository

**Decision:** no HTTP bridge between processes. Screen capture is ported here from
the other Electron project.

**Context:** the other project was mentioned as evidence that capture is already
solved and fast, not as an app that had to stay separate.

**Why:** `ipcMain.handle` only talks to the renderer of its own app, so two apps
would force inventing a transport (HTTP over loopback). It was the most fragile
piece of the plan and it disappears entirely by consolidating.

---

## D3 — Local transcription with Whisper, not Gemini Live

**Decision:** a local `whisper-server` transcribes; the cloud provider only reasons.

**Rejected alternative:** Gemini Live does transcription + diarisation + reasoning
in a single stream, with considerably less code.

**Why:** whatever is always on has to be the most robust and the cheapest thing.
Gemini Live is a WebSocket held open for 45 minutes — the repo already has
reconnection with 3 attempts _because it was needed_. A disconnect 20 minutes into
your interview leaves you without the thread of the conversation, which is exactly
what this is being built to hold. Local Whisper does not disconnect, does not cost
per minute, and **your audio never leaves the Mac**.

**What looked like it was being lost:** diarisation. It is not — see D6.

---

## D4 — `large-v3-turbo`, not `tiny.en`, and no Parakeet in v1

**Decision:** add `large-v3-turbo` to the catalogue and make it the default. Keep
`medium.en` and `small.en` as alternatives.

**Why not `tiny.en`:** it is the smallest model in the family, exactly where
accents collapse. And being `.en` it does not detect the language, it assumes it:
with Spanish it produces garbage, not degradation.

**Why not a bigger `.en` model:** the `.en` models do beat the multilingual ones of
the same size on English, but the gap narrows with size — so much so that at
`large` there is no `.en` variant at all. `large-v3-turbo` covers English better
than `small.en` **and** leaves the door open to Spanish without changing anything.

**Why not Parakeet:** it is better on paper (~6.3% WER vs ~7.8% for turbo) and
smaller, but **it does not run on whisper.cpp**. Adopting it means compiling and
hosting new binaries for macOS arm64 and Windows with SHA verification, replicating
what `native-ai-runtime.js` already does. That is a project, not a configuration
change. On top of that the ranking moves fast (three different models held first
place in 2026 alone): building infrastructure to chase the leader is chasing a
moving target.

**How it will be revisited:** with the test bench on real audio. If
`large-v3-turbo` does not perform on your own accent, there will be a data-backed
case for investing in Parakeet.

---

## D5 — `NORMAL` VAD with pre-roll

**Decision:** drop from `VERY_AGGRESSIVE` to `NORMAL` (threshold 0.02 → 0.01,
silence 15 → 30 frames) and add a ~300 ms pre-roll.

**Why:** it is probably the main cause of the earlier poor experience, above the
model. The current VAD cuts on raw RMS energy: anyone who speaks quietly, has a bad
mic, or **pauses to think** (constant in interviews) gets cut off before Whisper
sees the audio. The pre-roll recovers the attack of the phrase, which is what is
lost most with accented speakers.

---

## D6 — Channel labelling, not diarisation

**Decision:** the speaker label comes from the source stream — system audio =
`[them]`, microphone = `[me]`.

**Why:** with dual capture these are two physically separate streams, so the
labelling is correct **by construction** and needs no algorithm at all. It is more
reliable than diarisation, which infers who is speaking and fails when two people
talk over each other or when there are three on the call.

**Consequence:** the only real advantage of Gemini Live over local Whisper (D3)
evaporates precisely because of the capture design already chosen.

---

## D7 — Profiles as markdown folders

**Decision:** a profile is a folder with `profile.md`, `checklist.md` and `context/*.md`.

**Why:** no authoring UI needs to be built — you write in your editor. And
`profile.md` is what kills the teleprompter prompt (H6): you define the behaviour,
it is not hardcoded.

**Rejected alternatives:** a bigger textarea (falls short with real material); RAG
with embeddings (see D8); loading loose files per session (does not accumulate
reusable memory across meetings of the same kind).

---

## D8 — No RAG, no embeddings

**Decision:** every `context/*.md` is sent whole on each call.

**Why:** the target models have **1M tokens of context**. All your notes plus the
full transcript plus the screenshot fit comfortably. Adding an embedding model and
a vector store would solve a problem that does not exist, and would be a whole
subsystem to maintain.

**When to revisit:** if the prior material grew until it no longer fit, or if the
cost of resending it stopped being amortised by prompt caching.

---

## D9 — Gemini first, not Claude _(revised recommendation)_

**Decision:** v1 ships with the Gemini adapter that already exists and works.

**Previous recommendation:** Claude (Opus 5, then Sonnet 5).

**Why it changed:** two reasons, one of them a mistake of my own.

1. **The price comparison was wrong.** Claude's high tiers were compared against
   Gemini's _Flash_ tier. Comparing tier for tier, Gemini 2.5 Pro (~$0.20/meeting)
   and Claude Sonnet 5 (~$0.23/meeting) cost practically the same. The claim
   "Gemini is much cheaper" only held up because of the skewed comparison.
2. **The repo already speaks Gemini fluently.** `gemini.js` works, has
   reconnection, the Live API, and Google Search grounding already wired (H9) —
   which serves the concept-lookup capability directly. Claude would be new code
   that does not exist yet, and both equally require their own API key.

**What does not change:** the design. The _seam_ from section 1
(`session-context.js` assembles, an adapter sends) keeps plugging Claude in later
cheap.

**How it will be revisited:** by measuring. The same meeting against Gemini and
against Sonnet 5. If Gemini recalls the notes well and reads the screenshots well,
there is no reason to pay more. If it hallucinates a figure that was in the
markdown, there is the answer.

**Factual note:** 1M of context **is not exclusive to Fable**. Opus 5, Sonnet 5 and
Fable 5 all have it. Fable is simply the expensive tier ($10/$50) and is not needed
here.

---

## D10 — TanStack AI: out

**Decision:** do not adopt `@tanstack/ai`. Full analysis in [04-evaluations.md](04-evaluations.md).

**Why:** it fits conceptually (it adapts Anthropic, Gemini, Groq, Ollama and
OpenAI-compatible, which maps almost 1:1 onto the repo's modes) but it clashes
mechanically: it is **pure ESM** and would live in the **main process**, which is
CommonJS on Node 20 — where `require(esm)` does not work. Adopting it forces either
upgrading Electron or introducing the repo's first bundler. Add that it sits at
0.49.1 (the Anthropic adapter at 0.18.0) and that its docs do not confirm image
input, which is a central requirement here.

It solves a problem we do not have yet: we are consolidating _towards_ one
provider, not spreading across eleven.

---

## D11 — Mediabunny: out of v1, a candidate later

**Decision:** not on the critical path. `OfflineAudioContext` for resampling.

**Why not now:** the core moves PCM in memory towards Whisper; there are no
containers and no codecs involved, which is Mediabunny's territory. And the broken
resampler (H7) lives in the **main process**, where there is no WebCodecs and no
AudioContext — Mediabunny cannot fix it there. Moving the DSP to the renderer lets
`OfflineAudioContext` resample properly with no added dependency.

**Why yes later:** to **record the session audio compressed**. That allows
re-transcribing past meetings with better models and feeding the test bench with
real material. Raw WAV is hundreds of MB per meeting; Opus is a few.

**Note:** unlike TanStack, ESM is **not a blocker** here — Mediabunny would go in
the renderer, which already loads ES modules (that is how Lit is imported today).
It gets vendored into `src/assets/` following the existing pattern. It is also at
v1.55.2 with zero dependencies: far lower risk.

---

## D12 — Model selectable per profile

**Decision:** `model:` in the frontmatter of `profile.md`.

**Why:** cost per meeting runs from ~$0.01 to ~$1.16 depending on the model, but
the stakes vary enormously too. A job interview justifies the good model; a daily
standup does not. This solves it with no new machinery, and it incidentally keeps
the Gemini adapter as the cheap option and as an escape hatch if the provider ever
changes.

---

## D13 — Confidential profiles stay local

**Decision:** a `confidential: true` flag in the frontmatter → that session sends
nothing to the cloud and accepts being less capable.

**Why:** even though the audio never leaves the Mac (D3), the **transcript does
travel** to the provider on every call. For a confidential meeting that is real
exposure. The decision is taken when choosing the profile, not in the heat of the
meeting.

---

# Decisions from the audit (2026-08-26)

Arising from [06-audit.md](06-audit.md).

## D14 — Transcription and reasoning are independent axes

**Decision:** replace the single `byok | cloud | local` mode with two settings:
`transcription: 'local-whisper' | 'gemini-live'` and
`reasoning: 'gemini' | 'local-llama'`. Default: `local-whisper` + `gemini`.

**Why:** today "local" means _whisper and llama together_ (`localai.js:425` starts
both with no option). The combination the design needs — transcribe locally, reason
in the cloud — did not exist. Without this decision, using Whisper forced
downloading Qwen and having 17 GB of RAM tied up unused (A1).

**Consequence:** `initializeLocalSession` splits into `startTranscription()` and
`startLocalReasoning()`. A `confidential: true` profile (D13) forces
`reasoning: 'local-llama'`.

## D15 — A single entry point for asking

**Decision:** text, screenshot and shortcut all enter through
`sessionManager.ask()`. `send-text-message` stops talking to the providers
directly.

**Why:** the plan only wired the screenshot; a typed question skipped the notes and
the transcript (A2). It makes no sense for the model to have memory only when
there is an image.

## D16 — The checklist is judged from context, not from state, in v1

**Decision:** do not generate `checklist` events in v1. The model receives the list
and the transcript, and when asked it answers what is still open. `addChecklist` is
kept in the thread for a v2 with explicit ticking.

**Why:** no task actually produced those events (A3). The two alternatives — asking
the model for structured output on every `ask`, or an extra call per turn — add
cost and complexity for a benefit that context already covers reasonably well.
Measure first whether the model gets the list right from context; if it fails, add
state.

## D17 — Post-session summary that feeds the profile

**Decision:** when a session closes, generate a summary (agreements, open items,
names, figures) and **append** it to `profiles/<profile>/context/history.md`. It is
shown in `HistoryView` too.

**Why:** it was the biggest omission in the idea (M1). "Remember what I forget"
includes what was said in the previous meeting with the same person. It closes the
loop between sessions for the cost of one call. And it makes the history readable
without reading the raw transcript (M2).

**Limit:** `history.md` is trimmed to the last N entries (N=20) so the cached
prefix cannot grow without bound.

## D18 — Headphones as a documented requirement

**Decision:** the session start UI warns that without headphones the `[me]` channel
may pick up the interviewer. No attempt is made to separate them in software.

**Why:** channel labelling (D6) is only "correct by construction" with headphones
(B1). `echoCancellation` is already on and mitigates it; promising more would be
lying. It is more honest to warn than to build diarisation to paper over the case.

## D19 — `AGENTS.md` stops promising TypeScript/React/shadcn

**Decision:** rewrite `AGENTS.md` so it points at `documentation/` as the source of
truth and drops the migration instructions to TS + React 19 + shadcn.

**Why:** it flatly contradicts the global constraints (CommonJS, no build, Lit). An
agent that reads it first will undo the work (B8).

## D20 — Total latency is 6-9 s and is accepted

**Decision:** accept that from the end of a sentence to seeing an answer takes
6-9 s (VAD + Whisper + keypress + Gemini). Try `silenceFramesRequired: 20` (2 s)
with the test bench as the first adjustment; add response streaming (B5).

**Why:** the reactive design implied it but nobody had added it up (C3). It serves
"remind me of a figure", not "what do I say right now" — and that is consistent
with D1: the app is memory, not a teleprompter.

## D21 — Local Whisper confirmed after the audit (revision of D3)

**Decision:** keep local Whisper as the default transcriber, with D14 applied.
Gemini Live stays available as `transcription: 'gemini-live'`, not removed.

**Why it was called into question:** the audit found (A1) that "local mode" in this
repo means _whisper **and** llama together_ — `initializeLocalSession` downloads
Qwen (~2.5 GB) and always starts `llama-server`. With that, choosing Whisper forced
having ~17 GB of RAM tied up by an unused LLM, on a 24 GB Mac shared with Meet and
Chrome during the interview. That really was reason enough to move to Gemini Live.

**Why it is confirmed anyway:** the problem was the code, not Whisper. With D14 the
real cost of local transcription is the model (~1.6 GB) and one process. With the
ground levelled, three things decide it, in this order:

1. **Robustness.** Whatever is always on has to be the thing that does not fail.
   Gemini Live is a WebSocket held open for 45 min and the repo already has
   reconnection with 3 attempts _because it was needed_. Losing the thread 20
   minutes in is losing the whole product.
2. **Measurability.** This weighs most for the concrete worry (accents): with
   Whisper you record 3 minutes and compare models over _the same file_ until you
   have confidence. With Gemini Live every test is unrepeatable and there is no
   parameter to tune.
3. **Gemini Live's advantage evaporates with two channels.** Its diarisation was
   the draw; labelling by physical source (D6) already covers it, more reliably.

**What is conceded:**

- Total latency (6-9 s, D20) is not fixed by changing transcriber: the bulk is in
  the VAD and in the reasoning, not in Whisper (1-2 s of it).
- **B10 is still unverified.** If the `whisper-server` binary from the releases was
  compiled without Metal, `large-v3-turbo` on CPU could climb to 4-6 s per segment,
  which would be unacceptable.

**Reopening criterion, measured in task 12:** per-segment latency for 10 s of audio
below ~4 s, and a readable transcript with a non-native accent. If it fails, the
first remedy is changing model (`medium.en`) or recompiling the binary — **not**
changing architecture. Only if both fail is `gemini-live` reconsidered.

---

# Decisions from the first real sessions (2026-08-28)

## D22 — A stretch of speech is cut on length, and the length is a setting

**Decision:** close a segment after `maxSegmentSeconds` of continuous speech even
with no pause, cutting at the quietest frame of the last second. Default 12 s,
editable in preferences.

**Why:** the VAD only closed on 2 s of silence, so talking for five minutes
straight produced no text at all for five minutes and then a wall of it. Measured
on an M4 Pro with `large-v3-turbo` and Metal:

| Audio | Transcription | Ratio |
| ----- | ------------- | ----- |
| 3 s   | 1.08 s        | —     |
| 10 s  | 1.13 s        | —     |
| 27 s  | 1.30 s        | 20x   |
| 60 s  | 2.85 s        | 21x   |
| 120 s | 4.86 s        | 25x   |
| 300 s | 11.5 s        | 26x   |

Two things follow. Whisper is not the bottleneck — it runs at ~25x real time, so
B10 is answered: the binary does accelerate. And the cost is flat below ~27 s
because Whisper works in 30 s windows, so a chunk under that costs a single pass.
Ten chunks of 30 s cost the same total compute as one 5-minute call, but the words
appear while the person is still talking.

**Why it is a setting:** the right value depends on how someone speaks and on how
much they mind split sentences. It is meant to be tuned, not guessed once.

**Cut point:** the quietest frame within the last second, so the cut lands on a
micro-pause rather than mid-syllable, which is what degrades the words either side
of a boundary. Only a voice frame can trip the cap: forcing a cut during trailing
silence would ship pure silence to Whisper, which is where it hallucinates (B3).

---

## D23 — An echoed turn is flagged, never deleted

**Decision:** when a microphone turn closely matches something the system channel
transcribed in the last 15 s, mark it `echo: true`. It stays in the thread, shown
collapsed, and is excluded from the transcript the model reads. A one-off notice
explains the cause.

**Why not delete it:** repeating a question back is ordinary conversation — "and
how was your day?" — and a similarity threshold cannot tell that apart from an
echo with confidence. Deleting would lose something the person actually said, with
no way for them to notice. Marking makes a false positive harmless.

**Why exclude it from the transcript:** the same words are already there from the
system channel. Sending them twice skews what the model believes was said, and who
said it.

**Similarity measure:** Dice coefficient over word multisets, threshold 0.85, with
a five-word floor. Intersection-over-smaller was rejected because it scores a
subset as a perfect match, which is exactly the repeated-question case that must
not be flagged.

**What this does not do:** it is not acoustic echo cancellation. With headphones
the problem does not arise at all, which is what D18 already says; this only
cleans up what leaks through when there are none.
