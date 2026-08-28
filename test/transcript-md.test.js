const test = require('node:test');
const assert = require('node:assert');
const { renderTranscriptMarkdown } = require('../src/core/transcript-md');

const at = (h, m) => new Date(2026, 7, 28, h, m).getTime();

test('renders a heading with the profile and the date', () => {
    const md = renderTranscriptMarkdown({
        sessionId: 's1',
        profileName: 'interview',
        events: [{ t: at(14, 2), kind: 'speech', speaker: 'them', text: 'Hi' }],
    });

    assert.match(md, /^# Interview/m);
    assert.match(md, /2026-08-28/);
});

test('each turn is a labelled line with its time', () => {
    const md = renderTranscriptMarkdown({
        sessionId: 's1',
        profileName: 'interview',
        events: [
            { t: at(14, 2), kind: 'speech', speaker: 'them', text: 'How would you handle a deadlock?' },
            { t: at(14, 3), kind: 'speech', speaker: 'me', text: 'Check the pool logs.' },
        ],
    });

    assert.match(md, /\*\*14:02 · Them\*\*\s+How would you handle a deadlock\?/);
    assert.match(md, /\*\*14:03 · Me\*\*\s+Check the pool logs\./);
});

test('a question to the assistant shows both sides', () => {
    const md = renderTranscriptMarkdown({
        sessionId: 's1',
        profileName: 'interview',
        events: [{ t: at(14, 5), kind: 'ask', question: 'What am I missing?', answer: 'Mention lock ordering.' }],
    });

    assert.match(md, /What am I missing\?/);
    assert.match(md, /Mention lock ordering\./);
});

// The echo is in the thread so it can be inspected, but a transcript meant for
// reading — or for uploading somewhere — should not carry the same words twice.
test('echoed turns are left out', () => {
    const md = renderTranscriptMarkdown({
        sessionId: 's1',
        profileName: 'interview',
        events: [
            { t: at(14, 2), kind: 'speech', speaker: 'them', text: 'Original words' },
            { t: at(14, 2), kind: 'speech', speaker: 'me', text: 'Original words', echo: true },
        ],
    });

    assert.strictEqual(md.match(/Original words/g).length, 1);
});

test('a screen capture is noted, without inlining the image', () => {
    const md = renderTranscriptMarkdown({
        sessionId: 's1',
        profileName: 'interview',
        events: [{ t: at(14, 4), kind: 'screen', imageRef: 's1/screen-1.jpg', caption: null }],
    });

    assert.match(md, /Screen captured/);
    assert.match(md, /screen-1\.jpg/);
});

test('a session with nothing in it still renders a valid document', () => {
    const md = renderTranscriptMarkdown({ sessionId: 's1', profileName: 'interview', events: [] });

    assert.match(md, /^# Interview/m);
    assert.strictEqual(md.trim().endsWith('_Nothing was recorded in this session._'), true);
});

test('the summary is included when there is one', () => {
    const md = renderTranscriptMarkdown({ sessionId: 's1', profileName: 'interview', events: [], digest: 'We agreed on X.' });

    assert.match(md, /## Summary/);
    assert.match(md, /We agreed on X\./);
});
