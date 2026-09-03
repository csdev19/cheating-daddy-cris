# Briefings binding

Where the briefings live and what regenerates them. Read by the
`generate-briefings` skill. Paths are relative to the repo root.

## Location

`documentation/briefings/` — this repo calls the set **briefings**, plain
markdown, linked from `documentation/README.md`. It sits beside the existing
sequential `documentation/01-...` through `10-...` analysis-and-plan narrative
without renumbering into it: those documents are a chronological record of one
redesign (current state → decisions → plan → shipped → hand-over to a future
rebuild), and the briefing set is a different shape — a snapshot re-derived
from repo truth on every refresh, not a narrative.

## Briefings in this repo

| Briefing         | File                | Notes                                                              |
| ----------------- | ------------------- | -------------------------------------------------------------------- |
| `index`           | `index.md`          |                                                                        |
| `pitch`           | `pitch.md`          | Memory-assistant framing only — see Repo rules below                 |
| `ai-briefing`      | `ai-briefing.md`    |                                                                        |
| `stack`            | `stack.md`          |                                                                        |
| `roadmap`          | `roadmap.md`        | No GitHub PR history for most work — sourced from `git log`; see it   |
| `design-brief`     | `design-brief.md`   | Tokens read from `src/index.html`, the only place they're defined    |
| `business-brief`   | —                   | Not created — this is a personal project, not a venture; skipped by request on 2026-09-03 |

## Sources of truth

| For | Read |
| --- | --- |
| shipped / in flight | `git log --oneline` on `origin/main` (the branch merges land on) plus `gh pr list --state merged\|open` — only 2 of ~30 shipped commits went through a PR (#1, #2); most land by direct push, so git log is primary. Current branch `feat/profile-editor` is ahead of `origin/main` and not yet opened as a PR. |
| public interface | `src/index.js` (Electron main, `ipcMain.handle` channels), `src/core/*.js` (pure modules), profile folder format (`documentation/03-decisions.md` D7, D30) |
| schemas | Session storage format: `documentation/03-decisions.md` D26 (`history/<sessionId>/session.json`, `events.jsonl`, `transcript.md`) |
| stack | `package.json` (deps/devDeps), `bun.lock`, `forge.config.js` + `documentation/03-decisions.md` (D9, D19, D21, D27, D28 and others carry the "why") |
| design values | `src/index.html` (`:root` CSS custom properties — the only design tokens file in the repo) |
| positioning copy | `README.md`, `documentation/README.md` (executive summary) — filtered through the memory-assistant framing rule below |
| published version | Not applicable — the app is not published (no npm package; `forge.config.js` has no `publish` target). `package.json`'s `version` is the only version that exists; skip the published-vs-repo check on every refresh. |

## Repo rules

- Language: English on every published surface (`AGENTS.md`, global `CLAUDE.md`)
- Safe positioning: the app helps someone recall their own prior material
  (notes, CV, figures, decisions), tracks what was said and left open in the
  current meeting, and surfaces a live checklist — on request, via a shortcut,
  never unprompted
- Never claim: that the app feeds live answers, writes what to say, or does
  anything covert/deceptive — even though the repo, package name and legacy
  README ("cheating daddy") predate this framing and still use that language.
  `pitch` in particular must not use "cheat" as a selling point.
- The product pivoted from an interview teleprompter to a reactive memory
  assistant (see `documentation/03-decisions.md` D1); briefings describe the
  current, post-pivot product, not the original one
- `documentation/09-reimplementation-reference.md` and `10-execution-plan.md`
  describe a **separate future repository** (a clean-room GPL-3.0 rebuild) —
  never source briefing claims about *this* repo's stack, interfaces or status
  from those two files

## Validation

None — no docs build. Verify every relative link resolves (`ls` the target)
and that every claim changed in a refresh was re-read from the source listed
above.
