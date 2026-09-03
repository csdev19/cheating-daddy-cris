# 10 — Execution plan for the new repository

**Written:** 2026-09-03
**Role:** this is the **coordinator**. `09-reimplementation-reference.md` says _what must be true_; this document says _in what order it gets built, who checks it, and when a phase is done_.
**Audience:** whoever — person or agent — opens the new repository on day one.

> Copy this file into the new repository as its first planning document. Once there, it is the living plan: phases get checked off, dates get filled in, and decisions that were open here get closed there as ADRs. This copy stays frozen as the hand-over record.

---

## 1. What we are building

A desktop overlay for live conversations — meetings and interviews — that acts as a **memory assistant, not a teleprompter**. It listens, watches and accumulates context quietly, and answers only when the user asks for it with a shortcut.

The product has four capabilities, and they are the reason the project exists:

1. **Prior material** — your notes, CV, figures and past decisions surface when they apply.
2. **Meeting thread** — what was said, who said it, what was left open.
3. **Live checklist** — what you must not forget to say or ask.
4. **Lookup on the fly** — a concept, name or number that just came up.

The technical idea underneath is a **single context thread** that fuses what the app hears, what it sees, and what it knows about you. In the previous implementation those were three disconnected things, which is why it felt blind and forgetful.

The overlay is visible to its owner and **excluded from screen capture**, so it does not appear in the shared screen. That behaviour is the most valuable thing being rebuilt and it is verified, not assumed.

## 2. Where this comes from

A previous implementation exists at `cheating-daddy-cris` (GPL-3.0, a fork of `sohzm/cheating-daddy`). It was run in real sessions, measured, and audited. **It is closed for feature work.** What survives is knowledge, not code:

| Document (in the old repository)   | What it gives you                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `09-reimplementation-reference.md` | **The specification.** Behaviour, acceptance criteria, budgets, licence rules. The primary input to every phase below.     |
| `03-decisions.md`                  | 31 decisions with their reasoning, including the ones that were reversed. Consult whenever something here looks arbitrary. |
| `08-shipped.md`                    | What was measured rather than estimated — the numbers in §7 of this plan.                                                  |
| `07-backlog.md`                    | Understood but unbuilt work, and why it was deferred.                                                                      |
| `01-current-state.md`              | The findings the whole design rests on, if you want to challenge it.                                                       |

## 3. Non-negotiables

These are settled. Anything that contradicts them is a bug in the work, not a trade-off.

| #   | Constraint                                                                                                                                                                                                                         | Where it is specified |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| N1  | **Clean-room rebuild.** No code, test, asset, binary, prompt or comment from the old repository or its upstream. Implement from specifications and vendor documentation; do not open the old source while writing the replacement. | `09` §Licence         |
| N2  | **Proprietary and private to start.** "All rights reserved", no MIT/Apache placeholder. A permissive licence is an intentional grant that cannot be recalled.                                                                      | `09` §Licence         |
| N3  | **Reactive, never proactive.** The app accumulates context silently and answers on an explicit shortcut. No answer per conversational turn, no timed screenshots.                                                                  | D1                    |
| N4  | **The overlay must be capture-excluded, and it must be tested.** Never accepted on code review alone.                                                                                                                              | `09` §1               |
| N5  | **Channel labelling, not diarisation.** `them` and `me` come from the physical audio source.                                                                                                                                       | D6                    |
| N6  | **A confidential profile never leaves the machine** — it fails loudly rather than falling back to the cloud.                                                                                                                       | D13                   |
| N7  | **Raw events are the durable truth.** Append-only log; the UI projects, it does not store.                                                                                                                                         | D26                   |
| N8  | **The stable payload prefix never depends on the clock or the conversation.** Breaking it degrades cost and latency silently.                                                                                                      | `09` §5               |

## 4. The stack, decided

| Layer         | Choice                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| Shell         | Electron, pinned exactly to `44.1.1`                                           |
| Structure     | Kaipu Record shape: `src/main` / `src/preload` / `src/renderer` / `src/shared` |
| Language      | TypeScript, ESM, strict                                                        |
| UI            | React 19, feature folders, CSS modules, shared tokens                          |
| Build         | `electron-vite`, `electron-builder`                                            |
| Model runtime | TanStack AI behind the provider port, exact pinned version                     |
| Repo          | bun workspaces + catalog, turbo, release-please                                |
| Quality       | oxlint + oxfmt, vitest, Playwright for the overlay                             |

Full rationale and the reading list live in `09` §Target stack. The general-knowledge hub carries the product-agnostic patterns (`general-knowledge/desktop/*`); do not re-derive them here.

## 5. Milestones

Five milestones. Each answers a question you can demo.

| Milestone                                    | Question it answers                                                                                   | Phases |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| **M1 — It hides**                            | Is there a window that stays on top, disappears from screen capture, and obeys shortcuts?             | 0–3    |
| **M2 — It hears and shows**                  | Does it capture both audio channels with honest status, transcribe them, and paint a readable thread? | 4–7    |
| **M3 — It remembers and answers**            | Does an explicit Ask produce a grounded answer, and does the session feed the next one?               | 8–9    |
| **M4 — It ships**                            | Can someone else install it, trust it, and receive updates?                                           | 10     |
| **M5 — It runs alone and crosses languages** | Local models as an independent capability, then translation.                                          | 11–12  |

M1 is the highest-risk milestone and the cheapest to abandon on. If the protected overlay cannot be made to work on the target OS versions, the product does not exist — so it is built and verified before anything is stacked on it.

---

## 6. Phases

Each phase states its goal, what it delivers, what to read, and how you know it is finished. **A phase is not done until its exit criteria are demonstrated, not argued.**

### Phase 0 — Repository and provenance foundation

**Goal:** the repository is legally clean and mechanically gated before a single feature line exists.

**Deliverables**

- [ ] New private repository, proprietary notice ("All rights reserved").
- [ ] ADR-0001: the clean-room policy, transcribed from `09` §Licence with its six rules.
- [ ] ADR-0002: stack and Electron pin, with the reason for `44.1.1` exactly.
- [ ] Provenance ledger opened (§9 of this plan) with its first rows.
- [ ] Monorepo skeleton: bun workspaces + catalog, turbo, release-please, oxlint/oxfmt, TypeScript strict.
- [ ] `verify` script (`oxlint` + `oxfmt --check` + `check-types` + `vitest run`), wired to `lint-staged` pre-commit and pre-push, identical in CI.
- [ ] CI matrix over the target operating systems.

**Read:** `09` §Target stack, §Licence.

**Exit criteria:** CI green on an empty app; a deliberate lint error and a deliberate type error each fail the pipeline; `git log` shows no file imported from the old repository.

---

### Phase 1 — Application shell

**Goal:** an Electron application that boots, with the process boundary right the first time.

**Deliverables**

- [ ] `electron-vite` dev/build/preview working.
- [ ] `src/main` with one `register*(…)` per subsystem, all called inside `app.whenReady()`.
- [ ] `contextIsolation: true`, `nodeIntegration: false`, a single typed `contextBridge` API.
- [ ] `IPC_CHANNELS` const and shared types in `src/shared` as the source of truth.
- [ ] Electron fuses set as specified.
- [ ] Playwright launching the built app and asserting the window exists.

**Read:** `09` §Target stack, §10 (fuses); `general-knowledge/desktop/main-process-architecture.md`, `ipc-contract.md`.

**Exit criteria:** the renderer cannot reach Node; every IPC call is typed end to end; the Playwright smoke test runs in CI.

---

### Phase 2 — Protected overlay ⚠ highest risk

**Goal:** the window that is visible to its owner and absent from screen capture.

**Deliverables**

- [ ] Frameless, transparent, shadowless window with persisted size/position and minimum-size floors.
- [ ] `setContentProtection(true)` immediately after construction.
- [ ] Per-platform supporting behaviour: always-on-top level, visible on all workspaces including full-screen, skip taskbar, hidden in Mission Control.
- [ ] Hide/restore without stealing focus (`showInactive`).
- [ ] The four-step acceptance test, automated where possible and a written manual checklist where not.
- [ ] A development-only control build that disables protection, for the negative case.

**Read:** `09` §1 in full.

**Exit criteria:** on **every** supported OS: the overlay is visible over a full-screen meeting app; a full-display capture does not contain it; the control build _does_ appear in the same capture path; hide, restore and screenshot do not move focus. Recorded with evidence, per OS and Electron version.

**If this fails:** stop and escalate. Do not build M2 on an unverified overlay.

---

### Phase 3 — Shortcuts and click-through

**Goal:** the overlay is operable while another application owns the keyboard.

**Deliverables**

- [ ] Global shortcut subsystem with persistence, an editor UI, and re-registration after a window that suspends shortcuts is destroyed.
- [ ] The documented default set per platform.
- [ ] Click-through with a single authoritative main-process boolean, `setIgnoreMouseEvents(true, { forward: true })`, announced over IPC, off automatically when leaving the live view, and visually unambiguous.
- [ ] A decision on the emergency-erase shortcut: keep, change or drop. It is high-risk and its policy was never settled.

**Read:** `09` §8.

**Exit criteria:** every shortcut fires while a different app is focused; enabling click-through lets clicks reach the app underneath and the state is visible; leaving the live view restores interactivity.

---

### Phase 4 — Permissions, capture and honest status

**Goal:** two independent audio channels, and a UI that never lies about what is being recorded.

**Deliverables**

- [ ] Permission subsystem: check, request, open system settings — per platform.
- [ ] First-run onboarding that provokes each prompt explicitly and shows the real result, re-enterable from Settings.
- [ ] System/call audio and microphone acquired independently, per-platform paths, each with its own failure handling.
- [ ] `captureState` reported consistently **on every platform** — this was inconsistent in the old implementation and is a known defect to fix, not to reproduce.
- [ ] Two live meters, `MIC` and `SYS`/`CALL`, driven by real captured audio.
- [ ] Audio mode preference: system only, microphone only, both.
- [ ] Capture display chosen in preferences, never at session start.

**Read:** `09` §2, §3 (display choice); `general-knowledge/desktop/permissions-and-onboarding.md`.

**Exit criteria:** denying the microphone at OS level shows "denied" and the app never claims to record it; both meters move with real sound on each platform; no dialog appears at session start.

---

### Phase 5 — The core package

**Goal:** the pure domain, independently written, with its own tests.

**Deliverables**

- [ ] A workspace package with **no** `electron` import, no `process.platform` read, and its filesystem root injected.
- [ ] Event log: append-only, one JSON object per line, tolerant of a truncated final line.
- [ ] Session context and the event union as a TypeScript discriminated type.
- [ ] Thread projection: merge adjacent same-speaker fragments, attach a recent screenshot to the next question.
- [ ] VAD per channel with pre-roll and a length-based cut, **thresholds chosen by new benchmarking** — not carried over.
- [ ] Level metering with decay, so a stopped channel falls to zero instead of freezing.
- [ ] Echo detection that flags and never deletes, and keeps the flagged turn out of what the model reads.
- [ ] Hallucination filtering for silence-invented text and bracketed non-speech tags.
- [ ] A fresh benchmark tool with its own fixtures.

**Read:** `09` §3, §4, §12; D5, D22, D23, D25.

**Exit criteria:** the package builds and tests standalone with no Electron present; a crash mid-write costs at most the last line; the benchmark produces the numbers the latency budget is set from.

---

### Phase 6 — Profiles and the payload contract

**Goal:** the assistant knows who you are and what this meeting is.

**Deliverables**

- [ ] Profile = folder of markdown, folder is the source of truth.
- [ ] Frontmatter with exactly three managed keys — `name`, `confidential`, `model` — preserving unknown hand-written keys.
- [ ] Base instructions that make it a memory assistant, and say so when something is not in the notes rather than inventing it.
- [ ] Context files, checklist with stable ids, `history.md`.
- [ ] Atomic revisioned writes and a guarded delete.
- [ ] Bootstrap of two default profiles on first run.
- [ ] Payload assembly: stable prefix (instructions → notes → checklist), volatile suffix (transcript → image → question).
- [ ] Profile editor UI over that contract, with validation in the main process.

**Read:** `09` §5; D7, D30, D31, D16.

**Exit criteria:** a test pins the stable prefix and fails if anything time- or conversation-dependent enters it; editing a profile by hand on disk and in the editor converge; deleting is guarded; a crash during a write never leaves a truncated profile.

---

### Phase 7 — The live session thread

**Goal:** you can read the meeting as it happens.

**Deliverables**

- [ ] React conversation bubbles rendered from the projection, not from raw events.
- [ ] Speech turns labelled by channel, screenshot thumbnails, ask/answer pairs, non-fatal notices.
- [ ] Manual screenshot shortcut; screenshots stored as files with a relative reference in the event.
- [ ] Answer navigation and thread scrolling by shortcut.

**Read:** `09` §4.

**Exit criteria:** the live view and a stored session render identically from the same events; the thread stays readable through a long meeting; screenshots never enter the event log as base64.

---

### Phase 8 — Reasoning end to end

**Goal:** an explicit Ask produces a grounded answer.

**Deliverables**

- [ ] The provider port, with the model runtime behind it.
- [ ] TanStack AI wired in the main process; exact pinned version; adapter integration tests as the upgrade gate.
- [ ] One cloud adapter (Gemini first) and the IPC chat transport feeding streamed state to React.
- [ ] Two independent axes — transcription and reasoning — selectable, with the per-profile model override.
- [ ] The confidential hard stop: a confidential profile with no local reasoning available refuses to run.
- [ ] Credentials in `safeStorage`, never plaintext on disk.
- [ ] One safe read-only tool, to prove the tool path.

**Read:** `09` §6 in full.

**Exit criteria:** an Ask during a live session returns an answer grounded in the profile and the thread; a confidential profile pointed at the cloud fails with a clear message and sends nothing; killing the app leaves no key in a readable file.

**Explicitly out of scope here:** autonomous agents, MCP, sandbox/code mode, external durable-thread persistence, realtime voice. They create a second capture or thread authority beside the event log.

---

### Phase 9 — Persistence and the post-session loop

**Goal:** the session survives, and it makes the next one better.

**Deliverables**

- [ ] Session = folder: metadata written atomically and rarely, events appended.
- [ ] Human-readable transcript regenerated from the log, never the reverse.
- [ ] History view over stored sessions, using the same projection as the live view.
- [ ] Digest: agreements, open items, names and roles, figures and dates — only what was said.
- [ ] Digest appended to the profile's `history.md`, trimmed so the cached prefix cannot grow without bound.
- [ ] Digest runs **detached from session close**, marked explicitly as pending, with an attempt cap.
- [ ] Confidential profiles route their digest to local reasoning.

**Read:** `09` §7; D17, D24, D26.

**Exit criteria:** closing a session is instant regardless of digest latency; killing the app mid-digest leaves work that resumes and never double-charges; the second session with a profile visibly knows about the first.

---

### Phase 10 — Shippable

**Goal:** someone who is not you can install it and keep it updated.

**Deliverables**

- [ ] Stable reverse-DNS bundle identifier, set before the first build.
- [ ] macOS: hardened runtime, entitlements, Developer ID signing, notarisation, `${arch}` in artifact names, usage-description strings including screen recording.
- [ ] Windows and Linux targets.
- [ ] Auto-update with a decided hosting target and a status surface in the UI.
- [ ] **Provenance attestation** recorded before the first external binary: no code from the old repositories is included.
- [ ] IP/software-licensing review completed.
- [ ] Privacy decisions implemented: retention for sessions, screenshots and logs; whether a transport log ships at all; telemetry scope with transcript content excluded from error reports.

**Read:** `09` §10, §11; §9 of this plan.

**Exit criteria:** a signed, notarised build installs on a clean machine with no Gatekeeper warning; an update is delivered and applied; the attestation and the ledger are complete.

---

### Phase 11 — Local models

**Goal:** transcription and reasoning can run entirely on the machine, as two independent capabilities.

**Blocked by:** the binary hosting decision (§8, open decision O1). Do not start until it is closed.

**Deliverables**

- [ ] Own release channel for the runner binaries, with checksums generated as part of that release.
- [ ] Download with SHA-256 verification and resumable transfers.
- [ ] Port allocation, process lifecycle, readiness waiting.
- [ ] Two independent controls — transcription model, reasoning model — each showing selection, disk state, progress, startup error, and whether it will be used next session.
- [ ] Entitlement review: the JIT and library-validation relaxations these runtimes force.

**Read:** `09` §9.

**Exit criteria:** using local Whisper does not download or start a local LLM; an interrupted 1.6 GB download resumes instead of restarting; a corrupted binary is rejected by checksum.

---

### Phase 12 — Translate

**Goal:** the feature that does not exist yet anywhere.

**Blocked by:** its product semantics (§8, open decision O3).

**Deliverables**

- [ ] Source and target language, and when translation runs.
- [ ] The original `speech.text` retained; translated text and target language attached as optional metadata. **Never overwrite the source transcript.**
- [ ] Sidebar surface and its settings.

**Read:** `09` §Product contract, §4.

**Exit criteria:** the original transcript is byte-identical with translation on and off.

---

## 7. Budgets inherited on day one

Measured on an M4 Pro / macOS, not estimated. These are the starting targets; the new benchmark re-establishes them.

| Budget                                       | Value                                                        |
| -------------------------------------------- | ------------------------------------------------------------ |
| Whisper throughput (`large-v3-turbo`, Metal) | ~25× real time                                               |
| Whisper cost below ~27 s of audio            | Flat — one pass per 30 s window                              |
| End of sentence → answer on screen           | 6–9 s, accepted; the bottleneck is segmentation, not Whisper |
| Session digest                               | 8–25 s typical, 67 s worst observed                          |
| Event log                                    | ~44 KB per hour-long meeting                                 |
| Model disk                                   | 1.6 GB for `large-v3-turbo` alone                            |

Not yet measured anywhere, and needing a budget: memory and CPU with the overlay plus both local runtimes resident, and behaviour across a multi-hour session.

## 8. Open decisions

Each one blocks specific phases. Close it as an ADR in the new repository before that phase starts.

| #   | Decision                                                                                                                                                              | Blocks           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| O1  | **Native binary hosting** — own release channel, vendored in the installer, or user-supplied path. The new app cannot point at the upstream project's release assets. | Phase 11         |
| O2  | **Data import** — migrate profiles and sessions from the old app's config directory, or start clean with an export path offered from the old app first.               | Phase 6, Phase 9 |
| O3  | **Translate semantics** — provider or local model, when it runs, whether translations persist.                                                                        | Phase 12         |
| O4  | **Privacy and retention** — retention windows, whether a transport log ships, telemetry scope, emergency-erase policy.                                                | Phase 10         |
| O5  | **Locale** — English-only or i18n from the start. Retrofitting is expensive.                                                                                          | Phase 1          |
| O6  | **Prompt caching** — never confirmed working end to end in the old app, so the cost model behind the latency budget is unverified.                                    | Phase 8          |
| O7  | **Kaipu reuse approval** — Kaipu is MIT and reusable under its own terms with its notices, but clean-room rule 5 requires explicit approval per package.              | Phase 1, Phase 4 |

## 9. Provenance ledger

Maintained from Phase 0, completed before the first external binary. One row per initial package and per third-party dependency of consequence.

| Package / component                  | Source                   | Licence     | Independently implemented or copied under licence | Reviewer | Date |
| ------------------------------------ | ------------------------ | ----------- | ------------------------------------------------- | -------- | ---- |
| _example_ `core`                     | Specification `09` §3–§7 | Proprietary | Independently implemented                         |          |      |
| _example_ Kaipu permission subsystem | `kaipu-record-monorepo`  | MIT         | Copied under licence, notices retained            |          |      |

**Attestation required before the first external binary release:** no code from `cheating-daddy-cris` or `sohzm/cheating-daddy` is included in this application.

## 10. How to work this plan

- **One phase at a time, in order.** The ordering is dependency-driven, not preference: every phase after 2 assumes a verified overlay, and every phase after 5 assumes a pure core.
- **Read the specification section before writing code**, and do not open the old implementation. That is clean-room rule 3, and it is also simply faster than reverse-engineering 1100 lines of mutable state.
- **Exit criteria are demonstrated, not asserted.** "It should work" closes nothing.
- **When something looks arbitrary, check `03-decisions.md` before changing it.** There is almost always a recorded reason, including for the decisions that were reversed.
- **When a decision is taken, write the ADR in the new repository.** This document is the plan; the ADRs are the record. Do not leave the new project citing a repository that no longer moves.
- **Update this file as you go** — check boxes, fill dates, move open decisions into ADRs. A plan nobody edits is a plan nobody follows.
