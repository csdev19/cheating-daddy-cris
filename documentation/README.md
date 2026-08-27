# Documentation — Memory assistant

Analysis, decisions and design for turning `cheating-daddy` from an interview
teleprompter into a **personal memory assistant** for meetings and interviews.

Analysis date: **2026-08-25**
Status: **design audited (D1–D20), plan amended and ready to execute**

## Executive summary

Today the app is a teleprompter: it listens to the interviewer and dictates, word
by word, what to answer. The goal is the opposite — for it to remind you of
**what you already know but forget** in the moment.

Four target capabilities:

1. **Prior material** — your notes, CV, figures and decisions surface when they apply.
2. **Meeting thread** — what was said, who said it, what was left open.
3. **Live checklist** — what you must not forget to say or ask.
4. **Lookup on the fly** — a concept or a name that just came up.

The underlying change is not adding features, it is **building a single context
thread** that fuses what the app hears, what it sees and what it knows about you.
Today those are three disconnected things, which is why the app feels blind and
forgetful.

Guiding principle: **reactive**. The app listens and accumulates context quietly,
and only answers when you press a shortcut. No noise during the meeting, and it
stops burning model calls on every turn.

## Index

| Document                                               | Contents                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| [01-current-state.md](01-current-state.md)             | What the repo does today, with findings and code references |
| [02-design.md](02-design.md)                           | The target design: context core, profiles, capture          |
| [03-decisions.md](03-decisions.md)                     | Decision log and the reasoning behind each one              |
| [04-evaluations.md](04-evaluations.md)                 | Libraries and models evaluated, with data and prices        |
| [05-implementation-plan.md](05-implementation-plan.md) | Implementation plan: 15 tasks, 58 tests, amendments applied |
| [06-audit.md](06-audit.md)                             | Audit: gaps, risks, improvements and amendments to the plan |

## How to read it

If you are implementing, read `02-design.md` and consult `03-decisions.md`
whenever something looks arbitrary — there is almost always a recorded reason,
including the decisions that were reversed halfway through the analysis.

If you are going to challenge the design, start with `01-current-state.md`: the
findings there are the evidence everything else rests on.
