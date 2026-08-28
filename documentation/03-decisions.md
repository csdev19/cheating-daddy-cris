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

---

## D24 — The session summary runs detached from the close

**Decision:** `close-session` stops the audio, flushes the thread to disk, takes a
snapshot of what the summary needs, ends the session and returns. The model call
runs afterwards, unawaited, reporting itself through a `digest-started` /
`digest-finished` pair that the UI shows as an indicator.

**Why:** the summary is a full model call over the whole transcript. Measured with
`gemini-2.5-flash`: 8 s and 25 s on two runs, and 67 s once. The UI awaited it
before switching views, with no spinner and no message, so ending a session looked
like the app had frozen.

**Why a snapshot:** the call outlives the session. Reading `sessionManager` when it
finishes would be reading whatever session is open by then, and the old code's
`finally { sessionManager.end() }` would have wiped a session the person had
already started.

**Losing it is recoverable, not fatal.** The transcript reaches disk before the call
starts, so a summary lost to a crash is not lost data — it is unfinished work. The
session is marked `digestPending` before the call and the mark is cleared when it
lands, so the next launch can finish what was owed.

**Why an explicit mark rather than "has no summary":** deducing it would sweep up
the entire back catalogue, including sessions recorded before summaries existed,
and spend a model call on each one without being asked. Only sessions that actually
reached the close path are eligible. After three failed attempts it stops retrying,
so one broken session cannot retry on every launch for ever.

**What the mark does not cover:** a session the app never got to close — killed
mid-meeting — carries no mark. Its thread is still on disk, and the history offers
a `Generate summary` button for any stored session, which is its way back.

---

## D25 — Filtering hallucinations: what is done and what is deliberately not

**Decision:** drop segments the model flags as non-speech (`no_speech_prob >= 0.6`),
known junk phrases, and segments that are nothing but a tag or a sound effect —
`[BLANK_AUDIO]`, `(music)`, `*Boo*`, `*sniff*`.

**Considered and not done, pending evidence from real use:**

- **Dropping on low language-detection confidence.** In a real session the junk came
  back at p=0.44 and p=0.24 while good speech sat at p=0.98, so the signal is there.
  Not adopted yet because a short but genuine segment also scores low, and dropping
  it loses real speech silently — the same reason echoes are flagged rather than
  deleted (D23).
- **Pinning the session language instead of autodetecting.** It would remove the
  spurious jumps to Russian outright, but D4 chose a multilingual model precisely so
  the language is not hardwired, and it would break a bilingual meeting.

Both are recorded rather than implemented so the current filter can be judged on
real sessions first.

---

## D26 — A session is a folder: metadata written atomically, events append-only

**Decision:** each session lives in `history/<sessionId>/` holding `session.json`
(metadata, written atomically), `events.jsonl` (the thread, appended one line per
event), `transcript.md` (derived, readable) and the screenshots that were already
there. Sessions in the old flat layout keep working and are never rewritten.

**Why:** the thread was one JSON document rewritten in full on every save, with a
one-second debounce. Two things followed. `fs.writeFileSync` truncates before
writing, so a crash during a save destroyed the whole session rather than losing
the last change — and because the document grew with the meeting, the exposure grew
with it. And the debounce reset on every event, so a burst could starve the save
indefinitely.

Appending one line per event removes both: nothing that grows is ever rewritten,
there is no debounce, and a crash costs at most the line being written. A torn
final line is skipped on read and everything before it survives — verified by
truncating a log on purpose.

**Why not SQLite:** it was the obvious suggestion and it does not fit. At the time
Electron 30 meant Node 20, where `node:sqlite` does not exist, so it would mean a native
dependency against a recorded constraint. More to the point, for this workload —
append events, read one session whole — an append-only log gives the same crash
durability, and the data stays as files the person can read, grep, back up and sync
with anything. For a memory assistant that is a property of the product, not a
detail. SQLite would win if sessions were queried against each other, and they are
not.

**JSON for records, Markdown for prose.** Measured on real sessions: 151 bytes per
event as JSONL against 92 as Markdown — 44 KB versus 27 KB for an hour-long
meeting. Scale decides nothing at that size. What decides it is that events carry
structure (`echo`, `imageRef`, a question paired with its answer, timestamps to the
millisecond) which Markdown could only encode by convention, needing a parser with
ambiguous cases as soon as someone says something containing `**`. Append-only
JSONL is also far easier to sync than prose: a client appends bytes and conflicts
resolve as a union of lines.

The Markdown that matters to a person already exists and stays Markdown: the
profile, its context notes, and the summaries (D7, D17). `transcript.md` joins them
as a derived view — regenerable from the log, so there are never two sources of
truth.

**Still not covered:** audio captured but not yet transcribed — up to
`maxSegmentSeconds` in the VAD plus whatever is queued for Whisper — is not on disk
in any form, and no storage choice would change that.

---

## D27 — Electron 44, and what that changes about earlier decisions

**Decision:** upgrade Electron 30 → 44, which moves the main process from Node 20
and Chrome 124 to Node 24 and Chrome 152.

**Why it was cheap:** the app ships **no native modules**. The only two in the tree
come from `@electron-forge/maker-dmg` and exist to build the installer, never to
run. The usual reason Electron upgrades hurt did not apply.

**What was verified rather than assumed:** H1, the undetectable window, is the most
valuable thing in the repo, so it was tested before and after. With the app running
on 44, its window is absent from a full-screen `desktopCapturer` capture taken from
a separate process — the same test that shows a control window appearing when
content protection is switched off.

**What this changes about D10 (TanStack AI, rejected):** one of the four reasons was
that it is pure ESM while the main process is CommonJS on Node 20, where
`require(esm)` does not work. **That reason is now gone** — Node 24 supports it. The
other three stand: it is pre-1.0, its Anthropic adapter does not document image
input, and the project is consolidating towards one provider rather than spreading
across eleven. The decision does not change; one of its arguments no longer holds
and should not be cited.

**What this changes about D26 (storage):** `node:sqlite` is now available with no
new dependency. It still is not adopted, and the reason is no longer availability
but fit: for appending events and reading one session whole, an append-only log
gives the same crash durability while the data stays as files the person can read,
grep, back up and sync. That argument is unaffected by the upgrade.

---

## D28 — bun as the package manager

**Decision:** bun replaces npm. `package.json` declares `packageManager: bun@1.3.4`
and `bun.lock` is committed. `bun run <script>` is the canonical way to run
anything.

**Why bun and not pnpm:** on strictness alone pnpm wins — it blocks every install
script by default, including native builds, and the allowlist is declarative and
reviewable. But twelve of the thirteen projects in this workspace already use bun
with the same `apps/*` / `packages/*` shape and a shared catalog. Being the odd one
out costs more day to day than that margin is worth.

**The security argument, stated honestly:** changing package manager does not change
the supply chain. All of them install the same tarballs from the same registry. What
changes is who may execute code on the machine at install time. npm runs every
lifecycle script without asking; bun blocks untrusted ones by default. Here that is
two — `@google/genai`, whose `preinstall` is literally `echo 'preinstall: no-op'`,
and `protobufjs`. Both stay blocked and the full suite passes.

**Verified before switching, not after:** `bun install` (538 packages, 1.5 s),
197/197 tests, the app boots, and `bun run make` produces a working 126 MB DMG with
the runtime dependencies correctly bundled inside `app.asar`. Packaging was the real
risk and it was checked first.

`node_modules` drops from 428 MB to 200 MB.

**Known rough edge:** electron-forge 7.8.1 does not know about bun and reports
`Found npm` at startup. Nothing depends on it in the current flow — packaging
works — but if forge ever needs to install on its own it would reach for npm.

**Use `bun run test`, not `bun test`.** Both pass, but the first runs `node --test`
while the second uses bun's own runtime. The app runs on Node inside Electron, so
tests should too, or a Node-specific difference could hide until production.

**Not a monorepo, for now.** The other projects are monorepos, and `src/core/` is
genuinely package-shaped — pure, no Electron, no dependencies, fully tested. But
forge bundles `node_modules` from the project root into the asar, and a workspace
hoists dependencies to the repo root, so packaging from inside a workspace needs
work that has not been done or tested. And the shared catalog pins TypeScript, vite
and tailwind, none of which this project uses by decision (D19). It becomes worth
doing when a second consumer of `core` exists.
