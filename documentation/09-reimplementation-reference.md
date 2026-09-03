# 09 — Reimplementation reference

**Reviewed:** 2026-09-02
**Status:** this repository is closed for further feature work. What was learned here is carried to a new repository; this document is the hand-over.
**Purpose:** a verified behaviour specification for rebuilding this product as an independent Electron application. It distinguishes current behaviour from requested new behaviour; it is not an implementation plan, and it is not a claim that every listed feature already exists.

> **This is a specification, not a porting guide.** The new application is a clean-room rebuild: no code, test, asset, binary, prompt or comment from this repository or its upstream is carried over, `src/core/` included. Every section below describes _what must be true_ of the new implementation and why, so it can be built without reading the old source. The rules are in [§Licence, provenance and attribution](#licence-provenance-and-attribution) and they govern the whole document.

## How this document is used

Development continues in a **new repository**, not here. Two things travel:

1. **Verified behaviour and its rationale** — this document plus `03-decisions.md`, which the code comments reference by decision number (D5, D13, D22…). Copy the decisions that survive into the new repository's own ADR set; do not leave the new project pointing at a repository that no longer moves.
2. **Framework-independent behaviour** — the event, profile, payload, VAD and persistence contracts represented by `src/core/`. These are specified here for independent reimplementation; no source module is ported.

The new repository must credit this one in its `README.md` and honour the licence consequence. Both are specified in [Licence, provenance and attribution](#licence-provenance-and-attribution) — read that section **before** the first commit, because it constrains the licence of the whole new application.

## Product contract to preserve

The application is a desktop overlay for a live conversation. It can remain visible to its user above other applications while being excluded from normal screen-capture output, collects screen and audio context, and shows a chronological conversation UI. It must keep the user in control: capture and model reasoning are initiated by explicit session and shortcut actions.

The new application's sidebar should contain these product areas:

| Area         | Status in this repository                                     | Requirement for the new application                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start        | Present as the `Home` / `MainView` flow, not under that label | Start and stop a session; show readiness and errors before capture begins.                                                                                                                                |
| Local models | Present inside `MainView`, not as its own sidebar entry       | Choose transcription and local reasoning models, show download/loading state, and persist the choice.                                                                                                     |
| Translate    | **Not present as a dedicated feature**                        | Define source language, target language, when translation runs, and whether translations are stored alongside the original transcript. Do not treat the existing speech-language selector as translation. |
| Settings     | Present                                                       | Configure audio sources, permissions/status, appearance, display selection, and shortcuts.                                                                                                                |

The current sidebar also has Profiles, History, Feedback, and Help.

**Profiles and History are not optional.** They were listed as "outside the minimum navigation" in an earlier draft of this document; that was wrong and is corrected here. `src/core/payload.js` cannot build a request without a profile — instructions, notes and checklist are the assistant. History is where the post-session summary loop lives, and that loop is what separates this product from a transcription overlay. See [§5](#5-profiles-and-the-payload-contract) and [§7](#7-session-persistence-and-the-post-session-loop).

Feedback is product-specific and should not be copied by default.

## Target stack and standards

### Reference implementation

The new application follows the shape of **`kaipu-record`** (`kaipu-record-monorepo/apps/kaipu-record`), which is the mature Electron reference in this workspace. Take its structure rather than reinventing one:

| Concern                  | Convention to adopt                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                    | `electron-vite` (dev/build/preview), `electron-builder` for distribution                                                                                                                           |
| Process split            | `src/main` (Node), `src/preload` (bridge), `src/renderer` (React), `src/shared` (types)                                                                                                            |
| Main-process composition | One `register*(…)` function per subsystem, all called inside `app.whenReady()` — see `src/main/index.ts` there                                                                                     |
| IPC                      | `contextBridge` in preload exposing a single typed API object; channel names in a shared `IPC_CHANNELS` const; **the TypeScript types in `src/shared` are the source of truth, not documentation** |
| UI                       | React 19 + `features/` folders, CSS modules, design tokens from a shared package                                                                                                                   |
| Tests                    | `vitest` for unit/component next to the source, `@playwright/test` under `e2e/` driving the packaged app                                                                                           |
| Lint/format              | `oxlint` + `oxfmt`, enforced by `lint-staged` on commit and `bun run verify` on push                                                                                                               |
| Repo                     | `bun` workspaces with a version catalog, `turbo` for orchestration, `release-please` for versioning and changelogs                                                                                 |

The reusable, product-agnostic reasoning behind that shape is already written down in the **general-knowledge hub** and must not be duplicated here:

- `general-knowledge/stacks/desktop-electron.md` — reading order for the whole stack
- `general-knowledge/desktop/main-process-architecture.md` — boot, subsystems, window lifecycle
- `general-knowledge/desktop/ipc-contract.md` — typed channels, `invoke` vs `send`
- `general-knowledge/desktop/permissions-and-onboarding.md` — cross-platform permission checks, macOS quirks
- `general-knowledge/desktop/library-vault.md` — filesystem-first storage with metadata sidecars
- `general-knowledge/monorepos/testing-strategy.md` and `general-knowledge/monorepos/ci-cd-pipelines.md`

This document records only **the application of those patterns to this product**.

### Electron version

| Source           | Version         |
| ---------------- | --------------- |
| This repository  | `^44.0.0` (D27) |
| `kaipu-record`   | `^39.2.6`       |
| Latest published | `44.1.1`        |

**Decision for the new application: pin `44.1.1` exactly.** This is deliberately ahead of `kaipu-record`. The reason is §1: `setContentProtection` is the single most valuable behaviour being carried over, and it was verified on Electron 44 in this repository. Building on 39 would throw that verification away and re-open the question on an older engine.

Exact pin, not a range: a caret on Electron silently moves the runtime that the content-protection test was run against. Re-run the [§1 acceptance test](#platform-boundary-and-acceptance-test) on every Electron bump and treat a failure as release-blocking.

### Where the independently rebuilt core lives

The behaviour currently represented by `src/core/` is framework-independent and covered by 22 test files. In the new monorepo it is independently rebuilt as a **workspace package**, not copied into the Electron app — mirroring the `packages/domain` + `packages/application` split used across the other monorepos here. This is the backlog item "Monorepo, when there is a second consumer of `core`" (`07-backlog.md`), and the rewrite is that second consumer.

Consequences to respect: the package must not import `electron`, must not read `process.platform`, and must take its filesystem root as an argument (as `configDir` is passed today) rather than resolving `app.getPath('userData')` itself.

### Toolchain gates

This repository has `"lint": "echo \"No linting configured\""` and no CI. The new one starts with the gate on day one: `oxlint` + `oxfmt --check` + `check-types` + `vitest run`, wired to `lint-staged` pre-commit and `bun run verify` pre-push, with the identical script in CI so a `--no-verify` only defers the failure.

### What to take from `monorepo-template`

`niway-dev/monorepo-template` was reviewed at commit `ce0ff92bccea6060b2b87fed060d2bf2f9ae32a3` (2026-09-02). It is the source for the **workspace/tooling conventions**, while `kaipu-record` is the source for the Electron application shape. They are complementary, not competing templates.

| Keep or adapt                                                     | Why it belongs here                                                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun workspaces, version catalog and Turborepo                     | One source of dependency versions and one root quality gate across the desktop app and pure packages.                                                     |
| TypeScript, Zod, `packages/domain` / `packages/application` shape | Fits the discriminated session-event types, provider ports, IPC contracts and pure use cases.                                                             |
| React 19, Vite, `web-ui`, design tokens, Vitest, oxlint and oxfmt | Supplies the renderer implementation and engineering baseline.                                                                                            |
| `infra-env` pattern                                               | Validates non-secret configuration at process start. Secrets themselves belong in Electron `safeStorage`, not `.env` committed to a desktop installation. |

Do **not** run its `bun run customize` script for this application: its supported patterns are web/backend/fullstack/Convex and none is an Electron target. It will remove packages based on those assumptions. Start the new repository on Kaipu's Electron structure and selectively carry the tooling/packages listed above.

The following template concerns are out of scope until a product need proves otherwise: the Hono/Elysia Worker applications, Cloudflare deployment, Neon/Drizzle database, Better Auth, Convex, mobile apps, Todo example, and the server-function runtime. They add deployment, credentials and data-retention surface without implementing any capture, overlay, local-model, or session requirement.

## 1. Protected, always-on-top overlay

### Required behaviour

- The overlay is visible to its owner above the meeting application, including full-screen workspaces.
- It is excluded from desktop-capture output and therefore from ordinary screen sharing/capture flows.
- It can be hidden and restored without taking keyboard focus from the meeting.
- It is absent from task-switcher surfaces where the platform supports that choice.

### How it works today, and what the replacement must do

`src/utils/window.js` creates the `BrowserWindow` without a frame, with transparency and no shadow. The protection mechanism itself is the call below, made immediately after construction:

```js
mainWindow.setContentProtection(true);
```

This is the essential capture-exclusion call. It was re-verified on Electron 44 with a separate-process full-screen `desktopCapturer` test: the protected window was absent, and a control window appeared when content protection was disabled. See `08-shipped.md`, “What was verified rather than assumed.”

The remaining calls are supporting behaviour, not substitutes for protection:

- Windows: `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, `setAlwaysOnTop(true, 'screen-saver', 1)`, and `setSkipTaskbar(true)`.
- macOS: when the assistant view is active, `setAlwaysOnTop(true)` and `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`; `setHiddenInMissionControl(true)` hides it from Mission Control.
- `showInactive()` restores a hidden window without activating it.

The app additionally sets opacity to zero just around its _own manual screenshot_, then restores it in a `finally` block. This is deliberate redundancy: content protection already excludes the overlay from this capture path, while opacity makes the frame boundary explicit and avoids focus loss caused by `hide()` / `show()` on macOS.

### Window state not to forget

`src/utils/window.js` also owns behaviour that is easy to lose in a rewrite: a persisted size with `MIN_WINDOW_SIZE` floors, a `layout` preference (`normal` / compact) that changes the overlay footprint, and shortcut-driven movement in 10% steps of the primary work area. Multi-monitor movement and the persisted position are part of the contract, not polish.

### Platform boundary and acceptance test

This is Electron/OS behaviour, not a Zoom, Meet, or Teams integration. Keep Electron as the desktop shell for this requirement. Test separately on every supported OS and Electron version:

1. Overlay visible over a full-screen meeting app.
2. Entire-display capture excludes the overlay.
3. Disabling protection in a development-only control build makes the overlay visible in the same capture path.
4. Hide, restore, and screenshot operations do not steal focus from the meeting app.

Steps 1–4 are **not unit-testable**. In the new repository they belong in the Playwright `e2e/` suite plus a documented manual checklist per OS, run before every release.

## 2. Session capture: system audio and microphone

### Required behaviour

At session start, acquire the allowed sources and expose their actual state—not merely the preference—to the UI:

```text
system / call audio  -> transcription pipeline -> speaker: them
microphone           -> transcription pipeline -> speaker: me
```

The label comes from the physical source rather than speaker diarisation (D6). Each channel must have independent processing and failure handling; a denied microphone must not make the UI claim that it is recording the microphone.

### How it works today, and what the replacement must do

- `src/utils/renderer.js` owns capture in the renderer. It requests screen media and, when selected, microphone media with `getUserMedia`.
- macOS uses the main-process `SystemAudioDump` path for system audio and browser media only for the screen. Windows uses Electron's display-media loopback path. Linux first tries display-media audio and falls back to screen-only capture.
- `audioMode` is persisted as `speaker_only`, `mic_only`, or `both`; the settings UI currently exposes those choices in `CustomizeView`.
- `captureState = { mic, system }` is intended to report actual capture state, and the live bar renders separate `MIC` and `SYS` meters. In the current code it is updated on the macOS acquisition path; a rewrite must make that reporting consistent on every platform.
- Renderer-side resampling targets 16 kHz, then independent VAD instances segment the streams. `src/core/vad.js` uses the normal threshold plus pre-roll. `src/core/audio-levels.js` drives the metering; it is not transcription logic.

`src/utils/renderer.js` is 1110 lines of module-level mutable state. Reimplement each platform path from the description above and from Electron's own capture documentation; do not read that file while writing the replacement, and do not reproduce its module-level state in React. The general-knowledge rule applies: the heavy pipeline lives outside React and publishes to it (`general-knowledge/desktop/media-pipeline.md`).

### Settings and permission design for the new app

Make the settings page stateful rather than a single “allow audio” switch:

| Setting / status  | Source of truth                                          | Expected UI                                                                             |
| ----------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| System/call audio | OS permission plus the system capture stream             | Available, denied, unavailable, or active. Explain the OS action required to enable it. |
| Microphone        | Browser/Electron media permission plus microphone stream | Available, denied, unavailable, or active.                                              |
| Audio mode        | Persisted preference                                     | System only, microphone only, or both.                                                  |
| Live input proof  | Actual captured channels                                 | Two live meters and explicit labels, `MIC` and `SYS` / `CALL`.                          |

Do not say “permissions granted” simply because a preference is enabled. On macOS, the current app triggers the Screen Recording prompt by enumerating `desktopCapturer` sources during startup. Microphone permission occurs when `getUserMedia` is requested.

### Onboarding

`src/components/views/OnboardingView.js` (with `src/assets/onboarding/*.svg`) is the first-run flow, and it is where the macOS Screen Recording prompt is actually provoked. The new application needs an equivalent: a first-run sequence that requests each permission explicitly, shows the real status afterwards, and can be re-entered from Settings when a permission is later revoked. `kaipu-record`'s `src/main/permissions.ts` (`checkPermissions` / `requestPermission` / `openSystemSettings`) is the shape to copy.

## 3. Transcription quality layer

Raw Whisper output is not usable as a transcript. Three pure modules stand between the audio and the thread, and each exists because of a specific observed failure. The new application needs all three, written afresh from the requirements below — the failures they prevent are the specification, not their code.

| Module                          | What it prevents                                                                                                                                                                                                                                                                                                                                                        | Decision                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/core/transcript-filter.js` | Whisper invents sentences over silence and marks non-speech with bracketed tags. Without it, “Thank you for watching”, `[BLANK_AUDIO]`, `(music)` and `*sniff*` enter the thread as things the other person said, and the model is then asked to reason about them. Uses a `no_speech` threshold of 0.6 plus junk patterns.                                             | D25 records both what is filtered and what is deliberately **not** |
| `src/core/echo-filter.js`       | Without headphones the microphone re-records the speakers, so the same words are transcribed on both channels and the “correct by construction” channel labelling breaks. A match is **flagged, never deleted** — repeating a question back is normal speech — and the flagged turn is kept out of what the model reads. 15 s window, 0.85 similarity, minimum 5 words. | D23, with headphones as a documented requirement in D18            |
| `src/core/vad.js`               | Segmentation is what gates latency, not Whisper. `NORMAL` mode with pre-roll; one independent VAD instance per channel, state in a closure.                                                                                                                                                                                                                             | D5, D22                                                            |

Two related settings that are part of the contract:

- **Speech is cut on length, and the length is a setting** (D22). This is nearly free because Whisper works in 30 s windows, so ten short chunks cost roughly the same compute as one long one but land while the person is still talking (`08-shipped.md`).
- **The capture display is chosen in preferences, never at session start** (`src/core/display-choice.js`, D27/D29). macOS's own picker was rejected precisely because it opens a dialog that everyone in the call can see. Note the trap the module documents: `desktopCapturer` reports `display_id` as a string while `screen` reports `id` as a number, so a raw comparison silently never matches.

## 4. Conversation bubbles and event model

The session UI is a chronological thread rather than a single answer panel. It currently renders:

- Speech turns, labelled `me` or `them`.
- Captured-screen thumbnails.
- A user question plus a streamed or completed assistant answer.
- Non-fatal notices, such as an unavailable microphone or detected audio echo.

The canonical durable event shapes are documented in `02-design.md` and implemented through `src/core/session-context.js` and `src/core/event-log.js`:

```js
{ t, kind: 'speech', speaker: 'them' | 'me', text }
{ t, kind: 'screen', imageRef, caption? }
{ t, kind: 'ask', question, answer }
{ t, kind: 'checklist', itemId, status }
```

`src/core/thread-view.js` projects raw events into UI rows: adjacent speech fragments from the same source are merged (8 s window — Whisper emits one segment per VAD pause, so one spoken sentence arrives in pieces), and a recent screenshot attaches to the next question (30 s window, because a screenshot and the question that uses it are one gesture). `AssistantView` consumes that same projection for the live session that history uses later.

Preserve this separation: persistence keeps raw events; UI code projects them. It is what makes the live view and the history view render identically from the same data, and in TypeScript the event shapes become a discriminated union.

For translation, add a new explicit event or field only after deciding the product semantics. Recommended starting point: retain the original `speech.text`, and attach optional translated text and target-language metadata. Do not overwrite the source transcript.

## 5. Profiles and the payload contract

This is the core of the product and the largest omission in the first draft of this document.

### Profiles

A profile is a **folder of markdown**, and the folder is the source of truth (D7, revised by D30 when the in-app editor landed). `src/core/profiles.js` is 517 lines and owns:

- **Frontmatter with exactly three managed keys** — `name`, `confidential`, `model` — parsed without taking on a YAML dependency. Unknown keys written by hand are preserved.
- **`BASE_INSTRUCTIONS`** — the prompt that replaced the old hardcoded teleprompter prompt (finding H6). It seeds both the default profiles and any profile created in the editor, so a new profile is never blank. Its content is a product decision, not boilerplate: _memory assistant, not a teleprompter; say so when something is not in the notes rather than inventing it._
- **Context files** — the user's own notes, CV, figures, decisions, read from the profile folder.
- **A checklist** — items with stable ids, judged from context rather than stored state in v1 (D16).
- **`history.md`** — where post-session summaries accumulate (§7).
- **Safe writes** — every profile write goes through `src/core/atomic-file.js` (write to a unique sibling, then rename) with revision checks, and profile deletion is guarded.
- **`profiles-bootstrap.js`** — seeds `interview` and `meeting` profiles on first run.

`src/components/views/ProfilesView.js` is the editor. Rebuild the UI; keep the folder contract and the main-process validation.

### The payload contract

`src/core/payload.js` is 31 lines and is the most load-bearing file in the repository. It assembles the request in the order prompt caching demands:

```text
stable prefix   : instructions → my notes → session checklist
volatile suffix : transcript → image → question
```

**Nothing in the prefix may depend on the clock or on the conversation.** If the prefix changes between calls, the whole cache is invalidated and both cost and latency regress silently — nothing fails, it just gets slower and more expensive. Any rewrite must keep this invariant and keep a test on it. (`07-backlog.md` notes that Gemini implicit caching was never confirmed working end to end; that verification is inherited work, not a solved problem.)

The payload also carries `confidential` through to the provider layer, which is how D13 is enforced (§6).

## 6. Providers, modes and the privacy model

### Two independent axes

`src/core/modes.js` (D14):

| Axis          | Values                         |
| ------------- | ------------------------------ |
| Transcription | `local-whisper`, `gemini-live` |
| Reasoning     | `gemini`, `local-llama`        |

They used to be a single `providerMode`, which made the design's default combination — transcribe locally, reason in the cloud — impossible to express. The old value is still translated so stored preferences keep working; the new application needs the same translation only if it imports old configuration (see §7).

`src/core/modes.js` also resolves the **per-profile model override** (D12) and enforces **D13: a confidential profile never leaves the machine**, whatever the preferences say. In `src/utils/gemini.js` that becomes a hard failure — a confidential profile with no local reasoning available refuses to run rather than falling back to the cloud. Keep that shape: a privacy guarantee that degrades quietly is not a guarantee. Note it applies to the session summary too, which routes to local reasoning for confidential profiles.

### The provider seam

`src/core/session.js` takes `sendToProvider` as an injected function. That single seam is what lets the provider change without touching the memory logic, and it is why the core package can stay free of Electron and of any SDK. Preserve it; in TypeScript it becomes the port interface that each provider adapter implements.

The cloud implementation is `src/utils/gemini.js` (1737 lines — the largest file in the repo, and the one least worth porting literally) plus `src/utils/cloud.js`, a WebSocket relay for the Live API. Rebuild these as adapters behind the port rather than translating them.

### TanStack AI is the new provider runtime

**Decision: adopt TanStack AI for reasoning, provider selection, tools and streamed chat state.** D10 rejected it in this repository because the main process was CommonJS on Node 20 and the package was ESM-only. The new application is TypeScript/ESM on the Kaipu structure, so that mechanical objection no longer applies. TanStack AI remains an RC/v0 dependency; pin an exact version in the workspace catalog, wrap it behind the provider port, and upgrade it only with its adapter integration tests passing.

TanStack AI does **not** replace Electron, the capture pipeline, VAD, the event log, or the profile/payload contract. It occupies the seam between an assembled request and a selected model:

```text
main process
  session/profile core -> payload assembler -> TanStack AI chat() -> provider adapter
                                                |                    |-- Gemini / Groq / OpenAI / Anthropic
                                                |                    |-- local OpenAI-compatible llama-server
                                                `-> server-only tools

preload
  typed IPC stream and commands

renderer
  React bubbles <- TanStack AI useChat() over a custom IPC transport
```

#### Package responsibility

| Package                     | Where it belongs                         | Purpose                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/ai`              | Main process                             | `chat()`, stream handling, model adapters, typed tool definitions and provider-independent agent loop.                                                                                            |
| Provider adapter package(s) | Main process                             | Gemini for the first cloud adapter; add Groq/OpenAI/Anthropic only when a profile or product need requires them. Use TanStack AI's OpenAI-compatible route for the existing local `llama-server`. |
| `@tanstack/ai-react`        | Renderer                                 | `useChat()` state and streamed assistant messages; it owns no credentials and performs no direct provider request.                                                                                |
| `@tanstack/ai-client`       | Renderer/preload boundary only if needed | The framework-agnostic client/transport layer behind the React hook.                                                                                                                              |

The main process is the application's “server” for this purpose. It owns provider keys through `safeStorage`, selects the model from the profile and modes, invokes `chat()`, and forwards only typed progress/stream events over preload IPC. The renderer never imports a provider adapter, receives an API key, or gets filesystem access.

TanStack AI accepts custom transports, so the renderer does not need an HTTP server merely to use `useChat()`: implement an IPC connection that turns the main-process stream into the client event stream. Define and test that connection in one module; do not let React components subscribe directly to Electron channels.

#### Request, image and durable-thread boundary

For an explicit Ask action, the core first assembles the stable prefix and volatile suffix from §5. The TanStack adapter translates that into model messages. A screenshot becomes an image content part only after the adapter/model capability is known; TypeScript capability constraints should reject sending it to a text-only model.

`useChat()` is transient view/stream state. The append-only session event log remains authoritative:

1. Create a pending Ask row in the renderer.
2. Stream display text through the IPC transport.
3. On successful completion, persist the completed `ask` event through the main-process session service.
4. On failure/cancellation, record an explicit error state or notice; do not write a partial answer as a completed durable event.

This preserves the existing invariant that the same raw event thread can render both the live session and History, independent of whichever chat SDK is installed.

#### Tools: useful, local and approval-gated

Define tool contracts once with Zod and expose server implementations only in the main process. Good first tools are:

| Tool                              | Implementation boundary                           | Approval policy                                                                                                |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `searchProfileNotes(query)`       | Read the selected profile's allowed markdown only | No approval; it is part of the chosen session context.                                                         |
| `getChecklist()`                  | Read the active profile/session checklist         | No approval.                                                                                                   |
| `updateChecklist(itemId, status)` | Atomic write through the profile/session service  | Require approval until the product explicitly chooses autonomous checklist updates.                            |
| `translate(text, targetLanguage)` | Selected local/cloud translation adapter          | No approval, but preserve original transcript and store target-language metadata.                              |
| `saveMeetingDigest()`             | Existing detached digest service                  | No approval when it is the configured close-session action; never send it to cloud for a confidential profile. |

Do not give the model a general filesystem, shell, window-control, screen-capture, or credential tool. The application already knows when a screenshot is requested through the explicit shortcut; that action is not an agent decision.

#### What not to adopt in v1

Do not start with autonomous agents, sandbox/code mode, MCP, TanStack AI persistence, automatic memory/compaction, or realtime voice. They solve different problems and would create a second durable-thread or capture authority beside the product's own event log. Local Whisper remains the primary transcription path; TanStack AI transcription is a possible later cloud fallback, not a reason to move captured audio off-device.

Translation is a separate capability, not a side effect of transcription. It should use the tool/adapter boundary above or a dedicated explicit action, retain the original speech text, and follow the confidential-profile routing rule.

### Credentials

`src/storage.js` keeps API keys (Gemini, Groq) as **plaintext in `credentials.json`** inside the config directory, separate from `config.json` and `preferences.json`. That separation is right; the plaintext is not. The new application should use Electron `safeStorage` (OS keychain-backed) for the key material and keep the same file split for everything else. Usage and rate-limit counters currently live in storage as well and need a home in the new model.

## 7. Session persistence and the post-session loop

### A session is a folder

D26. Metadata is written atomically and rarely; events are **append-only, one JSON object per line**. The reasoning is in `src/core/event-log.js`: storing the thread as one growing JSON document means the whole file is rewritten on every event, so the window in which a crash destroys the session grows with the session itself. Measured, not assumed: JSONL costs 151 bytes per event against Markdown's 92, which for an hour-long meeting is 44 KB against 27 KB — the size difference decides nothing, the structure does (`08-shipped.md`).

Screenshots are **files, not base64 in the thread** (`src/core/screenshots.js`): they live under the session folder and the event keeps only a relative `imageRef`.

`src/core/transcript-md.js` renders the human-readable face of a session, always derived from the event log and never the reverse — it can be regenerated, so there are never two sources of truth.

### The post-session loop

This is the product's differentiator and it must survive the rewrite:

```text
session ends → transcript on disk → digest (10-15 lines) → appended to the profile's history.md
            → the next session with that profile loads it as one more note
```

- `src/core/digest.js` builds the prompt (agreements, open items, names and roles, figures and dates — only what was said, empty sections omitted) and appends the result to the profile history, trimmed so the cached prefix cannot grow without bound.
- `src/core/digest-queue.js` decides which stored sessions still owe a summary. Sessions are marked explicitly when the work begins (D24); deducing "has no summary" would sweep up the entire back catalogue and spend a model call on each one unasked. Capped at 3 attempts.
- The summary runs **detached from the session close** (D24), because it was measured at 8 s, 25 s and once 67 s with `gemini-2.5-flash`. Blocking the close on it is not acceptable.

### Configuration and migration

`src/storage.js` holds `CONFIG_VERSION` with a reset-on-mismatch policy, and `src/core/session-context-migrate.js` converts the old `{ transcription, ai_response }` schema into the event thread — in that schema `transcription` was always the interviewer, because the app never listened to the user at all (finding H5). Both layouts (folder-per-session and the legacy flat files) currently coexist in read paths.

**Open decision for the new application:** does it import existing profiles and sessions from this app's config directory, or start clean? If it imports, `session-context-migrate.js` and the legacy read paths come along and the new app inherits two storage layouts on day one. If it does not, say so in the new README and give users an export path first. This has not been decided.

## 8. Shortcuts and overlay interaction

### Current shortcut set

Shortcuts are registered with Electron `globalShortcut`, so they work while another app owns focus. They are persisted in storage and edited in the current Settings view.

| Action                 | macOS default           | Windows default          | Current effect                                                                           |
| ---------------------- | ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Move overlay           | `Alt` + arrow           | `Ctrl` + arrow           | Moves by 10% of the primary work area.                                                   |
| Toggle visibility      | `Cmd` + `\\`            | `Ctrl` + `\\`            | `hide()` or `showInactive()`.                                                            |
| Toggle click-through   | `Cmd` + `M`             | `Ctrl` + `M`             | Enables/disables ignored mouse events.                                                   |
| Ask / capture screen   | `Cmd` + `Enter`         | `Ctrl` + `Enter`         | Starts a session from the home screen, or captures a manual screenshot during a session. |
| Previous / next answer | `Cmd` + `[` / `]`       | `Ctrl` + `[` / `]`       | Jumps between completed assistant-answer bubbles.                                        |
| Scroll answer thread   | `Cmd` + `Shift` + arrow | `Ctrl` + `Shift` + arrow | Scrolls the conversation thread.                                                         |
| Emergency erase        | `Cmd` + `Shift` + `E`   | `Ctrl` + `Shift` + `E`   | Existing high-risk shutdown/wipe flow; reassess its product policy before copying.       |

The screen-capture shortcut is intentionally reactive (D1). There is no automatic “every N seconds” screenshot capture in the target design.

`kaipu-record` has an equivalent subsystem in `src/main/shortcuts/global-shortcuts.ts`, including re-registration after a window that suspends shortcuts is destroyed. Reuse that pattern rather than writing a third one.

### Click-through mode

Click-through is implemented in the main process with:

```js
mainWindow.setIgnoreMouseEvents(true, { forward: true });
```

With it enabled, mouse clicks pass through the overlay to the meeting application; `{ forward: true }` still forwards mouse-move events. The mode is toggled by a global shortcut and announced to the renderer over IPC, where the live bar shows `[click through]`.

Requirements for a rewrite:

- Keep a single authoritative main-process boolean for this state.
- Bind it to a global shortcut because the overlay cannot receive a click while click-through is on.
- On leaving the live overlay view, turn click-through off so normal settings/UI controls remain usable.
- Make its enabled state visually unambiguous.

## 9. Local models and the native runtime supply chain

The repository separates local transcription from local reasoning. This distinction matters: using local Whisper must not force a local language model download or launch.

Current model configuration is in `MainView` and preferences:

- Whisper default: `large-v3-turbo` (D4, confirmed after the audit in D21); alternatives include `medium.en`, `small.en`, `base.en`, and `tiny.en`.
- Local LLM default: `unsloth/Qwen3.5-4B-GGUF:Q4_K_M`; presets range from 0.8B to 35B-A3B variants, and a custom Hugging Face / local GGUF reference is accepted.
- `src/utils/localai.js` downloads/verifies runners and models, starts Whisper and Llama processes, and reports progress to the renderer.

For the new sidebar, surface this as **Local models** with two independent controls: **Transcription model** and **Reasoning model**. Each needs selected model, disk/download state, progress, startup error, and an explicit statement of whether it will be used in the next session.

### The supply chain is an inherited external dependency

`src/utils/native-ai-runtime.js` (435 lines) is the part most likely to be overlooked. It:

- Downloads `llama-server` and `whisper` binaries from **`https://github.com/sohzm/cheating-daddy/releases/download/v0.7.0`** — a release of the upstream project, not of this fork — and verifies each against a **hardcoded SHA-256 per platform and architecture**.
- Resumes partial downloads via `src/core/download-plan.js`, which reads the bytes already on disk and asks Hugging Face for a `Range`. This exists because `large-v3-turbo` is 1.6 GB and the previous implementation deleted the temp file on any error, restarting from byte 0 every time.
- Allocates a free port, spawns the servers, and waits for readiness.

**The new application cannot ship pointing at someone else's release assets.** Decide and document one of: host the binaries on your own release channel (and generate the checksums as part of that release), vendor them into the installer and pay the size, or require the user to supply a local runtime path. Whichever is chosen, keep the SHA-256 verification and the resumable download plan — both were written in response to real failures.

Note also the entitlements this forces on macOS: `allow-jit`, `allow-unsigned-executable-memory` and `disable-library-validation` are in `entitlements.plist` for the local runtimes, and each one weakens the hardened runtime. If local models are deferred past v1, the initial release can ship without them.

## 10. Delivery: packaging, signing, updates and CI

Nothing in this section exists in a shippable state in this repository. All of it is new work.

### Signing and notarisation

`forge.config.js` here has `osxSign` and `osxNotarize` **commented out**, and `07-backlog.md` lists "Code signing with a Developer ID" as open. Unsigned means Gatekeeper blocks the app for anyone who did not build it.

The new application uses `electron-builder`, and `kaipu-record/electron-builder.yml` is the working reference: `hardenedRuntime: true` (required to notarise), `entitlements` + `entitlementsInherit`, `notarize: true` activated by `APPLE_API_*` environment variables, `${arch}` in the DMG artifact name so arm64 and x64 do not collide, and `extendInfo` carrying the `NS*UsageDescription` strings. Two additions are needed for this product specifically: a usage description for screen recording, and the `disable-library-validation` family of entitlements only if local runtimes ship.

### Bundle identifier

D29: macOS keys the Screen Recording and Microphone grants to the bundle identifier. Set a stable reverse-DNS identifier from the first build (`com.csdev19.screen-assistant` here) — inheriting Electron's default ties the user's permission grant to something generic that changes shape between builds. In development, Electron runs from `node_modules` as `Electron` and no configuration changes that; only the packaged app is affected.

### Auto-update

Absent here. `kaipu-record` uses `electron-updater` with a `generic` provider pointed at an R2 custom domain, plus an `updater/auto-updater.ts` subsystem that publishes status over IPC and a `dev-app-update.yml` for local testing. Adopt it; decide the hosting target before the first release, because a released version with no update path is permanent.

### Fuses

Set the same fuses: `RunAsNode: false`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`, `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`. These are Electron's own flag names set to the values its documentation recommends for a hardened build — a security choice, not an implementation carried over. These matter more here than in an ordinary app: the process holds meeting audio and API keys.

### CI

Per-OS matrix, because every risky behaviour in this document is platform-specific: content protection, system audio, global shortcuts, permissions. Unit tests can run on one runner; the Playwright suite and the manual overlay checklist cannot.

## 11. Privacy, retention and telemetry

The application records meetings. It needs a stated posture, not an implicit one.

Concrete issues carried from this repository:

- **`src/utils/transportLogger.js` writes the full transport of a session** — including model requests — to `configDir/logs/<sessionId>.json`, unconditionally. That is a plaintext record of the meeting sitting on disk with no retention policy.
- **`src/audioUtils.js` has `saveDebugAudio`**, which writes captured PCM/WAV to disk.
- **API keys are plaintext** (§6).
- **Emergency erase** (`Cmd`/`Ctrl` + `Shift` + `E`) is a high-risk irreversible flow whose product policy has never been settled.

Decisions the new application must take and write down:

1. What leaves the machine in each mode combination, stated per axis — audio never does (D3), but **the transcript does travel** on every cloud reasoning call (D13).
2. Retention: how long sessions, screenshots, transport logs and debug audio are kept, and whether deletion is offered per session and globally.
3. Whether the debug transport log ships in release builds at all, and if so behind which explicit switch.
4. Consent: whether the product asserts anything about the other participants in the call, and what the README says about the user's responsibility for recording law in their jurisdiction.
5. Telemetry. `kaipu-record` ships PostHog with feature flags; the pattern (renderer-primary + main-sink, the two-channel error rule, per-device identity) is in `general-knowledge/desktop/analytics-and-flags.md`. For a meeting recorder the default should be narrower than for a screen recorder, and error reports must never carry transcript content.
6. Locale. This app's UI strings are English throughout; `kaipu-record` has a `@kaipu/i18n` package and Spanish `NS*UsageDescription` strings. Decide once, at the start — retrofitting i18n is expensive.

## 12. Performance budgets

Measured on an M4 Pro / macOS development machine (`08-shipped.md`), not estimated. These are the numbers the new application inherits as its starting budget:

| Budget                                       | Measured here                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Whisper throughput (`large-v3-turbo`, Metal) | ~25× real time; 27 s of audio in 1.30 s, 300 s in 11.5 s                             |
| Whisper cost below ~27 s of audio            | Flat — it works in 30 s windows, so a short chunk costs one pass                     |
| End of sentence → answer on screen           | **6–9 s**, accepted (D20). The bottleneck is silence-gated segmentation, not Whisper |
| Session summary                              | 8 s and 25 s typical, 67 s worst observed — hence D24                                |
| Event log                                    | ~44 KB per hour-long meeting                                                         |
| Model disk                                   | 1.6 GB for `large-v3-turbo` alone, plus the local LLM                                |
| `node_modules`                               | 428 MB on npm → 200 MB on bun (D28)                                                  |

The numbers above were produced with `tools/transcribe-bench.js` (`bun run bench:stt -- <file.wav> large-v3-turbo`). The new application needs an equivalent bench, written fresh with its own fixtures and assertions (clean-room rule 4): a bench is what turned "Whisper feels slow" into a decision, and it is the only way the latency budgets above stay honest as models change.

Not measured here and needing a budget in the new application: memory and CPU with the overlay plus both local runtimes resident, and behaviour over a multi-hour session.

## Licence, provenance and attribution

**Read this before the first commit of the new repository.** None of what follows is legal advice; it is the factual position, established from `git log`, so the decision can be taken with the facts in hand.

### The facts

| Fact                            | Value                                                    |
| ------------------------------- | -------------------------------------------------------- |
| This repository's licence       | **GPL-3.0** (inherited from upstream)                    |
| Upstream author                 | `sohzm` (this is a fork of `sohzm/cheating-daddy`)       |
| `kaipu-record-monorepo` licence | **MIT**                                                  |
| Bundled third-party binary      | `src/assets/SystemAudioDump`, provenance not established |

Authorship splits cleanly, and the split is what matters:

| Files                                                                                                                                                                                                                                         | Author                                     | Can be relicensed by you                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| All 20 modules in `src/core/`, the tests in `test/`, `tools/transcribe-bench.js`, everything in `documentation/`, `ProfilesView.js`                                                                                                           | **Cristian Sotomayor** (2026-08-26 onward) | **Yes** — you hold the copyright                                               |
| `src/utils/window.js`, `src/utils/renderer.js`, `src/utils/gemini.js`, `src/utils/cloud.js`, `src/utils/localai.js`, `src/utils/native-ai-runtime.js`, `src/storage.js`, `src/index.js`, `src/preload.js`, `src/audioUtils.js`, the Lit views | `sohzm` and other upstream contributors    | **No** — copying or translating them makes the new work derivative and GPL-3.0 |

One exception inside `core`: **`src/core/vad.js` carries upstream expression**. Its `VAD_MODES` thresholds (`NORMAL`, `AGGRESSIVE`, `VERY_AGGRESSIVE`, with their exact values) are lifted verbatim from `sohzm`'s `src/utils/localai.js`. The surrounding implementation is new; the constants are not.

### What this means

Copyright is not transferred by writing inside someone else's repository. You are the author of `src/core/*`, so you may publish those same files in a new repository under any licence you choose — MIT included. The GPL binds what you distribute that is **derived from `sohzm`'s code**, not what you wrote yourself.

Two further points that narrow the problem:

- **The obligation triggers on distribution, not on use.** An application you build and run only on your own machines carries no GPL obligation at all, whatever it contains.
- **Ideas, decisions and API sequences are not the protected part.** §1 of this document describes the protected overlay as a short sequence of Electron calls — `setContentProtection(true)`, `setAlwaysOnTop`, `setVisibleOnAllWorkspaces`, `setSkipTaskbar`, `showInactive`. There is essentially one way to express that, and this document already prescribes rewriting `window.js` as a typed boundary rather than copying it. The same applies to the design decisions in `03-decisions.md`, which are yours in any case.

### Decision: clean-room proprietary rebuild

**The new application will be an independent rewrite.** It treats this repository as a source of behaviour, requirements and historical decisions, never as a source of implementation. No code, test, asset, binary, configuration, prompt or comment from this repository or its upstream is ported, including `src/core/` and the tests attributed to the current maintainer.

This is intentionally stricter than what copyright ownership may permit. Git authorship is useful provenance evidence, but it is not by itself a legal determination that a file is free of upstream expression or derivative-work risk. The stricter rule is simpler to execute, review and explain before a commercial release.

#### Required clean-room rules

1. **No copying or mechanical translation.** Do not copy, move, adapt line-by-line, or use any existing file here as a coding template. Do not port tests verbatim either.
2. **Implement from behaviour-level specifications.** Permitted inputs are this hand-over's requirements and acceptance criteria, independently written ADRs, and official Electron/TanStack/vendor documentation. New code, tests, fixtures and comments are authored afresh in TypeScript.
3. **Do not read the old implementation while coding the replacement.** For example, use Electron's own documentation and the protected-window acceptance test to implement the overlay; do not consult `src/utils/window.js`. Code review rejects pasted or mechanically translated upstream code.
4. **Retune rather than reproduce VAD.** Choose and benchmark new thresholds; do not carry the upstream `VAD_MODES` values or their expression. The benchmark is reimplemented with new fixtures and assertions.
5. **Review all third-party material independently.** Kaipu is MIT and can be reused only under its own terms with its notices, after an explicit approval. `SystemAudioDump` and every native binary from this repository are excluded until their provenance and licence are separately established.
6. **Keep a provenance ledger.** Every initial package records its source, licence, whether it is independently implemented or copied under a licence, and the reviewer. Before the first external binary release, record an attestation that no code from `cheating-daddy-cris` or `sohzm/cheating-daddy` is included.

This policy reduces provenance risk; it is not legal advice or a legal guarantee. Obtain an IP/software-licensing review before the first external binary release.

A private Git repository does not relax the clean-room policy. GPL permits private modification and use, but an obligation can arise when covered/derivative software is conveyed to another recipient. The project will be clean from its first commit, rather than attempting to clean it only when it becomes public.

### Initial licence and future publication

The new repository is initially **private and proprietary**. Use a clear proprietary notice (“All rights reserved”) or a collaborator agreement; do not add MIT or Apache-2.0 merely as a placeholder. A public permissive licence is an intentional grant that cannot practically be recalled for copies already released.

If a later provenance review confirms the rewrite is clean and the project is deliberately open-sourced, the default recommendation is **Apache-2.0**: it is permissive, commercial-friendly and includes an explicit patent grant. MIT is also viable if simplicity is more valuable than that patent language. Either licence permits a separately operated paid cloud-model service. Authentication, quotas and billing must be enforced on the server; a desktop client is modifiable by its users.

If a future feature deliberately includes GPL-covered code, distribute that component/application under GPL-3.0 with the corresponding source and notices instead. Attribution alone never changes that result.

### README attribution for the new repository

The new `README.md` credits the research as a matter of honesty and provenance. The credit is not a GPL permission and does not substitute for the clean-room rules. Suggested wording:

```markdown
## Provenance

This application was independently implemented after research into
[`cheating-daddy-cris`](https://github.com/csdev19/cheating-daddy-cris), itself a fork of
[`sohzm/cheating-daddy`](https://github.com/sohzm/cheating-daddy) (GPL-3.0).

That research informed behaviour-level requirements including a protected Electron
overlay, dual-channel audio labelling, an append-only session thread and explicit
capture controls. No source code from those repositories is included in this
application.
```

This credit is accurate and voluntary; it is not a licence obligation. If GPL-covered code is ever included, this section must instead state that the affected application is distributed under GPL-3.0 and say where its corresponding source can be obtained.

## Decision inheritance

`03-decisions.md` holds 31 decisions (D1–D31), referenced by number throughout the source comments. They do not all survive the move. Resolve each explicitly in the new repository's ADR set:

| Decision                                                                                                                                                                                                                                                                             | Status in the new application                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1 reactive, D5 VAD, D6 channel labelling, D13 confidential profiles, D16 checklist from context, D17 summary feeds the profile, D22 length-based cut, D23 echo flagged not deleted, D24 detached summary, D25 hallucination filtering, D26 session-as-folder, D29 bundle identifier | **Carried unchanged.** Copy into the new ADR set with their reasoning.                                                                                                                                                                           |
| D7 profiles as markdown folders, revised by D30 (in-app editor), D31 (`customPrompt` retired)                                                                                                                                                                                        | **Carried in revised form** — adopt the revision, not the original.                                                                                                                                                                              |
| D4 / D21 `large-v3-turbo`, D12 model per profile, D14 two axes, D20 6–9 s latency accepted                                                                                                                                                                                           | **Carried, but re-verify** against whatever runtime and provider the new app ships.                                                                                                                                                              |
| D2 "one app, this repository"                                                                                                                                                                                                                                                        | **Superseded.** The new repository is a monorepo app; the anti-pattern D2 rejected (an HTTP bridge between two Electron apps) still stands.                                                                                                      |
| D19 "`AGENTS.md` stops promising TypeScript/React/shadcn"                                                                                                                                                                                                                            | **Reversed deliberately.** It was correct here, where the constraint was CommonJS + Lit + no build step. The new application is TypeScript + React by decision, and the new repository's agent instructions must say so.                         |
| D27 Electron 44                                                                                                                                                                                                                                                                      | **Carried and tightened** — exact pin `44.1.1`, see [Target stack](#electron-version).                                                                                                                                                           |
| D28 bun as package manager                                                                                                                                                                                                                                                           | **Carried**, and extended to workspaces with a version catalog.                                                                                                                                                                                  |
| D3 local transcription, D8 no RAG, D9 Gemini first, D11 Mediabunny out, D15 single entry point for asking, D18 headphones                                                                                                                                                            | **Re-open.** Each was decided against a stack and a price list that have moved; `04-evaluations.md` records the data they rested on.                                                                                                             |
| D10 TanStack AI out                                                                                                                                                                                                                                                                  | **Reversed.** Adopt TanStack AI behind the existing provider port for typed model selection, tools and streamed chat; see [§6](#tanstack-ai-is-the-new-provider-runtime). Pin its RC version and keep its integration tests as the upgrade gate. |

## Independent implementation map

Every row is independently implemented. The **Specified in** column points at the section of _this document_ that carries the behaviour and its acceptance criteria — that section is the input to the work. The old file names appear only as provenance, to record what was studied before this document was written; clean-room rule 3 stands, so do not open them while writing the replacement.

| New responsibility            | Specified in | Implementation approach                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron window and shortcuts | §1, §8       | Typed main-process boundary built from Electron's documentation and the §1 acceptance test. (Provenance: `src/utils/window.js`.)                                                                                                                                                  |
| Screen/audio capture          | §2           | Implement each platform path from the described source/permission matrix; the heavy pipeline lives outside React and publishes to it. (Provenance: `src/utils/renderer.js`.)                                                                                                      |
| Audio processing              | §2, §3       | Fresh VAD, level metering, echo detection and hallucination filtering, with new thresholds benchmarked per clean-room rule 4 and new tests. (Provenance: `src/core/vad.js`, `audio-levels.js`, `echo-filter.js`, `transcript-filter.js`.)                                         |
| Profiles and payload          | §5           | Implement the markdown-folder format, the three managed frontmatter keys, atomic revisioned writes, and the stable-prefix payload ordering. Write a new test that pins the prefix. (Provenance: `src/core/profiles.js`, `profiles-bootstrap.js`, `payload.js`, `atomic-file.js`.) |
| Providers and modes           | §6           | Two independent axes, a `sendToProvider`-style port, and the confidential-profile hard stop. Adapters written against each vendor's own SDK documentation. (Provenance: `src/core/modes.js`, `session.js`.)                                                                       |
| Session/thread persistence    | §4, §7       | Append-only event log, session-as-folder layout, screenshots as files with a relative ref, and a pure projection into view rows. Events become a TypeScript discriminated union. (Provenance: `src/core/session-context.js`, `event-log.js`, `thread-view.js`, `screenshots.js`.) |
| Post-session loop             | §7           | Digest prompt, append to the profile's `history.md`, detached execution with an explicit pending mark and an attempt cap. (Provenance: `src/core/digest.js`, `digest-queue.js`, `transcript-md.js`.)                                                                              |
| Capture display choice        | §3           | Preference-time display selection, including the string/number `display_id` comparison trap described there. (Provenance: `src/core/display-choice.js`.)                                                                                                                          |
| Storage and credentials       | §6, §7       | Config/preferences/credentials file split, key material in `safeStorage`, versioned config. (Provenance: `src/storage.js`.)                                                                                                                                                       |
| Overlay conversation UI       | §4           | React components built from the described row types and grouping windows. (Provenance: `AssistantView.js`.)                                                                                                                                                                       |
| Profile editor UI             | §5           | New UI over the folder-is-truth contract, with validation in the main process. (Provenance: `ProfilesView.js`.)                                                                                                                                                                   |
| Settings and shortcut editor  | §2, §8       | New UI over the stateful permission model and the shortcut registry. (Provenance: `CustomizeView.js`.)                                                                                                                                                                            |
| Onboarding / permissions      | §2           | Built on Kaipu's permission subsystem, reused under MIT with its notices after the approval required by clean-room rule 5. (Provenance: `OnboardingView.js`.)                                                                                                                     |
| Local runtime                 | §9           | Deferred until the overlay and capture loop are proven and the binary hosting question is answered; SHA-256 verification and resumable downloads are requirements, implemented fresh. (Provenance: `src/utils/localai.js`, `native-ai-runtime.js`, `src/core/download-plan.js`.)  |
| Benchmark                     | §12          | New bench with new fixtures and assertions, reproducing the measurement method rather than the tool. (Provenance: `tools/transcribe-bench.js`.)                                                                                                                                   |

## Recommended build order

0. **Licence and provenance set up before any code.** Proprietary notice (“All rights reserved”) in the new repository, the clean-room policy recorded as its first ADR, and the provenance ledger opened. See [§Licence, provenance and attribution](#licence-provenance-and-attribution).
1. Monorepo skeleton on the `kaipu-record` shape: `electron-vite`, typed preload, `register*` subsystems, oxlint/oxfmt, vitest, Playwright, CI gate, Electron pinned to `44.1.1`.
2. Protected Electron overlay: always-on-top, workspace/full-screen behaviour, task-switcher hiding, visibility toggle, and click-through — with the §1 acceptance test running before anything is built on top of it.
3. Global-shortcut service and settings UI for those shortcuts.
4. Explicit screen, microphone, and system-audio permission/status model plus onboarding; prove both channels with live meters.
5. Independently build the `core` package: event log, session context, thread projection, VAD, echo filter and transcript filter, with freshly authored tests green.
6. Profiles: folder format, bootstrap, payload assembly with the cache-prefix test.
7. Typed session event log wired to React conversation bubbles; manual screenshot shortcut and screenshot attachment to an `ask` event.
8. TanStack AI end to end behind the `sendToProvider` port: one Gemini adapter, the typed IPC chat transport, one safe read-only tool, and credentials in `safeStorage`.
9. Persistence on disk (session-as-folder) and the post-session digest loop into `history.md`.
10. Packaging, signing, notarisation and auto-update — before any external user, not after.
11. Local Whisper, then local reasoning as an independent capability, once binary hosting is resolved.
12. Define and implement translation after its storage and timing semantics are chosen.

## Verified gaps and decisions still needed

- **Licence and attribution** — clean-room policy, provenance ledger and proprietary/private initial status. Blocking; see above.
- **Native binary hosting** — the new app cannot depend on `sohzm/cheating-daddy` release assets.
- **Data import** — whether existing profiles and sessions are migrated from this app's config directory, or the new app starts clean with an export path offered here first.
- **Translation** is new work; select its provider/local model, target-language behaviour, UI location, and persistence policy before implementation.
- **Privacy posture** — retention for sessions, screenshots, transport logs and debug audio; whether the transport log ships at all; telemetry scope; the emergency-erase policy.
- **Locale** — English-only or i18n from the start.
- **Prompt caching was never confirmed working end to end** (`07-backlog.md`), so the cost model that D20's latency budget assumes is unverified.
- The current project has a legacy/unsafe renderer boundary (`nodeIntegration: true`, `contextIsolation: false`). The new project uses a narrow typed preload API with context isolation; this changes the IPC architecture but not the overlay requirements.
- The capture mechanisms are platform-specific. “System audio” must remain a per-OS capability with explicit unavailable/denied states, rather than an assumed universal browser API.
- The current macOS path starts system-audio capture before checking `audioMode`, and the Linux/Windows paths do not consistently update `captureState`. Treat the new app's source-selection and status model as a redesign, not a direct copy.
- `setContentProtection` is essential but must be regression-tested against the exact Electron and OS versions shipped. It should never be accepted on the basis of a code review alone.
