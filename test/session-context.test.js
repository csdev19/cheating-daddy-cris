const test = require('node:test');
const assert = require('node:assert');
const { createSessionContext, fromJSON } = require('../src/core/session-context');

function newContext() {
    let clock = 1000;
    return createSessionContext({ sessionId: 's1', profileName: 'interview', now: () => clock++ });
}

test('starts empty', () => {
    const ctx = newContext();
    assert.deepStrictEqual(ctx.getEvents(), []);
    assert.strictEqual(ctx.getTranscript(), '');
});

test('collects speech from both speakers into a single thread', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'What is your experience with Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Five years.' });

    const events = ctx.getEvents();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].kind, 'speech');
    assert.strictEqual(events[0].speaker, 'them');
    assert.strictEqual(events[1].speaker, 'me');
});

test('screen and speech share the thread, ordered by time', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Look at this code.' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addSpeech({ speaker: 'me', text: 'I see it.' });

    assert.deepStrictEqual(
        ctx.getEvents().map(e => e.kind),
        ['speech', 'screen', 'speech']
    );
});

test('sorts by timestamp even when events arrive out of order', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'me', text: 'second', t: 200 });
    ctx.addSpeech({ speaker: 'them', text: 'first', t: 100 });

    assert.deepStrictEqual(
        ctx.getEvents().map(e => e.text),
        ['first', 'second']
    );
});

test('the transcript labels each speaker', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Hello' });
    ctx.addSpeech({ speaker: 'me', text: 'Hi there' });

    assert.strictEqual(ctx.getTranscript(), '[Them]: Hello\n[Me]: Hi there');
});

test('the transcript ignores everything that is not speech', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Hello' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addAsk({ question: 'what do I say?', answer: 'this' });

    assert.strictEqual(ctx.getTranscript(), '[Them]: Hello');
});

test('rejects unknown speakers', () => {
    const ctx = newContext();
    assert.throws(() => ctx.addSpeech({ speaker: 'other', text: 'x' }), /speaker/);
});

test('drops empty or whitespace-only text', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: '   ' });
    ctx.addSpeech({ speaker: 'them', text: '' });
    assert.strictEqual(ctx.getEvents().length, 0);
});

test('the checklist keeps the latest state of each item', () => {
    const ctx = newContext();
    ctx.addChecklist({ itemId: 'ask-salary', status: 'pending' });
    ctx.addChecklist({ itemId: 'mention-k8s', status: 'done' });
    ctx.addChecklist({ itemId: 'ask-salary', status: 'done' });

    const state = ctx.getChecklistState();
    assert.strictEqual(state.get('ask-salary'), 'done');
    assert.strictEqual(state.get('mention-k8s'), 'done');
});

test('survives a JSON round-trip', () => {
    const ctx = newContext();
    ctx.addSpeech({ speaker: 'them', text: 'Hello' });
    ctx.addScreen({ imageRef: 'img-1', caption: 'an IDE' });

    const restored = fromJSON(JSON.parse(JSON.stringify(ctx.toJSON())));
    assert.strictEqual(restored.getTranscript(), '[Them]: Hello');
    assert.strictEqual(restored.getEvents().length, 2);
    assert.strictEqual(restored.toJSON().sessionId, 's1');
});

test('requires a sessionId', () => {
    assert.throws(() => createSessionContext({}), /sessionId/);
});
