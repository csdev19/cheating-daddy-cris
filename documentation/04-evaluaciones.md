# 04 — Evaluaciones

Librerías y modelos evaluados durante el análisis, con los datos que sustentan
las decisiones de [03-decisiones.md](03-decisiones.md).

Todos los datos verificados el **2026-08-25**. Los precios y rankings cambian;
reverificar antes de apoyarse en ellos.

---

## Librerías

### TanStack AI → descartado (D10)

Framework agéntico headless, agnóstico de framework de UI.

| Aspecto             | Dato                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Versión core        | `@tanstack/ai` **0.49.1**                                                                                                |
| Adaptador Anthropic | `@tanstack/ai-anthropic` **0.18.0**                                                                                      |
| Formato             | **`"type": "module"` — ESM puro**                                                                                        |
| Engines             | `node >=18`                                                                                                              |
| Peer deps           | `zod ^4`, `@anthropic-ai/vertex-sdk ^0.19`                                                                               |
| Proveedores         | 11: OpenRouter, OpenAI, Anthropic, Gemini, Bedrock, Mistral, Groq, Grok, Ollama, ElevenLabs, fal.ai + `openaiCompatible` |
| Capacidades         | Streaming, tool calling con gates de aprobación, chat state, `cache_control`                                             |

**A favor:** mapea casi 1:1 con los tres modos del repo — Gemini y Groq directos, y
el `llama-server` local ya habla OpenAI-compatible. Sustituiría plomería de
proveedor escrita a mano: `gemini.js` (1365 líneas), `cloud.js` y parte de `localai.js`.

**En contra:**

1. **Choque de módulos.** Viviría en el main process, que es **CommonJS sobre Node 20**.
   `require(esm)` llegó en Node 22. Adoptarlo exige subir Electron a 35+, meter un
   bundler (el repo no tiene ninguno), o convertir el main a ESM.
2. **Pre-1.0.** Core en 0.49.1, adaptador Anthropic en 0.18.0. La API todavía se mueve.
3. **Visión sin confirmar.** La doc del adaptador de Anthropic no documenta entrada
   de imágenes — requisito central aquí.
4. **Ecosistema mayormente irrelevante:** `ai-memory` es Redis/mem0/Honcho (aquí la
   memoria son markdowns locales); los bindings de UI son React/Vue/Svelte (aquí es Lit).

**Fuentes:** [tanstack.com/ai](https://tanstack.com/ai/latest) ·
[adaptador Anthropic](https://tanstack.com/ai/latest/docs/adapters/anthropic) ·
[quick start server](https://tanstack.com/ai/latest/docs/getting-started/quick-start-server) ·
[npm](https://www.npmjs.com/package/@tanstack/ai)

---

### Mediabunny → fuera de v1, candidato después (D11)

Toolkit de media en TypeScript puro sobre WebCodecs.

| Aspecto      | Dato                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| Versión      | **1.55.2** (madura)                                                            |
| Formato      | `"type": "module"` — ESM                                                       |
| Dependencias | **cero**                                                                       |
| Formatos     | mp4, mov, webm, mkv, wav, mp3, ogg, flac, adts, subtítulos                     |
| Capacidades  | Leer, escribir, convertir; transmux, transcode, resize, **resampleo de audio** |
| Runtime      | Browser-first, apoyado en WebCodecs                                            |

**El ESM aquí no bloquea**, a diferencia de TanStack: Mediabunny iría en el
**renderer**, que ya es contexto de navegador y ya carga ES modules —
`import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js'`.
Se vendoriza en `src/assets/` con el patrón que el repo ya usa para Lit, marked
y highlight.js. Sin bundler.

**Dónde aportaría:**

- _Resampleo correcto_ — pero el resampler defectuoso (H7) corre en el **main
  process**, sin WebCodecs ni AudioContext. Moviendo el DSP al renderer,
  `OfflineAudioContext` ya resuelve esto sin dependencias. Mediabunny no gana aquí.
- _Grabar audio de sesión comprimido_ — **este sí es caso genuino**. Permite
  re-transcribir reuniones pasadas con modelos mejores y alimentar el banco de
  pruebas con material real. WAV crudo son cientos de MB por reunión; Opus, unos pocos.

**Veredicto:** herramienta correcta para la función de grabación, coste de adopción
bajo, pero no en el camino crítico de v1.

**Fuentes:** [mediabunny.dev](https://mediabunny.dev) · npm `mediabunny@1.55.2`

---

## Modelos de transcripción (ASR)

### Disponibles sin tocar el runtime

El `whisper-server` del repo carga GGML. Verificado en
[ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp) — todos drop-in,
una entrada de catálogo y listo:

```
ggml-large-v3-turbo.bin        ggml-large-v3-turbo-q5_0.bin   ← mitad de tamaño
ggml-large-v3.bin              ggml-medium.en.bin
ggml-medium-q5_0.bin           ggml-small.en.bin
```

Hay variantes cuantizadas (`q5_0`, `q8_0`) de casi todo. En un M4 Pro / 24 GB no
hacen falta: `large-v3-turbo` completo (~1.6 GB) entra sin problema.

El catálogo **actual** del repo (`native-ai-runtime.js:49`) solo tiene `tiny.en`,
`base.en` y `small.en`.

### Mejores, pero incompatibles con el runtime

| Modelo                          | WER inglés | Runtime           | ¿Drop-in? |
| ------------------------------- | ---------- | ----------------- | --------- |
| IBM Granite Speech 4.1 2B       | ~5.33%     | transformers      | ✗         |
| Cohere Transcribe 2B            | ~5.42%     | transformers      | ✗         |
| NVIDIA Canary Qwen 2.5B         | ~5.63%     | NeMo              | ✗         |
| **NVIDIA Parakeet TDT 0.6B v3** | **~6.32%** | NeMo / ONNX / MLX | ✗         |
| **Whisper large-v3-turbo**      | **~7.83%** | **whisper.cpp**   | **✓**     |

Parakeet es mejor que turbo en inglés, más pequeño (0.6B), y cubre 25 idiomas
europeos incluido español. El bloqueo es puramente de plomería (ver D4).

**Dos advertencias sobre estos números:**

1. **El ranking se mueve rapidísimo** — solo en 2026 pasaron por el primer puesto
   Canary Qwen, luego Cohere Transcribe, luego Granite.
2. **El WER se mide sobre datasets curados**, no sobre audio comprimido de Google
   Meet con acento no nativo. El resultado real puede ordenarse distinto. De ahí
   el banco de pruebas.

**Fuentes:** [Open ASR Leaderboard](https://huggingface.co/blog/open-asr-leaderboard) ·
[ASR Leaderboard paper](https://arxiv.org/html/2510.06961v4) ·
[comparativa STT 2026](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks)

### Sobre modelos `.en` vs multilingües

Los `.en` superan a los multilingües del mismo tamaño en inglés, porque no gastan
capacidad en 98 idiomas. La ventaja es grande en `tiny`/`base` y se estrecha con el
tamaño — tanto que en `large` **no existe variante `.en`**.

Trampa importante: los `.en` **no detectan idioma, lo asumen**. Con español no
degradan: transliteran a palabras inglesas y producen basura.

---

## Modelos de razonamiento y coste

### Supuestos del cálculo

Reunión de 30 min, ~20 invocaciones del atajo, ~8k tokens de notas en el bloque
cacheado, transcript creciendo hasta ~5k, screenshot en la mitad de invocaciones
(~1.1k tokens cada uno), ~300 tokens de respuesta.

### Comparativa

| Modelo                | Contexto | In / Out ($/1M)     | ~Coste/reunión | 20 reuniones/mes |
| --------------------- | -------- | ------------------- | -------------- | ---------------- |
| Gemini 2.5 Flash-Lite | 1M       | $0.10 / $0.40       | ~$0.01         | ~$0.20           |
| Gemini 3.7 Flash      | 1M       | $0.75 / $3.75       | ~$0.08         | ~$1.60           |
| **Gemini 2.5 Pro**    | 1M       | $1.25 / $10 (≤200k) | **~$0.20**     | ~$4.00           |
| **Claude Sonnet 5**   | 1M       | $2 / $10            | **~$0.23**     | ~$4.60           |
| Claude Opus 5         | 1M       | $5 / $25            | ~$0.58         | ~$11.60          |
| Claude Fable 5        | 1M       | $10 / $50           | ~$1.16         | ~$23             |

**Conclusión: el precio no es la variable de decisión.** Incluso el tier caro sale
por ~$12 al mes. La diferencia entre Gemini Flash y Opus 5 son ~$10 mensuales — no
es criterio para elegir la herramienta que te salva, o no, una entrevista.

El **prompt caching** hace la mayor parte del trabajo: las notas se escriben en
caché una vez y las otras 19 invocaciones las leen a ~0.1x. Por eso el bloque
grande y estable apenas pesa en la factura, y por eso el ensamblado del payload
en [02-diseno.md](02-diseno.md) ordena estable → volátil.

### Notas

- **1M de contexto no es exclusivo de Fable.** Opus 5, Sonnet 5 y Fable 5 lo tienen.
- **Gemini 3.7/3.6 Flash duplica precio el 1 de enero de 2027** ($1.50 / $7.50).
- **El caching de Gemini cobra almacenamiento por hora** además del token.
  Despreciable en sesiones de 30 min; deja de serlo si la app corre todo el día.
- **Claude no acepta audio en absoluto.** Gemini Live sí, con diarización — es su
  mayor diferenciador para esta app, aunque D6 lo vuelve innecesario.
- **La suscripción de Claude Code no sirve como backend.** Pro/Max cubre el uso de
  Claude Code como herramienta; una app de terceros necesita credenciales de API,
  facturadas por token.

**Fuentes:** [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) ·
[Gemini pricing 2026 — CloudZero](https://www.cloudzero.com/blog/gemini-pricing/) ·
precios de Claude según la referencia oficial de la API consultada durante el análisis.
