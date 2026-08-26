# 01 — Estado actual del repositorio

Análisis de `cheating-daddy` v0.8.0 tal como está antes de cualquier cambio.
Fork de [sohzm/cheating-daddy](https://github.com/sohzm/cheating-daddy), GPL-3.0.

## Qué es hoy

Una app de **Electron** que captura pantalla y audio del sistema durante una
videollamada, transcribe lo que dice la otra persona, y muestra en un overlay
transparente **las palabras exactas que deberías decir**.

Perfiles disponibles: entrevista, ventas, reunión, presentación, negociación, examen.

## Inventario técnico

| Aspecto      | Estado                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Módulos      | **CommonJS** (sin `"type"` en `package.json`)                           |
| Build        | **Ninguno** — sin webpack, vite, rollup, esbuild ni TypeScript          |
| Runtime      | Electron `^30` → **Node 20**                                            |
| UI           | **Lit** cargado como asset (`src/assets/lit-core-2.7.4.min.js`), no npm |
| Dependencias | `@google/genai`, `ws`, `electron-squirrel-startup`                      |
| Tests        | Ninguno                                                                 |
| Lint         | Ninguno (`npm run lint` imprime "No linting configured")                |

Consecuencia importante: el **main process es CommonJS sobre Node 20**, donde
`require()` de un paquete ESM no funciona. El **renderer sí es contexto de
navegador y ya usa ES modules**. Esta asimetría determinó varias decisiones
de librerías (ver [04-evaluaciones.md](04-evaluaciones.md)).

## Arquitectura

```
main process                          renderer
─────────────                         ────────
index.js          ← arranque, ~60 handlers IPC
utils/window.js   ← ventana, atajos globales
utils/gemini.js   ← orquestador (1365 líneas)     utils/renderer.js  ← captura real
utils/localai.js  ← whisper + llama locales       components/        ← vistas Lit
utils/cloud.js    ← WebSocket propio
storage.js        ← JSON en disco
```

### Tres modos de proveedor

| Modo             | Cómo funciona                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `byok` (default) | Gemini Live por WebSocket + Groq para texto/imagen. Reconexión con 3 intentos                                            |
| `local`          | Descarga `llama-server` + `whisper-server` desde GitHub Releases con verificación SHA-256, los levanta en puertos libres |
| `cloud`          | WebSocket a `api.cheatingdaddy.com`. **Backend cableado pero UI deshabilitada** (`MainView.js:1146`)                     |

## Hallazgos

### H1 — La ventana indetectable funciona, y es lo más valioso del repo

`window.js:45` → `setContentProtection(true)`, más `frame: false`, `transparent: true`
y `alwaysOnTop` con nivel `screen-saver`. En macOS y Windows la ventana **no aparece
en capturas ni al compartir pantalla**. Son ~50 líneas y funcionan hoy.

También hay un atajo de _emergency erase_ (`window.js:270`) que oculta la ventana,
cierra la sesión, borra datos sensibles y mata la app en 300 ms.

### H2 — Ya lee la pantalla, por dos caminos

- **Automático** cada N segundos: `renderer.js:464` `captureScreenshot()`
- **Manual** por atajo: `renderer.js:561` `captureManualScreenshot()`, con downscale a 1280px

El manual ya envía imagen + prompt al modelo. La capacidad existe; lo que falla es
la orientación: el prompt manual está cableado a modo LeetCode.

```js
// renderer.js — MANUAL_SCREENSHOT_PROMPT
`Help me on this page, give me the answer no bs, complete answer.
So if its a code question, give me the approach in few bullet points, then the entire code.`;
```

### H3 — El contexto está fragmentado (problema de fondo)

Lo que la app _oye_ y lo que _ve_ viven en dos arrays que **nunca se fusionan**:

```js
// gemini.js:24-25
let conversationHistory = []; // audio → transcripción
let screenAnalysisHistory = []; // screenshots → análisis
```

El modelo jamás recibe ambos en el mismo hilo. La app no se _siente_ ciega y sin
memoria: literalmente lo está.

Además, el contexto del usuario (`customPrompt`) es un único textarea inyectado
una sola vez al arrancar la sesión (`prompts.js:213`). No hay memoria entre reuniones.

### H4 — La transcripción está mal configurada por defecto

Dos fallos independientes que explican la mala experiencia previa con acentos:

```js
// storage.js:35
whisperModel: 'tiny.en'; // el modelo más pequeño, y solo inglés

// localai.js:39
let vadConfig = VAD_MODES.VERY_AGGRESSIVE;
// { energyThreshold: 0.02, speechFramesRequired: 2, silenceFramesRequired: 15 }
```

- `tiny.en` es donde los acentos se derrumban: el tamaño del modelo pesa mucho en
  habla no nativa. Y al ser `.en`, **no detecta idioma, lo asume** — con español
  produce basura, no degradación.
- El VAD corta por energía RMS pura. Si alguien habla bajo, tiene mal micro, o
  **hace una pausa para pensar** (constante en una entrevista), cierra el segmento
  a los 15 frames de silencio y **Whisper nunca ve esa parte del audio**.

El catálogo disponible tope en `small.en` (`native-ai-runtime.js:49`): solo
`tiny.en`, `base.en`, `small.en`.

### H5 — Solo escucha al entrevistador

```js
// CustomizeView.js:578
<option value="speaker_only">Speaker Only (Interviewer)</option> // ← default
```

Para un teleprompter tiene sentido. Para un asistente de memoria es un agujero:
sin tu lado del diálogo no puede saber qué has dicho, así que no puede marcar un
checklist ni avisarte de lo que falta.

El esquema guardado tampoco tiene sitio para ello (`storage.js:397`):

```js
{
    (timestamp, transcription, ai_response);
} // transcription = el entrevistador
```

### H6 — El prompt trabaja en contra del objetivo

Los seis perfiles de `prompts.js` terminan igual de literal:

> _"Provide only the exact words to say. No coaching, no 'you should' statements,
> no explanations — just the direct response the candidate can speak immediately."_

Es un teleprompter que dicta el guion. El objetivo es lo contrario. Esto no es un
ajuste de configuración: es cambiar qué es el producto.

### H7 — El resampler no filtra

```js
// localai.js:42 — interpolación lineal sin filtro anti-aliasing
const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
```

Bajar de 24 kHz a 16 kHz sin paso-bajo previo hace que el contenido por encima de
8 kHz **se pliegue como aliasing**. Afecta sobre todo a las sibilantes (s, sh, f),
justo donde un acento no nativo ya es frágil. Es un problema de segundo orden
frente a H4, pero suma en la misma dirección.

Nota: este código corre en el **main process**, donde no hay `AudioContext` ni WebCodecs.

### H8 — El punto de entrada para imágenes ya existe

```js
// gemini.js:1171
ipcMain.handle('send-image-content', async (event, { data, prompt }) => { ... })
```

Acepta base64 + prompt arbitrario y ya rutea a los tres proveedores. El modo local
además **ya hace visión** (`localai.js:541`): `llama-server` con proyector multimodal
y mensajes estilo OpenAI con `image_url`.

### H9 — Google Search ya está cableado

```js
// gemini.js:165
tools.push({ googleSearch: {} });
```

Sirve directamente a la capacidad #4 (explicar un concepto o nombre que acaba de salir).

## Lo que se conserva

- La ventana indetectable y los atajos globales (H1)
- La captura de audio de macOS vía `SystemAudioDump`
- El runtime local con descarga verificada por SHA-256 (`native-ai-runtime.js`)
- El adaptador de Gemini, incluida la reconexión y el grounding de búsqueda
- `HistoryView` y el almacenamiento por sesión en JSON
