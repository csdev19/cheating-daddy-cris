# 06 — Audit of the design and the plan

A critical review of the analysis (`01`–`04`) and the plan (`05`), done on
2026-08-26, looking for what was being missed and how to improve the idea. Each
finding says whether it was verified against the code or is a risk still to check.

Result in one line: **the design holds, but the plan had three holes that would
have made it useless in v1** (A1–A3), and there is one product improvement that
multiplies the value of everything else (M1).

---

## A — Holes that break v1 (blocking)

### A1 — Local transcription is chained to starting a local LLM

**Verified.** `initializeLocalSession` (`localai.js:425`) always calls
`prepareNativeFiles(model, whisperModel)` → downloads Qwen (~2.5 GB) →
`startLlamaServer`. There is no way to bring up only `whisper-server`.

The plan (tasks 7-8) assumes "local Whisper + Gemini reasons", but that combination
**does not exist** in the current mode model (`byok | cloud | local`). As it
stands, transcribing locally would mean downloading and running Qwen without using
it — 17 GB of RAM thrown away mid-interview, exactly the scenario D9 rejected.

**Correction:** split two axes that are one today. See D14.

### A2 — Typed questions do not go through the context thread

**Verified.** The plan only wires `send-image-content` to the manager (task 10).
`send-text-message` (`gemini.js:1208`) still goes to Gemini Live / Groq / llama
with its own history. In other words: if you type a question instead of taking a
screenshot, the model **does not see your notes or the transcript**. Half the
invocations would fall outside the design.

**Correction:** a single `ask` entry point for text, screenshot and shortcut. See D15.

### A3 — Nothing produces checklist events

**Verified by omission.** `session-context.js` accepts `addChecklist`, `payload.js`
renders it, but no task generates that event. The checklist is shown to the model
as a static list and never changes state. Capability #3 ("warn me about what I am
missing") is left half-built.

**Correction:** in v1 the model resolves it from context, with no state. See D16.

---

## B — Technical risks to manage

### B1 — Without headphones, channel labelling gets contaminated

D6 says "correct label by construction". That is true **only with headphones**.
On speakers, the microphone picks up the interviewer's voice and it shows up in
`[me]`. `getUserMedia` already asks for `echoCancellation: true`
(`renderer.js:239`), which mitigates but does not eliminate.

**Action:** document headphones as a requirement in the session start UI, and
measure the crosstalk with and without them on the test bench. It is not code, it
is honesty in the product.

### B2 — `whisper-server` handles one request at a time

Two channels with independent VADs can close a segment at the same moment.
whisper.cpp serialises: the second waits. With `large-v3-turbo` on an M4 Pro a 5 s
segment takes ~1-2 s, so the delay is tolerable but **cumulative** during long
crosstalk.

**Action:** a per-channel queue that drops the oldest segment once more than N pile
up. Without it, after a long interruption the transcript arrives with growing lag.
Added as a step in task 7 (see amendments).

### B3 — Whisper hallucinates over silence and noise

Known behaviour: on segments with no speech it returns invented phrases ("Thank you
for watching", "Subtitles by…"). The VAD reduces the risk, but D5's pre-roll
deliberately feeds in audio below the threshold.

**Action:** request `response_format=verbose_json` and drop segments with
`no_speech_prob > 0.6`, plus a short list of known junk phrases. Cheap, and it
removes most of them.

### B4 — Gemini's caching does not work like Anthropic's

`04-evaluations.md` computed costs assuming prefix caching. In Gemini **implicit**
caching exists (2.5+) but requires a stable prefix **and** a token minimum (~1024
on Flash), and it is not clear that `systemInstruction` counts as a prefix of
`contents`.

**Action:** verify in task 8 by reading `usageMetadata.cachedContentTokenCount` in
the response. If it is consistently 0, move the stable block into the first `user`
message of `contents` instead of `systemInstruction`. The uncached cost is still
low (~$0.20-0.60/meeting), so it is not blocking — but the estimate would be
optimistic and that is worth knowing.

### B5 — The answer is not streamed

The adapter in task 8 uses `generateContent` (waits for the whole answer). With 8k
of notes + transcript + image, that is 2-4 s of blank before anything shows. In an
interview, 3 s staring at an empty window is noticeable.

**Action:** `generateContentStream`, reusing the `new-response` / `update-response`
events the UI already knows how to paint. See the amendment to task 8.

### B6 — Double-pressing the shortcut = two calls

There is no concurrency guard in `sessionManager.ask`. Two quick presses fire two
requests and the second overwrites the first on screen.

**Action:** `ask` rejects while a request is in flight. One `if (pending)` and a test.

### B7 — Emergency erase does not touch the in-memory thread

**Verified.** `clear-sensitive-data` (`renderer.js:770`) only calls
`storage.clearAll()`. The live `sessionContext`, holding the whole transcript,
stays in the main process memory until the process dies (300 ms later). It is a
small window, but the shortcut promises to "erase everything".

**Action:** have the emergency handler call `sessionManager.end()` before exiting.
One line.

### B8 — `AGENTS.md` contradicts the project's decisions

**Verified.** `AGENTS.md:27-45` instructs migrating to TypeScript + React 19 +
shadcn. `03-decisions.md` and the plan's global constraints say **no build step,
CommonJS, Lit**. An agent that reads `AGENTS.md` first will do the opposite of what
was agreed.

**Action:** update `AGENTS.md` so it points at `documentation/` as the source of
truth and drop the shadcn/TS section. See D19.

### B9 — Unverified model identifiers

The examples use `gemini-3.7-flash`. That is the commercial name from the pricing
page, but the API id could differ (the repo uses `gemini-2.5-flash` and
`gemini-3.1-flash-live-preview`). Confirm with `client.models.list()` in task 8
before fixing it as the default in `profiles-bootstrap.js`.

### B10 — The whisper-server binary: does it use Metal?

The binaries come from the original fork's releases (`native-ai-runtime.js:10`). If
they were compiled without Metal, `large-v3-turbo` runs on CPU and latency
multiplies by 3-5. The test bench (task 12) prints milliseconds: if a 10 s segment
takes more than ~4 s, the binary is not accelerating and it needs recompiling or a
different model.

---

## C — Weak points in the original analysis

### C1 — Real interview diarisation was underestimated

Plenty of technical interviews have **two or three interviewers**. The `[them]`
channel mixes them all together. For capability #2 ("who asked what") that matters
less than it seems — what you need to remember is _what_ was asked — but the design
should name it rather than promising perfect labelling.

### C2 — The cost estimate assumed caching that is not verified (see B4)

### C3 — Total chain latency was not considered

From the end of an interviewer's sentence to seeing the answer: the VAD closes (3 s
of silence at `NORMAL`) + Whisper (~1-2 s) + you press + Gemini (2-4 s).
**That is 6-9 s.** Acceptable for "remind me of a figure", not for "what do I answer
right now". The reactive design assumes it implicitly; it should be said explicitly
so nobody expects otherwise. Dropping `silenceFramesRequired` to 20 (2 s) is a
reasonable adjustment to try on the bench.

---

## M — Improvements to the idea

### M1 — Close the loop: today's meeting feeds tomorrow's ⭐

The biggest omission in the design. "Remember what I forget" includes **what was
said last time with this same person or client**. Today the session is saved in
`history/` and never read again.

Proposal: when the session closes, one extra call generates a 10-15 line summary
(agreements, open items, names, figures mentioned) and **appends** it to
`profiles/<profile>/context/history.md`. The next meeting on that profile loads it
automatically like any other note.

Cost: one call per meeting (cents). Complexity: ~40 lines and a test. Value: it
turns the app from "session memory" into "client memory / hiring-process memory".
It is the feature that would make you open it for every meeting. See D17.

### M2 — The post-session summary doubles as a review

The same summary from M1, shown in `HistoryView`, answers "could we just look at
the transcript": better than the raw transcript, you see the points and drill into
the detail only when you need to.

### M3 — Context preview before starting

Before starting a session, show which profile, which `context/` files and how many
tokens are about to be sent. It avoids the surprise of "it did not load my CV
because I saved it as `.txt`" (the loader only reads `.md`) halfway through an
interview. Little code, removes a silent failure mode.

### M4 — Two shortcuts, not one

`ask` with a screenshot and `ask` without one are different cases: "what is this I
am looking at" vs "what am I forgetting to say". Always sending an image costs more
and sometimes confuses. Two keybinds are already supported by
`updateGlobalShortcuts`.

---

## Amendments to the plan (`05`)

| Task       | Change                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7**      | Add a per-channel queue (B2), a `no_speech_prob` + junk-phrase filter (B3), `silenceFramesRequired: 20` as the initial value to try (C3)                                                    |
| **8**      | `generateContentStream` with `new-response`/`update-response` events (B5); concurrency guard in `ask` + test (B6); read `cachedContentTokenCount` and log it (B4); verify the model id (B9) |
| **10**     | Wire `send-text-message` to `sessionManager.ask` too (A2); a shortcut with no image (M4); `sessionManager.end()` on emergency erase (B7)                                                    |
| **New 7b** | Independent transcription mode: `startTranscriptionOnly()` bringing up only `whisper-server` (A1, D14)                                                                                      |
| **New 14** | Post-session summary into `context/history.md` + rendering in `HistoryView` (M1, M2, D17)                                                                                                   |
| **New 15** | Update `AGENTS.md` (B8, D19)                                                                                                                                                                |
| **12**     | The bench also prints `no_speech_prob` per segment and tests with and without headphones (B1, B3, B10)                                                                                      |

Tasks 1-6, 9, 11 and 13 are unchanged.
