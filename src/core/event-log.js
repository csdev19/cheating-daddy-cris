// One event, one line. The log is only ever appended to, never rewritten, so a
// crash costs at most the line being written — everything before it is already on
// disk and still readable.
//
// This is why the thread is not stored as one growing JSON document: rewriting the
// whole file on every event means the window where a crash destroys the session
// grows with the session itself.

function serializeEvent(event) {
    // JSON.stringify escapes newlines, so the one-line contract holds whatever the
    // speech contained.
    return `${JSON.stringify(event)}\n`;
}

function parseEventLog(text) {
    if (typeof text !== 'string' || text.length === 0) return { events: [], dropped: 0 };

    const events = [];
    let dropped = 0;

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            events.push(JSON.parse(trimmed));
        } catch {
            // A torn final line from a crash, or a corrupted one: skip it and keep
            // whatever else is readable.
            dropped += 1;
        }
    }

    events.sort((a, b) => (a.t || 0) - (b.t || 0));
    return { events, dropped };
}

module.exports = { serializeEvent, parseEventLog };
