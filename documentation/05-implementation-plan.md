# Implementation plan — Memory assistant

> **For executing agents:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task by task. Steps use checkboxes (`- [ ]`) for tracking.

**Goal:** Turn `cheating-daddy` from a teleprompter into a memory assistant: a single context thread (audio + screen + notes), profiles as markdown folders, dual audio labelled by speaker, and reliable local transcription.

**Architecture:** `src/core/` is introduced with pure, testable modules (event thread, profiles, payload assembly, VAD). `gemini.js` is reduced to a provider adapter. Capture stays in the renderer; reasoning only happens when the user presses the shortcut (reactive design).

**Tech Stack:** Electron 44 (Node 24), CommonJS, Lit vendored in `src/assets/`, `whisper.cpp` via `whisper-server`, `@google/genai`. Tests with `node:test` (built in, zero dependencies).

**Spec:** [`documentation/02-design.md`](02-design.md) · decisions in [`documentation/03-decisions.md`](03-decisions.md) · findings in [`documentation/01-current-state.md`](01-current-state.md)

> ⚠️ **This plan has been executed.** All 15 tasks shipped. The step checkboxes were
> never ticked as the work progressed, so they read as unstarted — they are left as
> written rather than back-filled, because ticking them now would be a guess about
> which step each commit satisfied. For what actually shipped, what was measured, and
> the bugs that only appeared once the app was run, see
> [08-shipped.md](08-shipped.md). Open work is in [07-backlog.md](07-backlog.md).
> Commands embedded in tasks 1–15 are historical too; use `bun run test` and
> `bun run start` for any work performed now. Tasks 16–19 are current.

> ✅ **Audit amendments applied** (2026-08-26): tasks 7, 8, 10 and 12 extended; new 7b, 14 and 15. See [06-audit.md](06-audit.md).
>
> **Next planned work — D30/D31:** tasks 16–19 below implement the honest profile
> editor and retire the decorative preference UI. They are deliberately separate
> from the shipped work above and are the current implementation queue.

## Global Constraints

- **CommonJS is mandatory.** Everything in `src/core/**` and `src/utils/**` uses `require`/`module.exports`. The main process is Node 24; ESM support is not a reason to change this architecture.
- **No new runtime dependencies.** Do not add packages to `dependencies`. Tests use the built-in `node:test`.
- **Prettier style** (`.prettierrc`): 4 spaces, `printWidth` 150, single quotes, semicolons, `trailingComma: es5`, `arrowParens: avoid`. Run `npx prettier --write .` before every commit.
- **Commands use Bun.** Run `bun run test`, not `bun test`; it executes `node --test`, matching Electron's Node runtime.
- **No build step.** Do not introduce webpack/vite/rollup/esbuild/TypeScript.
- **Audio format:** both channels arrive as **mono PCM16 at 24 kHz**, in **0.1 s** chunks (`AUDIO_CHUNK_DURATION = 0.1`, `SAMPLE_RATE = 24000` in `renderer.js:10-11`). Whisper consumes **16 kHz**.
- **Speaker labels:** exactly `'them'` (system audio) and `'me'` (microphone). Never infer by diarisation (D6).
- **New Whisper models** (verified on 2026-08-25 against `huggingface.co/ggerganov/whisper.cpp`):
    - `large-v3-turbo` → `ggml-large-v3-turbo.bin`, sha256 `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69`, 1 624 555 275 bytes
    - `medium.en` → `ggml-medium.en.bin`, sha256 `cc37e93478338ec7700281a7ac30a10128929eb8f427dda2e865faa8f6da4356`, 1 533 774 781 bytes
- **Config directory:** always via `storage.getConfigDir()`. Never build `~` paths by hand.

---

## File structure

**Created:**

| Archivo                        | Responsibility                                                |
| ------------------------------ | ------------------------------------------------------------- |
| `src/core/vad.js`              | Per-instance voice detection (one per channel), with pre-roll |
| `src/core/session-context.js`  | The session's single event thread                             |
| `src/core/profiles.js`         | Read profiles from disk (frontmatter + markdown)              |
| `src/core/payload.js`          | Assemble the payload ordered for caching                      |
| `test/vad.test.js`             | VAD tests                                                     |
| `test/session-context.test.js` | Thread tests                                                  |
| `test/profiles.test.js`        | Profile tests                                                 |
| `test/payload.test.js`         | Assembly tests                                                |
| `test/helpers/pcm.js`          | PCM generators for tests                                      |
| `tools/transcribe-bench.js`    | Transcription test bench                                      |

**Modified:**

| Archivo                                 | Change                                               |
| --------------------------------------- | ---------------------------------------------------- |
| `package.json`                          | `test` script                                        |
| `src/utils/native-ai-runtime.js:49`     | Wider Whisper catalogue                              |
| `src/storage.js:35`                     | Default `whisperModel`; session schema               |
| `src/utils/localai.js`                  | Per-channel VAD, `processLocalAudio(chunk, speaker)` |
| `src/utils/gemini.js`                   | Route the speaker, emit events into the thread       |
| `src/utils/renderer.js`                 | Reoriented screenshot, automatic capture removed     |
| `src/components/views/MainView.js:1299` | Whisper model dropdown                               |

**Removed (task 11):** `src/utils/prompts.js`

---

## Phases

- **Phase A (tasks 1-5)** — pure, testable core. No visible behaviour change.
- **Phase B (tasks 6-9, incl. 7b)** — reliable transcription and dual audio. This is where the improvement shows.
- **Phase C (tasks 10-15)** — profiles, screenshot and test bench.

Every phase leaves the app working.

---

## Phase A — Core

### Task 1: Test infrastructure

**Files:**

- Modify: `package.json`
- Create: `test/smoke.test.js`
- Create: `test/helpers/pcm.js`

**Interfaces:**

- Consumes: nothing
- Produces: `npm test` runs `node --test "test/**/*.test.js"`. Helper `makePcm16({ samples, amplitude })` → mono little-endian PCM16 `Buffer`, used by every following task.

- [ ] **Step 1: Write the smoke test**

`test/smoke.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');

test('the test runner works', () => {
    assert.strictEqual(1 + 1, 2);
});
```

- [ ] **Step 2: Add the test script**

In `package.json`, replace the `lint` script line with these two:

```json
        "lint": "echo \"No linting configured\"",
        "test": "node --test \\"test/**/*.test.js\\""
```

- [ ] **Step 3: Run it and confirm it passes**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 4: Write the PCM helper**

`test/helpers/pcm.js`:

```js
// Builds mono little-endian PCM16. `amplitude` runs from 0 (silence) to 1 (full
// scale). Deterministic so the RMS stays stable across runs.
function makePcm16({ samples, amplitude = 0 }) {
    const buffer = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        // Alternating sign keeps the mean at ~0 and the RMS at ~amplitude.
        const value = Math.round((i % 2 === 0 ? 1 : -1) * amplitude * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
    }
    return buffer;
}

// A 100 ms frame at 16 kHz = 1600 samples.
function frame16k(amplitude) {
    return makePcm16({ samples: 1600, amplitude });
}

// A 100 ms frame at 24 kHz = 2400 samples.
function frame24k(amplitude) {
    return makePcm16({ samples: 2400, amplitude });
}

module.exports = { makePcm16, frame16k, frame24k };
```

- [ ] **Step 5: Confirm the helper produces the expected RMS**

Add to `test/smoke.test.js`:

```js
const { frame16k } = require('./helpers/pcm');

test('the PCM helper produces the expected size and amplitude', () => {
    const buffer = frame16k(0.5);
    assert.strictEqual(buffer.length, 3200);
    assert.strictEqual(Math.abs(buffer.readInt16LE(0)) > 16000, true);
});
```

Run: `npm test`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write package.json test/
git add package.json test/
git commit -m "test: add a node:test runner and PCM helpers"
```

---

### Task 2: Per-channel VAD module

**Files:**

- Create: `src/core/vad.js`
- Create: `test/vad.test.js`

**Interfaces:**

- Consumes: `test/helpers/pcm.js` (task 1)
- Produces:
    - `VAD_MODES` — object with `NORMAL`, `AGGRESSIVE`, `VERY_AGGRESSIVE`
    - `calculateRms(pcm16Buffer: Buffer): number`
    - `createVad({ mode?, preRollFrames?, onSpeechEnd })` → `{ process(pcm16kBuffer: Buffer): void, reset(): void, isSpeaking(): boolean }`
    - `onSpeechEnd` receives `(audioData: Buffer)` with the pre-roll already included.

Extracts the logic from `localai.js:65-110` into a module with **per-instance state** (today it is shared module state, which is why the two channels trample each other) and adds D5's pre-roll.

- [ ] **Step 1: Write the failing tests**

`test/vad.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createVad, calculateRms, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

test('calculateRms returns 0 for silence', () => {
    assert.strictEqual(calculateRms(frame16k(0)), 0);
});

test('calculateRms approximates the signal amplitude', () => {
    const rms = calculateRms(frame16k(0.5));
    assert.ok(rms > 0.45 && rms < 0.55, `rms out of range: ${rms}`);
});

test('never fires onSpeechEnd when there was no speech', () => {
    let calls = 0;
    const vad = createVad({ onSpeechEnd: () => calls++ });
    for (let i = 0; i < 50; i++) vad.process(frame16k(0));
    assert.strictEqual(calls, 0);
});

test('detects speech after speechFramesRequired frames', () => {
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => {} });
    assert.strictEqual(vad.isSpeaking(), false);
    for (let i = 0; i < VAD_MODES.NORMAL.speechFramesRequired; i++) vad.process(frame16k(0.5));
    assert.strictEqual(vad.isSpeaking(), true);
});

test('closes the segment after silenceFramesRequired silent frames', () => {
    const segments = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: b => segments.push(b) });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));
    assert.strictEqual(segments.length, 1);
    assert.strictEqual(vad.isSpeaking(), false);
});

test('the pre-roll includes audio from before speech started', () => {
    const segments = [];
    // preRollFrames: 3 → 3 frames of 1600 samples = 4800 samples = 9600 bytes of pre-roll.
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 3, onSpeechEnd: b => segments.push(b) });

    for (let i = 0; i < 5; i++) vad.process(frame16k(0)); // silencio previo
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5)); // voz
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    assert.strictEqual(segments.length, 1);
    // 10 speech frames + 3 of pre-roll = 13 frames × 3200 bytes.
    assert.strictEqual(segments[0].length, 13 * 3200);
});

test('two instances share no state', () => {
    const a = createVad({ onSpeechEnd: () => {} });
    const b = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) a.process(frame16k(0.5));
    assert.strictEqual(a.isSpeaking(), true);
    assert.strictEqual(b.isSpeaking(), false);
});

test('reset clears the state', () => {
    const vad = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    vad.reset();
    assert.strictEqual(vad.isSpeaking(), false);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/vad'`

- [ ] **Step 3: Implement the module**

`src/core/vad.js`:

```js
const VAD_MODES = {
    NORMAL: { energyThreshold: 0.01, speechFramesRequired: 3, silenceFramesRequired: 30 },
    AGGRESSIVE: { energyThreshold: 0.015, speechFramesRequired: 2, silenceFramesRequired: 20 },
    VERY_AGGRESSIVE: { energyThreshold: 0.02, speechFramesRequired: 2, silenceFramesRequired: 15 },
};

function calculateRms(pcm16Buffer) {
    const samples = Math.floor(pcm16Buffer.length / 2);
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
        const sample = pcm16Buffer.readInt16LE(i * 2) / 32768;
        sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / samples);
}

// One independent VAD per audio channel. State lives in the closure rather than in
// the module so the system channel and the microphone cannot trample each other (D6).
function createVad({ mode = VAD_MODES.NORMAL, preRollFrames = 3, onSpeechEnd } = {}) {
    if (typeof onSpeechEnd !== 'function') {
        throw new TypeError('createVad requires an onSpeechEnd callback');
    }

    let isSpeaking = false;
    let speechBuffers = [];
    let preRoll = [];
    let speechFrameCount = 0;
    let silenceFrameCount = 0;

    function reset() {
        isSpeaking = false;
        speechBuffers = [];
        preRoll = [];
        speechFrameCount = 0;
        silenceFrameCount = 0;
    }

    function process(pcm16kBuffer) {
        if (!pcm16kBuffer || pcm16kBuffer.length === 0) return;

        const isVoice = calculateRms(pcm16kBuffer) > mode.energyThreshold;

        if (isVoice) {
            speechFrameCount += 1;
            silenceFrameCount = 0;

            if (!isSpeaking && speechFrameCount >= mode.speechFramesRequired) {
                isSpeaking = true;
                // Start the segment with the pre-roll: the attack of a phrase usually
                // falls below the threshold, and that is what an accent loses most.
                speechBuffers = preRoll.slice();
                preRoll = [];
            }
        } else {
            silenceFrameCount += 1;
            speechFrameCount = 0;

            if (isSpeaking && silenceFrameCount >= mode.silenceFramesRequired) {
                isSpeaking = false;
                const audioData = Buffer.concat(speechBuffers);
                speechBuffers = [];
                onSpeechEnd(audioData);
                return;
            }
        }

        const frame = Buffer.from(pcm16kBuffer);

        if (isSpeaking) {
            speechBuffers.push(frame);
        } else if (preRollFrames > 0) {
            preRoll.push(frame);
            if (preRoll.length > preRollFrames) preRoll.shift();
        }
    }

    return { process, reset, isSpeaking: () => isSpeaking };
}

module.exports = { VAD_MODES, calculateRms, createVad };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, every test in `vad.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/vad.js test/vad.test.js
git commit -m "feat: per-channel VAD with a 300ms pre-roll"
```

---

### Task 3: Single context thread

**Files:**

- Create: `src/core/session-context.js`
- Create: `test/session-context.test.js`

**Interfaces:**

- Consumes: nothing
- Produces:
    - `createSessionContext({ sessionId, profileName, now? })` → objeto con:
        - `addSpeech({ speaker: 'them'|'me', text, t? })`
        - `addScreen({ imageRef, caption?, t? })`
        - `addAsk({ question, answer, t? })`
        - `addChecklist({ itemId, status, t? })`
        - `getEvents()` → array sorted by ascending `t`
        - `getTranscript()` → string with `[Them]:` / `[Me]:` lines
        - `getChecklistState()` → `Map<itemId, status>` (last state wins)
        - `toJSON()` → serialisable object for persistence
    - `fromJSON(obj)` → contexto restaurado

Replaces `conversationHistory` and `screenAnalysisHistory` (H3), which today are two arrays that never merge.

- [ ] **Step 1: Write the failing tests**

`test/session-context.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createSessionContext, fromJSON } = require('../src/core/session-context');

function newContext() {
    let clock = 1000;
    return createSessionContext({ sessionId: 's1', profileName: 'interview', now: () => clock++ });
}

test('starts empty', () => {
    const ctx = newContext();
    assert.deepStrictEqual(ctx.getEvents(), []);
    assert.strictEqual(ctx.getTranscript(), '');
});

test('collects speech from both speakers into a single thread', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'What is your experience with Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Five years.' });

    const events = ctx.getEvents();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].kind, 'speech');
    assert.strictEqual(events[0].speaker, 'them');
    assert.strictEqual(events[1].speaker, 'me');
});

test('screen and speech share the thread, ordered by time', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Look at this code.' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addSpeech({ speaker: 'me', text: 'I see it.' });

    const kinds = ctx.getEvents().map(e => e.kind);
    assert.deepStrictEqual(kinds, ['speech', 'screen', 'speech']);
});

test('sorts by timestamp even when events arrive out of order', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'me', text: 'second', t: 200 });
    ctx.addSpeech({ speaker: 'them', text: 'first', t: 100 });

    assert.deepStrictEqual(
        ctx.getEvents().map(e => e.text),
        ['first', 'second']
    );
});

test('the transcript labels each speaker', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Hello' });
    ctx.addSpeech({ speaker: 'me', text: 'Hi there' });

    assert.strictEqual(ctx.getTranscript(), '[Entrevistador]: Hola\n[Yo]: Buenas');
});

test('the transcript ignores everything that is not speech', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Hello' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addAsk({ question: 'what do I say?', answer: 'this' });

    assert.strictEqual(ctx.getTranscript(), '[Entrevistador]: Hola');
});

test('rejects unknown speakers', () => {
    const ctx = newContext();
    assert.throws(() => ctx.addSpeech({ speaker: 'other', text: 'x' }), /speaker/);
});

test('drops empty or whitespace-only text', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: '   ' });
    ctx.addSpeech({ speaker: 'them', text: '' });
    assert.strictEqual(ctx.getEvents().length, 0);
});

test('the checklist keeps the latest state of each item', () => {
    const ctx = newContext();
    ctx.addChecklist({ itemId: 'ask-salary', status: 'pending' });
    ctx.addChecklist({ itemId: 'mention-k8s', status: 'done' });
    ctx.addChecklist({ itemId: 'ask-salary', status: 'done' });

    const state = ctx.getChecklistState();
    assert.strictEqual(state.get('ask-salary'), 'done');
    assert.strictEqual(state.get('mention-k8s'), 'done');
});

test('survives a JSON round-trip', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Hello' });
    ctx.addScreen({ imageRef: 'img-1', caption: 'an IDE' });

    const restored = fromJSON(JSON.parse(JSON.stringify(ctx.toJSON())));
    assert.strictEqual(restaurado.getTranscript(), '[Entrevistador]: Hola');
    assert.strictEqual(restored.getEvents().length, 2);
    assert.strictEqual(restored.toJSON().sessionId, 's1');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/session-context'`

- [ ] **Step 3: Implement the module**

`src/core/session-context.js`:

```js
const SPEAKERS = ['them', 'me'];
const SPEAKER_LABELS = { them: 'Entrevistador', me: 'Yo' };

// The session's single thread. Replaces conversationHistory + screenAnalysisHistory,
// which lived apart and never reached the model together (finding H3).
function createSessionContext({ sessionId, profileName = null, now = Date.now, events = [] } = {}) {
    if (!sessionId) throw new TypeError('createSessionContext requiere sessionId');

    const thread = events.slice();

    function push(event) {
        thread.push(event);
        thread.sort((a, b) => a.t - b.t);
    }

    function addSpeech({ speaker, text, t }) {
        if (!SPEAKERS.includes(speaker)) {
            throw new TypeError(`speaker debe ser 'them' o 'me', recibido: ${speaker}`);
        }
        const clean = (text || '').trim();
        if (!clean) return;
        push({ t: t ?? now(), kind: 'speech', speaker, text: clean });
    }

    function addScreen({ imageRef, caption = null, t }) {
        if (!imageRef) throw new TypeError('addScreen requiere imageRef');
        push({ t: t ?? now(), kind: 'screen', imageRef, caption });
    }

    function addAsk({ question, answer, t }) {
        push({ t: t ?? now(), kind: 'ask', question: (question || '').trim(), answer: (answer || '').trim() });
    }

    function addChecklist({ itemId, status, t }) {
        if (!itemId) throw new TypeError('addChecklist requiere itemId');
        push({ t: t ?? now(), kind: 'checklist', itemId, status });
    }

    function getEvents() {
        return thread.slice();
    }

    function getTranscript() {
        return thread
            .filter(e => e.kind === 'speech')
            .map(e => `[${SPEAKER_LABELS[e.speaker]}]: ${e.text}`)
            .join('\n');
    }

    function getChecklistState() {
        const estado = new Map();
        for (const e of thread) {
            if (e.kind === 'checklist') estado.set(e.itemId, e.status);
        }
        return estado;
    }

    function toJSON() {
        return { sessionId, profileName, events: thread.slice() };
    }

    return { addSpeech, addScreen, addAsk, addChecklist, getEvents, getTranscript, getChecklistState, toJSON };
}

function fromJSON(obj) {
    return createSessionContext({
        sessionId: obj.sessionId,
        profileName: obj.profileName ?? null,
        events: obj.events || [],
    });
}

module.exports = { createSessionContext, fromJSON, SPEAKERS, SPEAKER_LABELS };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, every test in `session-context.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/session-context.js test/session-context.test.js
git commit -m "feat: single session context thread"
```

---

### Task 4: Profiles from disk

**Files:**

- Create: `src/core/profiles.js`
- Create: `test/profiles.test.js`

**Interfaces:**

- Consumes: `storage.getConfigDir()` (already exported in `src/storage.js:500`)
- Produces:
    - `getProfilesDir(configDir)` → `string`
    - `parseFrontmatter(raw)` → `{ meta: object, body: string }`
    - `listProfiles(profilesDir)` → `string[]` (folder names, sorted)
    - `loadProfile(profilesDir, name)` → `{ name, meta: { name, confidential, model }, instructions, contextFiles: [{ file, content }], checklist: [{ id, text }] }`

Implements D7. Frontmatter is parsed by hand (only `key: value`) to respect the no-new-dependencies constraint.

- [ ] **Step 1: Write the failing tests**

`test/profiles.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseFrontmatter, listProfiles, loadProfile, getProfilesDir } = require('../src/core/profiles');

function makeSampleProfile() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    const profile = path.join(root, 'backend-interview');
    fs.mkdirSync(path.join(profile, 'context'), { recursive: true });

    fs.writeFileSync(
        path.join(profile, 'profile.md'),
        ['---', 'name: Backend Interview', 'confidential: false', 'model: gemini-3.7-flash', '---', '', 'Do not tell me what to say.'].join('\n')
    );
    fs.writeFileSync(path.join(profile, 'checklist.md'), '- Ask about the team\n- Mention Kubernetes\n\n- \n');
    fs.writeFileSync(path.join(profile, 'context', 'cv.md'), '15 years of backend.');
    fs.writeFileSync(path.join(profile, 'context', 'figures.md'), 'Cut latency by 40%.');

    return root;
}

test('getProfilesDir hangs off the config folder', () => {
    assert.strictEqual(getProfilesDir('/tmp/cfg'), path.join('/tmp/cfg', 'profiles'));
});

test('parseFrontmatter splits metadata from body', () => {
    const { meta, body } = parseFrontmatter('---\nname: Sample\nconfidential: true\n---\n\nBody here.');
    assert.strictEqual(meta.name, 'Sample');
    assert.strictEqual(meta.confidential, true);
    assert.strictEqual(body, 'Body here.');
});

test('parseFrontmatter tolerates a file with no frontmatter', () => {
    const { meta, body } = parseFrontmatter('Body only.');
    assert.deepStrictEqual(meta, {});
    assert.strictEqual(body, 'Body only.');
});

test('parseFrontmatter converts booleans and leaves the rest as text', () => {
    const { meta } = parseFrontmatter('---\na: true\nb: false\nc: gemini-3.7-flash\n---\nx');
    assert.strictEqual(meta.a, true);
    assert.strictEqual(meta.b, false);
    assert.strictEqual(meta.c, 'gemini-3.7-flash');
});

test('listProfiles returns the folders in order', () => {
    const root = makeSampleProfile();
    fs.mkdirSync(path.join(root, 'aaa-first'));
    assert.deepStrictEqual(listProfiles(root), ['aaa-first', 'backend-interview']);
});

test('listProfiles returns empty when the directory does not exist', () => {
    assert.deepStrictEqual(listProfiles('/path/that/does/not/exist'), []);
});

test('loadProfile reads instructions, context and checklist', () => {
    const root = makeSampleProfile();
    const profile = loadProfile(root, 'backend-interview');

    assert.strictEqual(profile.meta.name, 'Backend Interview');
    assert.strictEqual(profile.meta.confidential, false);
    assert.strictEqual(profile.meta.model, 'gemini-3.7-flash');
    assert.strictEqual(profile.instructions, 'Do not tell me what to say.');

    // Sorted by filename so the cached prefix stays stable.
    assert.deepStrictEqual(
        profile.contextFiles.map(f => f.file),
        ['cv.md', 'figures.md']
    );
    assert.strictEqual(profile.contextFiles[0].content, '15 years of backend.');
});

test('loadProfile parses the checklist and skips empty lines', () => {
    const root = makeSampleProfile();
    const profile = loadProfile(root, 'backend-interview');

    assert.strictEqual(profile.checklist.length, 2);
    assert.strictEqual(profile.checklist[0].text, 'Ask about the team');
    assert.strictEqual(profile.checklist[0].id, 'ask-about-the-team');
});

test('loadProfile works with no checklist and no context folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'minimal'));
    fs.writeFileSync(path.join(root, 'minimal', 'profile.md'), 'Instructions only.');

    const profile = loadProfile(root, 'minimal');
    assert.deepStrictEqual(profile.contextFiles, []);
    assert.deepStrictEqual(profile.checklist, []);
    assert.strictEqual(profile.meta.name, 'minimal');
});

test('loadProfile fails clearly when the profile does not exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    assert.throws(() => loadProfile(root, 'missing'), /missing/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/profiles'`

- [ ] **Step 3: Implement the module**

`src/core/profiles.js`:

```js
const fs = require('fs');
const path = require('path');

function getProfilesDir(configDir) {
    return path.join(configDir, 'profiles');
}

// Minimal frontmatter parser: only `key: value` pairs in the header. Enough for
// name/confidential/model, and it avoids taking on a YAML dependency.
function parseFrontmatter(raw) {
    const text = (raw || '').replace(/^﻿/, '');
    if (!text.startsWith('---')) {
        return { meta: {}, body: text.trim() };
    }

    const cierre = text.indexOf('\n---', 3);
    if (cierre === -1) {
        return { meta: {}, body: text.trim() };
    }

    const cabecera = text.slice(3, cierre);
    const body = text.slice(cierre + 4).trim();
    const meta = {};

    for (const linea of cabecera.split('\n')) {
        const limpia = linea.trim();
        if (!limpia || limpia.startsWith('#')) continue;

        const sep = limpia.indexOf(':');
        if (sep === -1) continue;

        const clave = limpia.slice(0, sep).trim();
        // Strip a trailing comment and any wrapping quotes.
        let valor = limpia
            .slice(sep + 1)
            .replace(/\s+#.*$/, '')
            .trim();
        valor = valor.replace(/^["'](.*)["']$/, '$1');

        if (valor === 'true') meta[clave] = true;
        else if (valor === 'false') meta[clave] = false;
        else meta[clave] = valor;
    }

    return { meta, body };
}

function listProfiles(profilesDir) {
    if (!fs.existsSync(profilesDir)) return [];
    return fs
        .readdirSync(profilesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
}

function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function readChecklist(profileDir) {
    const file = path.join(profileDir, 'checklist.md');
    if (!fs.existsSync(ruta)) return [];

    return fs
        .readFileSync(ruta, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('- '))
        .map(l => l.slice(2).trim())
        .filter(Boolean)
        .map(text => ({ id: slugify(text), text }));
}

function readContextFiles(profileDir) {
    const dir = path.join(profileDir, 'context');
    if (!fs.existsSync(dir)) return [];

    // Stable alphabetical order: the cached prefix must not change between calls.
    return fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(file => ({ file, content: fs.readFileSync(path.join(dir, file), 'utf8').trim() }));
}

function loadProfile(profilesDir, name) {
    const profileDir = path.join(profilesDir, name);
    const profileFile = path.join(profileDir, 'profile.md');

    if (!fs.existsSync(profileFile)) {
        throw new Error(`Profile '${name}' has no profile.md in ${profileDir}`);
    }

    const { meta, body } = parseFrontmatter(fs.readFileSync(profileFile, 'utf8'));

    return {
        name,
        meta: {
            name: meta.name || name,
            confidential: meta.confidential === true,
            model: meta.model || null,
        },
        instructions: body,
        contextFiles: readContextFiles(profileDir),
        checklist: readChecklist(profileDir),
    };
}

module.exports = { getProfilesDir, parseFrontmatter, listProfiles, loadProfile, slugify };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, every test in `profiles.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/profiles.js test/profiles.test.js
git commit -m "feat: profiles as markdown folders"
```

---

### Task 5: Payload assembly

**Files:**

- Create: `src/core/payload.js`
- Create: `test/payload.test.js`

**Interfaces:**

- Consumes: `loadProfile()` (task 4), `createSessionContext()` (task 3)
- Produces: `buildPayload({ profile, sessionContext, question, image })` → `{ system, transcript, question, image, model, confidential }`

Order matters: `system` is the **stable prefix** cached for the whole meeting; `transcript` and `image` are the volatile part and come after. See the "Payload assembly" section of [02-design.md](02-design.md).

- [ ] **Step 1: Write the failing tests**

`test/payload.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { buildPayload } = require('../src/core/payload');
const { createSessionContext } = require('../src/core/session-context');

const sampleProfile = {
    name: 'backend-interview',
    meta: { name: 'Backend Interview', confidential: false, model: 'gemini-3.7-flash' },
    instructions: 'Do not tell me what to say.',
    contextFiles: [
        { file: 'figures.md', content: 'Cut latency by 40%.' },
        { file: 'cv.md', content: '15 years of backend.' },
    ],
    checklist: [
        { id: 'ask-team', text: 'Ask about the team' },
        { id: 'mention-k8s', text: 'Mention Kubernetes' },
    ],
};

function contextWithSpeech() {
    let clock = 1000;
    const ctx = createSessionContext({ sessionId: 's1', now: () => clock++ });
    ctx.addSpeech({ speaker: 'them', text: 'What have you done with Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Backend at scale.' });
    return ctx;
}

test('system carries the instructions and every context file', () => {
    const p = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'what do I say?' });
    assert.ok(p.system.includes('Do not tell me what to say.'));
    assert.ok(p.system.includes('Cut latency by 40%.'));
    assert.ok(p.system.includes('15 years of backend.'));
});

test('system does NOT carry the transcript (it must stay out of the cached prefix)', () => {
    const p = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'what do I say?' });
    assert.ok(!p.system.includes('Backend at scale.'));
    assert.ok(p.transcript.includes('Backend at scale.'));
});

test('system stays identical across calls even as the transcript grows', () => {
    const ctx = contextWithSpeech();
    const first = buildPayload({ profile: sampleProfile, sessionContext: ctx, question: 'a' });
    ctx.addSpeech({ speaker: 'them', text: 'One more question.' });
    const second = buildPayload({ profile: sampleProfile, sessionContext: ctx, question: 'b' });

    assert.strictEqual(first.system, second.system);
    assert.notStrictEqual(first.transcript, second.transcript);
});

test('the checklist shows up with its current state', () => {
    const ctx = contextWithSpeech();
    ctx.addChecklist({ itemId: 'mention-k8s', status: 'done' });

    const p = buildPayload({ profile: sampleProfile, sessionContext: ctx, question: 'x' });
    assert.ok(p.system.includes('Ask about the team'));
    assert.ok(p.system.includes('Mention Kubernetes'));
});

test('propagates the model and the confidential flag from the profile', () => {
    const p = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'x' });
    assert.strictEqual(p.model, 'gemini-3.7-flash');
    assert.strictEqual(p.confidential, false);

    const confidential = { ...sampleProfile, meta: { ...sampleProfile.meta, confidential: true } };
    assert.strictEqual(buildPayload({ profile: confidential, sessionContext: contextWithSpeech(), question: 'x' }).confidential, true);
});

test('the image is optional and travels through untouched', () => {
    const withoutImage = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'x' });
    assert.strictEqual(withoutImage.image, null);

    const withImage = buildPayload({
        profile: sampleProfile,
        sessionContext: contextWithSpeech(),
        question: 'x',
        image: { data: 'YWJj', mimeType: 'image/jpeg' },
    });
    assert.strictEqual(withImage.image.data, 'YWJj');
});

test('works with a profile that has no context and no checklist', () => {
    const minimal = {
        name: 'm',
        meta: { name: 'M', confidential: false, model: null },
        instructions: 'Keep it short.',
        contextFiles: [],
        checklist: [],
    };
    const p = buildPayload({ profile: minimo, sessionContext: contextoConVoz(), question: 'x' });
    assert.ok(p.system.includes('Keep it short.'));
    assert.strictEqual(p.model, null);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/payload'`

- [ ] **Step 3: Implement the module**

`src/core/payload.js`:

```js
// Assembles the payload in the order prompt caching demands: stable first
// (instructions + notes + checklist), volatile after (transcript + image +
// question). If the prefix changes between calls the whole cache is invalidated,
// so nothing here may depend on the clock or on the conversation.
function buildPayload({ profile, sessionContext, question, image = null }) {
    if (!profile) throw new TypeError('buildPayload requiere profile');
    if (!sessionContext) throw new TypeError('buildPayload requiere sessionContext');

    const sections = [profile.instructions];

    if (profile.contextFiles.length > 0) {
        const notes = profile.contextFiles.map(f => `### ${f.file}\n\n${f.content}`).join('\n\n');
        sections.push(`## My notes\n\n${notes}`);
    }

    if (profile.checklist.length > 0) {
        const items = profile.checklist.map(i => `- [${i.id}] ${i.text}`).join('\n');
        sections.push(`## Session checklist\n\n${items}`);
    }

    return {
        system: sections.join('\n\n'),
        transcript: sessionContext.getTranscript(),
        question: (question || '').trim(),
        image,
        model: profile.meta.model || null,
        confidential: profile.meta.confidential === true,
    };
}

module.exports = { buildPayload };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, every test in `payload.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/payload.js test/payload.test.js
git commit -m "feat: payload assembly ordered for caching"
```

---

## Phase B — Transcription and dual audio

### Task 6: Widen the Whisper model catalogue

**Files:**

- Modify: `src/utils/native-ai-runtime.js:49-67` (objeto `WHISPER_MODELS`)
- Modify: `src/storage.js:35` (default `whisperModel`)
- Modify: `src/components/views/MainView.js:1299-1303` (desplegable)

**Interfaces:**

- Consumes: nothing
- Produces: model keys `large-v3-turbo` and `medium.en` accepted by `ensureWhisperModel()`

Implements D4. The hashes are in **Global Constraints** and were verified against Hugging Face; do not swap them for others.

- [ ] **Step 1: Add the models to the catalogue**

In `src/utils/native-ai-runtime.js`, inside `WHISPER_MODELS`, after the `small.en` entry:

```js
    'medium.en': {
        filename: 'ggml-medium.en.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
        sha256: 'cc37e93478338ec7700281a7ac30a10128929eb8f427dda2e865faa8f6da4356',
    },
    'large-v3-turbo': {
        filename: 'ggml-large-v3-turbo.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
        sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69',
    },
```

- [ ] **Step 2: Change the `normalizeWhisperModel` default**

In `src/utils/native-ai-runtime.js:181`, change the final fallback:

```js
return legacyModels[modelName] || modelName || 'large-v3-turbo';
```

- [ ] **Step 3: Change the default in preferences**

In `src/storage.js:35`, inside `DEFAULT_PREFERENCES`:

```js
    whisperModel: 'large-v3-turbo',
```

- [ ] **Step 4: Update the UI dropdown**

In `src/components/views/MainView.js`, replace the three Whisper model `<option>`s with these five:

```js
                            <option value="large-v3-turbo" ?selected=${this._whisperModel === 'large-v3-turbo'}>Large v3 Turbo (1.6 GB, multilingüe, recomendado)</option>
                            <option value="medium.en" ?selected=${this._whisperModel === 'medium.en'}>Medium English (1.5 GB)</option>
                            <option value="small.en" ?selected=${this._whisperModel === 'small.en'}>Small English (466 MB)</option>
                            <option value="base.en" ?selected=${this._whisperModel === 'base.en'}>Base English (142 MB)</option>
                            <option value="tiny.en" ?selected=${this._whisperModel === 'tiny.en'}>Tiny English (75 MB, fastest)</option>
```

And in `MainView.js:739` and `:778`, change `'tiny.en'` to `'large-v3-turbo'`.

- [ ] **Step 5: Remove the hardwired English language**

`src/utils/localai.js:145` hardcodes `formData.append('language', 'en')`. With a
multilingual model that kills autodetection and forces an English decode — exactly
what D4 wants to avoid. In `transcribeAudio`, replace that line with:

```js
// The .en models only know English; multilingual ones must autodetect.
// Sending language='en' to a multilingual model forces the wrong decode.
const modeloActual = normalizeWhisperModel(currentWhisperModel);
if (modeloActual.endsWith('.en')) {
    formData.append('language', 'en');
} else {
    formData.append('language', 'auto');
}
```

Store the chosen model in `currentWhisperModel` when the session starts, inside
`initializeLocalSession` (`localai.js:425`):

```js
currentWhisperModel = whisperModel;
```

Declare it alongside the rest of the module state and import the normaliser:

```js
const { normalizeWhisperModel } = require('./native-ai-runtime');
let currentWhisperModel = 'large-v3-turbo';
```

And export `normalizeWhisperModel` from `src/utils/native-ai-runtime.js` by adding it
a su `module.exports`.

- [ ] **Step 6: Verify the URL and hash before trusting the download**

Run:

```bash
curl -sI "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" | grep -i "x-linked-etag\|x-linked-size"
```

Expected: `x-linked-etag: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"` y `x-linked-size: 1624555275`.

If they do not match, **stop and report it** — the file changed in the remote repository and the plan's hash is stale.

- [ ] **Step 7: Check the app starts and the model downloads**

Run: `npm start`, pick local mode, select "Large v3 Turbo", start a session.
Expected: a download progress bar (~1.6 GB), SHA verification without error, and the Whisper server starting.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/
git add src/utils/native-ai-runtime.js src/storage.js src/utils/localai.js src/components/views/MainView.js
git commit -m "feat: add large-v3-turbo and medium.en to the Whisper catalogue"
```

---

### Task 7: Per-channel VAD and resampling in `localai.js`

**Files:**

- Modify: `src/utils/localai.js` — remove module-level VAD state (lines 27-39, 42-63, 65-110), change `processLocalAudio` and `handleSpeechEnd`
- Modify: `src/utils/gemini.js:1102-1170` — pass the speaker in both audio handlers
- Create: `test/channel-state.test.js`

**Interfaces:**

- Consumes: `createVad`, `VAD_MODES` from `src/core/vad.js` (task 2); `createSessionContext` (task 3)
- Produces: `processLocalAudio(monoChunk24k: Buffer, speaker: 'them'|'me'): void`

**Why it is needed:** today `send-audio-content` and `send-mic-audio-content` **both** call `processLocalAudio(pcmBuffer)`, which uses module state (`isSpeaking`, `speechBuffers`, `resampleRemainder`). The two channels trample each other and the speaker identity is lost. A shared `resampleRemainder` also **corrupts the audio**, because it mixes one channel's leftovers into the other.

- [ ] **Step 1: Write the failing test**

`test/channel-state.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createVad, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

// Reproduces the bug this task fixes: when two channels share a VAD,
// closes the other one's segment.
test('independent channels do not close their neighbour segment', () => {
    const closed = { them: 0, me: 0 };
    const channels = {
        them: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => closed.them++ }),
        me: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => closed.me++ }),
    };

    // 'them' speaks while 'me' is silent.
    for (let i = 0; i < 10; i++) {
        channels.them.process(frame16k(0.5));
        channels.me.process(frame16k(0));
    }

    assert.strictEqual(channels.them.isSpeaking(), true);
    assert.strictEqual(channels.me.isSpeaking(), false);
    assert.strictEqual(closed.them, 0);

    // Now 'them' goes quiet: only its own segment must close.
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) {
        channels.them.process(frame16k(0));
        channels.me.process(frame16k(0));
    }

    assert.strictEqual(closed.them, 1);
    assert.strictEqual(closed.me, 0);
});
```

- [ ] **Step 2: Run the test**

Run: `npm test`
Expected: PASS (validates task 2's contract before wiring it up).

- [ ] **Step 3: Replace module state with per-channel state in `localai.js`**

Remove the `isSpeaking`, `speechBuffers`, `silenceFrameCount`, `speechFrameCount`, `vadConfig` and `resampleRemainder` declarations from `src/utils/localai.js`, along with the `VAD_MODES` object and the `calculateRms` and `processVad` functions. Replace them with:

```js
const { createVad, VAD_MODES } = require('../core/vad');

// One channel = one VAD of its own. Sharing state across channels corrupts the audio
// corrupts the audio and mixes the speakers up (see task 7).
function createChannel(speaker) {
    let resampleRemainder = Buffer.alloc(0);

    function resample24kTo16k(inputBuffer) {
        const combined = Buffer.concat([resampleRemainder, inputBuffer]);
        const inputSamples = Math.floor(combined.length / 2);
        const outputSamples = Math.floor((inputSamples * 2) / 3);
        const outputBuffer = Buffer.alloc(outputSamples * 2);

        for (let i = 0; i < outputSamples; i++) {
            const sourcePosition = (i * 3) / 2;
            const sourceIndex = Math.floor(sourcePosition);
            const fraction = sourcePosition - sourceIndex;
            const firstSample = combined.readInt16LE(sourceIndex * 2);
            const secondSample = sourceIndex + 1 < inputSamples ? combined.readInt16LE((sourceIndex + 1) * 2) : firstSample;
            const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
            outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
        }

        const consumedInputSamples = Math.ceil((outputSamples * 3) / 2);
        const remainderStart = consumedInputSamples * 2;
        resampleRemainder = remainderStart < combined.length ? combined.slice(remainderStart) : Buffer.alloc(0);

        return outputBuffer;
    }

    const vad = createVad({
        // D20: 2s of silence instead of 3. Tune it with the test bench.
        mode: { ...VAD_MODES.NORMAL, silenceFramesRequired: 20 },
        preRollFrames: 3,
        onSpeechEnd: audioData => channelQueue.push(speaker, audioData),
    });

    function reset() {
        resampleRemainder = Buffer.alloc(0);
        vad.reset();
    }

    return { resample24kTo16k, vad, reset };
}

const channels = { them: createChannel('them'), me: createChannel('me') };
```

- [ ] **Step 4: Change `processLocalAudio` to take the speaker**

```js
function processLocalAudio(monoChunk24k, speaker = 'them') {
    if (!isLocalActive) return;

    const channel = channels[speaker];
    if (!channel) {
        console.warn('[LocalAI] Hablante desconocido:', speaker);
        return;
    }

    const pcm16k = channel.resample24kTo16k(monoChunk24k);
    if (pcm16k.length > 0) {
        channel.vad.process(pcm16k);
    }
}
```

- [ ] **Step 4b: Per-channel transcription queue (B2)**

`whisper-server` handles one request at a time. If both channels close a segment
at once, the second waits; with no queue, after a long interruption the lag grows
without bound. Add this to `localai.js`, before `createChannel`:

```js
// Serialises requests to whisper-server and drops the oldest if a backlog builds.
const MAX_PENDING_PER_CHANNEL = 3;
const channelQueue = (() => {
    const pending = { them: [], me: [] };
    let busy = false;

    async function drain() {
        if (busy) return;
        busy = true;
        try {
            // Alternate channels so neither one monopolises the server.
            while (pending.them.length || pending.me.length) {
                for (const speaker of ['them', 'me']) {
                    const audio = pending[speaker].shift();
                    if (audio) await handleSpeechEnd(audio, speaker);
                }
            }
        } finally {
            busy = false;
        }
    }

    function push(speaker, audio) {
        pending[speaker].push(audio);
        if (pending[speaker].length > MAX_PENDING_PER_CHANNEL) {
            pending[speaker].shift();
            console.warn('[LocalAI] Cola llena, descartado segmento antiguo de', speaker);
        }
        drain();
    }

    function clear() {
        pending.them = [];
        pending.me = [];
    }

    return { push, clear };
})();
```

In `closeLocalSession()`, add `channelQueue.clear();` next to the channel resets.

- [ ] **Step 4c: Filter out Whisper hallucinations (B3)**

Whisper invents phrases over silence or noise. In `transcribeAudio` (`localai.js:133`),
request `verbose_json` and drop on `no_speech_prob`:

```js
formData.append('response_format', 'verbose_json');
```

and replace the result reading with:

```js
const result = await response.json();
const segments = Array.isArray(result.segments) ? result.segments : [];
const HALLUCINATIONS = [/thank you for watching/i, /subt[ií]tulos/i, /^\s*\[.*\]\s*$/, /^\s*\(.*\)\s*$/];

const text = segments
    .filter(seg => (seg.no_speech_prob ?? 0) < 0.6)
    .map(seg => (seg.text || '').trim())
    .filter(t => t && !HALLUCINATIONS.some(rx => rx.test(t)))
    .join(' ')
    .trim();
```

If the server returns no `segments`, fall back to `result.text` as before.

- [ ] **Step 5: Change `handleSpeechEnd` so it only transcribes (reactive design)**

Replace the body of `handleSpeechEnd` (`localai.js:160`). **It no longer calls `sendToLlama`** — under the reactive design the model is only invoked from the shortcut (D1):

```js
async function handleSpeechEnd(audioData, speaker) {
    if (!isLocalActive) return;

    if (audioData.length < 16000) {
        console.log('[LocalAI] Audio too short, discarding');
        return;
    }

    try {
        const transcription = await transcribeAudio(audioData);
        if (!transcription || transcription.trim().length < 2) return;

        // Context only. The model is called from the shortcut, never here.
        onTranscription(speaker, transcription.trim());
    } catch (error) {
        console.error('[LocalAI] Transcription error:', error);
        sendToRenderer('update-status', 'Transcription error: ' + error.message);
    }
}

// The consumer (task 8) injects where the transcription goes.
let onTranscription = () => {};
function setTranscriptionHandler(handler) {
    onTranscription = handler;
}
```

Add `setTranscriptionHandler` to `module.exports`.

- [ ] **Step 6: Reset the channels when the session closes**

In `closeLocalSession()` (`localai.js:489`), replace the lines that reset the VAD state (`isSpeaking`, `speechBuffers`, `silenceFrameCount`, `speechFrameCount`, `resampleRemainder`) with:

```js
channels.them.reset();
channels.me.reset();
```

- [ ] **Step 7: Pass the speaker through from the IPC handlers**

In `src/utils/gemini.js:1113`, inside `send-audio-content`:

```js
getLocalAi().processLocalAudio(pcmBuffer, 'them');
```

In `src/utils/gemini.js:1148`, inside `send-mic-audio-content`:

```js
getLocalAi().processLocalAudio(pcmBuffer, 'me');
```

- [ ] **Step 8: Verify in the real app**

Run: `npm start` in local mode, with `audioMode` set to something that captures the microphone (not `speaker_only`), and speak alternating with the system audio.
Expected: correctly labelled transcriptions in the console and **no** automatic model response (that now requires the shortcut).

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/ test/
git add src/utils/localai.js src/utils/gemini.js test/channel-state.test.js
git commit -m "feat: independent VAD and resampling per audio channel"
```

---

### Task 7b: Local transcription independent of the local LLM (D14)

**Files:**

- Create: `src/core/modes.js`
- Create: `test/modes.test.js`
- Modify: `src/utils/localai.js:425-480` — dividir `initializeLocalSession`
- Modify: `src/storage.js:23-37` — `transcription` and `reasoning` preferences
- Modify: `src/utils/gemini.js` — handler `initialize-session`
- Modify: `src/utils/renderer.js:143-170` — "Start Session" usa `initialize-session`

**Interfaces:**

- Consumes: `ensureNativeBinary`, `ensureWhisperModel`, `ensureLlamaModel`, `startWhisperServer`, `startLlamaServer` (already exist in `localai.js` / `native-ai-runtime.js`)
- Produces:
    - `resolveModes(prefs, profileMeta?)` → `{ transcription: 'local-whisper'|'gemini-live', reasoning: 'gemini'|'local-llama' }`
    - `startTranscription({ whisperModel })` → arranca **solo** `whisper-server`
    - `startLocalReasoning({ model, profile, customPrompt })` → arranca `llama-server`

Today `initializeLocalSession` downloads Qwen and starts llama **always**. The design's
default combination (local Whisper + Gemini) did not exist (A1).

- [ ] **Step 1: Test for the mode resolver**

`test/modes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { resolveModes } = require('../src/core/modes');

test('default: local whisper + gemini', () => {
    assert.deepStrictEqual(resolveModes({}), { transcription: 'local-whisper', reasoning: 'gemini' });
});

test('honours the new preferences', () => {
    assert.deepStrictEqual(resolveModes({ transcription: 'gemini-live', reasoning: 'local-llama' }), {
        transcription: 'gemini-live',
        reasoning: 'local-llama',
    });
});

test('migrates the old providerMode', () => {
    assert.deepStrictEqual(resolveModes({ providerMode: 'local' }), { transcription: 'local-whisper', reasoning: 'local-llama' });
    assert.deepStrictEqual(resolveModes({ providerMode: 'byok' }), { transcription: 'gemini-live', reasoning: 'gemini' });
});

test('a confidential profile forces everything local (D13)', () => {
    assert.deepStrictEqual(resolveModes({ reasoning: 'gemini' }, { confidential: true }), {
        transcription: 'local-whisper',
        reasoning: 'local-llama',
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/modes'`

- [ ] **Step 3: Implement the resolver**

`src/core/modes.js`:

```js
const TRANSCRIPTION = ['local-whisper', 'gemini-live'];
const REASONING = ['gemini', 'local-llama'];

// Two independent axes (D14). The old providerMode is translated so as not to
// romper preferencias guardadas.
function resolveModes(prefs = {}, profileMeta = {}) {
    let transcription = TRANSCRIPTION.includes(prefs.transcription) ? prefs.transcription : null;
    let reasoning = REASONING.includes(prefs.reasoning) ? prefs.reasoning : null;

    if (!transcription || !reasoning) {
        if (prefs.providerMode === 'local') {
            transcription = transcription || 'local-whisper';
            reasoning = reasoning || 'local-llama';
        } else if (prefs.providerMode === 'byok') {
            transcription = transcription || 'gemini-live';
            reasoning = reasoning || 'gemini';
        }
    }

    transcription = transcription || 'local-whisper';
    reasoning = reasoning || 'gemini';

    if (profileMeta.confidential === true) {
        transcription = 'local-whisper';
        reasoning = 'local-llama';
    }

    return { transcription, reasoning };
}

module.exports = { resolveModes, TRANSCRIPTION, REASONING };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Split `initializeLocalSession`**

In `src/utils/localai.js`, lift `binaryProgress` (today inside `prepareNativeFiles`)
to module level and replace `initializeLocalSession` with:

```js
async function startTranscription({ whisperModel }) {
    initializationController = new AbortController();
    const signal = initializationController.signal;

    const whisperBinaryPath = await ensureNativeBinary('whisper', binaryProgress('Whisper binary'), signal);
    const whisperModelPath = await ensureWhisperModel(whisperModel, binaryProgress('Whisper model'), signal);
    currentWhisperModel = whisperModel;

    await startWhisperServer(whisperBinaryPath, whisperModelPath);
    isLocalActive = true;
    sendToRenderer('local-ai-download-progress', { active: false });
}

async function startLocalReasoning({ model, profile, customPrompt }) {
    initializationController = initializationController || new AbortController();
    const signal = initializationController.signal;

    const llamaBinaryPath = await ensureNativeBinary('llama', binaryProgress('Llama binary'), signal);
    const { modelPath, projectorPath } = await ensureLlamaModel(model, binaryProgress('Language model'), binaryProgress('Vision model'), signal);
    validatePreparedNativeFiles({ llamaBinaryPath, llamaModelPath: modelPath, projectorPath });

    await startLlamaServer(llamaBinaryPath, modelPath, projectorPath);
    currentSystemPrompt = customPrompt || null;
    sendToRenderer('local-ai-download-progress', { active: false });
}

// Compatibility with the legacy flow.
async function initializeLocalSession(model, whisperModel, profile, customPrompt) {
    await startTranscription({ whisperModel });
    await startLocalReasoning({ model, profile, customPrompt });
}
```

Export `startTranscription` and `startLocalReasoning`.

- [ ] **Step 6: Preferences and unified startup**

In `src/storage.js` `DEFAULT_PREFERENCES`, add:

```js
    transcription: 'local-whisper',
    reasoning: 'gemini',
```

In `src/utils/gemini.js`, import `resolveModes` from `../core/modes` and `getPreferences`
from `../storage`, and add the handler:

```js
ipcMain.handle('initialize-session', async (event, { profileName }) => {
    try {
        const prefs = getPreferences();
        const { profile } = sessionManager.start({ profileName });
        const modes = resolveModes(prefs, profile.meta);

        if (modes.transcription === 'local-whisper') {
            await getLocalAi().startTranscription({ whisperModel: prefs.whisperModel });
        }
        if (modes.reasoning === 'local-llama') {
            await getLocalAi().startLocalReasoning({ model: prefs.localLlmModel, profile: profileName, customPrompt: profile.instructions });
        }
        if (modes.transcription === 'gemini-live') {
            await initializeGeminiSession(getApiKey(), profile.instructions, profileName, prefs.selectedLanguage);
        }

        return { success: true, modes };
    } catch (error) {
        sessionManager.end();
        return { success: false, error: error.message };
    }
});
```

In `renderer.js`, the "Start Session" button invokes `initialize-session` with the chosen
profile instead of `initialize-gemini` / `initialize-local`.

- [ ] **Step 7: Verify Whisper starts without Qwen**

Run: `npm start` with the default preferences.
Expected: `whisper-server` downloads/starts **without** downloading any llama model.
In Activity Monitor there is a `whisper-server` process and no `llama-server`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/modes.js test/modes.test.js src/utils/localai.js src/utils/gemini.js src/utils/renderer.js src/storage.js
git commit -m "feat: local transcription independent of the local LLM"
```

---

### Task 8: Session manager (joins thread, profile and provider)

**Files:**

- Create: `src/core/session.js`
- Create: `test/session.test.js`
- Modify: `src/utils/gemini.js` — use the manager in `initializeNewSession` and in the shortcut handler

**Interfaces:**

- Consumes: `createSessionContext` (T3), `loadProfile`/`getProfilesDir` (T4), `buildPayload` (T5), `setTranscriptionHandler` (T7)
- Produces:
    - `createSessionManager({ configDir, sendToProvider, now? })` → `{ start({ profileName, sessionId? }), recordSpeech(speaker, text), recordScreen(imageRef), ask({ question, image }), getContext(), getProfile(), end() }`
    - `sendToProvider(payload)` → `Promise<string>` — injected, it is the provider **seam** (D9/D10)

- [ ] **Step 1: Write the failing tests**

`test/session.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionManager } = require('../src/core/session');

function makeConfigDir() {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const profile = path.join(cfg, 'profiles', 'interview');
    fs.mkdirSync(path.join(profile, 'context'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'profile.md'), '---\nname: Interview\nmodel: gemini-3.7-flash\n---\n\nBe my memory.');
    fs.writeFileSync(path.join(profile, 'context', 'cv.md'), 'Backend, 15 years.');
    return cfg;
}

test('start loads the profile and opens an empty thread', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'ok' });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    assert.strictEqual(manager.getProfile().meta.name, 'Interview');
    assert.deepStrictEqual(manager.getContext().getEvents(), []);
});

test('recordSpeech accumulates without calling the provider', async () => {
    let calls = 0;
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => {
            calls++;
            return 'answer';
        },
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    manager.recordSpeech('them', 'What do you know about Node?');
    manager.recordSpeech('me', 'Quite a lot.');

    assert.strictEqual(calls, 0);
    assert.strictEqual(manager.getContext().getEvents().length, 2);
});

test('ask sends the payload to the provider and records the answer', async () => {
    let received = null;
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async payload => {
            received = payload;
            return 'Say you cut latency by 40%.';
        },
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });
    manager.recordSpeech('them', 'What impact did you have?');

    const answer = await manager.ask({ question: 'what do I say?' });

    assert.strictEqual(answer, 'Say you cut latency by 40%.');
    assert.ok(received.system.includes('Backend, 15 years.'));
    assert.ok(received.transcript.includes('What impact did you have?'));
    assert.strictEqual(received.model, 'gemini-3.7-flash');

    const events = manager.getContext().getEvents();
    assert.strictEqual(events[events.length - 1].kind, 'ask');
});

test('ask fails clearly when there is no active session', async () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'x' });
    await assert.rejects(() => manager.ask({ question: 'x' }), /no active session/i);
});

test('the payload carries the confidential flag so the adapter can honour it', async () => {
    const cfg = makeConfigDir();
    const profile = path.join(cfg, 'profiles', 'private');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'profile.md'), '---\nname: Private\nconfidential: true\n---\n\nBe discreet.');

    let received = null;
    const manager = createSessionManager({
        configDir: cfg,
        sendToProvider: async payload => {
            received = payload;
            return 'ok';
        },
    });
    manager.start({ profileName: 'privado', sessionId: 's1' });
    await manager.ask({ question: 'x' });

    assert.strictEqual(recibido.confidential, true);
});

test('ask rejects a second request while the first is in flight (B6)', async () => {
    let release;
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: () => new Promise(r => (release = r)),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    const first = manager.ask({ question: 'a' });
    await assert.rejects(() => manager.ask({ question: 'b' }), /already in flight/i);
    release('ok');
    assert.strictEqual(await first, 'ok');
});

test('end closes the session', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'x' });
    manager.start({ profileName: 'interview', sessionId: 's1' });
    manager.end();
    assert.strictEqual(manager.getContext(), null);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/session'`

- [ ] **Step 3: Implement the manager**

`src/core/session.js`:

```js
const { createSessionContext } = require('./session-context');
const { getProfilesDir, loadProfile } = require('./profiles');
const { buildPayload } = require('./payload');

// Joins the context thread, the profile and the provider. `sendToProvider` is
// injected: it is the seam that lets Gemini be swapped out without touching memory.
function createSessionManager({ configDir, sendToProvider, now = Date.now }) {
    if (!configDir) throw new TypeError('createSessionManager requiere configDir');
    if (typeof sendToProvider !== 'function') throw new TypeError('createSessionManager requiere sendToProvider');

    let context = null;
    let profile = null;

    function start({ profileName, sessionId = String(now()) }) {
        profile = loadProfile(getProfilesDir(configDir), profileName);
        context = createSessionContext({ sessionId, profileName, now });
        return { sessionId, profile };
    }

    function recordSpeech(speaker, text) {
        if (!context) return;
        context.addSpeech({ speaker, text });
    }

    function recordScreen(imageRef) {
        if (!context) return;
        context.addScreen({ imageRef });
    }

    let pending = false;

    async function ask({ question, image = null }) {
        if (!context || !profile) throw new Error('No active session');
        // B6: two quick presses of the shortcut must not fire two requests.
        if (pending) throw new Error('A request is already in flight');

        pending = true;
        try {
            const payload = buildPayload({ profile, sessionContext: context, question, image });
            const answer = await sendToProvider(payload);
            context.addAsk({ question, answer });
            return answer;
        } finally {
            pending = false;
        }
    }

    function end() {
        context = null;
        profile = null;
    }

    return { start, recordSpeech, recordScreen, ask, end, getContext: () => context, getProfile: () => profile };
}

module.exports = { createSessionManager };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, every test in `session.test.js`.

- [ ] **Step 5: Wire the manager into `gemini.js`**

Near the top of `src/utils/gemini.js`, after the existing `require`s:

```js
const { createSessionManager } = require('../core/session');
const { getConfigDir } = require('../storage');

const sessionManager = createSessionManager({
    configDir: getConfigDir(),
    // The provider adapter lives here: it is the only thing that knows about Gemini.
    // Applies D13: a confidential profile never leaves the machine, even when the
    // active mode is a cloud one. A worse answer beats a leak.
    sendToProvider: async payload => {
        if (payload.confidential) {
            if (!getLocalAi().isLocalSessionActive()) {
                throw new Error('This profile is confidential and needs local mode running');
            }
            return getLocalAi().sendLocalPayload(payload);
        }
        return sendPayloadToGemini(payload);
    },
});
```

In `setupGeminiIpcHandlers`, connect local transcription to the thread:

```js
getLocalAi().setTranscriptionHandler((speaker, text) => {
    sessionManager.recordSpeech(speaker, text);
    sendToRenderer('transcription', { speaker, text });
});
```

- [ ] **Step 6: Implement the two provider adapters**

The manager is agnostic; these two functions are the only things that know each provider.

In `src/utils/gemini.js`, add:

```js
// Translates the neutral payload into a Gemini request. The `system` block goes
// first and stays unchanged through the meeting: it is the prefix that gets cached.
async function sendPayloadToGemini(payload) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Missing Gemini API key');

    const model = payload.model || getConfig().geminiLiveModel || 'gemini-2.5-flash';
    const client = new GoogleGenAI({ apiKey });

    const parts = [];
    if (payload.transcript) {
        parts.push({ text: `Conversation so far:\n\n${payload.transcript}` });
    }
    if (payload.image) {
        parts.push({ inlineData: { mimeType: payload.image.mimeType, data: payload.image.data } });
    }
    parts.push({ text: payload.question });

    // B5: stream so the window is not left blank for 2-4s.
    const stream = await client.models.generateContentStream({
        model,
        config: { systemInstruction: payload.system },
        contents: [{ role: 'user', parts }],
    });

    let fullText = '';
    let isFirst = true;
    let usage = null;
    for await (const chunk of stream) {
        const text = chunk.text || '';
        if (text) {
            fullText += text;
            sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
            isFirst = false;
        }
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }

    // B4: if this stays at 0, implicit caching is not working and the stable block
    // move the stable block into the first 'user' message instead of systemInstruction.
    if (usage) {
        console.log('[Gemini] tokens cacheados:', usage.cachedContentTokenCount ?? 0, 'de', usage.promptTokenCount);
    }

    return fullText.trim();
}
```

In `src/utils/localai.js`, add and export:

```js
// Local counterpart of the adapter: same payload, llama.cpp server.
async function sendLocalPayload(payload) {
    if (!isLocalActive || !llamaProcess) {
        throw new Error('No active local session');
    }

    const content = [];
    if (payload.transcript) {
        content.push({ type: 'text', text: `Conversation so far:\n\n${payload.transcript}` });
    }
    if (payload.image) {
        content.push({ type: 'image_url', image_url: { url: `data:${payload.image.mimeType};base64,${payload.image.data}` } });
    }
    content.push({ type: 'text', text: payload.question });

    const messages = [
        { role: 'system', content: payload.system },
        { role: 'user', content },
    ];

    let isFirst = true;
    const fullText = await requestLlama(messages, text => {
        sendToRenderer(isFirst ? 'new-response' : 'update-response', text);
        isFirst = false;
    });

    return fullText.trim();
}
```

Add `sendLocalPayload` to `localai.js`'s `module.exports`.

- [ ] **Step 6b: Verify the model id (B9)**

Before fixing `gemini-3.7-flash` as the default anywhere:

```bash
GEMINI_API_KEY=... node -e "const {GoogleGenAI}=require('@google/genai');new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY}).models.list().then(async r=>{for await(const m of r)console.log(m.name)})"
```

Expected: the list includes the id you are going to use. If `gemini-3.7-flash` is absent,
use the most recent Flash id that does appear and note it in `03-decisions.md` D12.

- [ ] **Step 7: Verify the app still starts**

Run: `npm start`
Expected: the app opens with no console errors. The manager does not respond to the shortcut yet — that comes with task 10.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/session.js test/session.test.js src/utils/gemini.js src/utils/localai.js
git commit -m "feat: session manager joining thread, profile and provider"
```

---

### Task 9: Thread persistence and schema migration

**Files:**

- Modify: `src/storage.js:397-420` (`saveSession`, `getSession`)
- Modify: `src/components/views/HistoryView.js:375-380` (thread rendering)
- Create: `test/storage-session.test.js`

**Interfaces:**

- Consumes: `toJSON()` / `fromJSON()` from `session-context.js` (T3)
- Produces: `saveSession(sessionId, { profileName, events })` persists the new thread; `migrateLegacySession(obj)` converts sessions from the old schema

The old schema (`{ timestamp, transcription, ai_response }`) has no room for what the user said (H5). The new one stores the whole event thread.

- [ ] **Step 1: Write the failing tests**

`test/storage-session.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { migrateLegacySession } = require('../src/core/session-context-migrate');

test('turns legacy turns into thread events', () => {
    const legacy = {
        sessionId: 's1',
        profile: 'interview',
        conversationHistory: [{ timestamp: 100, transcription: 'What is your experience?', ai_response: 'Say 15 years.' }],
        screenAnalysisHistory: [{ timestamp: 150, prompt: 'read this', response: 'it is an IDE', model: 'gemini' }],
    };

    const { sessionId, profileName, events } = migrateLegacySession(legacy);

    assert.strictEqual(sessionId, 's1');
    assert.strictEqual(profileName, 'interview');
    // The legacy transcription was always the interviewer.
    assert.strictEqual(events[0].kind, 'speech');
    assert.strictEqual(events[0].speaker, 'them');
    assert.strictEqual(events[0].text, 'What is your experience?');
    // The model's answer becomes an 'ask' event.
    assert.strictEqual(events[1].kind, 'ask');
    assert.strictEqual(events[1].answer, 'Say 15 years.');
    // Screen analysis enters the thread too, ordered by time.
    assert.strictEqual(events[2].kind, 'screen');
});

test('an already migrated session is returned untouched', () => {
    const modern = { sessionId: 's2', profileName: 'interview', events: [{ t: 1, kind: 'speech', speaker: 'me', text: 'hi' }] };
    assert.deepStrictEqual(migrateLegacySession(modern), modern);
});

test('tolerates an empty session', () => {
    const { events } = migrateLegacySession({ sessionId: 's3' });
    assert.deepStrictEqual(events, []);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/session-context-migrate'`

- [ ] **Step 3: Implement the migration**

`src/core/session-context-migrate.js`:

```js
// Converts the old { transcription, ai_response } schema into the event thread.
// In that schema `transcription` was always the interviewer: the app never
// listened to the user at all (finding H5).
function migrateLegacySession(obj) {
    if (Array.isArray(obj.events)) return obj;

    const events = [];

    for (const turn of obj.conversationHistory || []) {
        const t = turn.timestamp || 0;
        if (turn.transcription) {
            events.push({ t, kind: 'speech', speaker: 'them', text: turn.transcription });
        }
        if (turn.ai_response) {
            events.push({ t: t + 1, kind: 'ask', question: '', answer: turn.ai_response });
        }
    }

    for (const analysis of obj.screenAnalysisHistory || []) {
        events.push({
            t: analysis.timestamp || 0,
            kind: 'screen',
            imageRef: null,
            caption: analysis.response || null,
        });
    }

    events.sort((a, b) => a.t - b.t);

    return { sessionId: obj.sessionId, profileName: obj.profile || obj.profileName || null, events };
}

module.exports = { migrateLegacySession };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Persist the new thread**

In `src/storage.js`, replace the body of `saveSession` (`storage.js:397`):

```js
function saveSession(sessionId, data) {
    const sessionPath = getSessionPath(sessionId);
    const existingSession = readJsonFile(sessionPath, null);

    const sessionData = {
        sessionId,
        createdAt: existingSession?.createdAt || parseInt(sessionId),
        lastUpdated: Date.now(),
        profileName: data.profileName || existingSession?.profileName || null,
        events: data.events || existingSession?.events || [],
    };
    return writeJsonFile(sessionPath, sessionData);
}
```

And in `getSession`, migrate on read:

```js
function getSession(sessionId) {
    const raw = readJsonFile(getSessionPath(sessionId), null);
    if (!raw) return null;
    const { migrateLegacySession } = require('./core/session-context-migrate');
    return { ...raw, ...migrateLegacySession(raw) };
}
```

- [ ] **Step 6: Update `HistoryView` to render the thread**

In `src/components/views/HistoryView.js`, replace the block that builds `messages` from `conversationHistory` (`:375-380`):

```js
const events = session.events || [];
const messages = events
    .filter(e => e.kind === 'speech' || e.kind === 'ask')
    .map(e =>
        e.kind === 'speech'
            ? { type: e.speaker === 'me' ? 'me' : 'them', content: e.text, timestamp: e.t }
            : { type: 'ai', content: e.answer, timestamp: e.t }
    );
```

- [ ] **Step 7: Verify against a real legacy session**

Run: `npm start`, open the History view and select a session created before this change.
Expected: it renders with no errors, with the legacy turns labelled as the interviewer.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/session-context-migrate.js test/storage-session.test.js src/storage.js src/components/views/HistoryView.js
git commit -m "feat: persist the event thread and migrate legacy sessions"
```

---

## Phase C — Profiles, screen and measurement

### Task 10: Reactive shortcut and reoriented screenshot

**Files:**

- Modify: `src/utils/renderer.js:464-551` — remove the automatic `captureScreenshot`
- Modify: `src/utils/renderer.js:551-556` — eliminar `MANUAL_SCREENSHOT_PROMPT`
- Modify: `src/utils/renderer.js:561-665` — `captureManualScreenshot` stops setting the prompt
- Modify: `src/utils/renderer.js:201-215` — do not start the screenshot interval
- Modify: `src/utils/gemini.js:1171` — the `send-image-content` handler delegates to `sessionManager.ask`

**Interfaces:**

- Consumes: `sessionManager.ask({ question, image })` (T8)
- Produces: the shortcut captures the screen and asks for an answer in one action

Implements D1 and the "Screenshot on demand" section of [02-design.md](02-design.md).

- [ ] **Step 1: Remove the automatic capture**

In `src/utils/renderer.js`, inside `startCapture`, delete the creation of `screenshotInterval` and the periodic call to `captureScreenshot`. Also delete the whole `captureScreenshot` function (`:464-551`) and the `MANUAL_SCREENSHOT_PROMPT` constant (`:551-556`).

Reason: under a reactive design, sending an image every N seconds burns calls nobody asked for.

- [ ] **Step 2: Remove the hardwired prompt from the manual screenshot**

In `captureManualScreenshot`, replace the IPC invocation with:

```js
const result = await ipcRenderer.invoke('send-image-content', {
    data: base64data,
});
```

(No `prompt`: the profile decides it now, not the renderer.)

- [ ] **Step 3: Delegate the handler to the session manager**

In `src/utils/gemini.js`, replace the body of `send-image-content` with:

```js
ipcMain.handle('send-image-content', async (event, { data, prompt }) => {
    try {
        if (!data || typeof data !== 'string') {
            return { success: false, error: 'Invalid image data' };
        }

        const buffer = Buffer.from(data, 'base64');
        if (buffer.length < 1000) {
            return { success: false, error: 'Image too small' };
        }

        const answer = await sessionManager.ask({
            question: prompt || 'Help me with what I am looking at and the conversation so far.',
            image: { data, mimeType: 'image/jpeg' },
        });

        return { success: true, text: answer };
    } catch (error) {
        console.error('Error enviando imagen:', error);
        return { success: false, error: error.message };
    }
});
```

- [ ] **Step 3b: Wire typed questions into the manager (A2 / D15)**

In `src/utils/gemini.js`, replace the entire body of `send-text-message` with:

```js
ipcMain.handle('send-text-message', async (event, text) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { success: false, error: 'Empty message' };
    }
    try {
        const answer = await sessionManager.ask({ question: text.trim() });
        return { success: true, text: answer };
    } catch (error) {
        console.error('Error on typed question:', error);
        return { success: false, error: error.message };
    }
});
```

- [ ] **Step 3c: An "ask without image" shortcut (M4)**

In `src/utils/window.js`, inside `getDefaultKeybinds()`, add
`askNoScreen: isMac ? 'Cmd+Shift+Enter' : 'Ctrl+Shift+Enter'`. En
`updateGlobalShortcuts`, registrar:

```js
if (keybinds.askNoScreen) {
    try {
        globalShortcut.register(keybinds.askNoScreen, () => sendToRenderer('ask-no-screen'));
    } catch (error) {
        console.error(`Failed to register askNoScreen (${keybinds.askNoScreen}):`, error);
    }
}
```

En `renderer.js`:

```js
ipcRenderer.on('ask-no-screen', async () => {
    const result = await ipcRenderer.invoke('send-text-message', 'What am I forgetting to say or ask?');
    if (!result.success) cheatingDaddy.addNewResponse(`Error: ${result.error}`);
});
```

- [ ] **Step 3d: Emergency erase clears the in-memory thread (B7)**

In `src/utils/window.js`, in the `emergencyErase` handler, before
`sendToRenderer('clear-sensitive-data')`:

```js
require('./gemini').endSessionForEmergency();
```

And in `gemini.js`, add and export:

```js
function endSessionForEmergency() {
    sessionManager.end();
}
```

- [ ] **Step 4: Verify the whole flow by hand**

Run: `npm start`, start a session with a profile, let it transcribe a couple of turns, and press the screenshot shortcut.
Expected: **one** answer arrives, taking into account both the screen and what was said before. No automatic answers in between.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/
git add src/utils/renderer.js src/utils/gemini.js
git commit -m "feat: reactive shortcut; remove automatic screen capture"
```

---

### Task 11: Generate default profiles and retire `prompts.js`

**Files:**

- Create: `src/core/profiles-bootstrap.js`
- Create: `test/profiles-bootstrap.test.js`
- Modify: `src/index.js:20` — call the bootstrap after `storage.initializeStorage()`
- Delete: `src/utils/prompts.js`
- Modify: `src/utils/gemini.js` — remove the `require` of `./prompts` and every use of `getSystemPrompt`
- Modify: `src/utils/localai.js:3` — remove the `require` of `./prompts`

**Interfaces:**

- Consumes: `getProfilesDir` (T4)
- Produces: `bootstrapProfiles({ configDir, legacyCustomPrompt })` → `string[]` of the profiles created

Implements the "Migration" section of [02-design.md](02-design.md) and removes H6.

- [ ] **Step 1: Write the failing tests**

`test/profiles-bootstrap.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapProfiles } = require('../src/core/profiles-bootstrap');
const { loadProfile, getProfilesDir, listProfiles } = require('../src/core/profiles');

test('creates the default profiles in an empty config', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const created = bootstrapProfiles({ configDir: cfg });

    assert.ok(creados.includes('entrevista'));
    assert.ok(listProfiles(getProfilesDir(cfg)).length >= 3);

    const profile = loadProfile(getProfilesDir(cfg), 'interview');
    assert.ok(profile.instructions.length > 0);
    // El nuevo prompt NO debe dictar palabras.
    assert.ok(!/exact words to say/i.test(profile.instructions));
});

test('keeps the old customPrompt as a context file', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg, legacyCustomPrompt: 'I am a backend dev with 15 years.' });

    const profile = loadProfile(getProfilesDir(cfg), 'interview');
    const migrated = profile.contextFiles.find(f => f.file === 'migrated.md');
    assert.ok(migrated, 'debe existir context/migrated.md');
    assert.strictEqual(migrated.content, 'I am a backend dev with 15 years.');
});

test('never overwrites a profile that already exists', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const file = path.join(getProfilesDir(cfg), 'entrevista', 'profile.md');
    fs.writeFileSync(file, '---\nname: Mine\n---\n\nMy own instructions.');

    const created = bootstrapProfiles({ configDir: cfg });
    assert.strictEqual(creados.includes('entrevista'), false);
    assert.strictEqual(loadProfile(getProfilesDir(cfg), 'interview').instructions, 'Mis instrucciones.');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/profiles-bootstrap'`

- [ ] **Step 3: Implement the bootstrap**

`src/core/profiles-bootstrap.js`:

```js
const fs = require('fs');
const path = require('path');
const { getProfilesDir } = require('./profiles');

const BASE_INSTRUCTIONS = `You are my memory assistant, not a teleprompter. Do not tell me what to say.

When I call on you, give me what I have probably forgotten: the exact figure, the
project name, the term they just used. Keep it short — I will be reading you while
talking to someone.

If something is not in my notes, say so. Do not make it up: I would rather hear
"I don't have that" than a confident falsehood.`;

const DEFAULT_PROFILES = [
    {
        dir: 'entrevista',
        name: 'Job Interview',
        extra: 'Prioritise my concrete experience and impact figures. If they mention a technology that appears in my notes, remind me what I did with it.',
        checklist: ['Ask about the team and the day to day', 'Ask about the deployment process', 'Mention my experience leading'],
    },
    {
        dir: 'reunion',
        name: 'Work Meeting',
        extra: 'Prioritise earlier agreements and open commitments. Warn me if something already settled comes up again.',
        checklist: ['Confirm the next steps', 'Note down who does what'],
    },
    {
        dir: 'client-call',
        name: 'Client Call',
        extra: 'Prioritise the account history and whatever was promised on earlier calls.',
        checklist: ['Confirm deadlines', 'Ask about blockers'],
    },
];

function bootstrapProfiles({ configDir, legacyCustomPrompt = '' }) {
    const profilesDir = getProfilesDir(configDir);
    fs.mkdirSync(profilesDir, { recursive: true });

    const creados = [];

    for (const template of DEFAULT_PROFILES) {
        const dir = path.join(profilesDir, template.dir);
        if (fs.existsSync(path.join(dir, 'profile.md'))) continue;

        fs.mkdirSync(path.join(dir, 'context'), { recursive: true });

        const frontmatter = ['---', `name: ${template.name}`, 'confidential: false', '---', ''].join('\n');
        fs.writeFileSync(path.join(dir, 'profile.md'), `${frontmatter}\n${BASE_INSTRUCTIONS}\n\n${template.extra}\n`);
        fs.writeFileSync(path.join(dir, 'checklist.md'), template.checklist.map(t => `- ${t}`).join('\n') + '\n');

        // Keeps whatever the user had already written in the old textarea.
        const legacy = (legacyCustomPrompt || '').trim();
        if (legacy) {
            fs.writeFileSync(path.join(dir, 'context', 'migrated.md'), `${legacy}\n`);
        }

        creados.push(template.dir);
    }

    return creados;
}

module.exports = { bootstrapProfiles, BASE_INSTRUCTIONS };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Call the bootstrap on startup**

In `src/index.js`, right after `storage.initializeStorage()`:

```js
const { bootstrapProfiles } = require('./core/profiles-bootstrap');
const prefs = storage.getPreferences();
const creados = bootstrapProfiles({ configDir: storage.getConfigDir(), legacyCustomPrompt: prefs.customPrompt });
if (creados.length > 0) {
    console.log('Perfiles creados:', creados.join(', '));
}
```

- [ ] **Step 6: Delete `prompts.js` and its callers**

```bash
git rm src/utils/prompts.js
```

Remove the line `const { getSystemPrompt } = require('./prompts');` from `src/utils/gemini.js`, along with every reference to `getSystemPrompt`. Do the same in `src/utils/localai.js:3`.

- [ ] **Step 7: Verify it starts and the profiles exist on disk**

Run: `npm start`, and in another terminal:

```bash
ls -R "$HOME/Library/Application Support/cheating-daddy-config/profiles"
```

Expected: three folders with `profile.md`, `checklist.md` and `context/`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add -A src/ test/
git commit -m "feat: default profiles on disk; retire prompts.js"
```

---

### Task 12: Transcription test bench

**Files:**

- Create: `tools/transcribe-bench.js`
- Modify: `package.json` — script `bench:stt`

**Interfaces:**

- Consumes: `ensureWhisperModel`, `ensureNativeBinary`, `startNativeServer`, `waitForServer`, `getAvailablePort`, `stopNativeServer` from `src/utils/native-ai-runtime.js`
- Produces: `npm run bench:stt -- <file.wav> [model...]` prints the transcriptions side by side

Implements the "Test bench" section of [02-design.md](02-design.md). It is the tool that replaces opinion with measurement in D4.

- [ ] **Step 1: Write the tool**

`tools/transcribe-bench.js`:

```js
#!/usr/bin/env node
// Compares Whisper models over the SAME audio file.
// Uso: node tools/transcribe-bench.js grabacion.wav large-v3-turbo small.en
const fs = require('fs');
const path = require('path');
const {
    ensureNativeBinary,
    ensureWhisperModel,
    getAvailablePort,
    startNativeServer,
    stopNativeServer,
    waitForServer,
} = require('../src/utils/native-ai-runtime');

const MODELOS_POR_DEFECTO = ['tiny.en', 'small.en', 'large-v3-turbo'];

async function transcribir(baseUrl, wavPath) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(wavPath)]), path.basename(wavPath));
    form.append('response_format', 'verbose_json');

    const response = await fetch(`${baseUrl}/inference`, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const segments = Array.isArray(json.segments) ? json.segments : [];
    // B3/B10: per-segment no_speech_prob, to calibrate the hallucination filter.
    const lineas = segments.map(seg => `[${(seg.no_speech_prob ?? 0).toFixed(2)}] ${(seg.text || '').trim()}`);
    return lineas.length ? lineas.join('\n') : (json.text || '').trim();
}

async function correrModelo(binario, modelo, wavPath) {
    const modelPath = await ensureWhisperModel(modelo, () => {});
    const puerto = await getAvailablePort();
    const proceso = startNativeServer({
        executablePath: binario,
        arguments: ['-m', modelPath, '--host', '127.0.0.1', '--port', String(puerto)],
        name: `whisper-${modelo}`,
    });

    const baseUrl = `http://127.0.0.1:${puerto}`;
    try {
        await waitForServer(`${baseUrl}/`, proceso, 120000);
        const inicio = Date.now();
        const texto = await transcribir(baseUrl, wavPath);
        return { modelo, texto, ms: Date.now() - inicio };
    } finally {
        stopNativeServer(proceso);
    }
}

async function main() {
    const [wavPath, ...modelos] = process.argv.slice(2);

    if (!wavPath || !fs.existsSync(wavPath)) {
        console.error('Uso: node tools/transcribe-bench.js <archivo.wav> [modelo...]');
        process.exit(1);
    }

    const aProbar = modelos.length > 0 ? modelos : MODELOS_POR_DEFECTO;
    const binario = await ensureNativeBinary('whisper', () => {});

    for (const modelo of aProbar) {
        try {
            const { texto, ms } = await correrModelo(binario, modelo, wavPath);
            console.log(`\n${'='.repeat(70)}\n${modelo}  (${ms} ms)\n${'='.repeat(70)}\n${texto}`);
        } catch (error) {
            console.error(`\n${modelo}: ERROR — ${error.message}`);
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
```

- [ ] **Step 2: Add the script**

En `package.json`, junto a `test`:

```json
        "bench:stt": "node tools/transcribe-bench.js"
```

- [ ] **Step 3: Record 2-3 minutes of real audio and run it**

Record **two** real conversations as 16 kHz mono WAV: one with headphones and one on
speakers (B1). The second shows how much of the interviewer bleeds into your channel.
If a 10 s segment takes more than ~4 s with `large-v3-turbo`, the binary is not
accelerating with Metal (B10): try `medium.en` or recompile. Then:

Run: `npm run bench:stt -- ~/grabacion.wav`
Expected: three transcription blocks with timings. Compare them by eye: what decides is not a leaderboard's WER, but which one understands **your** audio.

- [ ] **Step 4: Commit**

```bash
npx prettier --write tools/ package.json
git add tools/transcribe-bench.js package.json
git commit -m "feat: test bench for comparing transcription models"
```

---

### Task 13: Correct resampling in the renderer

**Files:**

- Modify: `src/utils/renderer.js:371-460` — resample to 16 kHz before the IPC
- Modify: `src/utils/localai.js` — `createChannel` stops resampling

**Interfaces:**

- Consumes: nothing nuevo
- Produces: the IPC handlers receive mono PCM16 **at 16 kHz** (`mimeType: 'audio/pcm;rate=16000'`)

Fixes H7 per D11: `OfflineAudioContext` resamples with proper filtering, whereas the current linear interpolation introduces aliasing that degrades sibilants.

**Note:** this task changes the format Gemini Live expects. Verify that `byok` mode still works before calling the task done.

- [ ] **Step 1: Add resampling in the renderer**

In `src/utils/renderer.js`, add alongside the audio helpers:

```js
// OfflineAudioContext applies the anti-aliasing filter the main process's linear
// the main process never did (finding H7).
async function resampleTo16k(float32Chunk, sourceRate) {
    const offline = new OfflineAudioContext(1, Math.ceil((float32Chunk.length * 16000) / sourceRate), 16000);
    const buffer = offline.createBuffer(1, float32Chunk.length, sourceRate);
    buffer.copyToChannel(float32Chunk, 0);

    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
}
```

- [ ] **Step 2: Use it in all three audio processors**

In `setupLinuxMicProcessing`, `setupLinuxSystemAudioProcessing` and `setupWindowsLoopbackProcessing`, replace the direct conversion with:

```js
const chunk = audioBuffer.splice(0, samplesPerChunk);
const resampled = await resampleTo16k(Float32Array.from(chunk), SAMPLE_RATE);
const pcmData16 = convertFloat32ToInt16(resampled);
const base64Data = arrayBufferToBase64(pcmData16.buffer);

await ipcRenderer.invoke('send-mic-audio-content', {
    data: base64Data,
    mimeType: 'audio/pcm;rate=16000',
});
```

(In the system audio processors, the IPC channel is `send-audio-content`.)

- [ ] **Step 3: Remove resampling from the main process**

In `src/utils/localai.js`, inside `createChannel`, remove `resample24kTo16k` and `resampleRemainder`. `processLocalAudio` becomes:

```js
function processLocalAudio(pcm16k, speaker = 'them') {
    if (!isLocalActive) return;

    const channel = channels[speaker];
    if (!channel) {
        console.warn('[LocalAI] Hablante desconocido:', speaker);
        return;
    }

    channel.vad.process(pcm16k);
}
```

- [ ] **Step 4: Verify local mode**

Run: `npm start` in local mode, speak and check the transcriptions.
Expected: transcriptions at least as good as before, with cleaner sibilants.

- [ ] **Step 5: Verify byok mode**

Run: `npm start` in `byok` mode with a valid Gemini key.
Expected: Gemini Live still transcribes. If it rejects 16 kHz, revert only the `mimeType` for that mode and keep resampling active in local mode alone.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/
git add src/utils/renderer.js src/utils/localai.js
git commit -m "fix: resample to 16kHz with OfflineAudioContext instead of linear interpolation"
```

---

### Task 14: Post-session summary that feeds the profile (D17)

**Files:**

- Create: `src/core/digest.js`
- Create: `test/digest.test.js`
- Modify: `src/utils/gemini.js:1279` — the `close-session` handler generates and stores the summary
- Modify: `src/utils/renderer.js` — listener `save-session-digest`
- Modify: `src/storage.js` — `saveSession` conserva `digest`
- Modify: `src/components/views/HistoryView.js` — mostrar `digest`

**Interfaces:**

- Consumes: `sessionManager.getContext()/getProfile()` (T8), `sendPayloadToGemini` (T8), `getProfilesDir` (T4)
- Produces:
    - `buildDigestPrompt(transcript)` → `string`
    - `appendDigest({ profilesDir, profileName, digest, date, maxEntries = 20 })` → ruta escrita
    - the stored session carries `digest: string | null`

- [ ] **Step 1: Failing tests**

`test/digest.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDigestPrompt, appendDigest } = require('../src/core/digest');

test('the prompt asks for agreements, open items, names and figures', () => {
    const prompt = buildDigestPrompt('[Entrevistador]: Hola');
    assert.ok(/acuerdos/i.test(prompt));
    assert.ok(/pendientes/i.test(prompt));
    assert.ok(prompt.includes('[Entrevistador]: Hola'));
});

test('appendDigest creates history.md and appends dated entries in order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'client-call', 'context'), { recursive: true });

    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'We agreed on X.', date: '2026-08-26' });
    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'Y is pending.', date: '2026-08-27' });

    const content = fs.readFileSync(path.join(root, 'client-call', 'context', 'history.md'), 'utf8');
    assert.ok(content.includes('## 2026-08-26'));
    assert.ok(content.includes('We agreed on X.'));
    assert.ok(content.indexOf('2026-08-26') < content.indexOf('2026-08-27'));
});

test('appendDigest trims down to the last maxEntries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'p', 'context'), { recursive: true });
    for (let i = 1; i <= 5; i++) {
        appendDigest({ profilesDir: root, profileName: 'p', digest: `e${i}`, date: `2026-01-0${i}`, maxEntries: 3 });
    }

    const content = fs.readFileSync(path.join(root, 'p', 'context', 'history.md'), 'utf8');
    assert.ok(!content.includes('2026-01-01'));
    assert.ok(content.includes('2026-01-05'));
    assert.strictEqual((content.match(/^## /gm) || []).length, 3);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/digest'`

- [ ] **Step 3: Implement**

`src/core/digest.js`:

```js
const fs = require('fs');
const path = require('path');

function buildDigestPrompt(transcript) {
    return [
        'Summarise this meeting in 10-15 lines so I can read it before the next one with the same people.',
        'Sections: **Agreements**, **Open items** (who owes what), **Names and roles** mentioned, **Figures and dates** quoted.',
        'Only what was actually said. If a section would be empty, leave it out.',
        '',
        '---',
        transcript,
    ].join('\n');
}

// Appends the summary to the profile's history, which the next session loads as
// one more note (D17). Trimmed so the cached prefix cannot grow without bound.
function appendDigest({ profilesDir, profileName, digest, date, maxEntries = 20 }) {
    const file = path.join(profilesDir, profileName, 'context', 'history.md');
    fs.mkdirSync(path.dirname(ruta), { recursive: true });

    const existente = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '';
    const entries = existente
        .split(/^(?=## )/m)
        .map(e => e.trim())
        .filter(e => e.startsWith('## '));

    entries.push(`## ${date}\n\n${digest.trim()}`);
    const trimmed = entries.slice(-maxEntries);

    fs.writeFileSync(file, `# Meeting history\n\n${trimmed.join('\n\n')}\n`);
    return ruta;
}

module.exports = { buildDigestPrompt, appendDigest };
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Generate the summary when the session closes**

In `src/utils/gemini.js`, inside the `close-session` handler, before closing the providers:

```js
const ctx = sessionManager.getContext();
const profile = sessionManager.getProfile();
if (ctx && profile && ctx.getTranscript().length > 200) {
    try {
        const { buildDigestPrompt, appendDigest } = require('../core/digest');
        const { getProfilesDir } = require('../core/profiles');
        const digestPayload = {
            system: 'You summarise meetings accurately and never invent detail.',
            transcript: '',
            question: buildDigestPrompt(ctx.getTranscript()),
            image: null,
            model: profile.meta.model,
            confidential: profile.meta.confidential,
        };
        const digest = profile.meta.confidential ? await getLocalAi().sendLocalPayload(digestPayload) : await sendPayloadToGemini(digestPayload);

        appendDigest({
            profilesDir: getProfilesDir(getConfigDir()),
            profileName: profile.name,
            digest,
            date: new Date().toISOString().slice(0, 10),
        });
        sendToRenderer('save-session-digest', { sessionId: ctx.toJSON().sessionId, digest });
    } catch (error) {
        console.error('Could not generate the session summary:', error);
    }
}
sessionManager.end();
```

In `renderer.js`, alongside the other `ipcRenderer.on('save-…')` listeners:

```js
ipcRenderer.on('save-session-digest', async (event, { sessionId, digest }) => {
    const existing = await cheatingDaddy.storage.getSession(sessionId);
    await cheatingDaddy.storage.saveSession(sessionId, { ...(existing || {}), digest });
});
```

In `storage.saveSession` (modified in task 9), add to the stored object:

```js
        digest: data.digest || existingSession?.digest || null,
```

- [ ] **Step 6: Show it in the history**

In `HistoryView.js`, in the session detail, before the message thread, render
`this.selectedSession.digest` (when present) inside a `<section class="digest">`
titled "Summary", using the same `html\`…\`` pattern as the rest of the view.

- [ ] **Step 7: Verify**

Run: `npm start`, hold a session with at least 200 characters of transcript, then close it.
Expected: `profiles/<profile>/context/history.md` has an entry dated today
and `HistoryView` shows the summary.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/digest.js test/digest.test.js src/utils/gemini.js src/utils/renderer.js src/storage.js src/components/views/HistoryView.js
git commit -m "feat: post-session summary feeding the profile history"
```

---

### Task 15: Align `AGENTS.md` with the decisions (D19)

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Rewrite the contradicting sections**

Replace the **Code standards**, **Shadcn and Electron**, **Strategy and
Future Work**, **TODO** and **LLM plans** sections with:

```markdown
## Source of truth

The project's analysis, design and decisions live in `documentation/`. Read it
before touching code; `03-decisions.md` takes precedence over any instruction in
this file that contradicts it.

## Restricciones

- **CommonJS and no build step.** The main process is Node 20 (Electron 30); it uses neither ESM nor bundlers.
- **UI in Lit**, vendored in `src/assets/`. No migration to React or shadcn.
- **No new runtime dependencies** unless a decision in `03-decisions.md` says otherwise.
- **Tests with `node:test`**: run `npm test` before every commit.
- **Prettier** before every commit: `npx prettier --write .`
```

Keep **Getting started**, **Style** and **Merging upstream PRs**. In **Tests**,
replace "No automated tests yet" with the instruction to run `npm test`.

- [ ] **Step 2: Commit**

```bash
npx prettier --write AGENTS.md
git add AGENTS.md
git commit -m "docs: AGENTS.md points at documentation/ and drops the TS/React migration"
```

---

## Phase D — Honest profile authoring (D30/D31)

**Order matters.** Build the pure file boundary first, then the migration and main
process coordination, then the renderer. Do not expose a write IPC until its target
has containment checks and regression tests. Do not remove a `customPrompt` writer
until its replacement writes to a real profile file.

### Task 16: Safe, revisioned profile file API

**Files:**

- Modify: `src/core/profiles.js`
- Modify: `src/core/atomic-file.js`
- Modify: `src/core/digest.js`
- Modify: `test/profiles.test.js`
- Modify: `test/atomic-file.test.js`
- Modify: `test/digest.test.js`

**Interfaces:**

- `readProfileForEditing(profilesDir, slug)` → `{ profile, revisions }`, where
  `profile` includes `slug`, editable `meta`, `instructions`, `checklist`, and note
  `{ name, content, bytes }` values; `revisions` contains an opaque SHA-256 digest
  for each physical file.
- `writeProfile({ profilesDir, slug, profile, expectedRevision })` and
  `writeChecklist({ profilesDir, slug, items, expectedRevision })` → new revision.
  The complete document is passed and replaced atomically; a mismatched revision
  throws a typed `ProfileConflictError`.
- `writeNote({ profilesDir, slug, noteName, content, expectedRevision })`,
  `deleteNote({ profilesDir, slug, noteName, expectedRevision })` → new state.
- `createProfile({ profilesDir, displayName })` → `{ slug, profile }` and
  `deleteProfile({ profilesDir, slug })`.
- `appendDigest(...)` requires an existing, non-symlink profile directory and writes
  `history.md` atomically. It never calls `mkdir` for a profile.

- [ ] **Step 1: Write the failing core tests**

Cover these behaviours before implementation:

1. Editing name, model, confidential flag and instructions through one
   `writeProfile` preserves all four values and unknown frontmatter keys/comments.
2. A stale revision rejects the write without changing the file; the caller can read
   the replacement and retain its unsaved draft.
3. Notes reject `../x`, path separators, non-`.md` names, empty slugs and collisions;
   a valid note stays under `profiles/<slug>/context/`.
4. Checklist rejects empty entries and duplicate `slugify(text)` ids.
5. A profile name that slugifies to empty is rejected. A collision is detected using
   the real filesystem, including a differently cased existing directory on macOS.
6. `createProfile` leaves either no directory or a complete readable profile after an
   injected failure; never an incomplete directory that reserves the slug.
7. `deleteProfile` refuses the last profile and rejects a symlinked target.
8. `appendDigest` preserves an existing `history.md`, is atomic, and fails rather
   than recreating a deleted/missing profile. Replace the old test that expects it to
   create `profiles/<slug>/context`.

- [ ] **Step 2: Implement path, revision and serializer primitives**

Use `path.resolve` plus a separator-aware prefix check against the canonical
`profilesDir`; accept only validated slugs/note names, and use `lstatSync` to reject
symlinks at write/delete targets. Keep all of this in `core/profiles.js`, not in
renderer validation.

Calculate revisions from the exact UTF-8 bytes read from disk. Keep the current
minimal frontmatter parser for loading, but add a lossless frontmatter representation
for editing so unknown keys, comments and ordering survive a `profile.md` save.
Known fields are updated in that representation; malformed managed values return a
clear English validation error instead of being normalised away.

Make `writeFileAtomic` use a unique sibling temporary name rather than only the
process id. This supports future overlapping writes without one failed cleanup
removing another write's temporary file.

- [ ] **Step 3: Implement atomic profile creation and digest hardening**

Create the folder and its three initial files in a unique sibling staging directory,
then rename the completed directory to `profiles/<slug>`. Clean up only that explicit
staging path on failure. Seed `profile.md` with `BASE_INSTRUCTIONS`, an empty
`context/`, and a parseable empty `checklist.md`.

Change `appendDigest` to confirm `profile.md` exists before reading `history.md`,
read the current history at append time, and replace it with `writeFileAtomic`. Its
header and generated prose remain English.

- [ ] **Step 4: Run and commit the core boundary**

Run: `bun run test`

Expected: all profile, atomic-file and digest tests pass; the missing-profile digest
test proves an old asynchronous result cannot recreate a deleted profile.

Commit: `feat: add safe revisioned profile file writes`

### Task 17: One-time legacy migration and digest-safe deletion

**Files:**

- Modify: `src/core/profiles-bootstrap.js`
- Modify: `src/storage.js`
- Modify: `src/utils/gemini.js`
- Modify: `src/core/digest-queue.js`
- Modify: `src/index.js`
- Modify: `test/profiles-bootstrap.test.js`
- Modify: `test/storage-session.test.js`
- Modify: `test/digest-queue.test.js`

**Interfaces:**

- `migrateLegacyCustomPrompt({ configDir, legacyCustomPrompt, selectedProfile,
migrationState })` → `{ migrated, profile, migrationState }`.
- `storage` persists `customPromptMigrationVersion` only after the legacy note is
  atomically present, and persists `digestCancelled` in session metadata.
- `cancelDigestsForProfile(profileSlug)` marks matching pending work
  `{ digestPending: false, digestCancelled: true }` before deletion.

- [ ] **Step 1: Write failing migration tests**

Test a fresh install, an install whose profile folders already exist, an empty legacy
prompt, an interrupted write, and a second launch. The selected profile must receive
the legacy note once; a missing selected slug falls back through `resolveProfileName`.
An existing unrelated `migrated.md` must not be overwritten: preserve it and choose a
non-colliding legacy note name. Completion is not recorded on failure and makes a
second launch retry safely.

- [ ] **Step 2: Replace bootstrap-coupled migration**

`bootstrapProfiles` continues to create missing defaults only. Move legacy copying to
the explicit idempotent migration called after profile resolution in startup. Do not
clear `prefs.customPrompt`; D31 keeps it as a read-only compatibility value. Update
the existing bootstrap test, whose current setup only happens to observe the
`interview` copy while the implementation writes into every newly-created default.

- [ ] **Step 3: Make deletion cancel digests, not wait forever**

Before `deleteProfile` runs, atomically mark every stored session for that slug
cancelled. `generateSessionDigest` checks this mark and the existence of `profile.md`
after the provider response but before `appendDigest` or saving a digest. Pending
digest recovery (`selectPendingDigests` / drain on startup) skips cancelled records.

Regression tests must cover an in-flight response that returns after cancellation and
a restarted app: neither may recreate the folder or retry the digest. The stored
session and its event log remain untouched.

- [ ] **Step 4: Add the main-process profile IPC**

Add narrow handlers in `setupStorageIpcHandlers` for list/read/write profile,
note/checklist mutations, create and delete. Every handler returns
`{ success, data? , error?, code? }`; conflict and validation have stable `code`
values so the renderer does not parse English messages. Never expose a config path or
an arbitrary filesystem path to the renderer.

The delete handler performs cancellation then deletion. It must reject any mutation
when `sessionManager` has a live context, even if a renderer invokes IPC directly.
Expose a minimal `isSessionActive()` query from the session boundary rather than
reaching into its closure. Re-check this invariant in the handler immediately before
the mutation.

- [ ] **Step 5: Run and commit integration logic**

Run: `bun run test`

Expected: migration is exactly-once, cancellation survives restart, and all legacy
session metadata remains readable.

Commit: `feat: migrate legacy context and guard profile deletion`

### Task 18: Replace the decorative UI with the profile editor

**Files:**

- Replace: `src/components/views/AICustomizeView.js` with the D30 editor
- Modify: `src/components/app/CheatingDaddyApp.js`
- Modify: `src/components/views/CustomizeView.js`
- Modify: `src/components/views/OnboardingView.js`
- Modify: `src/components/views/HistoryView.js`
- Modify: the renderer-side `cheatingDaddy` bridge that exposes storage IPC

**Interfaces:**

- The editor receives `{ selectedProfile, availableProfiles, sessionActive }` and
  callbacks to select the next-session profile and refresh the list after mutations.
- Each loaded region retains its server revision and reports `Saving…`, `Saved HH:MM`,
  `Save failed`, or `Changed outside the app — reload or copy your draft`.

- [ ] **Step 1: Build the read-only master-detail shell**

Render the profile list, active-profile indicator, immutable slug, name/model/
confidential controls, instructions, one selected note, checklist, create and inline
delete confirmation. Use the approved D30 copy in English. The selected editor
profile and the profile active for the next session must be visibly distinct when
they differ.

While `sessionActive`, disable _every_ mutation control and show `Session running —
end it to edit this profile.` Do not rely only on this UI lock; task 17 owns the
authoritative main-process lock.

- [ ] **Step 2: Implement ordered autosave and conflict recovery**

Debounce each region by about 700 ms; flush on blur, profile switch and view exit.
For `profile.md`, merge local field changes into one document model and serialize all
writes through one promise queue. Notes and checklist have independent queues. A late
response for an obsolete edit must not replace the latest revision/status.

On a `PROFILE_CONFLICT`, stop that region's queue, preserve the unsaved draft in
memory, fetch the current disk version, and offer Reload and Copy draft. Never retry
automatically. A normal reload updates its revision and restarts autosave only after
the user edits again.

- [ ] **Step 3: Wire creation, deletion and onboarding**

Create asks only for a display name, lets the main process derive the slug, refreshes
the list, selects the new profile, and makes it the next-session profile only if the
user chooses it. Delete confirms inline; after success it refreshes the list and
switches `selectedProfile` to the first survivor if needed.

Replace onboarding's `customPrompt` write with an atomic write to a non-colliding
`context/onboarding.md` in the resolved selected profile. If onboarding text is
empty, do not create the file. If it conflicts, keep onboarding open and show the
error rather than marking onboarding complete.

Remove both `customPrompt` textareas: this editor replaces `AICustomizeView`; the
Settings view retains only real settings/keybinds. Its Restore defaults action must
not write `customPrompt`.

- [ ] **Step 4: Fix historical profile presentation without rewriting history**

`HistoryView` obtains current display names from `describeProfiles()` and falls back
to the stored raw slug for deleted profiles. Do not reassign, edit, or rewrite a
stored session's profile. Preserve old `session.json.customPrompt` display for legacy
sessions; D31 retires a preference, not historical metadata.

- [ ] **Step 5: Manual verification and commit**

Run `bun run start` and verify: create profile; edit every `profile.md` field quickly;
edit a note in an external editor before autosave; resolve the conflict without
losing the draft; attempt edits during a session; delete a profile after ending a
session with a deliberately delayed digest; restart; inspect the profile folder and
history.

Commit: `feat: replace custom prompt UI with profile editor`

### Task 19: Regression pass and removal audit for D31

**Files:**

- Modify: tests touched by tasks 16–18
- Modify: `documentation/08-shipped.md` after manual verification

- [ ] **Step 1: Audit every `customPrompt` occurrence**

Use `rg -n "customPrompt" src test` and classify each result as one of: legacy
preference migration, historical session metadata, Live compatibility parameter, or
a prohibited UI/preference writer. Remove only the last class. In particular, ensure
there is no `storage.updatePreference('customPrompt', ...)` and no default-reset
assignment to it.

- [ ] **Step 2: Run the full verification matrix**

Run `bun run test`, `npx prettier --check .`, and `bun run start`. Exercise a fresh
profile, an upgraded profile with legacy text, a deleted profile's stored session,
and a confidential profile. Confirm all user-visible errors and logs are English.

- [ ] **Step 3: Record results and commit**

Document observed behaviour, migration outcomes and any deferred edge case in
`08-shipped.md` or `07-backlog.md`; do not mark a speculative manual scenario as
verified. Commit: `test: cover profile editor regressions`

## Final verification

- [ ] `bun run test` — every test passes
- [ ] `npx prettier --check .` — no differences
- [ ] `bun run start` starts with no console errors
- [ ] A full session: chosen profile → labelled dual transcription → shortcut → answer with the context of notes + conversation + screen
- [ ] `HistoryView` shows the session thread, and a migrated legacy session too
- [ ] The window still does not appear when sharing the screen in Google Meet (H1 not broken)
- [ ] With default preferences `whisper-server` starts and `llama-server` does **not** (D14)
- [ ] A typed question gets an answer with notes and transcript (D15)
- [ ] Closing a session produces a new entry in `context/history.md` (D17)
- [ ] Legacy `customPrompt` migrates once into the resolved selected profile and is
      never silently cleared (D31)
- [ ] A stale editor revision cannot overwrite a hand edit; its draft remains
      recoverable (D30)
- [ ] No profile, note, creation or deletion IPC can escape `profiles/`, including
      through a symlink (D30)
- [ ] Creating a profile leaves a complete folder or none; deleting one cannot be
      reversed by a late digest response (D30)
- [ ] The profile editor is read-only during a live session in both renderer and main
      process, and stored sessions retain their original raw profile slug (D30)
