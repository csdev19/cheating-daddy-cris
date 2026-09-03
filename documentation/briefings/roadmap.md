**Last reviewed: 2026-09-03.** Status determined from `git log --oneline` on
`origin/main`, not GitHub PR history: only 2 of the commits below (marked
`#1`/`#2`) went through a pull request — the rest landed by direct push, so
`gh pr list` alone would badly undercount what shipped.

## Shipped

This repo started as a fork of
[`sohzm/cheating-daddy`](https://github.com/sohzm/cheating-daddy), a
live-answer interview teleprompter. Everything below is the redesign into a
reactive memory assistant (decision log: `../03-decisions.md`, D1 onward),
merged into `origin/main`.

| Capability | Where it landed |
| --- | --- |
| **Reactive core: one context thread, one shortcut.** Screen + audio feed a single event log instead of three disconnected features; the model answers only when the user presses the shortcut, not on every turn. | `hilo de contexto, perfiles como carpetas y ensamblado de payload`, `atajo reactivo, perfiles en disco y retirada de prompts.js`, `thread-driven view, disk-backed profile picker and English runtime strings` |
| **Profiles as markdown folders.** `profile.md` + `checklist.md` + `context/*.md`, no authoring UI at first — replaced later by an in-app editor (see In flight). | same commits as above; format defined in D7 |
| **Local transcription: per-channel VAD, large-v3-turbo Whisper, independent of the reasoning provider.** Includes pre-roll/silence trimming, a standalone STT bench tool, hallucination filtering, segment-length capping, and echo detection so a repeated question isn't double-counted. | `VAD por canal con pre-roll y recorte de silencio final`, `transcripción local independiente del LLM local (D14/A1)`, `large-v3-turbo, VAD por canal y cola de transcripción`, `declare the missing hallucination filter and step the window aside for capture`, `route audio by the transcription axis, not the reasoning one`, `cap long speech segments, flag echoed turns and add an end-session CTA` |
| **Sessions as append-only, crash-safe storage.** A session is a folder (`session.json` + `events.jsonl` + `transcript.md` + screenshots) instead of one JSON blob rewritten on every save; old flat-file sessions still load. | `persistir el hilo de eventos, migrar sesiones antiguas y mostrar el resumen`, `a session is a folder, with atomic metadata and an append-only event log`, `read a stored session properly, and copy it out as Markdown` (`#2`) |
| **Post-session summary detached from session close.** The digest model call runs unawaited after the session ends and is resumable on next launch if interrupted. | `gestor de sesión, adaptadores de proveedor y resumen post-sesión`, `a summary owed is finished on the next launch`, `detach the session summary and actually shut down local transcription` |
| **Correctness fixes surfaced by actually running the app** (see `08-shipped.md` for the full "core built, wiring not connected" postmortem): missing `initialize-session` wiring, hardcoded profile list vs. disk, deleted macOS audio handlers, wrong Gemini model id for HTTP calls, `whisper-server` processes not shutting down. | `correct Gemini model id, resumable model downloads and a real recording indicator`, and the fixes folded into the commits above |
| **Electron 30 → 44, bun as the package manager.** Node 20→24, Chrome 124→152; `bun.lock` committed, `bun run test` (not `bun test`) as the test entrypoint. | `chore: upgrade Electron to 44 and switch to bun` (`#1`) — see D27, D28 |
| **English as the only language across code, docs, and UI strings** — no i18n layer, by decision. | `translate documentation/, AGENTS.md and the STT bench to English`, `translate comments and tests to English` |
| **The capture screen is a setting, not a per-session picker; the packaged app has its own bundle identifier** (`com.csdev19.screen-assistant`) so macOS permission grants aren't tied to Electron's generic identity. | folded into the D29 decision commit and the Electron 44 upgrade |

## In flight

| What | Blocked on |
| --- | --- |
| **In-app profile editor** (create, edit, rename display name, delete — the folder stays the source of truth; D30). Retires the old decorative "custom prompt" textarea that never actually reached the model (D31). Fully built on branch `feat/profile-editor`, 6 commits ahead of `origin/main`: safe revisioned file writes, legacy-context migration with deletion guards, the editor UI itself, and profile selection on the start screen. | Not yet opened as a pull request / merged to `origin/main`. |

## Next

Not decided yet. `07-backlog.md` lists several understood-but-unbuilt items
(crash-safe persistence for audio not yet transcribed, Developer ID code
signing, a pre-session context preview, session naming/description, a
monorepo split for `core`) but per this briefing set's own rule, a backlog
of deferred work isn't committed direction until someone picks it — ask
before treating any of it as "next."
