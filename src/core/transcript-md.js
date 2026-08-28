const { formatClock } = require('./thread-view');

// The human-readable face of a session, derived from the event log — never the
// other way round. The log is exact and machine-owned; this is what you would drop
// into a notes app or sync to a provider, and it can always be regenerated, so
// there are never two sources of truth.

const SPEAKER_LABELS = { them: 'Them', me: 'Me' };

function formatDate(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function titleFrom(profileName) {
    return (profileName || 'Session')
        .split(/[-_]/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function renderTranscriptMarkdown({ sessionId, profileName, events = [], digest = null }) {
    const ordered = (events || []).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
    const startedAt = ordered.length > 0 ? ordered[0].t : Number(sessionId) || Date.now();

    const lines = [`# ${titleFrom(profileName)}`, '', `${formatDate(startedAt)} · session \`${sessionId}\``, ''];

    if (digest) {
        lines.push('## Summary', '', digest.trim(), '');
    }

    const body = [];
    for (const event of ordered) {
        // Echoes are kept in the thread so they can be inspected, but a document
        // meant to be read should not say the same thing twice (D23).
        if (event.kind === 'speech' && !event.echo) {
            body.push(`**${formatClock(event.t)} · ${SPEAKER_LABELS[event.speaker] || event.speaker}**`, '', event.text, '');
        } else if (event.kind === 'ask') {
            body.push(`**${formatClock(event.t)} · You asked**`, '', event.question, '', '> ' + (event.answer || '').split('\n').join('\n> '), '');
        } else if (event.kind === 'screen') {
            body.push(`**${formatClock(event.t)} · Screen captured** — \`${event.imageRef}\`${event.caption ? ` (${event.caption})` : ''}`, '');
        }
    }

    if (body.length === 0) {
        lines.push('_Nothing was recorded in this session._');
    } else {
        lines.push('## Transcript', '', ...body);
    }

    return (
        lines
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trimEnd() + '\n'
    );
}

module.exports = { renderTranscriptMarkdown };
