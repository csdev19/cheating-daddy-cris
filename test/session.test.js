const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionManager } = require('../src/core/session');

function makeConfigDir() {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const profile = path.join(cfg, 'profiles', 'interview');
    fs.mkdirSync(path.join(profile, 'context'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'profile.md'), '---\nname: Interview\nmodel: gemini-3.7-flash\n---\n\nBe my memory.');
    fs.writeFileSync(path.join(profile, 'context', 'cv.md'), 'Backend, 15 years.');
    return cfg;
}

test('start loads the profile and opens an empty thread', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'ok' });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    assert.strictEqual(manager.getProfile().meta.name, 'Interview');
    assert.deepStrictEqual(manager.getContext().getEvents(), []);
});

test('recordSpeech accumulates without calling the provider', async () => {
    let calls = 0;
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => {
            calls++;
            return 'answer';
        },
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    manager.recordSpeech('them', 'What do you know about Node?');
    manager.recordSpeech('me', 'Quite a lot.');

    assert.strictEqual(calls, 0);
    assert.strictEqual(manager.getContext().getEvents().length, 2);
});

test('ask sends the payload to the provider and records the answer', async () => {
    let received = null;
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async payload => {
            received = payload;
            return 'Say you cut latency by 40%.';
        },
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });
    manager.recordSpeech('them', 'What impact did you have?');

    const answer = await manager.ask({ question: 'what do I say?' });

    assert.strictEqual(answer, 'Say you cut latency by 40%.');
    assert.ok(received.system.includes('Backend, 15 years.'));
    assert.ok(received.transcript.includes('What impact did you have?'));
    assert.strictEqual(received.model, 'gemini-3.7-flash');

    const events = manager.getContext().getEvents();
    assert.strictEqual(events[events.length - 1].kind, 'ask');
});

test('ask fails clearly when there is no active session', async () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'x' });
    await assert.rejects(() => manager.ask({ question: 'x' }), /no active session/i);
});

test('ask rejects a second request while the first is in flight (B6)', async () => {
    let release;
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: () => new Promise(r => (release = r)),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    const first = manager.ask({ question: 'a' });
    await assert.rejects(() => manager.ask({ question: 'b' }), /already in flight/i);
    release('ok');
    assert.strictEqual(await first, 'ok');
});

test('ask releases the lock even when the provider fails', async () => {
    let shouldFail = true;
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => {
            if (shouldFail) throw new Error('boom');
            return 'ok';
        },
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    await assert.rejects(() => manager.ask({ question: 'a' }), /boom/);
    shouldFail = false;
    assert.strictEqual(await manager.ask({ question: 'b' }), 'ok');
});

test('the payload carries the confidential flag so the adapter can honour it', async () => {
    const cfg = makeConfigDir();
    const profile = path.join(cfg, 'profiles', 'private');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'profile.md'), '---\nname: Private\nconfidential: true\n---\n\nBe discreet.');

    let received = null;
    const manager = createSessionManager({
        configDir: cfg,
        sendToProvider: async payload => {
            received = payload;
            return 'ok';
        },
    });
    manager.start({ profileName: 'private', sessionId: 's1' });
    await manager.ask({ question: 'x' });

    assert.strictEqual(received.confidential, true);
});

test('recordScreen adds the event to the thread', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'x' });
    manager.start({ profileName: 'interview', sessionId: 's1' });
    manager.recordScreen('img-1');
    assert.strictEqual(manager.getContext().getEvents()[0].kind, 'screen');
});

test('end closes the session', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'x' });
    manager.start({ profileName: 'interview', sessionId: 's1' });
    manager.end();
    assert.strictEqual(manager.getContext(), null);
});

// The view paints the thread, so it has to learn about every event as it happens.
// `onEvent` is the only way out: without it the UI would have to poll the context.
test('onEvent reports each speech turn as it is recorded', () => {
    const seen = [];
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => seen.push(e),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    manager.recordSpeech('them', 'What do you know about Node?');

    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].kind, 'speech');
    assert.strictEqual(seen[0].speaker, 'them');
    assert.strictEqual(seen[0].text, 'What do you know about Node?');
});

test('onEvent stays quiet on an empty speech turn', () => {
    const seen = [];
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => seen.push(e),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    manager.recordSpeech('me', '   ');

    assert.deepStrictEqual(seen, []);
});

test('onEvent reports the screen capture', () => {
    const seen = [];
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => seen.push(e),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    manager.recordScreen('s1/screen-1.jpg');

    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].kind, 'screen');
    assert.strictEqual(seen[0].imageRef, 's1/screen-1.jpg');
});

test('onEvent reports the question once it has an answer', async () => {
    const seen = [];
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => 'Mention lock ordering.',
        onEvent: e => seen.push(e),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    await manager.ask({ question: 'What am I missing?' });

    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].kind, 'ask');
    assert.strictEqual(seen[0].question, 'What am I missing?');
    assert.strictEqual(seen[0].answer, 'Mention lock ordering.');
});

// When the provider fails there is nothing to add to the thread: the view must be
// left as it was, not holding an orphan question.
test('a failed request emits no event', async () => {
    const seen = [];
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => {
            throw new Error('no network');
        },
        onEvent: e => seen.push(e),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    await assert.rejects(() => manager.ask({ question: 'And now?' }));
    assert.deepStrictEqual(seen, []);
});

test('the manager works with no onEvent at all', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'ok' });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    assert.doesNotThrow(() => manager.recordSpeech('them', 'Hello'));
});

// Without headphones the mic re-records the speakers, so the same words arrive on
// both channels. The manager marks the second one instead of deleting it (D23).
test('a mic turn echoing the speakers is flagged, not dropped', () => {
    const seen = [];
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => seen.push(e),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    manager.recordSpeech('them', 'I met her on the way to Chicago where she was all alone');
    manager.recordSpeech('me', 'I met her on the way to Chicago where she was all alone');

    assert.strictEqual(seen.length, 2, 'both turns are recorded');
    assert.strictEqual(seen[0].echo, false);
    assert.strictEqual(seen[1].echo, true);
    // The model reads the system channel only, so the words appear once.
    assert.strictEqual(manager.getContext().getTranscript(), '[Them]: I met her on the way to Chicago where she was all alone');
});

test('a genuine reply is not mistaken for an echo', () => {
    const seen = [];
    const manager = createSessionManager({
        configDir: makeConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => seen.push(e),
    });
    manager.start({ profileName: 'interview', sessionId: 's1' });

    manager.recordSpeech('them', 'so tell me about your experience with Node');
    manager.recordSpeech('me', 'I have about five years of backend work with Node');

    assert.strictEqual(seen[1].echo, false);
});

test('starting a new session forgets the previous audio', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'ok' });
    manager.start({ profileName: 'interview', sessionId: 's1' });
    manager.recordSpeech('them', 'I met her on the way to Chicago where she was all alone');

    manager.start({ profileName: 'interview', sessionId: 's2' });
    const event = manager.recordSpeech('me', 'I met her on the way to Chicago where she was all alone');

    assert.strictEqual(event.echo, false);
});

test('isActive reports whether a session is live, so the main process can refuse edits', () => {
    const manager = createSessionManager({ configDir: makeConfigDir(), sendToProvider: async () => 'ok' });

    assert.strictEqual(manager.isActive(), false);
    manager.start({ profileName: 'interview', sessionId: 's-active' });
    assert.strictEqual(manager.isActive(), true);
    manager.end();
    assert.strictEqual(manager.isActive(), false);
});
