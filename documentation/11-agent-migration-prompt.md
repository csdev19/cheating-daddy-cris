# 11 — Agent brief for the rebuild

**Written:** 2026-09-03
**Purpose:** the prompt to hand to the coding agent that executes `10-execution-plan.md` in the new repository, plus how to set up its reference material without breaking the clean-room policy.

---

## Setting up the reference folder

The plan is to keep this repository available beside the new project so phases can be worked one at a time. That is useful, but it has to be done carefully: clean-room rule 3 says the old implementation is not read while writing the replacement, and an agent with `src/` in reach will read it.

**Copy the documentation, not the source.**

```bash
# from the root of the new repository
mkdir -p reference/legacy-docs
cp -R ../cheating-daddy-cris/documentation/. reference/legacy-docs/
echo "reference/" >> .gitignore
```

That gives the agent every specification, decision and measurement, and nothing it is forbidden to reproduce. If you clone the whole repository instead, the source sits one `cat` away from an agent that has been told not to look at it, and the provenance attestation in Phase 10 becomes something you cannot honestly sign.

If you do keep a full clone for your own reference, put it outside the new repository's working directory entirely.

---

## The standing brief

Paste this once at the start of a session. It sets the rules for every phase.

```text
You are implementing a desktop application from a written specification. The
specification and the plan are in `reference/legacy-docs/`:

  - `09-reimplementation-reference.md` — the specification. What must be true.
  - `10-execution-plan.md` — the plan. Phases, deliverables, exit criteria.
  - `03-decisions.md` — 31 prior decisions with their reasoning.
  - `08-shipped.md` — what was measured rather than estimated.

Read `10-execution-plan.md` first. It tells you which section of `09` to read
for the phase you are working on.

## The one rule that overrides everything

This is a clean-room rebuild. A previous implementation of this product exists
and is GPL-3.0. You are reimplementing from specifications, not porting.

  1. Never copy, translate, adapt line-by-line, or use as a template any file
     from that project. This includes tests, fixtures, prompts and comments.
  2. Do not read that project's source code. `reference/legacy-docs/` contains
     documentation only, and that is deliberate. If you ever find yourself with
     access to the old source, do not open it — tell me instead.
  3. Your permitted inputs are: the specification documents above, the ADRs in
     this repository, and official vendor documentation (Electron, TanStack,
     React, the model providers).
  4. Where the specification gives a numeric parameter that came from the old
     implementation — VAD thresholds especially — treat it as a starting point
     to be re-derived by your own benchmarking, not a value to copy.

If a specification section is not precise enough to implement from, say so and
ask. Do not resolve the gap by inferring what the old code must have done.

## How we work

- One phase at a time, in the order given. Do not start the next phase.
- Before writing code for a phase, read its specification section and restate
  in a few lines what you are about to build and how you will prove it works.
- A phase is finished when its exit criteria are demonstrated with evidence —
  a passing test, a screenshot, a recorded run. Not when the code looks right.
  If you cannot demonstrate a criterion, say which one and why.
- When a phase depends on an open decision (they are listed in section 8 of the
  plan, O1–O7), stop and ask. Do not pick a default and continue.
- When something in the specification looks arbitrary, check `03-decisions.md`
  before changing it. There is usually a recorded reason, including for the
  decisions that were reversed.
- When you take a decision that will outlive the phase, write it as an ADR in
  this repository. The plan is the plan; the ADRs are the record.
- Update `10-execution-plan.md` as you go: check the boxes you have actually
  finished, and move open decisions into ADRs when they close.
- Keep the provenance ledger (section 9 of the plan) current as you add
  packages and dependencies.

## Conventions

- Everything committed is in English: code, comments, identifiers, tests,
  commit messages, ADRs, documentation. Talk to me in Spanish if you like.
- TypeScript strict, ESM. React 19 in the renderer. The main process owns
  anything heavy; React subscribes to it, it does not run it.
- The renderer never gets Node access. Every main↔renderer call is typed and
  goes through the preload bridge; the shared types are the source of truth.
- Tests are written with the feature, not after it.
- `bun run verify` passes before anything is pushed.
```

---

## Per-phase invocation

After the standing brief, start each phase with one line:

```text
Start Phase 2 — Protected overlay. Read section 6 of the plan for the phase and
section 1 of the specification for the behaviour, then restate the goal and the
exit criteria before you write anything.
```

Change the numbers per phase. The plan already names which specification section each phase needs, so you do not have to remember the mapping.

---

## Phase 0 is different

Phase 0 has no code. It is the repository, the licence notice, the first two ADRs, the provenance ledger and the CI gate. Run it yourself or with the agent, but do not let it be skipped: the clean-room attestation in Phase 10 depends on the ledger having been kept from the first commit, not reconstructed afterwards.

---

## What to watch for

| Signal                                                                                                                                          | What it means                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The agent produces code that matches the old implementation suspiciously closely — same function names, same comment phrasing, same file layout | It has found the old source, or it is reconstructing from memory of it. Stop and ask where the code came from. |
| It reports a phase complete without evidence                                                                                                    | The exit criteria exist precisely to prevent this. Ask for the demonstration.                                  |
| It picks a default for an open decision                                                                                                         | O1–O7 are yours to close, not its. Reject and decide.                                                          |
| It starts Phase 3 before Phase 2's overlay is verified on every OS                                                                              | The ordering is dependency-driven. Everything after Phase 2 assumes a verified overlay.                        |
