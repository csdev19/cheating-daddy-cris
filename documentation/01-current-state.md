# 01 — Current state of the repository

Analysis of `cheating-daddy` v0.8.0 as it stands before any change.
Fork of [sohzm/cheating-daddy](https://github.com/sohzm/cheating-daddy), GPL-3.0.

## What it is today

An **Electron** app that captures the screen and system audio during a video call,
transcribes what the other person says, and shows **the exact words you should
say** in a transparent overlay.

Available profiles: interview, sales, meeting, presentation, negotiation, exam.

## Technical inventory

| Aspect       | State                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| Modules      | **CommonJS** (no `"type"` in `package.json`)                                  |
| Build        | **None** — no webpack, vite, rollup, esbuild or TypeScript                    |
| Runtime      | Electron `^30` → **Node 20** _(upgraded to 44 / Node 24 after this analysis)_ |
| UI           | **Lit** loaded as an asset (`src/assets/lit-core-2.7.4.min.js`), not npm      |
| Dependencies | `@google/genai`, `ws`, `electron-squirrel-startup`                            |
| Tests        | None                                                                          |
| Lint         | None (`bun run lint` prints "No linting configured")                          |

One consequence matters a lot: the **main process is CommonJS on Node 20**, where
`require()` of an ESM package does not work. The **renderer is a browser context
and already uses ES modules**. That asymmetry drove several library decisions
(see [04-evaluations.md](04-evaluations.md)).

## Architecture

```
main process                          renderer
─────────────                         ────────
index.js          ← startup, ~60 IPC handlers
utils/window.js   ← window, global shortcuts
utils/gemini.js   ← orchestrator (1365 lines)     utils/renderer.js  ← the real capture
utils/localai.js  ← local whisper + llama         components/        ← Lit views
utils/cloud.js    ← in-house WebSocket
storage.js        ← JSON on disk
```

### Three provider modes

| Mode             | How it works                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `byok` (default) | Gemini Live over WebSocket + Groq for text/image. Reconnects with 3 attempts                                          |
| `local`          | Downloads `llama-server` + `whisper-server` from GitHub Releases with SHA-256 verification, starts them on free ports |
| `cloud`          | WebSocket to `api.cheatingdaddy.com`. **Backend wired but UI disabled** (`MainView.js:1146`)                          |

## Findings

### H1 — The undetectable window works, and it is the most valuable thing in the repo

`window.js:45` → `setContentProtection(true)`, plus `frame: false`,
`transparent: true` and `alwaysOnTop` at `screen-saver` level. On macOS and Windows
the window **does not appear in captures or when sharing the screen**. It is ~50
lines and it works today.

There is also an _emergency erase_ shortcut (`window.js:270`) that hides the
window, closes the session, wipes sensitive data and kills the app in 300 ms.

### H2 — It already reads the screen, through two paths

- **Automatic** every N seconds: `renderer.js:464` `captureScreenshot()`
- **Manual** by shortcut: `renderer.js:561` `captureManualScreenshot()`, downscaled to 1280px

The manual path already sends image + prompt to the model. The capability exists;
what fails is the orientation: the manual prompt is hardwired to LeetCode mode.

```js
// renderer.js — MANUAL_SCREENSHOT_PROMPT
`Help me on this page, give me the answer no bs, complete answer.
So if its a code question, give me the approach in few bullet points, then the entire code.`;
```

### H3 — Context is fragmented (the underlying problem)

What the app _hears_ and what it _sees_ live in two arrays that **never merge**:

```js
// gemini.js:24-25
let conversationHistory = []; // audio → transcription
let screenAnalysisHistory = []; // screenshots → analysis
```

The model never receives both in the same thread. The app does not merely _feel_
blind and forgetful: it literally is.

On top of that, the user's context (`customPrompt`) is a single textarea injected
once when the session starts (`prompts.js:213`). There is no memory between meetings.

### H4 — Transcription is misconfigured by default

Two independent failures that explain the poor experience with accents:

```js
// storage.js:35
whisperModel: 'tiny.en'; // the smallest model, and English only

// localai.js:39
let vadConfig = VAD_MODES.VERY_AGGRESSIVE;
// { energyThreshold: 0.02, speechFramesRequired: 2, silenceFramesRequired: 15 }
```

- `tiny.en` is where accents collapse: model size weighs heavily on non-native
  speech. And being `.en`, it **does not detect the language, it assumes it** —
  with Spanish it produces garbage, not graceful degradation.
- The VAD cuts on raw RMS energy. If someone speaks quietly, has a bad mic, or
  **pauses to think** (constant in an interview), it closes the segment after 15
  silent frames and **Whisper never sees that part of the audio**.

The available catalogue tops out at `small.en` (`native-ai-runtime.js:49`): only
`tiny.en`, `base.en`, `small.en`.

### H5 — It only listens to the interviewer

```js
// CustomizeView.js:578
<option value="speaker_only">Speaker Only (Interviewer)</option> // ← default
```

For a teleprompter that makes sense. For a memory assistant it is a hole: without
your side of the dialogue it cannot know what you have said, so it cannot tick a
checklist or warn you about what is missing.

The stored schema has no room for it either (`storage.js:397`):

```js
{
    (timestamp, transcription, ai_response);
} // transcription = the interviewer
```

### H6 — The prompt works against the goal

All six profiles in `prompts.js` end just as literally:

> _"Provide only the exact words to say. No coaching, no 'you should' statements,
> no explanations — just the direct response the candidate can speak immediately."_

It is a teleprompter reading out a script. The goal is the opposite. This is not a
configuration tweak: it changes what the product is.

### H7 — The resampler does not filter

```js
// localai.js:42 — linear interpolation with no anti-aliasing filter
const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
```

Dropping from 24 kHz to 16 kHz with no prior low-pass makes everything above
8 kHz **fold back as aliasing**. It hits sibilants hardest (s, sh, f), exactly
where a non-native accent is already fragile. It is second-order next to H4, but
it pushes in the same direction.

Note: this code runs in the **main process**, where there is no `AudioContext` and
no WebCodecs.

### H8 — The entry point for images already exists

```js
// gemini.js:1171
ipcMain.handle('send-image-content', async (event, { data, prompt }) => { ... })
```

It accepts base64 + an arbitrary prompt and already routes to all three providers.
Local mode **already does vision** too (`localai.js:541`): `llama-server` with a
multimodal projector and OpenAI-style messages carrying `image_url`.

### H9 — Google Search is already wired

```js
// gemini.js:165
tools.push({ googleSearch: {} });
```

It serves capability #4 directly (explain a concept or name that just came up).

## What is kept

- The undetectable window and the global shortcuts (H1)
- macOS audio capture via `SystemAudioDump`
- The local runtime with SHA-256 verified downloads (`native-ai-runtime.js`)
- The Gemini adapter, including reconnection and search grounding
- `HistoryView` and the per-session JSON storage
