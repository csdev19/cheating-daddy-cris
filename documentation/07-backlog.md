# 07 — Backlog

Work that is understood but not done, with enough context to pick it up cold. Items
leave this list when they ship or when a decision in
[03-decisions.md](03-decisions.md) closes them.

---

## Open

### Audio captured but not yet transcribed is not on disk

The only gap D26 does not close. The VAD holds up to `maxSegmentSeconds` of speech
that has not closed into a segment yet, plus whatever is queued for
`whisper-server`. A crash loses it, and no storage engine would change that — the
audio never reaches the storage layer.

Closing it means writing the pending PCM to disk as it is captured and transcribing
it on the next launch. The cost is continuous audio writes for the whole meeting
and real recovery logic. Deliberately deferred: at 12 s the exposure is small, and
the transcript of everything already spoken is safe.

### Code signing with a Developer ID

`appBundleId` is set, so the packaged app's `Info.plist` carries
`com.csdev19.screen-assistant`. But the build is ad-hoc signed and `codesign -dv`
still reports `com.github.Electron`, so the identity macOS sees is not consistent
end to end. Fixing it means enabling `osxSign` in `forge.config.js` with a real
Developer ID, and notarisation after that. Until then, permission grants are less
stable than they look. See D29.

### Context preview before starting a session (M3)

From the audit. Before starting, show which profile, which `context/` files and how
many tokens are about to be sent. It removes a silent failure mode — a note saved as
`.txt` is never loaded, since the loader only reads `.md`, and you find out
mid-meeting. Small, and not built.

### Gemini implicit caching is not confirmed working

B4 from the audit. A real session logged `cachedContentTokenCount: 0 of 197`. That
particular call was below the ~1024-token minimum, so it proves nothing either way.
It needs checking on a session with a large context block. If it stays at zero, the
stable block should move into the first `user` message of `contents` instead of
`systemInstruction`. Cost estimates in
[04-evaluations.md](04-evaluations.md) assume the caching works.

### Two transcription filters considered and not built

Recorded in D25. Dropping segments on low language-detection confidence, and
pinning the session language instead of autodetecting. Both were left out pending
evidence from real sessions, and both have a real downside written down.

### `transcript.md` is not generated for sessions that predate it

The derived transcript is written when a session closes. Sessions already stored do
not have one. They can be regenerated from their event log at any time; nothing
does it yet, and doing it in bulk on startup would be the same mistake the explicit
`digestPending` mark exists to avoid (D24).

### A profile's `history.md` keeps the header it was created with

`appendDigest` writes the file header only on creation, so a `history.md` created
before the language sweep still opens with a Spanish heading. Only affects files
that already exist.

### A stored session cannot be named or described

Every row in the history reads `profile label · date · time`
(`HistoryView.js:763`). Nothing in it comes from what the session was about, so
someone who always picks the same profile gets a column of identical rows
separated only by a timestamp. The summary is the only thing that distinguishes
them, and it is inside the detail view, arrives after the session closes (D24),
and is missing entirely from sessions that never got one.

The metadata has nowhere to put it: `saveSession` (`storage.js:473`) writes a
fixed record — `sessionId`, `createdAt`, `lastUpdated`, `profile`,
`customPrompt`, `digest`, `digestPending`, `digestAttempts` — and
`getAllSessions` projects a fixed shape on top of it. Neither has a title or a
description.

Adding them is cheap. `saveSession` already merges into the stored record and
writes atomically (D26), so an edit is a merge of two fields and never touches
the event log, which stays append-only. An empty title falls back to today's
label, so stored sessions do not regress.

Two things are unresolved and are the reason this is written down rather than
built:

**Whether the title should be suggested.** The obvious source is the first line
of the digest, but the digest lands after the session ends and can be generated
much later, so a row the person already named would change under them. A
suggestion offered once at close, never overwriting an edit, is probably the
shape — that needs deciding, not guessing.

**Whether the profile is editable at all.** It is not a label: it selected the
instructions, the notes and the checklist that produced every answer in that
thread. Re-pointing a stored session at a different profile would make the
record claim something that did not happen, which is the opposite of what the
event log exists for. Showing the profile better is a different job from
changing it, and only the first one is clearly wanted.

That first job has a bug sitting in it already. `_getProfileLabel` resolves the
stored profile through a hardcoded map (`HistoryView.js:487`) listing `sales`,
`presentation`, `negotiation` and `exam` — none of which exist on disk — while
any profile the person actually creates is absent and renders as its folder
slug. AGENTS.md is explicit that the profile list is read from the profiles
folder and never hardcoded. Reading the name from the profile's frontmatter
fixes the label independently of anything else here, and is worth doing first.

### Profile editor: local file conflicts and managed digest notes

D30 specifies optimistic concurrency for editor writes and makes `history.md` an
app-managed note. The implementation plan must cover the UX details: retaining an
unsaved draft after a revision conflict, reloading without closing the editor, and
making it clear that a later digest can append to `history.md`. These are not a
second sync system or undo/versioning; they are the minimum needed for folders to
remain genuinely editable by hand.

---

## Open

### Monorepo, when there is a second consumer of `core`

The rest of the workspace is bun monorepos shaped `apps/*` / `packages/*`.
`src/core/` is already package-shaped: pure, no Electron, no dependencies, fully
tested. Two things are unresolved (D28): electron-forge bundles `node_modules` from
the project root into the asar, and a workspace hoists to the repo root, so
packaging from inside one needs testing; and the shared catalog pins a
TypeScript/vite/tailwind stack this project does not use by decision (D19). Worth
doing when something else needs to consume `core`.

---

## Shipped

### Electron 30 → 44 (D27)

Node 20 → 24, Chrome 124 → 152. Cheap because the app ships no native modules; the
only two in the tree are build-time, from `maker-dmg`.

H1 was re-verified on 44 with the app running: its window is absent from a
full-screen capture taken by a separate process. Two earlier decisions were
revisited rather than left stale — D10 lost one of its four arguments, and D26's
rejection of SQLite now rests on fit rather than availability.
