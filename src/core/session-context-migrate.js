// Converts the old { transcription, ai_response } schema into the event thread.
// In that schema `transcription` was always the interviewer: the app never
// listened to the user at all (finding H5).
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
