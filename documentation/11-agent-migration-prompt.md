# 11 — Agent brief for the rebuild

**Written:** 2026-09-03
**Purpose:** the prompt to hand the coding agent that executes `10-execution-plan.md` in the new repository, set up so the agent reads this documentation in place rather than through a copy.

---

## Reading in place

The agent reads these files directly by absolute path. Nothing is copied into the new repository, so there is no second version to drift, and the new repository's history stays clean.

The reference lives at:

```
/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/
```

Only that directory is readable. Its siblings — `src/`, `test/`, `tools/` — are the previous implementation, and clean-room rule 3 puts them out of bounds. The distinction is what makes the Phase 10 provenance attestation something you can honestly sign: the agent had the specifications and never had the source.

| File                           | Absolute path                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **The plan — start here**      | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/10-execution-plan.md`             |
| **The specification**          | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/09-reimplementation-reference.md` |
| Decision log (31 decisions)    | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/03-decisions.md`                  |
| What was measured              | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/08-shipped.md`                    |
| Deferred work and why          | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/07-backlog.md`                    |
| Original findings              | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/01-current-state.md`              |
| Target design                  | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/02-design.md`                     |
| Libraries and models evaluated | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/04-evaluations.md`                |
| AI briefing (paste whole)      | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/briefings/ai-briefing.md`         |
| Design and UI-copy brief       | `/Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/briefings/design-brief.md`        |

If the reference repository moves, update the paths in the brief below — they are the only thing tying it to this machine.

---

## Before you press go

An unattended run stalls the moment it hits a decision that is yours. Four of the seven open decisions block phases 0–9; close them first and the agent runs to the end of Phase 9 without needing you.

| Decision                | Blocks      | What you are choosing                                                                                                         |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **O5 — Locale**         | Phase 1     | English-only, or i18n from the start. Retrofitting is expensive; this is why it blocks so early.                              |
| **O7 — Kaipu reuse**    | Phases 1, 4 | Whether the agent may reuse Kaipu's MIT packages (permission subsystem especially) with their notices, or must write its own. |
| **O2 — Data import**    | Phases 6, 9 | Import profiles and sessions from the old app's config directory, or start clean.                                             |
| **O6 — Prompt caching** | Phase 8     | Whether the cost model assumes caching works, given it was never confirmed end to end.                                        |

The remaining three block later phases and can wait: **O4** (privacy and retention) blocks Phase 10, **O1** (native binary hosting) blocks Phase 11, **O3** (Translate semantics) blocks Phase 12.

Write each answer as an ADR in the new repository before starting. The agent reads ADRs; it does not read your intentions.

---

## The standing brief

Paste this once at the start of the session.

```text
You are implementing a desktop application from a written specification. You are
not porting an existing codebase — read the clean-room rules below before
anything else.

## Your reference material

Read these directly at these absolute paths. Do not copy them into this
repository.

  Plan (start here):
  /Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/10-execution-plan.md

  Specification:
  /Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/09-reimplementation-reference.md

  Decision log (31 prior decisions with their reasoning):
  /Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/03-decisions.md

  What was measured rather than estimated:
  /Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/08-shipped.md

  Deferred work and why:
  /Users/cristiansotomayor/Documents/Workspace/Personal/cheating-daddy-cris/documentation/07-backlog.md

Read the plan first. It tells you which section of the specification to read for
the phase you are working on.

## The rule that overrides everything

This is a clean-room rebuild. A previous implementation of this product exists
in that same reference repository and is GPL-3.0. You are reimplementing from
specifications, not porting.

  1. You may read ONLY the `documentation/` directory at that path. Its
     siblings — `src/`, `test/`, `tools/` — are the old implementation and are
     out of bounds. Do not open, list, grep or search them, and do not read the
     old repository's git history.
  2. Never copy, translate, adapt line-by-line, or use as a template any file
     from that project, including tests, fixtures, prompts and comments.
  3. Your permitted inputs are: those documentation files, the ADRs in this
     repository, and official vendor documentation (Electron, TanStack, React,
     the model providers).
  4. Numeric parameters quoted in the specification that came from the old
     implementation — the VAD thresholds especially — are starting points to be
     re-derived by your own benchmarking, never values to copy.

If a specification section is not precise enough to implement from, stop and ask.
Do not close the gap by inferring what the old code must have done.

## How we work

- One phase at a time, in the order the plan gives. Do not start the next phase
  before the current one's exit criteria are met.
- Before writing code for a phase, read its specification section and restate in
  a few lines what you are about to build and how you will prove it works.
- A phase is finished when its exit criteria are demonstrated with evidence — a
  passing test, a screenshot, a recorded run — not when the code looks right. If
  you cannot demonstrate a criterion, say which one and why.
- Append a short entry to `docs/progress.md` at the end of every phase: what was
  built, what evidence proves it, what you decided, and anything you skipped.
  Write it so I can read only that file and know where things stand.
- When you take a decision that will outlive the phase, write it as an ADR in
  this repository. The plan is the plan; the ADRs are the record.
- Update the plan document's checkboxes as you finish deliverables, and keep the
  provenance ledger (section 9 of the plan) current as you add packages and
  dependencies.
- When something in the specification looks arbitrary, check the decision log
  before changing it. There is usually a recorded reason, including for the
  decisions that were reversed.

## When to stop and wait for me

Stop, write what you have into `docs/progress.md`, and ask when:

  - a phase's exit criterion cannot be demonstrated;
  - the specification is ambiguous in a way that changes the implementation;
  - a phase needs a decision that is not already answered by an ADR here;
  - Phase 2's overlay verification fails on any target OS — nothing else gets
    built on an unverified overlay;
  - you would otherwise need to look at the old implementation.

Do not pick a default and continue in any of these cases.

## Conventions

- Everything committed is in English: code, comments, identifiers, tests, commit
  messages, ADRs, documentation. Talk to me in Spanish if you like.
- TypeScript strict, ESM. React 19 in the renderer. The main process owns
  anything heavy; React subscribes to it, it does not run it.
- The renderer never gets Node access. Every main-renderer call is typed and
  goes through the preload bridge; the shared types are the source of truth.
- Tests are written with the feature, not after it.
- `bun run verify` passes before anything is pushed.
```

---

## Per-phase invocation

After the standing brief, one line starts each phase:

```text
Start Phase 2 — Protected overlay. Read section 6 of the plan for the phase and
section 1 of the specification for the behaviour, then restate the goal and the
exit criteria before you write anything.
```

Change the numbers per phase. The plan already names which specification section each phase needs.

To let it run through several phases unattended, say so explicitly and bound it:

```text
Work Phases 0 through 5 in order without stopping between them, following the
stop conditions in the brief. Append to docs/progress.md after each phase.
```

Phases 0–5 are a good first unattended block: repository foundation, application
shell, the protected overlay with its verification, shortcuts, capture and
permissions, and the core package. It ends at a natural checkpoint — everything
below the UI is built and proven, and nothing yet depends on a provider or a
model key.

---

## Phase 0 is different

Phase 0 has no code: the repository, the proprietary notice, the first two ADRs, the provenance ledger and the CI gate. Do not let it be skipped or deferred. The clean-room attestation in Phase 10 depends on the ledger having been kept from the first commit rather than reconstructed afterwards.

---

## What to watch for

| Signal                                                                                                                       | What it means                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Code that matches the old implementation suspiciously closely — same function names, same comment phrasing, same file layout | It reached the source despite the rule, or it is reconstructing from memory of it. Stop and ask where the code came from. |
| A phase reported complete with no evidence                                                                                   | The exit criteria exist precisely to prevent this. Ask for the demonstration.                                             |
| A default picked for an open decision                                                                                        | O1–O7 are yours to close, not its. Reject and decide.                                                                     |
| Phase 3 started while Phase 2's overlay is unverified on some OS                                                             | The ordering is dependency-driven. Everything after Phase 2 assumes a verified overlay.                                   |
| `docs/progress.md` not updated                                                                                               | You lose the ability to come back to an unattended run and know what happened without reading the whole transcript.       |
