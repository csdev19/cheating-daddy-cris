# 03 — Registro de decisiones

Cada decisión con su contexto y su porqué. Incluye las que se **revirtieron** a
mitad del análisis, con la razón del cambio — son las más útiles de conservar.

---

## D1 — Reactivo, no proactivo

**Decisión:** la app solo muestra respuesta cuando pulsas un atajo. Acumula
contexto en silencio el resto del tiempo.

**Por qué:** en una entrevista, con alguien mirándote a la cara, cualquier cosa
que aparezca sola es una distracción. Además desacopla la transcripción (continua
y barata) del razonamiento (ocasional y caro), lo que elimina de paso el consumo
de límites diarios que la app tiene hoy llamando al modelo en cada turno.

---

## D2 — Una sola app, este repositorio

**Decisión:** no hay puente HTTP entre procesos. La captura de pantalla se porta
aquí desde el otro proyecto Electron.

**Contexto:** el otro proyecto se mencionó como evidencia de que la captura ya
está resuelta y es rápida, no como una app que deba permanecer separada.

**Por qué:** `ipcMain.handle` solo habla con el renderer de su propia app, así que
dos apps exigirían inventar un transporte (HTTP en loopback). Era la pieza más
frágil del plan y desaparece entera al consolidar.

---

## D3 — Transcripción local con Whisper, no Gemini Live

**Decisión:** `whisper-server` local transcribe; el proveedor en la nube solo razona.

**Alternativa descartada:** Gemini Live hace transcripción + diarización + razonamiento
en un solo stream, con bastante menos código.

**Por qué:** lo que está siempre encendido debe ser lo más robusto y lo más barato.
Gemini Live es un WebSocket abierto 45 minutos — el repo ya tiene reconexión con 3
intentos _porque hacía falta_. Una desconexión a los 20 minutos de tu entrevista te
deja sin el hilo de la conversación, que es justo lo que se viene a construir.
Whisper local no se desconecta, no cuesta por minuto, y **tu audio nunca sale del Mac**.

**Lo que parecía que se perdía:** la diarización. No se pierde — ver D6.

---

## D4 — `large-v3-turbo`, no `tiny.en`, y no Parakeet en v1

**Decisión:** añadir `large-v3-turbo` al catálogo y hacerlo default. Mantener
`medium.en` y `small.en` como alternativas.

**Por qué no `tiny.en`:** es el modelo más pequeño de la familia, justo donde los
acentos se derrumban. Y al ser `.en` no detecta idioma, lo asume: con español
produce basura, no degradación.

**Por qué no un modelo `.en` más grande:** los `.en` sí superan a los multilingües
del mismo tamaño en inglés, pero la ventaja se estrecha con el tamaño — tanto que
en `large` ni existe variante `.en`. `large-v3-turbo` cubre inglés mejor que
`small.en` **y** deja la puerta abierta al español sin cambiar nada.

**Por qué no Parakeet:** es mejor sobre el papel (~6.3% WER vs ~7.8% de turbo) y
más pequeño, pero **no corre en whisper.cpp**. Adoptarlo significa compilar y
hospedar binarios nuevos para macOS arm64 y Windows con verificación SHA,
replicando lo que `native-ai-runtime.js` ya hace. Es un proyecto, no un cambio de
configuración. Además el ranking se mueve rapidísimo (tres modelos distintos
pasaron por el primer puesto solo en 2026): construir infraestructura para
perseguir al líder es perseguir un blanco móvil.

**Cómo se revisará:** con el banco de pruebas sobre audio real. Si `large-v3-turbo`
no rinde con acento propio, ahí habrá justificación con datos para invertir en Parakeet.

---

## D5 — VAD `NORMAL` con pre-roll

**Decisión:** bajar de `VERY_AGGRESSIVE` a `NORMAL` (umbral 0.02 → 0.01, silencio
15 → 30 frames) y añadir pre-roll de ~300 ms.

**Por qué:** es probablemente la causa principal de la mala experiencia previa, por
encima del modelo. El VAD actual corta por energía RMS pura: quien habla bajo, tiene
mal micro, o **hace una pausa para pensar** (constante en entrevistas) queda cortado
antes de que Whisper vea el audio. El pre-roll recupera el arranque de frase, que es
lo que más se pierde con hablantes acentuados.

---

## D6 — Etiquetado por canal, no diarización

**Decisión:** la etiqueta de hablante viene del stream de origen — audio del
sistema = `[them]`, micrófono = `[me]`.

**Por qué:** con captura dual son dos streams físicamente separados, así que el
etiquetado es correcto **por construcción** y no necesita ningún algoritmo. Es más
fiable que la diarización, que infiere quién habla y falla cuando dos personas se
pisan o cuando hay tres en la llamada.

**Consecuencia:** la única ventaja real de Gemini Live sobre Whisper local (D3) se
evapora precisamente por el diseño de captura ya elegido.

---

## D7 — Perfiles como carpetas de markdown

**Decisión:** un perfil es una carpeta con `profile.md`, `checklist.md` y `context/*.md`.

**Por qué:** no hace falta construir UI de autoría — escribes en tu editor. Y
`profile.md` es lo que mata el prompt de teleprompter (H6): el comportamiento lo
defines tú, no está hardcodeado.

**Alternativas descartadas:** textarea más grande (se queda corto con material real);
RAG con embeddings (ver D8); cargar archivos sueltos por sesión (no acumula memoria
reutilizable entre reuniones del mismo tipo).

---

## D8 — Sin RAG ni embeddings

**Decisión:** todo `context/*.md` se envía completo en cada invocación.

**Por qué:** los modelos objetivo tienen **1M de tokens de contexto**. Todas tus
notas más el transcript completo más el screenshot caben con holgura. Añadir un
modelo de embeddings y un vector store resolvería un problema que no existe, y
sería un subsistema entero que mantener.

**Cuándo revisarlo:** si el material previo creciera hasta no caber, o si el coste
de reenviarlo dejara de estar amortizado por el prompt caching.

---

## D9 — Gemini primero, no Claude _(recomendación revisada)_

**Decisión:** v1 sale con el adaptador de Gemini que ya existe y funciona.

**Recomendación previa:** Claude (Opus 5, luego Sonnet 5).

**Por qué cambió:** dos razones, una de ellas un error propio.

1. **La comparación de precios estaba mal hecha.** Se compararon los tiers altos de
   Claude contra el tier _Flash_ de Gemini. Comparando tier contra tier, Gemini 2.5
   Pro (~$0.20/reunión) y Claude Sonnet 5 (~$0.23/reunión) cuestan prácticamente
   lo mismo. La afirmación "Gemini es mucho más barato" solo se sostenía por la
   comparación sesgada.
2. **El repo ya habla Gemini con fluidez.** `gemini.js` funciona, tiene reconexión,
   Live API, y el grounding de Google Search ya cableado (H9) — que sirve
   directamente a la capacidad de lookup de conceptos. Claude sería código nuevo
   que aún no existe, y ambos requieren igualmente su propia API key.

**Lo que no cambia:** el diseño. El _seam_ de la sección 1 (`session-context.js`
ensambla, un adaptador envía) mantiene barato enchufar Claude después.

**Cómo se revisará:** midiendo. La misma reunión contra Gemini y contra Sonnet 5.
Si Gemini recupera bien las notas y lee bien los screenshots, no hay razón para
pagar más. Si alucina una cifra que sí estaba en los markdowns, ahí está la respuesta.

**Nota factual:** 1M de contexto **no es exclusivo de Fable**. Opus 5, Sonnet 5 y
Fable 5 lo tienen. Fable es simplemente el tier caro ($10/$50) y no hace falta aquí.

---

## D10 — TanStack AI: fuera

**Decisión:** no adoptar `@tanstack/ai`. Ver análisis completo en [04-evaluaciones.md](04-evaluaciones.md).

**Por qué:** encaja conceptualmente (adapta Anthropic, Gemini, Groq, Ollama y
OpenAI-compatible, que mapea casi 1:1 con los modos del repo) pero choca
mecánicamente: es **ESM puro** y viviría en el **main process**, que es CommonJS
sobre Node 20 — donde `require(esm)` no funciona. Adoptarlo obliga a subir Electron
o meter el primer bundler del repo. Súmale que va en 0.49.1 (adaptador Anthropic en
0.18.0) y que su doc no confirma entrada de imágenes, que es requisito central aquí.

Resuelve un problema que aún no se tiene: se está consolidando _hacia_ un proveedor,
no repartiendo entre once.

---

## D11 — Mediabunny: fuera de v1, candidato después

**Decisión:** no en el camino crítico. `OfflineAudioContext` para el resampleo.

**Por qué no ahora:** el núcleo mueve PCM en memoria hacia Whisper; no hay
contenedores ni códecs de por medio, que es el terreno de Mediabunny. Y el
resampler defectuoso (H7) vive en el **main process**, donde no hay WebCodecs ni
AudioContext — Mediabunny no puede arreglarlo ahí. Moviendo el DSP al renderer,
`OfflineAudioContext` remuestrea correctamente sin añadir dependencias.

**Por qué sí después:** para **grabar el audio de la sesión comprimido**. Eso permite
re-transcribir reuniones pasadas con modelos mejores y alimentar el banco de pruebas
con material real. WAV crudo son cientos de MB por reunión; Opus son unos pocos.

**Nota:** a diferencia de TanStack, aquí el ESM **no es un bloqueo** — Mediabunny
iría en el renderer, que ya carga ES modules (así se importa Lit hoy). Se vendoriza
en `src/assets/` siguiendo el patrón existente. Además va en v1.55.2 con cero
dependencias: riesgo mucho menor.

---

## D12 — Modelo elegible por perfil

**Decisión:** `model:` en el frontmatter de `profile.md`.

**Por qué:** el coste por reunión va de ~$0.01 a ~$1.16 según el modelo, pero el
riesgo también varía enormemente. Una entrevista de trabajo justifica el modelo
bueno; un daily standup no. Esto lo resuelve sin piezas nuevas, y de paso conserva
el adaptador de Gemini como opción barata y como salida si algún día se cambia de
proveedor.

---

## D13 — Perfiles confidenciales se quedan locales

**Decisión:** flag `confidential: true` en el frontmatter → esa sesión no envía nada
a la nube y acepta ser menos capaz.

**Por qué:** aunque el audio nunca sale del Mac (D3), el **transcript sí viaja** al
proveedor en cada invocación. Para una reunión confidencial eso es exposición real.
La decisión se toma al elegir el perfil, no en caliente a mitad de reunión.

---

# Decisiones de la auditoría (2026-08-26)

Surgidas de [06-auditoria.md](06-auditoria.md).

## D14 — Transcripción y razonamiento son ejes independientes

**Decisión:** sustituir el modo único `byok | cloud | local` por dos ajustes:
`transcription: 'local-whisper' | 'gemini-live'` y `reasoning: 'gemini' | 'local-llama'`.
Default: `local-whisper` + `gemini`.

**Por qué:** hoy "local" significa _whisper y llama juntos_ (`localai.js:425` arranca
ambos sin opción). La combinación que el diseño necesita — transcribir en local,
razonar en la nube — no existía. Sin esta decisión, usar Whisper obligaba a
descargar Qwen y tener 17 GB de RAM ocupados sin usarlos (A1).

**Consecuencia:** `initializeLocalSession` se divide en `startTranscription()` y
`startLocalReasoning()`. El perfil `confidential: true` (D13) fuerza
`reasoning: 'local-llama'`.

## D15 — Un único punto de entrada para preguntar

**Decisión:** texto, screenshot y atajo entran todos por `sessionManager.ask()`.
`send-text-message` deja de hablar directamente con los proveedores.

**Por qué:** el plan solo cableaba el screenshot; una pregunta escrita se saltaba
notas y transcript (A2). No tiene sentido que el modelo tenga memoria solo cuando
hay imagen.

## D16 — El checklist se evalúa por contexto, no por estado, en v1

**Decisión:** no generar eventos `checklist` en v1. El modelo recibe la lista y el
transcript, y cuando se le pregunta responde qué queda pendiente. `addChecklist`
se conserva en el hilo para una v2 con marcado explícito.

**Por qué:** ninguna tarea producía esos eventos (A3). Las dos alternativas — pedir
al modelo salida estructurada en cada `ask`, o una llamada extra por turno — añaden
coste y complejidad para un beneficio que el contexto ya cubre razonablemente bien.
Se mide primero si el modelo acierta con la lista en contexto; si falla, se añade
estado.

## D17 — Resumen post-sesión que alimenta el perfil

**Decisión:** al cerrar sesión, generar un resumen (acuerdos, pendientes, nombres,
cifras) y **añadirlo** a `profiles/<perfil>/context/historial.md`. Se muestra
también en `HistoryView`.

**Por qué:** era la mayor omisión de la idea (M1). "Recordar lo que olvido" incluye
lo dicho en la reunión anterior con la misma persona. Cierra el bucle entre sesiones
por el coste de una llamada. Y hace que el historial sea legible sin leer el
transcript crudo (M2).

**Límite:** `historial.md` se recorta a las últimas N entradas (N=20) para que el
prefijo cacheado no crezca sin límite.

## D18 — Auriculares como requisito documentado

**Decisión:** la UI de inicio de sesión avisa de que sin auriculares el canal
`[me]` puede recoger al entrevistador. No se intenta separar por software.

**Por qué:** el etiquetado por canal (D6) solo es "correcto por construcción" con
auriculares (B1). `echoCancellation` ya está activo y mitiga; prometer más sería
mentir. Es más honesto avisar que construir diarización para tapar el caso.

## D19 — `AGENTS.md` deja de prometer TypeScript/React/shadcn

**Decisión:** reescribir `AGENTS.md` para que remita a `documentation/` como fuente
de verdad y elimine las instrucciones de migración a TS + React 19 + shadcn.

**Por qué:** contradice frontalmente las restricciones globales (CommonJS, sin build,
Lit). Un agente que lo lea primero deshará el trabajo (B8).

## D20 — La latencia total es de 6-9 s y se asume

**Decisión:** aceptar que del fin de una frase a ver respuesta pasan 6-9 s
(VAD + Whisper + pulsar + Gemini). Probar `silenceFramesRequired: 20` (2 s) con el
banco de pruebas como primer ajuste; añadir streaming de respuesta (B5).

**Por qué:** el diseño reactivo lo implicaba pero nadie lo había sumado (C3).
Sirve para "recordar una cifra", no para "qué digo ahora mismo" — y eso es
coherente con D1: la app es memoria, no teleprompter.
