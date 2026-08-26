# 06 — Auditoría del diseño y del plan

Revisión crítica del análisis (`01`–`04`) y del plan (`05`) hecha el 2026-08-26,
buscando qué se nos estaba pasando y cómo mejorar la idea. Cada hallazgo indica
si se verificó contra el código o es un riesgo a comprobar.

Resultado en una línea: **el diseño aguanta, pero el plan tenía tres agujeros
que lo habrían hecho inservible en v1** (A1–A3), y hay una mejora de producto
que multiplica el valor del resto (M1).

---

## A — Agujeros que rompen v1 (bloqueantes)

### A1 — Transcripción local está encadenada a arrancar un LLM local

**Verificado.** `initializeLocalSession` (`localai.js:425`) siempre hace
`prepareNativeFiles(model, whisperModel)` → descarga Qwen (~2,5 GB) → `startLlamaServer`.
No hay forma de levantar solo `whisper-server`.

El plan (Tareas 7-8) asume "Whisper local + Gemini razona", pero esa combinación
**no existe** en el modelo de modos actual (`byok | cloud | local`). Tal como está,
para transcribir en local tendrías que descargar y correr Qwen sin usarlo — 17 GB
de RAM tirados en mitad de la entrevista, justo el escenario que descartamos en D9.

**Corrección:** separar dos ejes que hoy son uno. Ver D14.

### A2 — Las preguntas por texto no pasan por el hilo de contexto

**Verificado.** El plan cablea solo `send-image-content` al gestor (Tarea 10).
`send-text-message` (`gemini.js:1208`) sigue yendo a Gemini Live / Groq / llama con
su propia historia. Es decir: si escribes una pregunta en vez de hacer screenshot,
el modelo **no ve tus notas ni el transcript**. La mitad de las invocaciones
quedarían fuera del diseño.

**Corrección:** un solo punto de entrada `ask` para texto, screenshot y atajo. Ver D15.

### A3 — Nada produce eventos de checklist

**Verificado por omisión.** `session-context.js` acepta `addChecklist`, `payload.js`
lo renderiza, pero ninguna tarea genera ese evento. El checklist se muestra al
modelo como lista estática y jamás cambia de estado. La capacidad #3 ("avísame de
lo que me falta") queda a medias.

**Corrección:** en v1 lo resuelve el modelo con contexto, sin estado. Ver D16.

---

## B — Riesgos técnicos que hay que gestionar

### B1 — Sin auriculares, el etiquetado por canal se contamina

D6 dice "etiqueta correcta por construcción". Es cierto **solo con auriculares**.
Con altavoces, el micrófono recoge la voz del entrevistador y aparece en `[me]`.
`getUserMedia` ya pide `echoCancellation: true` (`renderer.js:239`), que mitiga pero
no elimina.

**Acción:** documentar auriculares como requisito en la UI de inicio de sesión, y
en el banco de pruebas medir el cruce con y sin ellos. No es código, es honestidad
en el producto.

### B2 — `whisper-server` atiende una petición a la vez

Dos canales con VAD independiente pueden cerrar segmento a la vez. whisper.cpp
serializa: el segundo espera. Con `large-v3-turbo` en M4 Pro un segmento de 5 s
tarda ~1-2 s, así que el retraso es tolerable pero **acumulable** en cruces largos.

**Acción:** cola por canal con descarte del segmento más viejo si se acumulan más
de N. Sin esto, tras una interrupción larga el transcript llega con retraso
creciente. Añadido como paso en la Tarea 7 (ver enmiendas).

### B3 — Whisper alucina en silencio y ruido

Comportamiento conocido: en segmentos sin voz devuelve frases inventadas
("Thank you for watching", "Subtítulos por…"). El VAD reduce el riesgo, pero el
pre-roll de D5 mete deliberadamente audio bajo el umbral.

**Acción:** pedir `response_format=verbose_json` y descartar segmentos con
`no_speech_prob > 0.6`, más una lista corta de frases-basura conocidas. Barato y
elimina la mayoría.

### B4 — El caching de Gemini no funciona como el de Anthropic

`04-evaluaciones.md` calculó costes asumiendo caché por prefijo. En Gemini el
caching **implícito** existe (2.5+) pero requiere prefijo estable **y** un mínimo
de tokens (~1024 en Flash), y no está claro que `systemInstruction` cuente como
prefijo de `contents`.

**Acción:** verificar en la Tarea 8 leyendo `usageMetadata.cachedContentTokenCount`
en la respuesta. Si es 0 de forma sostenida, mover el bloque estable al primer
mensaje `user` de `contents` en vez de `systemInstruction`. El coste sin caché
sigue siendo bajo (~$0.20-0.60/reunión), así que no bloquea — pero la estimación
sería optimista y hay que saberlo.

### B5 — La respuesta no se transmite en streaming

El adaptador de la Tarea 8 usa `generateContent` (espera la respuesta entera).
Con 8k de notas + transcript + imagen, son 2-4 s en blanco antes de ver nada.
En una entrevista, 3 s mirando una ventana vacía se notan.

**Acción:** `generateContentStream` y reutilizar los eventos `new-response` /
`update-response` que la UI ya sabe pintar. Ver enmienda a la Tarea 8.

### B6 — Doble pulsación del atajo = dos llamadas

No hay guarda de concurrencia en `sessionManager.ask`. Dos pulsaciones seguidas
lanzan dos peticiones y la segunda pisa la primera en pantalla.

**Acción:** `ask` rechaza mientras hay una petición en curso. Un `if (pending)` y
un test.

### B7 — El borrado de emergencia no toca el hilo en memoria

**Verificado.** `clear-sensitive-data` (`renderer.js:770`) solo hace
`storage.clearAll()`. El `sessionContext` vivo, con el transcript entero, sigue en
memoria del main process hasta que el proceso muere (300 ms después). Es una
ventana pequeña, pero el atajo promete "borrar todo".

**Acción:** que el handler de emergencia llame a `sessionManager.end()` antes de
salir. Una línea.

### B8 — `AGENTS.md` contradice las decisiones del proyecto

**Verificado.** `AGENTS.md:27-45` instruye migrar a TypeScript + React 19 + shadcn.
`03-decisiones.md` y las restricciones globales del plan dicen **cero build step,
CommonJS, Lit**. Un agente que lea `AGENTS.md` primero hará lo contrario de lo
acordado.

**Acción:** actualizar `AGENTS.md` para que apunte a `documentation/` como fuente
de verdad y retirar la sección de shadcn/TS. Ver D19.

### B9 — Identificadores de modelo sin verificar

Los ejemplos usan `gemini-3.7-flash`. Es el nombre comercial de la página de precios,
pero el id de API podría diferir (el repo usa `gemini-2.5-flash` y
`gemini-3.1-flash-live-preview`). Confirmar con `client.models.list()` en la Tarea 8
antes de fijarlo como default en `profiles-bootstrap.js`.

### B10 — El binario de whisper-server: ¿usa Metal?

Los binarios vienen de los releases del fork original (`native-ai-runtime.js:10`).
Si se compilaron sin Metal, `large-v3-turbo` corre en CPU y la latencia se multiplica
por 3-5. El banco de pruebas (Tarea 12) imprime milisegundos: si un segmento de
10 s tarda más de ~4 s, el binario no acelera y hay que recompilar o cambiar de modelo.

---

## C — Puntos flojos del análisis original

### C1 — Se subestimó la diarización real de una entrevista

Muchas entrevistas técnicas tienen **dos o tres entrevistadores**. El canal `[them]`
los mezcla a todos. Para la capacidad #2 ("quién preguntó qué") eso importa menos
de lo que parece — lo que necesitas recordar es _qué_ se preguntó — pero el diseño
debería nombrarlo en vez de prometer etiquetado perfecto.

### C2 — La estimación de coste asumió caché que no está verificada (ver B4)

### C3 — No se consideró la latencia total de la cadena

Del final de una frase del entrevistador a ver la respuesta:
VAD cierra (3 s de silencio a `NORMAL`) + Whisper (~1-2 s) + tú pulsas + Gemini (2-4 s).
**Son 6-9 s.** Es aceptable para "recordarme una cifra", pero no para "qué respondo
ahora". El diseño reactivo lo asume implícitamente; hay que decirlo explícitamente
para que nadie espere otra cosa. Reducir `silenceFramesRequired` a 20 (2 s) es un
ajuste razonable a probar con el banco.

---

## M — Mejoras a la idea

### M1 — Cerrar el bucle: la reunión de hoy alimenta la de mañana ⭐

La mayor omisión del diseño. "Recordar lo que olvido" incluye **lo que se dijo la
última vez con esta misma persona o cliente**. Hoy la sesión se guarda en `history/`
y nunca vuelve a leerse.

Propuesta: al cerrar sesión, una llamada extra genera un resumen de 10-15 líneas
(acuerdos, pendientes, nombres, cifras mencionadas) y lo **añade** a
`profiles/<perfil>/context/historial.md`. La siguiente reunión con ese perfil lo
carga automáticamente como cualquier otra nota.

Coste: una llamada por reunión (~centavos). Complejidad: ~40 líneas y un test.
Valor: convierte la app de "memoria de la sesión" en "memoria del cliente / del
proceso de selección". Es la función que te haría abrirla en cada reunión.
Ver D17.

### M2 — El resumen post-sesión también sirve como revisión

El mismo resumen de M1, mostrado en `HistoryView`, responde a "podríamos simplemente
ver la transcripción": mejor que la transcripción cruda, ves los puntos y bajas al
detalle solo si hace falta.

### M3 — Vista previa del contexto antes de empezar

Antes de iniciar sesión, mostrar qué perfil, qué archivos de `context/` y cuántos
tokens se van a enviar. Evita la sorpresa de "no cargó mi CV porque lo guardé como
`.txt`" (el loader solo lee `.md`) a mitad de entrevista. Poco código, quita un
modo de fallo silencioso.

### M4 — Dos atajos, no uno

`ask` con screenshot y `ask` sin screenshot son casos distintos: "qué es esto que
veo" vs "qué me estoy olvidando de decir". Mandar imagen siempre encarece y a veces
confunde. Dos keybinds ya están soportados por `updateGlobalShortcuts`.

---

## Enmiendas al plan (`05`)

| Tarea        | Cambio                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7**        | Añadir cola por canal (B2), filtro `no_speech_prob` + frases-basura (B3), `silenceFramesRequired: 20` como valor inicial a probar (C3)                                                                          |
| **8**        | `generateContentStream` con eventos `new-response`/`update-response` (B5); guarda de concurrencia en `ask` + test (B6); leer `cachedContentTokenCount` y registrar en consola (B4); verificar id de modelo (B9) |
| **10**       | Cablear también `send-text-message` a `sessionManager.ask` (A2); atajo sin imagen (M4); `sessionManager.end()` en el borrado de emergencia (B7)                                                                 |
| **Nueva 7b** | Modo de transcripción independiente: `startTranscriptionOnly()` que levanta solo `whisper-server` (A1, D14)                                                                                                     |
| **Nueva 14** | Resumen post-sesión a `context/historial.md` + render en `HistoryView` (M1, M2, D17)                                                                                                                            |
| **Nueva 15** | Actualizar `AGENTS.md` (B8, D19)                                                                                                                                                                                |
| **12**       | El banco imprime también `no_speech_prob` por segmento y prueba con/sin auriculares (B1, B3, B10)                                                                                                               |

Las tareas 1-6, 9, 11 y 13 no cambian.
