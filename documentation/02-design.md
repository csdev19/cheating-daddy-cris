# 02 — Design

Target design for the memory assistant. Every decision here has its reasoning in
[03-decisions.md](03-decisions.md).

## Guiding principle: reactive

The app **listens and accumulates context quietly** for the whole meeting, and
only calls the model when you press a shortcut.

Consequences:

- No visual noise during the meeting. In an interview you cannot read a wall of text.
- Transcription (continuous, cheap) is decoupled from reasoning (occasional, expensive).
- It stops burning model calls on every turn, the way it does today.

## Section 1 — Context core

The piece that does not exist today and that the four capabilities all hang off.
It replaces the two disconnected arrays (see H3) with **a single time-ordered thread**:

```js
{ t, kind: 'speech',    speaker: 'them' | 'me', text }
{ t, kind: 'screen',    imageRef, caption? }
{ t, kind: 'ask',       question, answer }      // you hit the shortcut
{ t, kind: 'checklist', itemId, status }
```

New module: **`src/core/session-context.js`**. Three responsibilities and nothing else:

1. **Accumulate** thread events.
2. **Assemble** the payload when you hit the shortcut, ordered so prompt caching
   works (see below).
3. **Persist** to disk.

### Why it is a separate module

`gemini.js` is 1365 lines and mixes provider, session, audio, history and prompts.
Pulling the context core out makes it testable on its own and leaves `gemini.js`
as what it should be: a **provider adapter**.

That boundary is also the _seam_ that lets another provider (Claude, or an
abstraction library) be plugged in later without touching the memory logic.

### Payload assembly

Prompt caching is a _prefix match_: stable first, volatile last.

```
system:   profile.md + context/*.md + checklist.md    ← cache_control here
          └── stable all meeting → ~0.1x cost per call
messages: accumulated transcript (labelled speech events)
          screenshot + your question                   ← volatile
```

## Section 2 — Profiles as folders

A profile **is a folder on disk**. The app only reads; you write in your editor,
not in a textarea. They live alongside the rest of the config (`getConfigDir()`
in `storage.js`):

```
~/Library/Application Support/cheating-daddy-config/profiles/
  backend-interview/
    profile.md          ← how it should answer (replaces profilePrompts)
    checklist.md        ← what I must not forget to say/ask
    context/
      cv.md
      projects.md
      figures-i-forget.md
  client-meeting/
    profile.md
    context/
      accounts.md
```

`profile.md` carries frontmatter for the little that is not prose:

```markdown
---
name: Backend Interview
confidential: false # true → everything stays local, nothing leaves
model: gemini-3.7-flash # per-profile model
---

You are my memory assistant, not a teleprompter. Do not tell me what to say.
When I call on you, give me what I have probably forgotten: the exact figure,
the project name, the term they just used. If it is not in my notes, say so —
do not make it up.
```

This block is what removes problem H6: you write the behaviour, and `prompts.js`
with its six hardcoded personalities disappears.

Every `context/*.md` is sent **whole**. With 1M of context there is nothing to pick
or trim, which is why **there is no retrieval and no index to maintain** (see D8).

### Checklist

`checklist.md` is the static list. The **state** (what has already been covered)
lives as `checklist` events in the session thread — there is no parallel state
that can drift out of sync.

### Migration

On first launch the app generates `profiles/` from the six current profiles and
writes the existing `customPrompt` into the `context/` folder of the selected
profile. No configuration is lost.

## Section 3 — Capture

### Dual audio, labelled by channel

```
SystemAudioDump (macOS)  → PCM 24k stereo → mono → 16k → [them]
microphone (getUserMedia) → PCM                  → 16k → [me]
```

The label **comes from the source, not from an algorithm**. These are two
physically separate streams, so the labelling is correct by construction — more
reliable than diarisation, which infers who is speaking and gets confused when two
people talk over each other or when there are three on the call.

Each channel gets its own VAD instance and its own queue into `whisper-server`.

### Corrected VAD

Changes relative to what H4 diagnosed:

| Parameter               | Today (`VERY_AGGRESSIVE`) | Target (`NORMAL`) |
| ----------------------- | ------------------------- | ----------------- |
| `energyThreshold`       | 0.02                      | 0.01              |
| `silenceFramesRequired` | 15                        | 30                |
| pre-roll                | none                      | **~300 ms**       |

The **pre-roll** — keeping the audio from _before_ speech was detected — matters
because the attack of a phrase is exactly what is lost most with accented speakers.

### Resampling

Move the audio preprocessing to the **renderer** and use `OfflineAudioContext`,
which resamples with proper filtering. Fixes H7, adds no dependency, and as a side
effect the audio crosses the IPC already clean.

### Screenshot on demand

`captureManualScreenshot` (`renderer.js:561`) is reused, since it already
downscales to 1280px. What changes is what it does with the result: it stops
sending the LeetCode `MANUAL_SCREENSHOT_PROMPT` and **emits a `screen` event into
the thread**; it is the profile that decides what to do with it.

The **automatic capture every N seconds is removed** — under a reactive design it
makes no sense.

### Test bench

A mode that runs a recorded `.wav` against several Whisper models and shows the
transcriptions side by side. It is for:

- Picking a model with **your** audio and **your** accent, rather than by leaderboard.
- Calibrating the VAD without having to sit in a real meeting.
- Re-evaluating new models as they come out.

## What gets removed

| Going away                               | Why                                    |
| ---------------------------------------- | -------------------------------------- |
| `prompts.js` (profilePrompts)            | Replaced by a per-profile `profile.md` |
| Automatic screenshot capture             | Meaningless under a reactive design    |
| `MANUAL_SCREENSHOT_PROMPT`               | Hardwired to LeetCode mode             |
| `screenAnalysisHistory`                  | Absorbed by the single thread          |
| `whisperModel: 'tiny.en'` as the default | See D4                                 |

## Out of scope (YAGNI)

Deliberate decisions **not** to build right now:

- **RAG / embeddings** — unnecessary with 1M of context (D8).
- **Hot reloading markdown** mid-meeting; files are read when the session starts.
- **A second cache breakpoint** advancing with the transcript; premature optimisation.
- **Compressed session audio recording**; a clear candidate for later (D11).
- **A runtime for Parakeet or other non-whisper.cpp ASR** (D4).
- **`cloud` mode** with the in-house WebSocket; it stays disabled in the UI.

## Suggested implementation order

1. `session-context.js` — the core, with tests. Everything else hangs off it.
2. Profiles as folders + migration from `customPrompt`.
3. Wider Whisper catalogue + corrected VAD + test bench.
4. Labelled dual audio + new session schema.
5. Reoriented screenshot + removal of the automatic capture.
6. Renderer-side resampling with `OfflineAudioContext`.
