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
