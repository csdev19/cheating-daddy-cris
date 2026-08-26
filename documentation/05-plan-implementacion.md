# Plan de implementación — Asistente de memoria

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Goal:** Convertir `cheating-daddy` de teleprompter en asistente de memoria: un hilo único de contexto (audio + pantalla + notas), perfiles como carpetas de markdown, audio dual etiquetado por hablante y transcripción local fiable.

**Architecture:** Se introduce `src/core/` con módulos puros y testeables (hilo de eventos, perfiles, ensamblado de payload, VAD). `gemini.js` queda reducido a adaptador de proveedor. La captura sigue en el renderer; el razonamiento solo ocurre cuando el usuario pulsa el atajo (diseño reactivo).

**Tech Stack:** Electron 30 (Node 20), CommonJS, Lit vendorizado en `src/assets/`, `whisper.cpp` vía `whisper-server`, `@google/genai`. Tests con `node:test` (nativo, cero dependencias).

**Spec:** [`documentation/02-diseno.md`](02-diseno.md) · decisiones en [`documentation/03-decisiones.md`](03-decisiones.md) · hallazgos en [`documentation/01-estado-actual.md`](01-estado-actual.md)

> ✅ **Enmiendas de la auditoría aplicadas** (2026-08-26): Tareas 7, 8, 10 y 12 ampliadas; nuevas 7b, 14 y 15. Ver [06-auditoria.md](06-auditoria.md).

## Global Constraints

- **CommonJS obligatorio.** Todo `src/core/**` y `src/utils/**` usa `require`/`module.exports`. El main process es Node 20 y **no puede** hacer `require()` de ESM.
- **Cero dependencias nuevas de runtime.** No añadir paquetes a `dependencies`. Tests con `node:test` nativo.
- **Estilo Prettier** (`.prettierrc`): 4 espacios, `printWidth` 150, comillas simples, punto y coma, `trailingComma: es5`, `arrowParens: avoid`. Ejecutar `npx prettier --write .` antes de cada commit.
- **Sin build step.** No introducir webpack/vite/rollup/esbuild/TypeScript.
- **Formato de audio:** ambos canales llegan como **PCM16 mono a 24 kHz**, en chunks de **0,1 s** (`AUDIO_CHUNK_DURATION = 0.1`, `SAMPLE_RATE = 24000` en `renderer.js:10-11`). Whisper consume **16 kHz**.
- **Etiquetas de hablante:** exactamente `'them'` (audio del sistema) y `'me'` (micrófono). Nunca inferir por diarización (D6).
- **Modelos Whisper nuevos** (verificados el 2026-08-25 contra `huggingface.co/ggerganov/whisper.cpp`):
    - `large-v3-turbo` → `ggml-large-v3-turbo.bin`, sha256 `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69`, 1 624 555 275 bytes
    - `medium.en` → `ggml-medium.en.bin`, sha256 `cc37e93478338ec7700281a7ac30a10128929eb8f427dda2e865faa8f6da4356`, 1 533 774 781 bytes
- **Directorio de config:** siempre vía `storage.getConfigDir()`. Nunca construir rutas de `~` a mano.

---

## Estructura de archivos

**Se crean:**

| Archivo                        | Responsabilidad                                              |
| ------------------------------ | ------------------------------------------------------------ |
| `src/core/vad.js`              | Detección de voz por instancia (una por canal), con pre-roll |
| `src/core/session-context.js`  | El hilo único de eventos de la sesión                        |
| `src/core/profiles.js`         | Leer perfiles del disco (frontmatter + markdowns)            |
| `src/core/payload.js`          | Ensamblar el payload ordenado para caching                   |
| `test/vad.test.js`             | Tests de VAD                                                 |
| `test/session-context.test.js` | Tests del hilo                                               |
| `test/profiles.test.js`        | Tests de perfiles                                            |
| `test/payload.test.js`         | Tests de ensamblado                                          |
| `test/helpers/pcm.js`          | Generadores de PCM para tests                                |
| `tools/transcribe-bench.js`    | Banco de pruebas de transcripción                            |

**Se modifican:**

| Archivo                                 | Cambio                                               |
| --------------------------------------- | ---------------------------------------------------- |
| `package.json`                          | Script `test`                                        |
| `src/utils/native-ai-runtime.js:49`     | Catálogo Whisper ampliado                            |
| `src/storage.js:35`                     | Default `whisperModel`; esquema de sesión            |
| `src/utils/localai.js`                  | VAD por canal, `processLocalAudio(chunk, speaker)`   |
| `src/utils/gemini.js`                   | Enrutar hablante, emitir eventos al hilo             |
| `src/utils/renderer.js`                 | Screenshot reorientado, captura automática eliminada |
| `src/components/views/MainView.js:1299` | Desplegable de modelos Whisper                       |

**Se eliminan (Tarea 11):** `src/utils/prompts.js`

---

## Fases

- **Fase A (Tareas 1-5)** — núcleo puro y testeable. No cambia comportamiento visible.
- **Fase B (Tareas 6-9, incl. 7b)** — transcripción fiable y audio dual. Aquí se nota la mejora.
- **Fase C (Tareas 10-15)** — perfiles, screenshot y banco de pruebas.

Cada fase deja la app funcionando.

---

## Fase A — Núcleo

### Tarea 1: Infraestructura de tests

**Files:**

- Modify: `package.json`
- Create: `test/smoke.test.js`
- Create: `test/helpers/pcm.js`

**Interfaces:**

- Consumes: nada
- Produces: `npm test` ejecuta `node --test test/`. Helper `makePcm16({ samples, amplitude })` → `Buffer` PCM16 mono little-endian, usado por todas las tareas siguientes.

- [ ] **Step 1: Escribir el test de humo**

`test/smoke.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');

test('el runner de tests funciona', () => {
    assert.strictEqual(1 + 1, 2);
});
```

- [ ] **Step 2: Añadir el script de test**

En `package.json`, reemplazar la línea del script `lint` por estas dos:

```json
        "lint": "echo \"No linting configured\"",
        "test": "node --test test/"
```

- [ ] **Step 3: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 4: Escribir el helper de PCM**

`test/helpers/pcm.js`:

```js
// Genera PCM16 mono little-endian. amplitude va de 0 (silencio) a 1 (fondo de escala).
// Usa ruido determinista para que el RMS sea estable entre ejecuciones.
function makePcm16({ samples, amplitude = 0 }) {
    const buffer = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        // Alterna signo para que la media sea ~0 y el RMS sea ~amplitude.
        const value = Math.round((i % 2 === 0 ? 1 : -1) * amplitude * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
    }
    return buffer;
}

// Un frame de 100 ms a 16 kHz = 1600 muestras.
function frame16k(amplitude) {
    return makePcm16({ samples: 1600, amplitude });
}

// Un frame de 100 ms a 24 kHz = 2400 muestras.
function frame24k(amplitude) {
    return makePcm16({ samples: 2400, amplitude });
}

module.exports = { makePcm16, frame16k, frame24k };
```

- [ ] **Step 5: Verificar que el helper produce el RMS esperado**

Añadir a `test/smoke.test.js`:

```js
const { frame16k } = require('./helpers/pcm');

test('el helper de PCM produce el tamaño y la amplitud esperados', () => {
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
git commit -m "test: añadir runner con node:test y helpers de PCM"
```

---

### Tarea 2: Módulo VAD por canal

**Files:**

- Create: `src/core/vad.js`
- Create: `test/vad.test.js`

**Interfaces:**

- Consumes: `test/helpers/pcm.js` (Tarea 1)
- Produces:
    - `VAD_MODES` — objeto con `NORMAL`, `AGGRESSIVE`, `VERY_AGGRESSIVE`
    - `calculateRms(pcm16Buffer: Buffer): number`
    - `createVad({ mode?, preRollFrames?, onSpeechEnd })` → `{ process(pcm16kBuffer: Buffer): void, reset(): void, isSpeaking(): boolean }`
    - `onSpeechEnd` recibe `(audioData: Buffer)` con el pre-roll ya incluido.

Extrae la lógica de `localai.js:65-110` a un módulo con **estado por instancia** (hoy es estado de módulo compartido, por eso los dos canales se pisan) y le añade el pre-roll de D5.

- [ ] **Step 1: Escribir los tests que fallan**

`test/vad.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createVad, calculateRms, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

test('calculateRms devuelve 0 para silencio', () => {
    assert.strictEqual(calculateRms(frame16k(0)), 0);
});

test('calculateRms se aproxima a la amplitud de la señal', () => {
    const rms = calculateRms(frame16k(0.5));
    assert.ok(rms > 0.45 && rms < 0.55, `rms fuera de rango: ${rms}`);
});

test('no dispara onSpeechEnd si nunca hubo voz', () => {
    let llamadas = 0;
    const vad = createVad({ onSpeechEnd: () => llamadas++ });
    for (let i = 0; i < 50; i++) vad.process(frame16k(0));
    assert.strictEqual(llamadas, 0);
});

test('detecta voz tras speechFramesRequired frames', () => {
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => {} });
    assert.strictEqual(vad.isSpeaking(), false);
    for (let i = 0; i < VAD_MODES.NORMAL.speechFramesRequired; i++) vad.process(frame16k(0.5));
    assert.strictEqual(vad.isSpeaking(), true);
});

test('cierra el segmento tras silenceFramesRequired frames de silencio', () => {
    const segmentos = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: b => segmentos.push(b) });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));
    assert.strictEqual(segmentos.length, 1);
    assert.strictEqual(vad.isSpeaking(), false);
});

test('el pre-roll incluye audio anterior al inicio de voz', () => {
    const segmentos = [];
    // preRollFrames: 3 → 3 frames de 1600 muestras = 4800 muestras = 9600 bytes de pre-roll.
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 3, onSpeechEnd: b => segmentos.push(b) });

    for (let i = 0; i < 5; i++) vad.process(frame16k(0)); // silencio previo
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5)); // voz
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    assert.strictEqual(segmentos.length, 1);
    // 10 frames de voz + 3 de pre-roll = 13 frames × 3200 bytes.
    assert.strictEqual(segmentos[0].length, 13 * 3200);
});

test('dos instancias no comparten estado', () => {
    const a = createVad({ onSpeechEnd: () => {} });
    const b = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) a.process(frame16k(0.5));
    assert.strictEqual(a.isSpeaking(), true);
    assert.strictEqual(b.isSpeaking(), false);
});

test('reset limpia el estado', () => {
    const vad = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    vad.reset();
    assert.strictEqual(vad.isSpeaking(), false);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/vad'`

- [ ] **Step 3: Implementar el módulo**

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

// Un VAD independiente por canal de audio. El estado vive en el closure, no en el módulo,
// para que el canal del sistema y el del micrófono no se pisen (ver D6).
function createVad({ mode = VAD_MODES.NORMAL, preRollFrames = 3, onSpeechEnd } = {}) {
    if (typeof onSpeechEnd !== 'function') {
        throw new TypeError('createVad requiere un callback onSpeechEnd');
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
                // Arrancamos el segmento con el pre-roll: el ataque de la frase suele
                // caer por debajo del umbral y es justo lo que más se pierde con acento.
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

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS, todos los tests de `vad.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/vad.js test/vad.test.js
git commit -m "feat: VAD por canal con pre-roll de 300ms"
```

---

### Tarea 3: Hilo único de contexto

**Files:**

- Create: `src/core/session-context.js`
- Create: `test/session-context.test.js`

**Interfaces:**

- Consumes: nada
- Produces:
    - `createSessionContext({ sessionId, profileName, now? })` → objeto con:
        - `addSpeech({ speaker: 'them'|'me', text, t? })`
        - `addScreen({ imageRef, caption?, t? })`
        - `addAsk({ question, answer, t? })`
        - `addChecklist({ itemId, status, t? })`
        - `getEvents()` → array ordenado por `t` ascendente
        - `getTranscript()` → string con líneas `[Entrevistador]:` / `[Yo]:`
        - `getChecklistState()` → `Map<itemId, status>` (último estado gana)
        - `toJSON()` → objeto serializable para persistir
    - `fromJSON(obj)` → contexto restaurado

Sustituye a `conversationHistory` y `screenAnalysisHistory` (H3), que hoy son dos arrays que nunca se fusionan.

- [ ] **Step 1: Escribir los tests que fallan**

`test/session-context.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createSessionContext, fromJSON } = require('../src/core/session-context');

function nuevoContexto() {
    let reloj = 1000;
    return createSessionContext({ sessionId: 's1', profileName: 'entrevista', now: () => reloj++ });
}

test('empieza vacío', () => {
    const ctx = nuevoContexto();
    assert.deepStrictEqual(ctx.getEvents(), []);
    assert.strictEqual(ctx.getTranscript(), '');
});

test('acumula voz de ambos hablantes en un solo hilo', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: '¿Cuál es tu experiencia con Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Cinco años.' });

    const eventos = ctx.getEvents();
    assert.strictEqual(eventos.length, 2);
    assert.strictEqual(eventos[0].kind, 'speech');
    assert.strictEqual(eventos[0].speaker, 'them');
    assert.strictEqual(eventos[1].speaker, 'me');
});

test('pantalla y voz conviven en el mismo hilo, ordenados por tiempo', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Mira este código.' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addSpeech({ speaker: 'me', text: 'Ya lo veo.' });

    const kinds = ctx.getEvents().map(e => e.kind);
    assert.deepStrictEqual(kinds, ['speech', 'screen', 'speech']);
});

test('ordena por marca de tiempo aunque lleguen desordenados', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'me', text: 'segundo', t: 200 });
    ctx.addSpeech({ speaker: 'them', text: 'primero', t: 100 });

    assert.deepStrictEqual(
        ctx.getEvents().map(e => e.text),
        ['primero', 'segundo']
    );
});

test('el transcript etiqueta a cada hablante', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Hola' });
    ctx.addSpeech({ speaker: 'me', text: 'Buenas' });

    assert.strictEqual(ctx.getTranscript(), '[Entrevistador]: Hola\n[Yo]: Buenas');
});

test('el transcript ignora eventos que no son voz', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Hola' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addAsk({ question: '¿qué digo?', answer: 'esto' });

    assert.strictEqual(ctx.getTranscript(), '[Entrevistador]: Hola');
});

test('rechaza hablantes desconocidos', () => {
    const ctx = nuevoContexto();
    assert.throws(() => ctx.addSpeech({ speaker: 'otro', text: 'x' }), /speaker/);
});

test('descarta texto vacío o solo espacios', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: '   ' });
    ctx.addSpeech({ speaker: 'them', text: '' });
    assert.strictEqual(ctx.getEvents().length, 0);
});

test('el checklist conserva el último estado de cada ítem', () => {
    const ctx = nuevoContexto();
    ctx.addChecklist({ itemId: 'preguntar-salario', status: 'pending' });
    ctx.addChecklist({ itemId: 'mencionar-k8s', status: 'done' });
    ctx.addChecklist({ itemId: 'preguntar-salario', status: 'done' });

    const estado = ctx.getChecklistState();
    assert.strictEqual(estado.get('preguntar-salario'), 'done');
    assert.strictEqual(estado.get('mencionar-k8s'), 'done');
});

test('sobrevive a un round-trip por JSON', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Hola' });
    ctx.addScreen({ imageRef: 'img-1', caption: 'un IDE' });

    const restaurado = fromJSON(JSON.parse(JSON.stringify(ctx.toJSON())));
    assert.strictEqual(restaurado.getTranscript(), '[Entrevistador]: Hola');
    assert.strictEqual(restaurado.getEvents().length, 2);
    assert.strictEqual(restaurado.toJSON().sessionId, 's1');
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/session-context'`

- [ ] **Step 3: Implementar el módulo**

`src/core/session-context.js`:

```js
const SPEAKERS = ['them', 'me'];
const SPEAKER_LABELS = { them: 'Entrevistador', me: 'Yo' };

// El hilo único de la sesión. Sustituye a conversationHistory + screenAnalysisHistory,
// que vivían separados y nunca llegaban juntos al modelo (ver hallazgo H3).
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

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS, todos los tests de `session-context.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/session-context.js test/session-context.test.js
git commit -m "feat: hilo único de contexto de sesión"
```

---

### Tarea 4: Perfiles desde disco

**Files:**

- Create: `src/core/profiles.js`
- Create: `test/profiles.test.js`

**Interfaces:**

- Consumes: `storage.getConfigDir()` (ya exportado en `src/storage.js:500`)
- Produces:
    - `getProfilesDir(configDir)` → `string`
    - `parseFrontmatter(raw)` → `{ meta: object, body: string }`
    - `listProfiles(profilesDir)` → `string[]` (nombres de carpeta, ordenados)
    - `loadProfile(profilesDir, name)` → `{ name, meta: { name, confidential, model }, instructions, contextFiles: [{ file, content }], checklist: [{ id, text }] }`

Implementa D7. El frontmatter se parsea a mano (solo `clave: valor`) para respetar la restricción de cero dependencias nuevas.

- [ ] **Step 1: Escribir los tests que fallan**

`test/profiles.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseFrontmatter, listProfiles, loadProfile, getProfilesDir } = require('../src/core/profiles');

function crearPerfilDePrueba() {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    const perfil = path.join(raiz, 'entrevista-backend');
    fs.mkdirSync(path.join(perfil, 'context'), { recursive: true });

    fs.writeFileSync(
        path.join(perfil, 'profile.md'),
        ['---', 'name: Entrevista Backend', 'confidential: false', 'model: gemini-3.7-flash', '---', '', 'No me dictes qué decir.'].join('\n')
    );
    fs.writeFileSync(path.join(perfil, 'checklist.md'), '- Preguntar por el equipo\n- Mencionar Kubernetes\n\n- \n');
    fs.writeFileSync(path.join(perfil, 'context', 'cv.md'), '15 años de backend.');
    fs.writeFileSync(path.join(perfil, 'context', 'cifras.md'), 'Reduje latencia un 40%.');

    return raiz;
}

test('getProfilesDir cuelga de la carpeta de config', () => {
    assert.strictEqual(getProfilesDir('/tmp/cfg'), path.join('/tmp/cfg', 'profiles'));
});

test('parseFrontmatter separa metadatos y cuerpo', () => {
    const { meta, body } = parseFrontmatter('---\nname: Prueba\nconfidential: true\n---\n\nCuerpo aquí.');
    assert.strictEqual(meta.name, 'Prueba');
    assert.strictEqual(meta.confidential, true);
    assert.strictEqual(body, 'Cuerpo aquí.');
});

test('parseFrontmatter tolera un archivo sin frontmatter', () => {
    const { meta, body } = parseFrontmatter('Solo cuerpo.');
    assert.deepStrictEqual(meta, {});
    assert.strictEqual(body, 'Solo cuerpo.');
});

test('parseFrontmatter convierte booleanos pero deja el resto como texto', () => {
    const { meta } = parseFrontmatter('---\na: true\nb: false\nc: gemini-3.7-flash\n---\nx');
    assert.strictEqual(meta.a, true);
    assert.strictEqual(meta.b, false);
    assert.strictEqual(meta.c, 'gemini-3.7-flash');
});

test('listProfiles devuelve las carpetas ordenadas', () => {
    const raiz = crearPerfilDePrueba();
    fs.mkdirSync(path.join(raiz, 'aaa-primero'));
    assert.deepStrictEqual(listProfiles(raiz), ['aaa-primero', 'entrevista-backend']);
});

test('listProfiles devuelve vacío si el directorio no existe', () => {
    assert.deepStrictEqual(listProfiles('/ruta/que/no/existe'), []);
});

test('loadProfile lee instrucciones, contexto y checklist', () => {
    const raiz = crearPerfilDePrueba();
    const perfil = loadProfile(raiz, 'entrevista-backend');

    assert.strictEqual(perfil.meta.name, 'Entrevista Backend');
    assert.strictEqual(perfil.meta.confidential, false);
    assert.strictEqual(perfil.meta.model, 'gemini-3.7-flash');
    assert.strictEqual(perfil.instructions, 'No me dictes qué decir.');

    // Ordenados por nombre de archivo para que el prefijo cacheado sea estable.
    assert.deepStrictEqual(
        perfil.contextFiles.map(f => f.file),
        ['cifras.md', 'cv.md']
    );
    assert.strictEqual(perfil.contextFiles[1].content, '15 años de backend.');
});

test('loadProfile parsea el checklist e ignora líneas vacías', () => {
    const raiz = crearPerfilDePrueba();
    const perfil = loadProfile(raiz, 'entrevista-backend');

    assert.strictEqual(perfil.checklist.length, 2);
    assert.strictEqual(perfil.checklist[0].text, 'Preguntar por el equipo');
    assert.strictEqual(perfil.checklist[0].id, 'preguntar-por-el-equipo');
});

test('loadProfile funciona sin checklist ni carpeta context', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    fs.mkdirSync(path.join(raiz, 'minimo'));
    fs.writeFileSync(path.join(raiz, 'minimo', 'profile.md'), 'Solo instrucciones.');

    const perfil = loadProfile(raiz, 'minimo');
    assert.deepStrictEqual(perfil.contextFiles, []);
    assert.deepStrictEqual(perfil.checklist, []);
    assert.strictEqual(perfil.meta.name, 'minimo');
});

test('loadProfile falla claramente si el perfil no existe', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    assert.throws(() => loadProfile(raiz, 'inexistente'), /inexistente/);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/profiles'`

- [ ] **Step 3: Implementar el módulo**

`src/core/profiles.js`:

```js
const fs = require('fs');
const path = require('path');

function getProfilesDir(configDir) {
    return path.join(configDir, 'profiles');
}

// Parser mínimo de frontmatter: solo pares `clave: valor` en la cabecera.
// Suficiente para name/confidential/model, y evita añadir una dependencia de YAML.
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
        // Quitamos comentario al final de línea y comillas envolventes.
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
    const ruta = path.join(profileDir, 'checklist.md');
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

    // Orden alfabético estable: el prefijo cacheado no debe cambiar entre invocaciones.
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
        throw new Error(`El perfil '${name}' no tiene profile.md en ${profileDir}`);
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

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS, todos los tests de `profiles.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/profiles.js test/profiles.test.js
git commit -m "feat: perfiles como carpetas de markdown"
```

---

### Tarea 5: Ensamblado del payload

**Files:**

- Create: `src/core/payload.js`
- Create: `test/payload.test.js`

**Interfaces:**

- Consumes: `loadProfile()` (Tarea 4), `createSessionContext()` (Tarea 3)
- Produces: `buildPayload({ profile, sessionContext, question, image })` → `{ system, transcript, question, image, model, confidential }`

El orden importa: `system` es el **prefijo estable** que se cachea toda la reunión; `transcript` y `image` son lo volátil y van después. Ver la sección "Ensamblado del payload" de [02-diseno.md](02-diseno.md).

- [ ] **Step 1: Escribir los tests que fallan**

`test/payload.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { buildPayload } = require('../src/core/payload');
const { createSessionContext } = require('../src/core/session-context');

const perfilDePrueba = {
    name: 'entrevista-backend',
    meta: { name: 'Entrevista Backend', confidential: false, model: 'gemini-3.7-flash' },
    instructions: 'No me dictes qué decir.',
    contextFiles: [
        { file: 'cifras.md', content: 'Reduje latencia un 40%.' },
        { file: 'cv.md', content: '15 años de backend.' },
    ],
    checklist: [
        { id: 'preguntar-equipo', text: 'Preguntar por el equipo' },
        { id: 'mencionar-k8s', text: 'Mencionar Kubernetes' },
    ],
};

function contextoConVoz() {
    let reloj = 1000;
    const ctx = createSessionContext({ sessionId: 's1', now: () => reloj++ });
    ctx.addSpeech({ speaker: 'them', text: '¿Qué has hecho con Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Backend a escala.' });
    return ctx;
}

test('el system incluye instrucciones y todos los archivos de contexto', () => {
    const p = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: '¿qué digo?' });
    assert.ok(p.system.includes('No me dictes qué decir.'));
    assert.ok(p.system.includes('Reduje latencia un 40%.'));
    assert.ok(p.system.includes('15 años de backend.'));
});

test('el system NO incluye el transcript (debe quedar fuera del prefijo cacheado)', () => {
    const p = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: '¿qué digo?' });
    assert.ok(!p.system.includes('Backend a escala.'));
    assert.ok(p.transcript.includes('Backend a escala.'));
});

test('el system es idéntico entre invocaciones aunque crezca el transcript', () => {
    const ctx = contextoConVoz();
    const primero = buildPayload({ profile: perfilDePrueba, sessionContext: ctx, question: 'a' });
    ctx.addSpeech({ speaker: 'them', text: 'Una pregunta más.' });
    const segundo = buildPayload({ profile: perfilDePrueba, sessionContext: ctx, question: 'b' });

    assert.strictEqual(primero.system, segundo.system);
    assert.notStrictEqual(primero.transcript, segundo.transcript);
});

test('el checklist aparece con su estado actual', () => {
    const ctx = contextoConVoz();
    ctx.addChecklist({ itemId: 'mencionar-k8s', status: 'done' });

    const p = buildPayload({ profile: perfilDePrueba, sessionContext: ctx, question: 'x' });
    assert.ok(p.system.includes('Preguntar por el equipo'));
    assert.ok(p.system.includes('Mencionar Kubernetes'));
});

test('propaga modelo y flag de confidencialidad del perfil', () => {
    const p = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: 'x' });
    assert.strictEqual(p.model, 'gemini-3.7-flash');
    assert.strictEqual(p.confidential, false);

    const confidencial = { ...perfilDePrueba, meta: { ...perfilDePrueba.meta, confidential: true } };
    assert.strictEqual(buildPayload({ profile: confidencial, sessionContext: contextoConVoz(), question: 'x' }).confidential, true);
});

test('la imagen es opcional y se propaga tal cual', () => {
    const sinImagen = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: 'x' });
    assert.strictEqual(sinImagen.image, null);

    const conImagen = buildPayload({
        profile: perfilDePrueba,
        sessionContext: contextoConVoz(),
        question: 'x',
        image: { data: 'YWJj', mimeType: 'image/jpeg' },
    });
    assert.strictEqual(conImagen.image.data, 'YWJj');
});

test('funciona con un perfil sin contexto ni checklist', () => {
    const minimo = { name: 'm', meta: { name: 'M', confidential: false, model: null }, instructions: 'Sé breve.', contextFiles: [], checklist: [] };
    const p = buildPayload({ profile: minimo, sessionContext: contextoConVoz(), question: 'x' });
    assert.ok(p.system.includes('Sé breve.'));
    assert.strictEqual(p.model, null);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/payload'`

- [ ] **Step 3: Implementar el módulo**

`src/core/payload.js`:

```js
// Ensambla el payload en el orden que exige el prompt caching:
// estable primero (instrucciones + notas + checklist), volátil después
// (transcript + imagen + pregunta). Si el prefijo cambia entre invocaciones
// la caché se invalida entera, así que aquí nada puede depender del tiempo
// ni del contenido de la conversación.
function buildPayload({ profile, sessionContext, question, image = null }) {
    if (!profile) throw new TypeError('buildPayload requiere profile');
    if (!sessionContext) throw new TypeError('buildPayload requiere sessionContext');

    const secciones = [profile.instructions];

    if (profile.contextFiles.length > 0) {
        const notas = profile.contextFiles.map(f => `### ${f.file}\n\n${f.content}`).join('\n\n');
        secciones.push(`## Mis notas\n\n${notas}`);
    }

    if (profile.checklist.length > 0) {
        const items = profile.checklist.map(i => `- [${i.id}] ${i.text}`).join('\n');
        secciones.push(`## Checklist de la sesión\n\n${items}`);
    }

    return {
        system: secciones.join('\n\n'),
        transcript: sessionContext.getTranscript(),
        question: (question || '').trim(),
        image,
        model: profile.meta.model || null,
        confidential: profile.meta.confidential === true,
    };
}

module.exports = { buildPayload };
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS, todos los tests de `payload.test.js`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/core/ test/
git add src/core/payload.js test/payload.test.js
git commit -m "feat: ensamblado de payload ordenado para caching"
```

---

## Fase B — Transcripción y audio dual

### Tarea 6: Ampliar el catálogo de modelos Whisper

**Files:**

- Modify: `src/utils/native-ai-runtime.js:49-67` (objeto `WHISPER_MODELS`)
- Modify: `src/storage.js:35` (default `whisperModel`)
- Modify: `src/components/views/MainView.js:1299-1303` (desplegable)

**Interfaces:**

- Consumes: nada
- Produces: claves de modelo `large-v3-turbo` y `medium.en` aceptadas por `ensureWhisperModel()`

Implementa D4. Los hashes están en **Global Constraints** y fueron verificados contra Hugging Face; no los sustituyas por otros.

- [ ] **Step 1: Añadir los modelos al catálogo**

En `src/utils/native-ai-runtime.js`, dentro de `WHISPER_MODELS`, tras la entrada `small.en`:

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

- [ ] **Step 2: Cambiar el default de `normalizeWhisperModel`**

En `src/utils/native-ai-runtime.js:181`, cambiar el fallback final:

```js
return legacyModels[modelName] || modelName || 'large-v3-turbo';
```

- [ ] **Step 3: Cambiar el default en preferencias**

En `src/storage.js:35`, dentro de `DEFAULT_PREFERENCES`:

```js
    whisperModel: 'large-v3-turbo',
```

- [ ] **Step 4: Actualizar el desplegable de la UI**

En `src/components/views/MainView.js`, reemplazar las tres `<option>` de modelos Whisper por estas cinco:

```js
                            <option value="large-v3-turbo" ?selected=${this._whisperModel === 'large-v3-turbo'}>Large v3 Turbo (1.6 GB, multilingüe, recomendado)</option>
                            <option value="medium.en" ?selected=${this._whisperModel === 'medium.en'}>Medium English (1.5 GB)</option>
                            <option value="small.en" ?selected=${this._whisperModel === 'small.en'}>Small English (466 MB)</option>
                            <option value="base.en" ?selected=${this._whisperModel === 'base.en'}>Base English (142 MB)</option>
                            <option value="tiny.en" ?selected=${this._whisperModel === 'tiny.en'}>Tiny English (75 MB, el más rápido)</option>
```

Y en `MainView.js:739` y `:778`, cambiar `'tiny.en'` por `'large-v3-turbo'`.

- [ ] **Step 5: Quitar el idioma cableado a inglés**

`src/utils/localai.js:145` fija `formData.append('language', 'en')`. Con un modelo
multilingüe eso anula la autodetección y fuerza decodificación en inglés — justo lo
que D4 quiere evitar. En `transcribeAudio`, sustituir esa línea por:

```js
// Los modelos .en solo saben inglés; los multilingües deben autodetectar.
// Enviar language='en' a un modelo multilingüe fuerza mal el decodificado.
const modeloActual = normalizeWhisperModel(currentWhisperModel);
if (modeloActual.endsWith('.en')) {
    formData.append('language', 'en');
} else {
    formData.append('language', 'auto');
}
```

Guardar el modelo elegido en `currentWhisperModel` al iniciar la sesión, dentro de
`initializeLocalSession` (`localai.js:425`):

```js
currentWhisperModel = whisperModel;
```

Declararla junto al resto de estado de módulo e importar el normalizador:

```js
const { normalizeWhisperModel } = require('./native-ai-runtime');
let currentWhisperModel = 'large-v3-turbo';
```

Y exportar `normalizeWhisperModel` desde `src/utils/native-ai-runtime.js` añadiéndolo
a su `module.exports`.

- [ ] **Step 6: Verificar que la URL y el hash son correctos antes de confiar en la descarga**

Run:

```bash
curl -sI "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" | grep -i "x-linked-etag\|x-linked-size"
```

Expected: `x-linked-etag: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"` y `x-linked-size: 1624555275`.

Si no coinciden, **detente y avisa** — el archivo cambió en el repositorio remoto y el hash del plan quedó obsoleto.

- [ ] **Step 7: Comprobar que la app arranca y el modelo descarga**

Run: `npm start`, elegir modo local, seleccionar "Large v3 Turbo", iniciar sesión.
Expected: barra de progreso de descarga (~1,6 GB), verificación SHA sin error, y el servidor de Whisper arranca.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/
git add src/utils/native-ai-runtime.js src/storage.js src/utils/localai.js src/components/views/MainView.js
git commit -m "feat: añadir large-v3-turbo y medium.en al catálogo de Whisper"
```

---

### Tarea 7: VAD y resampleo por canal en `localai.js`

**Files:**

- Modify: `src/utils/localai.js` — eliminar estado de VAD de módulo (líneas 27-39, 42-63, 65-110), cambiar `processLocalAudio` y `handleSpeechEnd`
- Modify: `src/utils/gemini.js:1102-1170` — pasar el hablante en ambos handlers de audio
- Create: `test/channel-state.test.js`

**Interfaces:**

- Consumes: `createVad`, `VAD_MODES` de `src/core/vad.js` (Tarea 2); `createSessionContext` (Tarea 3)
- Produces: `processLocalAudio(monoChunk24k: Buffer, speaker: 'them'|'me'): void`

**Por qué es necesario:** hoy `send-audio-content` y `send-mic-audio-content` llaman **ambos** a `processLocalAudio(pcmBuffer)`, que usa estado de módulo (`isSpeaking`, `speechBuffers`, `resampleRemainder`). Los dos canales se pisan y se pierde la identidad del hablante. `resampleRemainder` compartido además **corrompe el audio**, porque mezcla restos de un canal en el otro.

- [ ] **Step 1: Escribir el test que falla**

`test/channel-state.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createVad, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

// Reproduce el fallo que esta tarea corrige: si dos canales comparten VAD,
// el silencio de uno cierra el segmento del otro.
test('canales independientes no cierran el segmento del vecino', () => {
    const cerrados = { them: 0, me: 0 };
    const canales = {
        them: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => cerrados.them++ }),
        me: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => cerrados.me++ }),
    };

    // 'them' habla mientras 'me' está en silencio.
    for (let i = 0; i < 10; i++) {
        canales.them.process(frame16k(0.5));
        canales.me.process(frame16k(0));
    }

    assert.strictEqual(canales.them.isSpeaking(), true);
    assert.strictEqual(canales.me.isSpeaking(), false);
    assert.strictEqual(cerrados.them, 0);

    // Ahora 'them' calla: solo debe cerrarse su propio segmento.
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) {
        canales.them.process(frame16k(0));
        canales.me.process(frame16k(0));
    }

    assert.strictEqual(cerrados.them, 1);
    assert.strictEqual(cerrados.me, 0);
});
```

- [ ] **Step 2: Ejecutar el test**

Run: `npm test`
Expected: PASS (valida el contrato de la Tarea 2 antes de cablearlo).

- [ ] **Step 3: Sustituir el estado de módulo por estado por canal en `localai.js`**

Eliminar de `src/utils/localai.js` las declaraciones `isSpeaking`, `speechBuffers`, `silenceFrameCount`, `speechFrameCount`, `vadConfig`, `resampleRemainder`, el objeto `VAD_MODES`, y las funciones `calculateRms` y `processVad`. Reemplazar por:

```js
const { createVad, VAD_MODES } = require('../core/vad');

// Un canal = un VAD + su propio resto de resampleo. Compartirlos entre canales
// corrompe el audio y mezcla los hablantes (ver Tarea 7).
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
        // D20: 2 s de silencio en vez de 3. Ajustar con el banco de pruebas.
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

- [ ] **Step 4: Cambiar `processLocalAudio` para aceptar el hablante**

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

- [ ] **Step 4b: Cola de transcripción por canal (B2)**

`whisper-server` atiende una petición a la vez. Si ambos canales cierran segmento
a la vez, el segundo espera; sin cola, tras una interrupción larga el retraso crece
sin límite. Añadir en `localai.js`, antes de `createChannel`:

```js
// Serializa las peticiones a whisper-server y descarta lo más viejo si se acumula.
const MAX_PENDING_PER_CHANNEL = 3;
const channelQueue = (() => {
    const pending = { them: [], me: [] };
    let busy = false;

    async function drain() {
        if (busy) return;
        busy = true;
        try {
            // Alterna canales para que ninguno monopolice el servidor.
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

En `closeLocalSession()`, añadir `channelQueue.clear();` junto a los resets de canal.

- [ ] **Step 4c: Filtrar alucinaciones de Whisper (B3)**

Whisper inventa frases en silencio o ruido. En `transcribeAudio` (`localai.js:133`),
pedir `verbose_json` y descartar por `no_speech_prob`:

```js
formData.append('response_format', 'verbose_json');
```

y sustituir la lectura del resultado por:

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

Si el servidor no devuelve `segments`, usar `result.text` como antes.

- [ ] **Step 5: Cambiar `handleSpeechEnd` para que solo transcriba (diseño reactivo)**

Reemplazar el cuerpo de `handleSpeechEnd` (`localai.js:160`). **Ya no llama a `sendToLlama`** — en diseño reactivo el modelo solo se invoca con el atajo (D1):

```js
async function handleSpeechEnd(audioData, speaker) {
    if (!isLocalActive) return;

    if (audioData.length < 16000) {
        console.log('[LocalAI] Audio demasiado corto, se descarta');
        return;
    }

    try {
        const transcription = await transcribeAudio(audioData);
        if (!transcription || transcription.trim().length < 2) return;

        // Solo acumulamos contexto. El modelo se invoca con el atajo, no aquí.
        onTranscription(speaker, transcription.trim());
    } catch (error) {
        console.error('[LocalAI] Error de transcripción:', error);
        sendToRenderer('update-status', 'Error de transcripción: ' + error.message);
    }
}

// El consumidor (Tarea 8) inyecta a dónde va la transcripción.
let onTranscription = () => {};
function setTranscriptionHandler(handler) {
    onTranscription = handler;
}
```

Añadir `setTranscriptionHandler` a `module.exports`.

- [ ] **Step 6: Resetear los canales al cerrar sesión**

En `closeLocalSession()` (`localai.js:489`), sustituir las líneas que reiniciaban el estado de VAD (`isSpeaking`, `speechBuffers`, `silenceFrameCount`, `speechFrameCount`, `resampleRemainder`) por:

```js
channels.them.reset();
channels.me.reset();
```

- [ ] **Step 7: Pasar el hablante desde los handlers IPC**

En `src/utils/gemini.js:1113`, dentro de `send-audio-content`:

```js
getLocalAi().processLocalAudio(pcmBuffer, 'them');
```

En `src/utils/gemini.js:1148`, dentro de `send-mic-audio-content`:

```js
getLocalAi().processLocalAudio(pcmBuffer, 'me');
```

- [ ] **Step 8: Verificar en la app real**

Run: `npm start` en modo local, con `audioMode` puesto en un valor que capture micrófono (no `speaker_only`), y habla alternando con el audio del sistema.
Expected: en la consola, transcripciones etiquetadas correctamente y **sin** respuesta automática del modelo (eso ahora requiere el atajo).

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/ test/
git add src/utils/localai.js src/utils/gemini.js test/channel-state.test.js
git commit -m "feat: VAD y resampleo independientes por canal de audio"
```

---

### Tarea 7b: Transcripción local independiente del LLM local (D14)

**Files:**

- Create: `src/core/modes.js`
- Create: `test/modes.test.js`
- Modify: `src/utils/localai.js:425-480` — dividir `initializeLocalSession`
- Modify: `src/storage.js:23-37` — preferencias `transcription` y `reasoning`
- Modify: `src/utils/gemini.js` — handler `initialize-session`
- Modify: `src/utils/renderer.js:143-170` — "Start Session" usa `initialize-session`

**Interfaces:**

- Consumes: `ensureNativeBinary`, `ensureWhisperModel`, `ensureLlamaModel`, `startWhisperServer`, `startLlamaServer` (ya existen en `localai.js` / `native-ai-runtime.js`)
- Produces:
    - `resolveModes(prefs, profileMeta?)` → `{ transcription: 'local-whisper'|'gemini-live', reasoning: 'gemini'|'local-llama' }`
    - `startTranscription({ whisperModel })` → arranca **solo** `whisper-server`
    - `startLocalReasoning({ model, profile, customPrompt })` → arranca `llama-server`

Hoy `initializeLocalSession` descarga Qwen y arranca llama **siempre**. La combinación
por defecto del diseño (Whisper local + Gemini) no existía (A1).

- [ ] **Step 1: Test del resolutor de modos**

`test/modes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { resolveModes } = require('../src/core/modes');

test('default: whisper local + gemini', () => {
    assert.deepStrictEqual(resolveModes({}), { transcription: 'local-whisper', reasoning: 'gemini' });
});

test('respeta las preferencias nuevas', () => {
    assert.deepStrictEqual(resolveModes({ transcription: 'gemini-live', reasoning: 'local-llama' }), {
        transcription: 'gemini-live',
        reasoning: 'local-llama',
    });
});

test('migra providerMode antiguo', () => {
    assert.deepStrictEqual(resolveModes({ providerMode: 'local' }), { transcription: 'local-whisper', reasoning: 'local-llama' });
    assert.deepStrictEqual(resolveModes({ providerMode: 'byok' }), { transcription: 'gemini-live', reasoning: 'gemini' });
});

test('un perfil confidencial fuerza todo local (D13)', () => {
    assert.deepStrictEqual(resolveModes({ reasoning: 'gemini' }, { confidential: true }), {
        transcription: 'local-whisper',
        reasoning: 'local-llama',
    });
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/modes'`

- [ ] **Step 3: Implementar el resolutor**

`src/core/modes.js`:

```js
const TRANSCRIPTION = ['local-whisper', 'gemini-live'];
const REASONING = ['gemini', 'local-llama'];

// Dos ejes independientes (D14). El providerMode antiguo se traduce para no
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

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Dividir `initializeLocalSession`**

En `src/utils/localai.js`, extraer `binaryProgress` (hoy dentro de `prepareNativeFiles`)
a nivel de módulo y sustituir `initializeLocalSession` por:

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

// Compatibilidad con el flujo antiguo.
async function initializeLocalSession(model, whisperModel, profile, customPrompt) {
    await startTranscription({ whisperModel });
    await startLocalReasoning({ model, profile, customPrompt });
}
```

Exportar `startTranscription` y `startLocalReasoning`.

- [ ] **Step 6: Preferencias y arranque unificado**

En `src/storage.js` `DEFAULT_PREFERENCES`, añadir:

```js
    transcription: 'local-whisper',
    reasoning: 'gemini',
```

En `src/utils/gemini.js`, importar `resolveModes` de `../core/modes` y `getPreferences`
de `../storage`, y añadir el handler:

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

En `renderer.js`, el botón "Start Session" invoca `initialize-session` con el perfil
elegido en lugar de `initialize-gemini` / `initialize-local`.

- [ ] **Step 7: Verificar que Whisper arranca sin Qwen**

Run: `npm start` con las preferencias por defecto.
Expected: descarga/arranque de `whisper-server` **sin** descargar ningún modelo de
llama. En Activity Monitor hay un proceso `whisper-server` y ninguno `llama-server`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/modes.js test/modes.test.js src/utils/localai.js src/utils/gemini.js src/utils/renderer.js src/storage.js
git commit -m "feat: transcripción local independiente del LLM local"
```

---

### Tarea 8: Gestor de sesión (une hilo, perfil y proveedor)

**Files:**

- Create: `src/core/session.js`
- Create: `test/session.test.js`
- Modify: `src/utils/gemini.js` — usar el gestor en `initializeNewSession` y en el handler del atajo

**Interfaces:**

- Consumes: `createSessionContext` (T3), `loadProfile`/`getProfilesDir` (T4), `buildPayload` (T5), `setTranscriptionHandler` (T7)
- Produces:
    - `createSessionManager({ configDir, sendToProvider, now? })` → `{ start({ profileName, sessionId? }), recordSpeech(speaker, text), recordScreen(imageRef), ask({ question, image }), getContext(), getProfile(), end() }`
    - `sendToProvider(payload)` → `Promise<string>` — inyectado, es el **seam** de proveedor (D9/D10)

- [ ] **Step 1: Escribir los tests que fallan**

`test/session.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionManager } = require('../src/core/session');

function crearConfigDir() {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const perfil = path.join(cfg, 'profiles', 'entrevista');
    fs.mkdirSync(path.join(perfil, 'context'), { recursive: true });
    fs.writeFileSync(path.join(perfil, 'profile.md'), '---\nname: Entrevista\nmodel: gemini-3.7-flash\n---\n\nSé mi memoria.');
    fs.writeFileSync(path.join(perfil, 'context', 'cv.md'), 'Backend, 15 años.');
    return cfg;
}

test('start carga el perfil y abre un hilo vacío', () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'ok' });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    assert.strictEqual(gestor.getProfile().meta.name, 'Entrevista');
    assert.deepStrictEqual(gestor.getContext().getEvents(), []);
});

test('recordSpeech acumula sin llamar al proveedor', async () => {
    let llamadas = 0;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => {
            llamadas++;
            return 'respuesta';
        },
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    gestor.recordSpeech('them', '¿Qué sabes de Node?');
    gestor.recordSpeech('me', 'Bastante.');

    assert.strictEqual(llamadas, 0);
    assert.strictEqual(gestor.getContext().getEvents().length, 2);
});

test('ask envía el payload al proveedor y registra la respuesta', async () => {
    let recibido = null;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async payload => {
            recibido = payload;
            return 'Di que redujiste latencia un 40%.';
        },
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });
    gestor.recordSpeech('them', '¿Qué impacto tuviste?');

    const respuesta = await gestor.ask({ question: '¿qué digo?' });

    assert.strictEqual(respuesta, 'Di que redujiste latencia un 40%.');
    assert.ok(recibido.system.includes('Backend, 15 años.'));
    assert.ok(recibido.transcript.includes('¿Qué impacto tuviste?'));
    assert.strictEqual(recibido.model, 'gemini-3.7-flash');

    const eventos = gestor.getContext().getEvents();
    assert.strictEqual(eventos[eventos.length - 1].kind, 'ask');
});

test('ask falla claramente si no hay sesión activa', async () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'x' });
    await assert.rejects(() => gestor.ask({ question: 'x' }), /sesión/i);
});

test('el payload lleva el flag de confidencialidad para que el adaptador lo respete', async () => {
    const cfg = crearConfigDir();
    const perfil = path.join(cfg, 'profiles', 'privado');
    fs.mkdirSync(perfil, { recursive: true });
    fs.writeFileSync(path.join(perfil, 'profile.md'), '---\nname: Privado\nconfidential: true\n---\n\nSé discreto.');

    let recibido = null;
    const gestor = createSessionManager({
        configDir: cfg,
        sendToProvider: async payload => {
            recibido = payload;
            return 'ok';
        },
    });
    gestor.start({ profileName: 'privado', sessionId: 's1' });
    await gestor.ask({ question: 'x' });

    assert.strictEqual(recibido.confidential, true);
});

test('ask rechaza una segunda petición mientras la primera está en curso (B6)', async () => {
    let resolver;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: () => new Promise(r => (resolver = r)),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    const primera = gestor.ask({ question: 'a' });
    await assert.rejects(() => gestor.ask({ question: 'b' }), /en curso/);
    resolver('ok');
    assert.strictEqual(await primera, 'ok');
});

test('end cierra la sesión', () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'x' });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });
    gestor.end();
    assert.strictEqual(gestor.getContext(), null);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/session'`

- [ ] **Step 3: Implementar el gestor**

`src/core/session.js`:

```js
const { createSessionContext } = require('./session-context');
const { getProfilesDir, loadProfile } = require('./profiles');
const { buildPayload } = require('./payload');

// Une el hilo de contexto, el perfil y el proveedor. `sendToProvider` se inyecta:
// es el seam que permite cambiar de Gemini a otro proveedor sin tocar la memoria.
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
        if (!context || !profile) throw new Error('No hay sesión activa');
        // B6: dos pulsaciones seguidas del atajo no deben lanzar dos peticiones.
        if (pending) throw new Error('Ya hay una petición en curso');

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

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS, todos los tests de `session.test.js`.

- [ ] **Step 5: Cablear el gestor en `gemini.js`**

Cerca del inicio de `src/utils/gemini.js`, tras los `require` existentes:

```js
const { createSessionManager } = require('../core/session');
const { getConfigDir } = require('../storage');

const sessionManager = createSessionManager({
    configDir: getConfigDir(),
    // El adaptador de proveedor vive aquí: es lo único que sabe de Gemini.
    // Aplica D13: un perfil confidencial nunca sale de la máquina, aunque
    // el modo activo sea de nube. Prefiere una respuesta peor a una fuga.
    sendToProvider: async payload => {
        if (payload.confidential) {
            if (!getLocalAi().isLocalSessionActive()) {
                throw new Error('Este perfil es confidencial y requiere el modo local activo');
            }
            return getLocalAi().sendLocalPayload(payload);
        }
        return sendPayloadToGemini(payload);
    },
});
```

En `setupGeminiIpcHandlers`, conectar la transcripción local al hilo:

```js
getLocalAi().setTranscriptionHandler((speaker, text) => {
    sessionManager.recordSpeech(speaker, text);
    sendToRenderer('transcription', { speaker, text });
});
```

- [ ] **Step 6: Implementar los dos adaptadores de proveedor**

El gestor es agnóstico; estas dos funciones son lo único que conoce a cada proveedor.

En `src/utils/gemini.js`, añadir:

```js
// Traduce el payload neutro a una petición de Gemini. El bloque `system` va
// primero y sin variar durante la reunión: es el prefijo que se cachea.
async function sendPayloadToGemini(payload) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Falta la API key de Gemini');

    const model = payload.model || getConfig().geminiLiveModel || 'gemini-2.5-flash';
    const client = new GoogleGenAI({ apiKey });

    const parts = [];
    if (payload.transcript) {
        parts.push({ text: `Conversación hasta ahora:\n\n${payload.transcript}` });
    }
    if (payload.image) {
        parts.push({ inlineData: { mimeType: payload.image.mimeType, data: payload.image.data } });
    }
    parts.push({ text: payload.question });

    // B5: streaming para no dejar la ventana en blanco 2-4 s.
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

    // B4: si esto es 0 de forma sostenida, la caché implícita no está funcionando;
    // mover el bloque estable al primer mensaje 'user' en vez de systemInstruction.
    if (usage) {
        console.log('[Gemini] tokens cacheados:', usage.cachedContentTokenCount ?? 0, 'de', usage.promptTokenCount);
    }

    return fullText.trim();
}
```

En `src/utils/localai.js`, añadir y exportar:

```js
// Equivalente local del adaptador: mismo payload, servidor llama.cpp.
async function sendLocalPayload(payload) {
    if (!isLocalActive || !llamaProcess) {
        throw new Error('No hay sesión local activa');
    }

    const content = [];
    if (payload.transcript) {
        content.push({ type: 'text', text: `Conversación hasta ahora:\n\n${payload.transcript}` });
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

Añadir `sendLocalPayload` a `module.exports` de `localai.js`.

- [ ] **Step 6b: Verificar el id de modelo (B9)**

Antes de fijar `gemini-3.7-flash` como default en ningún sitio:

```bash
GEMINI_API_KEY=... node -e "const {GoogleGenAI}=require('@google/genai');new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY}).models.list().then(async r=>{for await(const m of r)console.log(m.name)})"
```

Expected: la lista incluye el id que vas a usar. Si `gemini-3.7-flash` no aparece,
usar el id Flash más reciente que sí aparezca y anotarlo en `03-decisiones.md` D12.

- [ ] **Step 7: Verificar que la app sigue arrancando**

Run: `npm start`
Expected: la app abre sin errores en consola. El gestor todavía no responde al atajo — eso llega con la Tarea 10.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/session.js test/session.test.js src/utils/gemini.js src/utils/localai.js
git commit -m "feat: gestor de sesión que une hilo, perfil y proveedor"
```

---

### Tarea 9: Persistencia del hilo y migración del esquema

**Files:**

- Modify: `src/storage.js:397-420` (`saveSession`, `getSession`)
- Modify: `src/components/views/HistoryView.js:375-380` (render del hilo)
- Create: `test/storage-session.test.js`

**Interfaces:**

- Consumes: `toJSON()` / `fromJSON()` de `session-context.js` (T3)
- Produces: `saveSession(sessionId, { profileName, events })` persiste el hilo nuevo; `migrateLegacySession(obj)` convierte sesiones del esquema antiguo

El esquema viejo (`{ timestamp, transcription, ai_response }`) no tiene sitio para lo que dijo el usuario (H5). El nuevo guarda el hilo de eventos completo.

- [ ] **Step 1: Escribir los tests que fallan**

`test/storage-session.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { migrateLegacySession } = require('../src/core/session-context-migrate');

test('convierte turnos antiguos en eventos del hilo', () => {
    const legacy = {
        sessionId: 's1',
        profile: 'interview',
        conversationHistory: [{ timestamp: 100, transcription: '¿Y tu experiencia?', ai_response: 'Di que 15 años.' }],
        screenAnalysisHistory: [{ timestamp: 150, prompt: 'lee esto', response: 'es un IDE', model: 'gemini' }],
    };

    const { sessionId, profileName, events } = migrateLegacySession(legacy);

    assert.strictEqual(sessionId, 's1');
    assert.strictEqual(profileName, 'interview');
    // La transcripción antigua era siempre del entrevistador.
    assert.strictEqual(events[0].kind, 'speech');
    assert.strictEqual(events[0].speaker, 'them');
    assert.strictEqual(events[0].text, '¿Y tu experiencia?');
    // La respuesta del modelo pasa a ser un evento 'ask'.
    assert.strictEqual(events[1].kind, 'ask');
    assert.strictEqual(events[1].answer, 'Di que 15 años.');
    // El análisis de pantalla también entra en el hilo, ordenado por tiempo.
    assert.strictEqual(events[2].kind, 'screen');
});

test('una sesión ya migrada se devuelve intacta', () => {
    const nueva = { sessionId: 's2', profileName: 'entrevista', events: [{ t: 1, kind: 'speech', speaker: 'me', text: 'hola' }] };
    assert.deepStrictEqual(migrateLegacySession(nueva), nueva);
});

test('tolera una sesión vacía', () => {
    const { events } = migrateLegacySession({ sessionId: 's3' });
    assert.deepStrictEqual(events, []);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/session-context-migrate'`

- [ ] **Step 3: Implementar la migración**

`src/core/session-context-migrate.js`:

```js
// Convierte el esquema antiguo { transcription, ai_response } al hilo de eventos.
// En el esquema antiguo `transcription` era siempre el entrevistador: la app
// nunca escuchaba al usuario (ver hallazgo H5).
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

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Persistir el hilo nuevo**

En `src/storage.js`, reemplazar el cuerpo de `saveSession` (`storage.js:397`):

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

Y en `getSession`, migrar al leer:

```js
function getSession(sessionId) {
    const raw = readJsonFile(getSessionPath(sessionId), null);
    if (!raw) return null;
    const { migrateLegacySession } = require('./core/session-context-migrate');
    return { ...raw, ...migrateLegacySession(raw) };
}
```

- [ ] **Step 6: Actualizar `HistoryView` para renderizar el hilo**

En `src/components/views/HistoryView.js`, reemplazar el bloque que construye `messages` desde `conversationHistory` (`:375-380`):

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

- [ ] **Step 7: Verificar con una sesión antigua real**

Run: `npm start`, abrir la vista History y seleccionar una sesión creada antes de este cambio.
Expected: se renderiza sin errores, con los turnos antiguos etiquetados como entrevistador.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/session-context-migrate.js test/storage-session.test.js src/storage.js src/components/views/HistoryView.js
git commit -m "feat: persistir el hilo de eventos y migrar sesiones antiguas"
```

---

## Fase C — Perfiles, pantalla y medición

### Tarea 10: Atajo reactivo y screenshot reorientado

**Files:**

- Modify: `src/utils/renderer.js:464-551` — eliminar `captureScreenshot` automático
- Modify: `src/utils/renderer.js:551-556` — eliminar `MANUAL_SCREENSHOT_PROMPT`
- Modify: `src/utils/renderer.js:561-665` — `captureManualScreenshot` deja de fijar el prompt
- Modify: `src/utils/renderer.js:201-215` — no arrancar el intervalo de screenshots
- Modify: `src/utils/gemini.js:1171` — handler `send-image-content` delega en `sessionManager.ask`

**Interfaces:**

- Consumes: `sessionManager.ask({ question, image })` (T8)
- Produces: el atajo captura pantalla y pide respuesta en una sola acción

Implementa D1 y la sección "Screenshot bajo demanda" de [02-diseno.md](02-diseno.md).

- [ ] **Step 1: Eliminar la captura automática**

En `src/utils/renderer.js`, dentro de `startCapture`, borrar la creación de `screenshotInterval` y la llamada periódica a `captureScreenshot`. Borrar también la función `captureScreenshot` completa (`:464-551`) y la constante `MANUAL_SCREENSHOT_PROMPT` (`:551-556`).

Motivo: en diseño reactivo enviar una imagen cada N segundos quema llamadas sin que nadie las pida.

- [ ] **Step 2: Quitar el prompt cableado del screenshot manual**

En `captureManualScreenshot`, sustituir la invocación IPC por:

```js
const result = await ipcRenderer.invoke('send-image-content', {
    data: base64data,
});
```

(Sin `prompt`: ahora lo decide el perfil, no el renderer.)

- [ ] **Step 3: Delegar el handler en el gestor de sesión**

En `src/utils/gemini.js`, reemplazar el cuerpo de `send-image-content` por:

```js
ipcMain.handle('send-image-content', async (event, { data, prompt }) => {
    try {
        if (!data || typeof data !== 'string') {
            return { success: false, error: 'Datos de imagen inválidos' };
        }

        const buffer = Buffer.from(data, 'base64');
        if (buffer.length < 1000) {
            return { success: false, error: 'Imagen demasiado pequeña' };
        }

        const answer = await sessionManager.ask({
            question: prompt || 'Ayúdame con lo que estoy viendo y con la conversación hasta ahora.',
            image: { data, mimeType: 'image/jpeg' },
        });

        return { success: true, text: answer };
    } catch (error) {
        console.error('Error enviando imagen:', error);
        return { success: false, error: error.message };
    }
});
```

- [ ] **Step 3b: Cablear las preguntas por texto al gestor (A2 / D15)**

En `src/utils/gemini.js`, reemplazar el cuerpo completo de `send-text-message` por:

```js
ipcMain.handle('send-text-message', async (event, text) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { success: false, error: 'Mensaje vacío' };
    }
    try {
        const answer = await sessionManager.ask({ question: text.trim() });
        return { success: true, text: answer };
    } catch (error) {
        console.error('Error en pregunta por texto:', error);
        return { success: false, error: error.message };
    }
});
```

- [ ] **Step 3c: Atajo "preguntar sin imagen" (M4)**

En `src/utils/window.js`, dentro de `getDefaultKeybinds()`, añadir
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
    const result = await ipcRenderer.invoke('send-text-message', '¿Qué me estoy olvidando de decir o preguntar?');
    if (!result.success) cheatingDaddy.addNewResponse(`Error: ${result.error}`);
});
```

- [ ] **Step 3d: Borrado de emergencia limpia el hilo en memoria (B7)**

En `src/utils/window.js`, en el handler de `emergencyErase`, antes de
`sendToRenderer('clear-sensitive-data')`:

```js
require('./gemini').endSessionForEmergency();
```

Y en `gemini.js`, añadir y exportar:

```js
function endSessionForEmergency() {
    sessionManager.end();
}
```

- [ ] **Step 4: Verificar el flujo completo a mano**

Run: `npm start`, iniciar sesión con un perfil, dejar que transcriba un par de intervenciones, y pulsar el atajo de screenshot.
Expected: llega **una** respuesta, que tiene en cuenta tanto la pantalla como lo dicho antes. Sin respuestas automáticas entre medias.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/
git add src/utils/renderer.js src/utils/gemini.js
git commit -m "feat: atajo reactivo; eliminar captura automática de pantalla"
```

---

### Tarea 11: Generar perfiles por defecto y retirar `prompts.js`

**Files:**

- Create: `src/core/profiles-bootstrap.js`
- Create: `test/profiles-bootstrap.test.js`
- Modify: `src/index.js:20` — llamar al bootstrap tras `storage.initializeStorage()`
- Delete: `src/utils/prompts.js`
- Modify: `src/utils/gemini.js` — eliminar el `require` de `./prompts` y los usos de `getSystemPrompt`
- Modify: `src/utils/localai.js:3` — eliminar el `require` de `./prompts`

**Interfaces:**

- Consumes: `getProfilesDir` (T4)
- Produces: `bootstrapProfiles({ configDir, legacyCustomPrompt })` → `string[]` con los perfiles creados

Implementa la sección "Migración" de [02-diseno.md](02-diseno.md) y retira H6.

- [ ] **Step 1: Escribir los tests que fallan**

`test/profiles-bootstrap.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapProfiles } = require('../src/core/profiles-bootstrap');
const { loadProfile, getProfilesDir, listProfiles } = require('../src/core/profiles');

test('crea los perfiles por defecto en un config vacío', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const creados = bootstrapProfiles({ configDir: cfg });

    assert.ok(creados.includes('entrevista'));
    assert.ok(listProfiles(getProfilesDir(cfg)).length >= 3);

    const perfil = loadProfile(getProfilesDir(cfg), 'entrevista');
    assert.ok(perfil.instructions.length > 0);
    // El nuevo prompt NO debe dictar palabras.
    assert.ok(!/exact words to say/i.test(perfil.instructions));
});

test('conserva el customPrompt antiguo como archivo de contexto', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg, legacyCustomPrompt: 'Soy backend con 15 años.' });

    const perfil = loadProfile(getProfilesDir(cfg), 'entrevista');
    const migrado = perfil.contextFiles.find(f => f.file === 'migrado.md');
    assert.ok(migrado, 'debe existir context/migrado.md');
    assert.strictEqual(migrado.content, 'Soy backend con 15 años.');
});

test('no sobrescribe perfiles ya existentes', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const ruta = path.join(getProfilesDir(cfg), 'entrevista', 'profile.md');
    fs.writeFileSync(ruta, '---\nname: Mío\n---\n\nMis instrucciones.');

    const creados = bootstrapProfiles({ configDir: cfg });
    assert.strictEqual(creados.includes('entrevista'), false);
    assert.strictEqual(loadProfile(getProfilesDir(cfg), 'entrevista').instructions, 'Mis instrucciones.');
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/profiles-bootstrap'`

- [ ] **Step 3: Implementar el bootstrap**

`src/core/profiles-bootstrap.js`:

```js
const fs = require('fs');
const path = require('path');
const { getProfilesDir } = require('./profiles');

const INSTRUCCIONES_BASE = `Eres mi asistente de memoria, no un teleprompter. No me dictes qué decir.

Cuando te invoco, dame lo que probablemente he olvidado: la cifra exacta, el nombre
del proyecto, el término que acaban de usar. Sé breve — voy a leerte mientras hablo
con alguien.

Si algo no está en mis notas, dilo. No lo inventes: prefiero un "no lo tengo" a un
dato falso dicho con seguridad.`;

const PERFILES_POR_DEFECTO = [
    {
        dir: 'entrevista',
        name: 'Entrevista de trabajo',
        extra: 'Prioriza mi experiencia concreta y las cifras de impacto. Si mencionan una tecnología que está en mis notas, recuérdame qué hice con ella.',
        checklist: ['Preguntar por el equipo y el día a día', 'Preguntar por el proceso de despliegue', 'Mencionar mi experiencia liderando'],
    },
    {
        dir: 'reunion',
        name: 'Reunión de trabajo',
        extra: 'Prioriza acuerdos previos y compromisos pendientes. Avísame si se repite algo ya cerrado.',
        checklist: ['Confirmar los siguientes pasos', 'Anotar quién hace qué'],
    },
    {
        dir: 'cliente',
        name: 'Llamada con cliente',
        extra: 'Prioriza el historial de la cuenta y lo prometido en llamadas anteriores.',
        checklist: ['Confirmar plazos', 'Preguntar por bloqueos'],
    },
];

function bootstrapProfiles({ configDir, legacyCustomPrompt = '' }) {
    const profilesDir = getProfilesDir(configDir);
    fs.mkdirSync(profilesDir, { recursive: true });

    const creados = [];

    for (const plantilla of PERFILES_POR_DEFECTO) {
        const dir = path.join(profilesDir, plantilla.dir);
        if (fs.existsSync(path.join(dir, 'profile.md'))) continue;

        fs.mkdirSync(path.join(dir, 'context'), { recursive: true });

        const frontmatter = ['---', `name: ${plantilla.name}`, 'confidential: false', '---', ''].join('\n');
        fs.writeFileSync(path.join(dir, 'profile.md'), `${frontmatter}\n${INSTRUCCIONES_BASE}\n\n${plantilla.extra}\n`);
        fs.writeFileSync(path.join(dir, 'checklist.md'), plantilla.checklist.map(t => `- ${t}`).join('\n') + '\n');

        // Conservamos el contexto que el usuario ya tenía escrito en el textarea antiguo.
        const legacy = (legacyCustomPrompt || '').trim();
        if (legacy) {
            fs.writeFileSync(path.join(dir, 'context', 'migrado.md'), `${legacy}\n`);
        }

        creados.push(plantilla.dir);
    }

    return creados;
}

module.exports = { bootstrapProfiles, INSTRUCCIONES_BASE };
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Llamar al bootstrap al arrancar**

En `src/index.js`, justo después de `storage.initializeStorage()`:

```js
const { bootstrapProfiles } = require('./core/profiles-bootstrap');
const prefs = storage.getPreferences();
const creados = bootstrapProfiles({ configDir: storage.getConfigDir(), legacyCustomPrompt: prefs.customPrompt });
if (creados.length > 0) {
    console.log('Perfiles creados:', creados.join(', '));
}
```

- [ ] **Step 6: Eliminar `prompts.js` y sus usos**

```bash
git rm src/utils/prompts.js
```

Quitar de `src/utils/gemini.js` la línea `const { getSystemPrompt } = require('./prompts');` y toda referencia a `getSystemPrompt`. Hacer lo mismo en `src/utils/localai.js:3`.

- [ ] **Step 7: Verificar que arranca y los perfiles existen en disco**

Run: `npm start`, y en otra terminal:

```bash
ls -R "$HOME/Library/Application Support/cheating-daddy-config/profiles"
```

Expected: tres carpetas con `profile.md`, `checklist.md` y `context/`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add -A src/ test/
git commit -m "feat: perfiles por defecto en disco; retirar prompts.js"
```

---

### Tarea 12: Banco de pruebas de transcripción

**Files:**

- Create: `tools/transcribe-bench.js`
- Modify: `package.json` — script `bench:stt`

**Interfaces:**

- Consumes: `ensureWhisperModel`, `ensureNativeBinary`, `startNativeServer`, `waitForServer`, `getAvailablePort`, `stopNativeServer` de `src/utils/native-ai-runtime.js`
- Produces: `npm run bench:stt -- <archivo.wav> [modelo...]` imprime las transcripciones lado a lado

Implementa la sección "Banco de pruebas" de [02-diseno.md](02-diseno.md). Es la herramienta que sustituye la opinión por medición en D4.

- [ ] **Step 1: Escribir la herramienta**

`tools/transcribe-bench.js`:

```js
#!/usr/bin/env node
// Compara modelos de Whisper sobre el MISMO archivo de audio.
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
    // B3/B10: no_speech_prob por segmento para calibrar el filtro de alucinaciones.
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

- [ ] **Step 2: Añadir el script**

En `package.json`, junto a `test`:

```json
        "bench:stt": "node tools/transcribe-bench.js"
```

- [ ] **Step 3: Grabar 2-3 minutos de audio real y ejecutarlo**

Graba **dos** conversaciones reales a 16 kHz mono WAV: una con auriculares y otra con
altavoces (B1). Con la segunda comprobarás cuánto del entrevistador se cuela en tu canal.
Si un segmento de 10 s tarda más de ~4 s con `large-v3-turbo`, el binario no acelera
por Metal (B10): probar `medium.en` o recompilar. Después:

Run: `npm run bench:stt -- ~/grabacion.wav`
Expected: tres bloques de transcripción con tiempos. Compáralos a ojo: lo que decide no es el WER de un leaderboard, sino cuál entiende **tu** audio.

- [ ] **Step 4: Commit**

```bash
npx prettier --write tools/ package.json
git add tools/transcribe-bench.js package.json
git commit -m "feat: banco de pruebas para comparar modelos de transcripción"
```

---

### Tarea 13: Resampleo correcto en el renderer

**Files:**

- Modify: `src/utils/renderer.js:371-460` — remuestrear a 16 kHz antes del IPC
- Modify: `src/utils/localai.js` — `createChannel` deja de remuestrear

**Interfaces:**

- Consumes: nada nuevo
- Produces: los handlers IPC reciben PCM16 mono **a 16 kHz** (`mimeType: 'audio/pcm;rate=16000'`)

Corrige H7 conforme a D11: `OfflineAudioContext` remuestrea con filtrado correcto, mientras que la interpolación lineal actual mete aliasing que degrada las sibilantes.

**Nota:** esta tarea cambia el formato que espera Gemini Live. Verifica que el modo `byok` sigue funcionando antes de dar por buena la tarea.

- [ ] **Step 1: Añadir el remuestreo en el renderer**

En `src/utils/renderer.js`, añadir junto a los helpers de audio:

```js
// OfflineAudioContext aplica el filtro anti-aliasing que la interpolación lineal
// del main process no hacía (ver hallazgo H7).
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

- [ ] **Step 2: Usarlo en los tres procesadores de audio**

En `setupLinuxMicProcessing`, `setupLinuxSystemAudioProcessing` y `setupWindowsLoopbackProcessing`, sustituir la conversión directa por:

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

(En los procesadores de audio del sistema, el canal IPC es `send-audio-content`.)

- [ ] **Step 3: Quitar el resampleo del main process**

En `src/utils/localai.js`, dentro de `createChannel`, eliminar `resample24kTo16k` y el `resampleRemainder`. `processLocalAudio` pasa a:

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

- [ ] **Step 4: Verificar el modo local**

Run: `npm start` en modo local, hablar y comprobar las transcripciones.
Expected: transcripciones al menos tan buenas como antes, y sibilantes más limpias.

- [ ] **Step 5: Verificar el modo byok**

Run: `npm start` en modo `byok` con una clave de Gemini válida.
Expected: Gemini Live sigue transcribiendo. Si rechaza los 16 kHz, revierte solo el `mimeType` para ese modo y deja el remuestreo activo únicamente en modo local.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/
git add src/utils/renderer.js src/utils/localai.js
git commit -m "fix: remuestrear a 16kHz con OfflineAudioContext en vez de interpolación lineal"
```

---

### Tarea 14: Resumen post-sesión que alimenta el perfil (D17)

**Files:**

- Create: `src/core/digest.js`
- Create: `test/digest.test.js`
- Modify: `src/utils/gemini.js:1279` — handler `close-session` genera y guarda el resumen
- Modify: `src/utils/renderer.js` — listener `save-session-digest`
- Modify: `src/storage.js` — `saveSession` conserva `digest`
- Modify: `src/components/views/HistoryView.js` — mostrar `digest`

**Interfaces:**

- Consumes: `sessionManager.getContext()/getProfile()` (T8), `sendPayloadToGemini` (T8), `getProfilesDir` (T4)
- Produces:
    - `buildDigestPrompt(transcript)` → `string`
    - `appendDigest({ profilesDir, profileName, digest, date, maxEntries = 20 })` → ruta escrita
    - la sesión guardada lleva `digest: string | null`

- [ ] **Step 1: Tests que fallan**

`test/digest.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDigestPrompt, appendDigest } = require('../src/core/digest');

test('el prompt pide acuerdos, pendientes, nombres y cifras', () => {
    const prompt = buildDigestPrompt('[Entrevistador]: Hola');
    assert.ok(/acuerdos/i.test(prompt));
    assert.ok(/pendientes/i.test(prompt));
    assert.ok(prompt.includes('[Entrevistador]: Hola'));
});

test('appendDigest crea historial.md y añade entradas fechadas en orden', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    fs.mkdirSync(path.join(raiz, 'cliente', 'context'), { recursive: true });

    appendDigest({ profilesDir: raiz, profileName: 'cliente', digest: 'Acordamos X.', date: '2026-08-26' });
    appendDigest({ profilesDir: raiz, profileName: 'cliente', digest: 'Pendiente Y.', date: '2026-08-27' });

    const contenido = fs.readFileSync(path.join(raiz, 'cliente', 'context', 'historial.md'), 'utf8');
    assert.ok(contenido.includes('## 2026-08-26'));
    assert.ok(contenido.includes('Acordamos X.'));
    assert.ok(contenido.indexOf('2026-08-26') < contenido.indexOf('2026-08-27'));
});

test('appendDigest recorta a las últimas maxEntries', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    fs.mkdirSync(path.join(raiz, 'p', 'context'), { recursive: true });
    for (let i = 1; i <= 5; i++) {
        appendDigest({ profilesDir: raiz, profileName: 'p', digest: `e${i}`, date: `2026-01-0${i}`, maxEntries: 3 });
    }

    const contenido = fs.readFileSync(path.join(raiz, 'p', 'context', 'historial.md'), 'utf8');
    assert.ok(!contenido.includes('2026-01-01'));
    assert.ok(contenido.includes('2026-01-05'));
    assert.strictEqual((contenido.match(/^## /gm) || []).length, 3);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/digest'`

- [ ] **Step 3: Implementar**

`src/core/digest.js`:

```js
const fs = require('fs');
const path = require('path');

function buildDigestPrompt(transcript) {
    return [
        'Resume esta reunión en 10-15 líneas, en español, para que yo lo lea antes de la próxima con las mismas personas.',
        'Secciones: **Acuerdos**, **Pendientes** (quién debe qué), **Nombres y roles** mencionados, **Cifras y fechas** citadas.',
        'Solo lo que se dijo. Si una sección queda vacía, omítela.',
        '',
        '---',
        transcript,
    ].join('\n');
}

// Añade el resumen al historial del perfil, que la siguiente sesión cargará como
// una nota más (D17). Se recorta para que el prefijo cacheado no crezca sin límite.
function appendDigest({ profilesDir, profileName, digest, date, maxEntries = 20 }) {
    const ruta = path.join(profilesDir, profileName, 'context', 'historial.md');
    fs.mkdirSync(path.dirname(ruta), { recursive: true });

    const existente = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '';
    const entradas = existente
        .split(/^(?=## )/m)
        .map(e => e.trim())
        .filter(e => e.startsWith('## '));

    entradas.push(`## ${date}\n\n${digest.trim()}`);
    const recortadas = entradas.slice(-maxEntries);

    fs.writeFileSync(ruta, `# Historial de reuniones\n\n${recortadas.join('\n\n')}\n`);
    return ruta;
}

module.exports = { buildDigestPrompt, appendDigest };
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Generar el resumen al cerrar sesión**

En `src/utils/gemini.js`, dentro del handler `close-session`, antes de cerrar proveedores:

```js
const ctx = sessionManager.getContext();
const profile = sessionManager.getProfile();
if (ctx && profile && ctx.getTranscript().length > 200) {
    try {
        const { buildDigestPrompt, appendDigest } = require('../core/digest');
        const { getProfilesDir } = require('../core/profiles');
        const digestPayload = {
            system: 'Eres un asistente que resume reuniones con precisión y sin inventar.',
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
        console.error('No se pudo generar el resumen de la sesión:', error);
    }
}
sessionManager.end();
```

En `renderer.js`, junto a los otros `ipcRenderer.on('save-…')`:

```js
ipcRenderer.on('save-session-digest', async (event, { sessionId, digest }) => {
    const existing = await cheatingDaddy.storage.getSession(sessionId);
    await cheatingDaddy.storage.saveSession(sessionId, { ...(existing || {}), digest });
});
```

En `storage.saveSession` (modificado en la Tarea 9), añadir al objeto guardado:

```js
        digest: data.digest || existingSession?.digest || null,
```

- [ ] **Step 6: Mostrarlo en el historial**

En `HistoryView.js`, en el detalle de sesión, antes del hilo de mensajes, renderizar
`this.selectedSession.digest` (si existe) dentro de una `<section class="digest">`
con el título "Resumen", usando el mismo patrón `html\`…\`` que el resto de la vista.

- [ ] **Step 7: Verificar**

Run: `npm start`, hacer una sesión con al menos 200 caracteres de transcript, cerrarla.
Expected: `profiles/<perfil>/context/historial.md` tiene una entrada con la fecha de hoy
y `HistoryView` muestra el resumen.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/ test/
git add src/core/digest.js test/digest.test.js src/utils/gemini.js src/utils/renderer.js src/storage.js src/components/views/HistoryView.js
git commit -m "feat: resumen post-sesión que alimenta el historial del perfil"
```

---

### Tarea 15: Alinear `AGENTS.md` con las decisiones (D19)

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Reescribir las secciones contradictorias**

Sustituir las secciones **Code standards**, **Shadcn and Electron**, **Strategy and
Future Work**, **TODO** y **LLM plans** por:

```markdown
## Fuente de verdad

El análisis, el diseño y las decisiones del proyecto viven en `documentation/`.
Léelo antes de tocar código; `03-decisiones.md` tiene prioridad sobre cualquier
instrucción de este archivo que la contradiga.

## Restricciones

- **CommonJS y sin build step.** El main process es Node 20 (Electron 30); no usa ESM ni bundlers.
- **UI en Lit**, vendorizado en `src/assets/`. No se migra a React ni shadcn.
- **Cero dependencias nuevas de runtime** salvo decisión registrada en `03-decisiones.md`.
- **Tests con `node:test`**: `npm test` antes de cada commit.
- **Prettier** antes de cada commit: `npx prettier --write .`
```

Conservar **Getting started**, **Style** y **Merging upstream PRs**. En **Tests**,
sustituir "No automated tests yet" por la instrucción de ejecutar `npm test`.

- [ ] **Step 2: Commit**

```bash
npx prettier --write AGENTS.md
git add AGENTS.md
git commit -m "docs: AGENTS.md remite a documentation/ y retira la migración a TS/React"
```

---

## Verificación final

- [ ] `npm test` — todos los tests pasan
- [ ] `npx prettier --check .` — sin diferencias
- [ ] `npm start` arranca sin errores en consola
- [ ] Una sesión completa: perfil elegido → transcripción dual etiquetada → atajo → respuesta con contexto de notas + conversación + pantalla
- [ ] `HistoryView` muestra el hilo de la sesión, y también una sesión antigua migrada
- [ ] La ventana sigue sin aparecer al compartir pantalla en Google Meet (no romper H1)
- [ ] Con preferencias por defecto arranca `whisper-server` y **no** `llama-server` (D14)
- [ ] Una pregunta escrita recibe respuesta con notas y transcript (D15)
- [ ] Al cerrar sesión aparece una entrada nueva en `context/historial.md` (D17)
