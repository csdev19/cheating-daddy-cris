const test = require('node:test');
const assert = require('node:assert');
const { projectThread, formatClock } = require('../src/core/thread-view');

// Readable clock: t(14, 2) is today at 14:02 local time, so the test does not
// depend on the machine's timezone.
function t(hour, minute, second = 0) {
    return new Date(2026, 0, 15, hour, minute, second).getTime();
}

test('an empty thread produces no rows', () => {
    assert.deepStrictEqual(projectThread([]), []);
    assert.deepStrictEqual(projectThread(undefined), []);
});

test('each speech turn is a row labelled with its speaker', () => {
    const rows = projectThread([
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: 'How would you handle a deadlock?' },
        { t: t(14, 3), kind: 'speech', speaker: 'me', text: 'I would look at the pool logs.' },
    ]);

    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].kind, 'speech');
    assert.strictEqual(rows[0].speaker, 'them');
    assert.strictEqual(rows[0].text, 'How would you handle a deadlock?');
    assert.strictEqual(rows[1].speaker, 'me');
});

// Whisper emits one segment per VAD pause, so a single spoken sentence arrives in
// pieces. Without merging, the view is an unreadable list of fragments.
test('merges consecutive segments from the same speaker inside the window', () => {
    const rows = projectThread([
        { t: t(14, 2, 0), kind: 'speech', speaker: 'them', text: 'Right,' },
        { t: t(14, 2, 3), kind: 'speech', speaker: 'them', text: 'so the lock' },
        { t: t(14, 2, 6), kind: 'speech', speaker: 'them', text: 'lives in another service.' },
    ]);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].text, 'Right, so the lock lives in another service.');
    assert.strictEqual(rows[0].t, t(14, 2, 0), 'the row keeps the start of the first segment');
    assert.strictEqual(rows[0].tEnd, t(14, 2, 6));
});

test('does not merge when the speaker changes', () => {
    const rows = projectThread([
        { t: t(14, 2, 0), kind: 'speech', speaker: 'them', text: 'And the timeout?' },
        { t: t(14, 2, 2), kind: 'speech', speaker: 'me', text: 'Thirty seconds.' },
    ]);

    assert.strictEqual(rows.length, 2);
});

test('does not merge when too much time passes between segments', () => {
    const rows = projectThread(
        [
            { t: t(14, 2, 0), kind: 'speech', speaker: 'them', text: 'First idea.' },
            { t: t(14, 5, 0), kind: 'speech', speaker: 'them', text: 'Second idea.' },
        ],
        { mergeWindowMs: 8000 }
    );

    assert.strictEqual(rows.length, 2);
});

test('a question to the assistant is one row with question and answer', () => {
    const rows = projectThread([{ t: t(14, 4), kind: 'ask', question: 'What am I missing?', answer: 'Mention lock ordering.' }]);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].kind, 'ask');
    assert.strictEqual(rows[0].question, 'What am I missing?');
    assert.strictEqual(rows[0].answer, 'Mention lock ordering.');
    assert.strictEqual(rows[0].imageRef, null);
});

// The screenshot and the question that uses it are one single user gesture;
// painting them as two separate rows breaks the reading.
test('a screenshot right before a question attaches to that question', () => {
    const rows = projectThread([
        { t: t(14, 4, 0), kind: 'screen', imageRef: 'session/screen-1.jpg', caption: null },
        { t: t(14, 4, 1), kind: 'ask', question: 'Help me with this', answer: 'It is a deadlock.' },
    ]);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].kind, 'ask');
    assert.strictEqual(rows[0].imageRef, 'session/screen-1.jpg');
});

test('a screenshot with no question behind it stays a row of its own', () => {
    const rows = projectThread([
        { t: t(14, 4, 0), kind: 'screen', imageRef: 'session/screen-1.jpg', caption: 'LeetCode' },
        { t: t(14, 9, 0), kind: 'ask', question: 'Something else', answer: 'Sure.' },
    ]);

    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].kind, 'screen');
    assert.strictEqual(rows[0].imageRef, 'session/screen-1.jpg');
    assert.strictEqual(rows[0].caption, 'LeetCode');
    assert.strictEqual(rows[1].imageRef, null);
});

test('a screenshot does not attach to two questions', () => {
    const rows = projectThread([
        { t: t(14, 4, 0), kind: 'screen', imageRef: 'session/screen-1.jpg' },
        { t: t(14, 4, 1), kind: 'ask', question: 'First', answer: 'One.' },
        { t: t(14, 4, 2), kind: 'ask', question: 'Second', answer: 'Two.' },
    ]);

    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].imageRef, 'session/screen-1.jpg');
    assert.strictEqual(rows[1].imageRef, null);
});

test('checklist events are rows of their own', () => {
    const rows = projectThread([{ t: t(14, 6), kind: 'checklist', itemId: 'salary', status: 'done' }]);

    assert.strictEqual(rows[0].kind, 'checklist');
    assert.strictEqual(rows[0].itemId, 'salary');
    assert.strictEqual(rows[0].status, 'done');
});

test('keeps chronological order across different kinds', () => {
    const rows = projectThread([
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: 'One' },
        { t: t(14, 3), kind: 'ask', question: 'Two', answer: 'Two.' },
        { t: t(14, 4), kind: 'speech', speaker: 'me', text: 'Three' },
    ]);

    assert.deepStrictEqual(
        rows.map(r => r.kind),
        ['speech', 'ask', 'speech']
    );
});

test('every row carries a stable id so Lit does not repaint needlessly', () => {
    const events = [
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: 'One' },
        { t: t(14, 3), kind: 'speech', speaker: 'me', text: 'Two' },
    ];

    const first = projectThread(events).map(r => r.id);
    const second = projectThread(events).map(r => r.id);

    assert.deepStrictEqual(first, second);
    assert.strictEqual(new Set(first).size, 2, 'ids do not repeat across rows');
});

test('ignores empty speech turns', () => {
    const rows = projectThread([
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: '   ' },
        { t: t(14, 3), kind: 'speech', speaker: 'me', text: 'Real.' },
    ]);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].text, 'Real.');
});

test('formatClock gives the local time as zero-padded HH:MM', () => {
    assert.strictEqual(formatClock(t(9, 5)), '09:05');
    assert.strictEqual(formatClock(t(14, 2)), '14:02');
    assert.strictEqual(formatClock(t(0, 0)), '00:00');
});
