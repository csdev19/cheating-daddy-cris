# Repo Guidelines

This repository is a fork of [`cheating-daddy`](https://github.com/sohzm/cheating-daddy).
It provides an Electron-based real-time assistant which captures screen and audio
for contextual AI responses. The code is JavaScript and uses Electron Forge for
packaging.

## Source of truth

The project's analysis, design and decisions live in **`documentation/`**. Read it
before touching code. `documentation/03-decisions.md` takes precedence over any
instruction in this file that contradicts it.

| Document                                  | Contents                                             |
| ----------------------------------------- | ---------------------------------------------------- |
| `documentation/01-current-state.md`       | Findings about the code, with `file:line` references |
| `documentation/02-design.md`              | The target design                                    |
| `documentation/03-decisions.md`           | Decisions D1–D21 and their reasoning                 |
| `documentation/04-evaluations.md`         | Libraries and models evaluated                       |
| `documentation/05-implementation-plan.md` | Task-by-task plan                                    |
| `documentation/06-audit.md`               | Audit: gaps, risks and improvements                  |

## Constraints

- **CommonJS and no build step.** The main process is Node 20 (Electron 30); it uses
  neither ESM nor bundlers. `require()` of an ESM package **does not work** there.
- **UI in Lit**, vendored in `src/assets/`. No migration to React or shadcn (D19).
- **No new runtime dependencies** unless a decision is recorded in `03-decisions.md`.
- **The renderer is a browser context** and already uses ES modules; an ESM library
  can be vendored there following the Lit pattern.
- **Everything user-facing is in English** — errors, logs, UI copy and the prompts
  sent to the model. There is no i18n layer, so no Spanish anywhere.

## Getting started

```
1. npm install
2. npm start
```

## Architecture

- `src/core/` — pure, testable modules with no Electron: context thread, profiles,
  payload assembly, VAD, modes, post-session summary, thread projection.
- `src/utils/` — adapters: `gemini.js` (cloud provider), `localai.js` (local whisper
    - llama), `window.js`, `renderer.js`.
- `src/components/` — Lit views.

The user's profiles live on disk as markdown folders under `<configDir>/profiles/`,
not in the code. The profile picker reads that folder; never hardcode a list.

## Tests

```
npm test          # node:test, no dependencies
```

Anything landing in `src/core/` must come with tests. The adapters are verified by
starting the app (`npm start`).

## Style

Run `npx prettier --write .` before committing. Prettier uses the settings in
`.prettierrc` (four-space indentation, print width 150, semicolons and single
quotes). `src/assets` and `node_modules` are ignored via `.prettierignore`.
The project does not provide linting; `npm run lint` simply prints
"No linting configured".

## Tools

```
npm run bench:stt -- recording.wav        # compare Whisper models on your own audio
```

## Merging upstream PRs

Pull requests from <https://github.com/sohzm/cheating-daddy> are commonly
cherry-picked here. When merging:

1. Inspect the diff and keep commit messages short (`feat:` / `fix:` etc.).
2. Check it does not reintroduce anything removed by decision (for example
   `src/utils/prompts.js`, the automatic screenshot capture, or the single
   `providerMode`).
3. After merging, run `npm test` and the application locally.
