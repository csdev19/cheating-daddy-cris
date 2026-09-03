# Stack

One table per layer: the technology, its role in this app, and why it was
picked over the alternatives that were actually considered. Diffed against
`package.json`, `bun.lock`, `forge.config.js` and `src/assets/` — a
load-bearing dependency with no row here, or a row with nothing backing it,
is a bug in this document.

## Desktop shell

| Technology | Role here | Why |
| --- | --- | --- |
| **Electron `^44.0.0`** | Hosts the main + renderer processes; `desktopCapturer` + a transparent always-on-top window is the undetectable-overlay mechanism the whole product depends on. | Inherited from the upstream fork; upgraded 30→44 for Node 24 (unlocks `require(esm)` and `node:sqlite`) and Chrome 152. Cheap to upgrade because the app ships no native modules — see [D27](../03-decisions.md#d27--electron-44-and-what-that-changes-about-earlier-decisions). |
| **`electron-squirrel-startup` `^1.0.1`** | Handles Windows Squirrel installer lifecycle events on first run/uninstall. | Standard boilerplate required by the Squirrel-based Windows maker; not optional once that maker is used. |

## Package management & build

| Technology | Role here | Why |
| --- | --- | --- |
| **bun `1.3.4`** (`packageManager` in `package.json`, `bun.lock` committed) | Canonical install/run tool — `bun run <script>` for everything. | Matches the rest of the personal workspace (12 of 13 projects), and blocks lifecycle scripts by default like pnpm, without being the odd tool out day to day. `node_modules` dropped 428 MB → 200 MB on switching. See [D28](../03-decisions.md#d28--bun-as-the-package-manager). Known rough edge: electron-forge 7.8.1 doesn't recognize bun and logs "Found npm" at startup — harmless, packaging still works. |
| **electron-forge `^7.8.1`** (`@electron-forge/cli` + `plugin-fuses`, `plugin-auto-unpack-natives`) + makers **`maker-deb`, `maker-dmg`, `maker-rpm`, `maker-squirrel`, `maker-zip`**, plus **`@reforged/maker-appimage` `^5.0.0`** | Packages the app into per-OS installers (`bun run make`). `@reforged/maker-appimage` covers Linux AppImage, which forge's own maker set doesn't include. | Standard Electron packaging toolchain; the third-party AppImage maker fills forge's one gap for the Linux target the README already lists (experimental). No `publish` target is configured — this app is not distributed anywhere automated. |
| **`@electron/fuses` `^1.8.0`** | Electron security/behavior fuses applied at package time (via `plugin-fuses`). | Standard companion to `electron-forge`'s fuses plugin; not evaluated as a decision, just the mechanism forge expects. |

## AI: reasoning

| Technology | Role here | Why |
| --- | --- | --- |
| **`@google/genai` `^1.2.0`** (Gemini 2.5) | The reasoning provider — answers the user's question and produces the post-session summary, over the Live API (WebSocket) and `generateContent` (HTTP). | The repo already had a working, tested adapter (`gemini.js`) with reconnection and Google Search grounding wired in. Claude was the prior recommendation but would have meant new, unwritten code at roughly the same per-meeting cost — no longer a clear win once compared tier-for-tier. See [D9](../03-decisions.md#d9--gemini-first-not-claude-revised-recommendation). Anthropic's Claude models remain the documented fallback if Gemini's recall/accuracy doesn't hold up under measurement. |
| **`ws` `^8.19.0`** | WebSocket client underlying the Gemini Live session (a connection held open for the whole meeting, with reconnection). | Gemini Live is a WebSocket protocol; this is the transport `gemini.js` runs on. |

## AI: local transcription

| Technology | Role here | Why |
| --- | --- | --- |
| **`whisper-server` (bundled binary, not an npm package) running `large-v3-turbo`** | Default speech-to-text for both audio channels (system + mic), independent of the reasoning provider. | `large-v3-turbo` was measured against `tiny.en` and chosen for accuracy at acceptable latency (~25x real-time on Metal); Parakeet was evaluated and deferred out of v1. See [D4](../03-decisions.md#d4--large-v3-turbo-not-tinyen-and-no-parakeet-in-v1). Confirmed as the default over Gemini Live's built-in transcription after an audit, on robustness (a 45-min WebSocket losing the thread is worse than a local process), measurability (the same file can be re-tested until a model choice is trusted), and channel labelling already covering what Gemini Live's diarisation offered — see [D21](../03-decisions.md#d21--local-whisper-confirmed-after-the-audit-revision-of-d3). |

## UI

| Technology | Role here | Why |
| --- | --- | --- |
| **Lit `2.7.4`** (vendored: `src/assets/lit-core-2.7.4.min.js`, `lit-all-2.7.4.min.js` — not in `package.json`) | All UI components (`src/components/`) — the overlay window, profile editor, history, settings views. | Inherited from upstream; a React/shadcn migration was once promised in `AGENTS.md` and explicitly retracted as contradicting the CommonJS/no-build-step constraint — see [D19](../03-decisions.md#d19--agentsmd-stops-promising-typescriptreactshadcn). The renderer is a plain browser context with no bundler, so a UI library has to arrive as a vendored, self-contained script rather than an npm import. |
| **`marked` `4.3.0`** (vendored: `src/assets/marked-4.3.0.min.js`) | Renders profile/session markdown to HTML in the UI. | Same vendoring pattern as Lit — no build step means no bundler-managed npm dependency for the renderer. |
| **`highlight.js` `11.9.0`** (vendored: `src/assets/highlight-11.9.0.min.js` + `highlight-vscode-dark.min.css`) | Syntax highlighting for code blocks inside rendered markdown. | Same vendoring pattern. |

## Storage

| Technology | Role here | Why |
| --- | --- | --- |
| **Flat files: JSON + JSONL + Markdown**, no database | A session is `history/<sessionId>/{session.json, events.jsonl, transcript.md, screenshots/}`; a profile is a markdown folder under `profiles/<slug>/`. | An append-only event log gives the same crash durability a database would, while keeping sessions as files the user can read, grep, back up and sync with anything — a stated product property, not just an implementation detail. `node:sqlite` became available for free with the Electron 44 upgrade and was still declined: the workload (append events, read one session whole) doesn't need querying sessions against each other. See [D26](../03-decisions.md#d26--a-session-is-a-folder-metadata-written-atomically-events-append-only) and its revisit in [D27](../03-decisions.md#d27--electron-44-and-what-that-changes-about-earlier-decisions). |

## Testing

| Technology | Role here | Why |
| --- | --- | --- |
| **`node:test`** (built into Node, run via `bun run test` → `node --test "test/**/*.test.js"`) | Unit tests for every module in `src/core/` (22 test files). | Zero test-framework dependency, and — critically — the app runs on Node inside Electron, so tests must run on Node's own test runner, not bun's, to avoid a Node-specific difference hiding until production. `bun run lint` prints "No linting configured"; there is no linter in this project. |
