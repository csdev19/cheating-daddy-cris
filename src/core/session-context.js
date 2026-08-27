const SPEAKERS = ['them', 'me'];
// Labels that go into the transcript the model reads. Deliberately neutral: the
// 'them' channel can hold more than one person (finding C1).
const SPEAKER_LABELS = { them: 'Them', me: 'Me' };

// The session's single thread. Replaces conversationHistory + screenAnalysisHistory,
// which lived apart and never reached the model together (finding H3).
function createSessionContext({ sessionId, profileName = null, now = Date.now, events = [] } = {}) {
    if (!sessionId) throw new TypeError('createSessionContext requires sessionId');

    const thread = events.slice();

    // Returns the event so whoever records it can forward it on (see `onEvent` in
    // session.js): the view needs the exact event that entered the thread.
    function push(event) {
        thread.push(event);
        thread.sort((a, b) => a.t - b.t);
        return event;
    }

    function addSpeech({ speaker, text, t }) {
        if (!SPEAKERS.includes(speaker)) {
            throw new TypeError(`speaker must be 'them' or 'me', got: ${speaker}`);
        }
        const clean = (text || '').trim();
        if (!clean) return null;
        return push({ t: t ?? now(), kind: 'speech', speaker, text: clean });
    }

    function addScreen({ imageRef, caption = null, t }) {
        if (!imageRef) throw new TypeError('addScreen requires imageRef');
        return push({ t: t ?? now(), kind: 'screen', imageRef, caption });
    }

    function addAsk({ question, answer, t }) {
        return push({ t: t ?? now(), kind: 'ask', question: (question || '').trim(), answer: (answer || '').trim() });
    }

    function addChecklist({ itemId, status, t }) {
        if (!itemId) throw new TypeError('addChecklist requires itemId');
        return push({ t: t ?? now(), kind: 'checklist', itemId, status });
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
