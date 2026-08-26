# Repo Guidelines

This repository is a fork of [`cheating-daddy`](https://github.com/sohzm/cheating-daddy).
It provides an Electron-based real-time assistant which captures screen and audio
for contextual AI responses. The code is JavaScript and uses Electron Forge for
packaging.

## Fuente de verdad

El análisis, el diseño y las decisiones del proyecto viven en **`documentation/`**.
Léelo antes de tocar código. `documentation/03-decisiones.md` tiene prioridad sobre
cualquier instrucción de este archivo que la contradiga.

| Documento                                 | Contenido                                                  |
| ----------------------------------------- | ---------------------------------------------------------- |
| `documentation/01-estado-actual.md`       | Hallazgos sobre el código, con referencias `archivo:línea` |
| `documentation/02-diseno.md`              | Diseño objetivo                                            |
| `documentation/03-decisiones.md`          | Decisiones D1–D21 y su porqué                              |
| `documentation/04-evaluaciones.md`        | Librerías y modelos evaluados                              |
| `documentation/05-plan-implementacion.md` | Plan por tareas                                            |
| `documentation/06-auditoria.md`           | Auditoría: agujeros, riesgos y mejoras                     |

## Restricciones

- **CommonJS y sin build step.** El main process es Node 20 (Electron 30); no usa
  ESM ni bundlers. `require()` de un paquete ESM **no funciona** ahí.
- **UI en Lit**, vendorizado en `src/assets/`. No se migra a React ni a shadcn (D19).
- **Cero dependencias nuevas de runtime** salvo decisión registrada en `03-decisiones.md`.
- **El renderer sí es contexto de navegador** y ya usa ES modules; ahí sí se puede
  vendorizar una librería ESM siguiendo el patrón de Lit.

## Getting started

```
1. npm install
2. npm start
```

## Arquitectura

- `src/core/` — módulos puros y testeables, sin Electron: hilo de contexto, perfiles,
  ensamblado de payload, VAD, modos, resumen post-sesión.
- `src/utils/` — adaptadores: `gemini.js` (proveedor nube), `localai.js` (whisper +
  llama locales), `window.js`, `renderer.js`.
- `src/components/` — vistas Lit.

Los perfiles del usuario viven en disco como carpetas de markdown bajo
`<configDir>/profiles/`, no en el código.

## Tests

```
npm test          # node:test, sin dependencias
```

Todo lo que entre en `src/core/` debe llevar tests. Los adaptadores se verifican
arrancando la app (`npm start`).

## Style

Run `npx prettier --write .` before committing. Prettier uses the settings in
`.prettierrc` (four-space indentation, print width 150, semicolons and single
quotes). `src/assets` and `node_modules` are ignored via `.prettierignore`.
The project does not provide linting; `npm run lint` simply prints
"No linting configured".

## Herramientas

```
npm run bench:stt -- grabacion.wav        # compara modelos de Whisper sobre tu audio
```

## Merging upstream PRs

Pull requests from <https://github.com/sohzm/cheating-daddy> are commonly
cherry-picked here. When merging:

1. Inspect the diff and keep commit messages short (`feat:` / `fix:` etc.).
2. Comprueba que no reintroduce nada retirado por decisión (por ejemplo
   `src/utils/prompts.js`, la captura automática de screenshots, o el
   `providerMode` único).
3. After merging, run `npm test` and the application locally.
