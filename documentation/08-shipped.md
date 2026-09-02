# 08 — What shipped, and what it taught

The plan in [05-implementation-plan.md](05-implementation-plan.md) was executed, and
then the app was run for real. Running it surfaced a class of bug the plan could not
have caught, because every one of them was invisible until the pieces were connected.

This document records what was built, what was measured, and — most importantly —
the failure mode that produced three separate production bugs from the same cause.

---

## The recurring failure mode

**Three independent bugs, one shape: the core was built, the wiring was not.**

The plan created `src/core/` as pure, tested modules and left the adapters to be
"verified by starting the app". Nobody started the app until everything was
committed. Each of these passed every test and shipped broken:

| Symptom                               | Cause                                                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `No active session` on every question | `initialize-session` existed and called `sessionManager.start()`, but the renderer still invoked the three legacy handlers. Nothing ever called the new one.                                                                 |
| Session would not start at all        | `listProfiles` read folders from disk, but the profile picker still rendered a hardcoded list of names that no longer existed on disk.                                                                                       |
| No system audio at all                | `start-macos-audio` and `stop-macos-audio` were deleted by accident in `c908ffe`; the renderer still invoked them.                                                                                                           |
| Every audio chunk dropped             | Audio routing branched on `currentProviderMode`, which after D14 describes the **reasoning** axis. The design's own default — local Whisper plus cloud reasoning — resolved to `byok` and never reached `processLocalAudio`. |
| Every transcription threw             | `HALLUCINATIONS` was referenced in `transcribeAudio` but **never declared anywhere**. Task 7 step 4c landed the usage without the constant.                                                                                  |
| `whisper-server` never shut down      | `close-session` also branched on `currentProviderMode`; four processes were found alive, ~1.7 GB each, with the app closed.                                                                                                  |
| 404 on every model call               | `sendPayloadToGemini` fell back to `geminiLiveModel` — a WebSocket-only id — for an HTTP `generateContent` call.                                                                                                             |

Two patterns are worth naming, because they will happen again:

**1. A pure core with an untested seam is not done.** Every one of these modules had
tests and every test passed. The tests covered the module; nothing covered the
sentence "and then something calls it". Where the plan says "verified by starting the
app", that verification is the deliverable, not a footnote.

**2. A variable that stops meaning what its name says is a landmine.** D14 split one
axis into two, but `currentProviderMode` survived and kept being read as though it
still described transcription. It caused two separate bugs weeks apart. When a
decision splits a concept, the old variable has to be renamed or removed in the same
change — leaving it is leaving a trap.

The audio routing fix is now `resolveAudioTarget` in `core/modes.js`, tested, and
it reads the transcription axis explicitly.

---

## What was built

### New core modules — all pure, all tested

| Module                 | Purpose                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `thread-view.js`       | Projects the event thread into view rows; merges VAD-split speech, attaches screenshots to the question that used them |
| `transcript-filter.js` | Drops non-speech segments, junk phrases and bare sound effects                                                         |
| `echo-filter.js`       | Flags a mic turn that echoes the speakers (D23)                                                                        |
| `audio-levels.js`      | Throttled per-channel RMS for the recording indicator                                                                  |
| `event-log.js`         | One event per line, torn last line skipped on read (D26)                                                               |
| `atomic-file.js`       | Temp-and-rename writes, used by every JSON write in storage                                                            |
| `screenshots.js`       | Thumbnails on disk, path traversal rejected                                                                            |
| `transcript-md.js`     | The readable, derived transcript                                                                                       |
| `download-plan.js`     | Resume plan for interrupted model downloads                                                                            |
| `digest-queue.js`      | Which stored sessions still owe a summary (D24)                                                                        |

Tests went from 72 to 197.

### Behaviour

- The assistant view is a **projection of the thread**, not its own `responses[]`.
  `HistoryView` reuses the same projection, so live and stored sessions render alike.
- **Recording indicator**: a dot, a timer and a live level meter per channel, fed by
  the real RMS of every chunk reaching the main process. A channel that is not
  captured reads `off`, so "no audio" and "not listening" never look the same.
- **An explicit End session button.** It used to be an unlabelled back arrow.
- **Segment cap** so text arrives while you are still talking (D22).
- **Echoed turns flagged, collapsed, and kept out of the model's transcript** (D23).
- **Summary detached from the close**, resumable on next launch (D24).
- **Sessions are folders**: atomic metadata, append-only events (D26).
- **Resumable model downloads** — an interrupted 1.6 GB download no longer restarts.
- **A stored session copies out as Markdown**: one button in the history detail
  hands over the same document `transcript.md` holds, rendered on demand rather
  than read back, so sessions older than that file and summaries generated later
  are both included. Found in use: the summary block was the one text block in
  the view without `user-select`, so the most useful part could not even be
  selected by hand.
- **The history renders the thread the way the live view does.** The claim above
  was only half true: `HistoryView` shared the projection but painted it as chat
  bubbles, and tagged them `me` / `them` while its CSS styled `user` / `ai`. The
  two speakers matched no rule and came out identical, so a reread transcript did
  not say who was talking. Both views now use the same speaker label and channel
  marker, and the markdown styles and renderer live in one shared module instead
  of one copy per view — the summary and the stored answers are read as Markdown,
  not as asterisks.
- Everything user-facing is in English; the profile picker reads from disk.

---

## What was measured

Numbers taken on the development machine (M4 Pro, macOS), not estimated.

### Whisper latency — this answers B10

| Audio | Transcription | Ratio |
| ----- | ------------- | ----- |
| 3 s   | 1.08 s        | —     |
| 10 s  | 1.13 s        | —     |
| 27 s  | 1.30 s        | 20×   |
| 60 s  | 2.85 s        | 21×   |
| 120 s | 4.86 s        | 25×   |
| 300 s | 11.5 s        | 26×   |

**B10 is answered: the binary does accelerate.** ~25× real time with
`large-v3-turbo` and Metal.

Two consequences. Whisper is **not** the bottleneck — the wait was always the
silence-gated segmentation. And the cost is **flat below ~27 s**, because Whisper
works in 30 s windows, so a chunk under that costs one pass. Ten chunks cost the
same total compute as one long call but land while the person is still talking.
That is what makes D22 nearly free.

Reproduce with `bun run bench:stt -- <file.wav> large-v3-turbo`.

### Session summary latency

8 s and 25 s on two runs, 67 s once, with `gemini-2.5-flash`. This is why the
summary was detached from the close (D24).

### Storage

- Session JSON was rewritten in full on every save, and `fs.writeFileSync`
  truncates before writing — so a crash during a save destroyed the whole session,
  and the exposure grew with the meeting. Fixed by D26.
- JSONL vs Markdown for the event log: **151 vs 92 bytes per event**, so 44 KB vs
  27 KB for an hour-long meeting. Scale decides nothing at that size; the structure
  events carry does.

### Toolchain

- `node_modules`: **428 MB on npm → 200 MB on bun**
- Electron 44 = Node 24 / Chrome 152, up from Node 20 / Chrome 124
- The app ships **no native modules**; the only two in the tree are build-time,
  from `maker-dmg`

---

## What was verified rather than assumed

**H1 still holds on Electron 44.** The undetectable window is the most valuable
thing in the repo, so it was tested, not trusted. With the app running (6 processes
confirmed alive), its window is absent from a full-screen `desktopCapturer` capture
taken from a separate process. The same test shows a control window appearing when
`setContentProtection` is switched off, so the capture path is real and the
exclusion is what makes the difference.

**The app does not capture its own window.** This was reported as a bug and turned
out not to be one — measured before writing any fix. `setContentProtection` already
excludes the window from the app's own `desktopCapturer` output. A step-aside was
added afterwards anyway, on request; it is redundancy, not a fix, and that is
recorded in the code comment.

**Model ids — this answers B9.** `client.models.list()` was called with a real key:
`gemini-3.7-flash` exists and supports `generateContent`, but returned 503 under
load, so the default is the GA `gemini-2.5-flash`.

**Resumable downloads.** Aborted at 25 MB, resumed at 25 MB, file grew — against
the real server.

**Pending summaries.** A session planted with the mark was picked up on launch,
summarised correctly, and the mark cleared. Test data removed afterwards.

**Packaging under bun.** `bun run make` produces a working 126 MB DMG with the
runtime dependencies correctly bundled inside `app.asar`.

---

## Audit findings, resolved

Status of [06-audit.md](06-audit.md) after this work:

| Finding                                            | Status                                          |
| -------------------------------------------------- | ----------------------------------------------- |
| A1 — local transcription chained to a local LLM    | Fixed (D14)                                     |
| A2 — typed questions bypass the thread             | Fixed (D15)                                     |
| A3 — nothing produces checklist events             | Accepted as-is for v1 (D16)                     |
| B1 — mic picks up the speakers                     | Mitigated: flagged, not deleted (D23) + warning |
| B2 — whisper-server handles one request            | Fixed: per-channel queue                        |
| B3 — hallucinations                                | Fixed and tested (`transcript-filter`, D25)     |
| B4 — Gemini implicit caching                       | **Still open** — see backlog                    |
| B5 — no response streaming                         | Fixed                                           |
| B6 — double shortcut press                         | Fixed with a guard and a test                   |
| B7 — emergency erase misses the in-memory thread   | Fixed                                           |
| B8 — `AGENTS.md` contradicts the decisions         | Fixed (D19)                                     |
| B9 — unverified model ids                          | **Answered by measurement**                     |
| B10 — does the binary use Metal?                   | **Answered: yes, ~25× real time**               |
| C1 — several interviewers share the `them` channel | Accepted, named in the design                   |
| C3 — total latency 6-9 s                           | Accepted (D20), improved by D22                 |
| M1 / M2 — post-session summary                     | Shipped (D17, D24)                              |
| M3 — context preview before starting               | **Not built**                                   |
| M4 — ask without a screenshot                      | Shipped                                         |

Everything still open is in [07-backlog.md](07-backlog.md), with the reason it was
deferred rather than a bare name.
