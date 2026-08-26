# 02 — Diseño

Diseño objetivo del asistente de memoria. Cada decisión aquí tiene su justificación
en [03-decisiones.md](03-decisiones.md).

## Principio rector: reactivo

La app **escucha y acumula contexto en silencio** durante toda la reunión, y solo
llama al modelo cuando pulsas un atajo.

Consecuencias:

- Cero ruido visual durante la reunión. En una entrevista no puedes leer un muro de texto.
- La transcripción (continua, barata) se desacopla del razonamiento (ocasional, caro).
- Deja de quemar llamadas al modelo en cada turno, como hace hoy.

## Sección 1 — Núcleo de contexto

La pieza que hoy no existe y de la que cuelgan las cuatro capacidades. Reemplaza los
dos arrays desconectados (ver H3) por **un solo hilo ordenado por tiempo**:

```js
{ t, kind: 'speech',    speaker: 'them' | 'me', text }
{ t, kind: 'screen',    imageRef, caption? }
{ t, kind: 'ask',       question, answer }      // invocaste el atajo
{ t, kind: 'checklist', itemId, status }
```

Módulo nuevo: **`src/core/session-context.js`**. Tres responsabilidades y nada más:

1. **Acumular** eventos del hilo.
2. **Ensamblar** el payload cuando pulsas el atajo, ordenado para que el prompt
   caching funcione (ver abajo).
3. **Persistir** a disco.

### Por qué es un módulo aparte

`gemini.js` tiene 1365 líneas y mezcla proveedor, sesión, audio, historial y prompts.
Sacar el núcleo de contexto lo convierte en algo testeable por separado y deja a
`gemini.js` como lo que debería ser: un **adaptador de proveedor**.

Ese límite es también el _seam_ que permite enchufar otro proveedor (Claude, o una
librería de abstracción) más adelante sin tocar la lógica de memoria.

### Ensamblado del payload

El caching de prompt es _prefix match_: lo estable primero, lo volátil al final.

```
system:   profile.md + context/*.md + checklist.md    ← cache_control aquí
          └── estable toda la reunión → ~0.1x coste en cada invocación
messages: transcript acumulado (eventos speech etiquetados)
          screenshot + tu pregunta                     ← volátil
```

## Sección 2 — Perfiles como carpetas

Un perfil **es una carpeta en disco**. La app solo lee; tú escribes en tu editor,
no en un textarea. Viven junto al resto de config (`getConfigDir()` en `storage.js`):

```
~/Library/Application Support/cheating-daddy-config/profiles/
  entrevista-backend/
    profile.md          ← cómo debe responder (reemplaza profilePrompts)
    checklist.md        ← lo que no debo olvidar decir/preguntar
    context/
      cv.md
      proyectos.md
      cifras-que-olvido.md
  reunion-cliente/
    profile.md
    context/
      cuentas.md
```

`profile.md` lleva frontmatter para lo poco que no es prosa:

```markdown
---
name: Entrevista Backend
confidential: false # true → todo se queda local, no sale nada
model: gemini-3.7-flash # modelo por perfil
---

Eres mi asistente de memoria, no un teleprompter. No me dictes qué decir.
Cuando te invoco, dame lo que probablemente olvidé: la cifra exacta, el
nombre del proyecto, el término que acaban de usar. Si no está en mis
notas, dilo — no lo inventes.
```

Este bloque es lo que elimina el problema H6: el comportamiento lo escribes tú, y
`prompts.js` con sus seis personalidades hardcodeadas desaparece.

Todo `context/*.md` se manda **completo**. Con 1M de contexto no hay que elegir ni
recortar, y por eso **no hay recuperación ni índice que mantener** (ver D8).

### Checklist

`checklist.md` es la lista estática. El **estado** (qué se ha cubierto ya) son
eventos `checklist` en el hilo de la sesión — no hay estado paralelo que se
pueda desincronizar.

### Migración

Al arrancar por primera vez, la app genera `profiles/` desde los seis perfiles
actuales y escribe el `customPrompt` existente dentro de `context/` del perfil
seleccionado. No se pierde configuración.

## Sección 3 — Captura

### Audio dual, etiquetado por canal

```
SystemAudioDump (macOS)  → PCM 24k stereo → mono → 16k → [them]
micrófono (getUserMedia) → PCM                   → 16k → [me]
```

La etiqueta **viene del origen, no de un algoritmo**. Son dos streams físicamente
separados, así que el etiquetado es correcto por construcción — más fiable que la
diarización, que infiere quién habla y se confunde cuando dos personas se pisan
o cuando hay tres en la llamada.

Cada canal con su propia instancia de VAD y su propia cola hacia `whisper-server`.

### VAD corregido

Cambios respecto a lo diagnosticado en H4:

| Parámetro               | Hoy (`VERY_AGGRESSIVE`) | Objetivo (`NORMAL`) |
| ----------------------- | ----------------------- | ------------------- |
| `energyThreshold`       | 0.02                    | 0.01                |
| `silenceFramesRequired` | 15                      | 30                  |
| pre-roll                | ninguno                 | **~300 ms**         |

El **pre-roll** —guardar el audio _anterior_ a detectar voz— importa porque el
arranque de frase es justo lo que más se pierde con hablantes acentuados.

### Resampleo

Mover el preprocesado de audio al **renderer** y usar `OfflineAudioContext`, que
remuestrea con filtrado correcto. Arregla H7, no añade dependencias, y de paso el
audio cruza el IPC ya limpio.

### Screenshot bajo demanda

Se reutiliza `captureManualScreenshot` (`renderer.js:561`), que ya hace el downscale
a 1280px. Cambia lo que hace con el resultado: deja de enviar el `MANUAL_SCREENSHOT_PROMPT`
de LeetCode y **emite un evento `screen` al hilo**; es el perfil quien decide qué hacer con él.

La **captura automática cada N segundos se elimina** — en diseño reactivo no tiene sentido.

### Banco de pruebas

Un modo que corre un `.wav` grabado contra varios modelos Whisper y muestra las
transcripciones lado a lado. Sirve para:

- Elegir modelo con **tu** audio y **tu** acento, en vez de por leaderboard.
- Calibrar el VAD sin tener que estar en una reunión real.
- Reevaluar modelos nuevos según vayan saliendo.

## Qué se elimina

| Se va                                  | Por qué                                |
| -------------------------------------- | -------------------------------------- |
| `prompts.js` (profilePrompts)          | Sustituido por `profile.md` por perfil |
| Captura automática de screenshots      | Sin sentido en diseño reactivo         |
| `MANUAL_SCREENSHOT_PROMPT`             | Cableado a modo LeetCode               |
| `screenAnalysisHistory`                | Absorbido por el hilo único            |
| `whisperModel: 'tiny.en'` como default | Ver D4                                 |

## Fuera de alcance (YAGNI)

Decisiones conscientes de **no** construir ahora:

- **RAG / embeddings** — innecesario con 1M de contexto (D8).
- **Recarga en caliente de markdowns** a mitad de reunión; se leen al iniciar sesión.
- **Segundo breakpoint de caché** que avance con el transcript; optimización prematura.
- **Grabación de audio de sesión** comprimida; candidata clara para después (D11).
- **Runtime para Parakeet u otros ASR no-whisper.cpp** (D4).
- **Modo `cloud`** con el WebSocket propio; sigue deshabilitado en UI.

## Orden de implementación sugerido

1. `session-context.js` — el núcleo, con tests. Todo lo demás cuelga de aquí.
2. Perfiles como carpetas + migración desde `customPrompt`.
3. Catálogo de Whisper ampliado + VAD corregido + banco de pruebas.
4. Audio dual etiquetado + esquema de sesión nuevo.
5. Screenshot reorientado + eliminación de la captura automática.
6. Resampleo en el renderer con `OfflineAudioContext`.
