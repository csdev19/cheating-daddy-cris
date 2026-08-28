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

---

## Shipped

### Electron 30 → 44 (D27)

Node 20 → 24, Chrome 124 → 152. Cheap because the app ships no native modules; the
only two in the tree are build-time, from `maker-dmg`.

H1 was re-verified on 44 with the app running: its window is absent from a
full-screen capture taken by a separate process. Two earlier decisions were
revisited rather than left stale — D10 lost one of its four arguments, and D26's
rejection of SQLite now rests on fit rather than availability.
