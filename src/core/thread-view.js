// Projects the event thread into the rows the view paints. This is the only place
// that decides what gets grouped and what gets attached; the view just walks the
// result. Being pure, `AssistantView` (live session) and `HistoryView` (stored
// session) render exactly the same thing from the same events.

// Whisper emits one segment per VAD pause, so a single spoken sentence arrives in
// pieces. Without merging, the view is an unreadable list of fragments.
const DEFAULT_MERGE_WINDOW_MS = 8000;

// A screenshot and the question that uses it are one single user gesture.
const DEFAULT_ATTACH_WINDOW_MS = 30000;

function formatClock(t) {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function projectThread(events, { mergeWindowMs = DEFAULT_MERGE_WINDOW_MS, attachWindowMs = DEFAULT_ATTACH_WINDOW_MS } = {}) {
    if (!Array.isArray(events) || events.length === 0) return [];

    const ordered = events.slice().sort((a, b) => a.t - b.t);
    const rows = [];
    // Index in `rows` of the last screenshot no question has claimed yet.
    let pendingScreenRow = -1;

    for (let i = 0; i < ordered.length; i++) {
        const event = ordered[i];

        if (event.kind === 'speech') {
            const text = (event.text || '').trim();
            if (!text) continue;

            const isEcho = event.echo === true;
            const last = rows[rows.length - 1];
            // An echoed fragment never merges into a real turn, or the marking would
            // disappear inside legitimate text (D23).
            const continuesTurn =
                last && last.kind === 'speech' && last.speaker === event.speaker && last.echo === isEcho && event.t - last.tEnd <= mergeWindowMs;

            if (continuesTurn) {
                last.text = `${last.text} ${text}`;
                last.tEnd = event.t;
            } else {
                rows.push({ id: `speech-${event.t}-${i}`, kind: 'speech', speaker: event.speaker, t: event.t, tEnd: event.t, text, echo: isEcho });
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
            // The screenshot is consumed: it cannot also attach to the next question.
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

// Node (main process and tests) consumes it as CommonJS; the renderer loads it as a
// classic script and reads it off `window`, which is how the Lit views (ES modules)
// can use a `src/core/` module with no build step.
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.threadView = api;
