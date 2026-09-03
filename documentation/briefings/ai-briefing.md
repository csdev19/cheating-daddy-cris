> Paste this whole document into another model's context to answer questions
> about this project without repo access. It is self-contained — nothing here
> says "see the docs for details." Current as of 2026-09-03.

## What it is

`cheating-daddy-cris` is an Electron desktop app (fork of
[`sohzm/cheating-daddy`](https://github.com/sohzm/cheating-daddy)) that
overlays a transparent, always-on-top window during a video call, interview,
sales call, or negotiation. It captures the screen and system/mic audio
continuously, transcribes and threads everything into one running context
along with the user's own prior material, and answers **only when the user
presses a shortcut** — it never volunteers commentary during the meeting.
The product's own name for this is a "memory assistant," not a
teleprompter: it is built to remind the user of what they already know but
forgot in the moment, not to generate answers to feed them live.

Differentiators, in order of how load-bearing they are to the design:

1. **Reactive, not proactive** (decision D1). One shortcut triggers a
   response; nothing runs on every turn of conversation. This is also why a
   pure Q&A test of the app — asking it something with no interviewer
   speaking first — produces no answer: there is no question in the thread
   for it to react to.
2. **A single context thread, not three disconnected systems.** What the app
   hears, what it sees (screenshots), and what it knows about the user
   (profile markdown) are fused into one event log per session, not handled
   as separate features.
3. **Transcription and reasoning are independent axes** (D14). Local Whisper
   (via a bundled `whisper-server`, GPU-accelerated where available) does
   speech-to-text; Gemini 2.5 (via `@google/genai`) does the reasoning call.
   Either can be swapped without touching the other — there is no single
   "provider mode" that couples them.
4. **Profiles are markdown folders on disk, not database rows** (D7, D30).
   `profile.md` + `checklist.md` + `context/*.md` under
   `<userData>/profiles/<slug>/`. The in-app profile editor writes the same
   files atomically; the folder remains the source of truth and stays
   editable by hand at any time.
5. **A session is an append-only event log, not a rewritten JSON blob**
   (D26). Crash safety comes from never truncating a growing file.

## Status that changes how you should answer

- **Not published anywhere.** No npm package, no configured release target
  in `forge.config.js`. `package.json` version `0.8.0` is the only version
  that exists — there is no "latest release" to check against.
- **The product pivoted mid-history.** Early commits and the upstream
  `sohzm/cheating-daddy` project describe a live-answer interview
  teleprompter ("cheating daddy"). This fork redesigned it into the reactive
  memory assistant described above (decision log:
  `documentation/03-decisions.md`, D1 onward). Treat the *current* behavior
  as the reactive one; the repo/package name and older README language
  ("cheating daddy") are historical and should not be read as the product's
  actual behavior today.
- **Most work lands by direct push, not PRs.** Only 2 of the shipped
  commits went through a GitHub PR. `git log` on `origin/main` is the
  reliable shipped-work record, not the PR list.
- **`documentation/09-reimplementation-reference.md` and
  `10-execution-plan.md` describe a *different, future* repository** — a
  clean-room GPL-3.0 rebuild that has not started. Nothing in those two
  files is true of *this* repo's current code; don't cite them for this
  repo's stack, interfaces, or status.
- **The current branch (`feat/profile-editor`) is ahead of `origin/main`**
  with the profile-editor feature (D30) fully built but not yet merged via
  PR.

## The interfaces

**Running it:**

```
bun install         # bun is required; packageManager is pinned in package.json
bun run start        # electron-forge start
bun run test          # node --test "test/**/*.test.js" — NOT `bun test`, see D28
bun run make           # electron-forge make (build installers)
bun run bench:stt -- recording.wav   # compare local Whisper models on one file
```

**IPC surface** (Electron main process, `ipcMain.handle` channels the
renderer calls via `window.cheddar` / preload bridge) — the real public API
of the app:

```
Session lifecycle:  initialize-session, start-new-session, close-session,
                     cancel-local-initialization, get-current-session,
                     get-thread, generate-session-digest
Audio/video in:      send-audio-content, send-mic-audio-content,
                     send-image-content, send-text-message,
                     start-macos-audio, stop-macos-audio
Profiles:            list-profiles, profiles:read, profiles:create,
                     profiles:write, profiles:write-note, profiles:delete-note,
                     profiles:write-checklist, profiles:delete,
                     profiles:session-active
Storage (per-key):   storage:get-config / set-config / update-config,
                     storage:get-preferences / set-preferences / update-preference,
                     storage:get-api-key / set-api-key,
                     storage:get-credentials / set-credentials,
                     storage:get-all-sessions / get-session / save-session /
                     delete-session / delete-all-sessions / clear-all,
                     storage:get-keybinds / set-keybinds,
                     storage:get-today-limits, storage:get-groq-api-key / set-groq-api-key
Window/system:       window-minimize, window-step-aside, window-step-back,
                     toggle-window-visibility, list-displays, read-screenshot,
                     get-app-version, open-external, quit-application,
                     update-google-search-setting, copy-session-markdown
```

**Profile folder format** (D7, D30) — one folder per profile under
`<userData>/profiles/<slug>/`:

```
profiles/interview/
  profile.md        # frontmatter: name, model, confidential; body: instructions
  checklist.md       # items the profile wants surfaced live
  context/
    cv.md
    salary-notes.md
  history.md          # append-only summaries from past sessions with this profile (D17)
```

The slug is derived once from the name at creation and is immutable; only
`name:` in the frontmatter is editable afterward (renaming the folder would
orphan stored sessions that reference the slug in `session.json`).

**Session storage format** (D26) — one folder per session under
`<userData>/history/<sessionId>/`:

```
history/<sessionId>/
  session.json        # metadata, written atomically (temp + rename)
  events.jsonl          # the thread: one JSON event per line, append-only
  transcript.md          # derived, human-readable view, regenerated from events.jsonl
  screenshots/            # PNGs referenced by imageRef in events
```

A torn final line in `events.jsonl` (from a crash mid-write) is skipped on
read; everything before it survives.

## Corrections — what a model tends to get wrong about this project

- **CommonJS in the main process, not ESM or TypeScript.** `src/core/**` and
  `src/utils/**` are plain CommonJS with no build step. Node 24 (Electron 44)
  *can* `require()` an ESM package, but that's not a reason to add one
  (D10). The renderer is a separate browser context and does use ES modules.
- **The UI is Lit, not React/shadcn.** `AGENTS.md` used to promise a
  React 19 + shadcn migration; that instruction was retracted (D19) and is
  no longer true. UI lives in `src/components/`, vendored in `src/assets/`.
- **Storage is flat files, not SQLite**, even though Node 24 makes
  `node:sqlite` available for free. The append-only-log fit (D26) was judged
  right for "append events, read one session whole," not a limitation
  someone forgot to lift (D27 revisits this explicitly and still declines
  it).
- **Reasoning provider is Gemini, transcription is local Whisper — this is
  not "Gemini for everything" or "fully local."** They are independent axes
  (D14); a `providerMode` variable that used to couple them was the source
  of multiple production bugs and no longer exists in that form.
- **Package manager is bun, not npm**, and tests run via `bun run test`
  (which invokes `node --test`), never `bun test` directly — the app runs
  on Node inside Electron, and bun's own test runner can hide Node-specific
  differences (D28).
- **This repo is not the reimplementation target.** `documentation/09-*` and
  `10-*` describe a separate, not-yet-started rebuild in a different
  repository; this repo keeps shipping independently of that plan.
