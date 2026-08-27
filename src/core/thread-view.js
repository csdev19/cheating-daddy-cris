// Proyecta el hilo de eventos a las filas que pinta la vista. Es el único sitio
// donde se decide qué se agrupa y qué se adjunta; la vista solo recorre el
// resultado. Al ser puro, `AssistantView` (sesión en curso) e `HistoryView`
// (sesión guardada) pintan exactamente lo mismo a partir de los mismos eventos.

// Whisper emite un segmento por pausa del VAD, así que una frase hablada llega
// troceada. Sin fusionar, la vista es una lista de fragmentos ilegibles.
const DEFAULT_MERGE_WINDOW_MS = 8000;

// Una captura y la pregunta que la usa son un solo gesto del usuario.
const DEFAULT_ATTACH_WINDOW_MS = 30000;

function formatClock(t) {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function projectThread(events, { mergeWindowMs = DEFAULT_MERGE_WINDOW_MS, attachWindowMs = DEFAULT_ATTACH_WINDOW_MS } = {}) {
    if (!Array.isArray(events) || events.length === 0) return [];

    const ordered = events.slice().sort((a, b) => a.t - b.t);
    const rows = [];
    // Índice en `rows` de la última captura aún sin pregunta que la reclame.
    let pendingScreenRow = -1;

    for (let i = 0; i < ordered.length; i++) {
        const event = ordered[i];

        if (event.kind === 'speech') {
            const text = (event.text || '').trim();
            if (!text) continue;

            const last = rows[rows.length - 1];
            const continuesTurn = last && last.kind === 'speech' && last.speaker === event.speaker && event.t - last.tEnd <= mergeWindowMs;

            if (continuesTurn) {
                last.text = `${last.text} ${text}`;
                last.tEnd = event.t;
            } else {
                rows.push({ id: `speech-${event.t}-${i}`, kind: 'speech', speaker: event.speaker, t: event.t, tEnd: event.t, text });
                pendingScreenRow = -1;
            }
            continue;
        }

        if (event.kind === 'screen') {
            rows.push({ id: `screen-${event.t}-${i}`, kind: 'screen', t: event.t, imageRef: event.imageRef, caption: event.caption ?? null });
            pendingScreenRow = rows.length - 1;
            continue;
        }

        if (event.kind === 'ask') {
            const claimed = pendingScreenRow >= 0 && event.t - rows[pendingScreenRow].t <= attachWindowMs ? rows[pendingScreenRow] : null;
            // La captura se consume: no puede adjuntarse también a la pregunta siguiente.
            if (claimed) rows.splice(pendingScreenRow, 1);
            pendingScreenRow = -1;

            rows.push({
                id: `ask-${event.t}-${i}`,
                kind: 'ask',
                t: event.t,
                question: event.question || '',
                answer: event.answer || '',
                imageRef: claimed ? claimed.imageRef : (event.imageRef ?? null),
            });
            continue;
        }

        if (event.kind === 'checklist') {
            rows.push({ id: `checklist-${event.t}-${i}`, kind: 'checklist', t: event.t, itemId: event.itemId, status: event.status });
            pendingScreenRow = -1;
        }
    }

    return rows;
}

const api = { projectThread, formatClock, DEFAULT_MERGE_WINDOW_MS, DEFAULT_ATTACH_WINDOW_MS };

// Node (main process y tests) lo consume como CommonJS; el renderer lo carga como
// script clásico y lo lee desde `window`, que es como las vistas Lit (ES modules)
// pueden usar un módulo de `src/core/` sin build step.
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.threadView = api;
