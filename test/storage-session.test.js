const test = require('node:test');
const assert = require('node:assert');
const { migrateLegacySession } = require('../src/core/session-context-migrate');

test('turns legacy turns into thread events', () => {
    const legacy = {
        sessionId: 's1',
        profile: 'interview',
        conversationHistory: [{ timestamp: 100, transcription: 'What is your experience?', ai_response: 'Say 15 years.' }],
        screenAnalysisHistory: [{ timestamp: 150, prompt: 'read this', response: 'it is an IDE', model: 'gemini' }],
    };

    const { sessionId, profileName, events } = migrateLegacySession(legacy);

    assert.strictEqual(sessionId, 's1');
    assert.strictEqual(profileName, 'interview');
    // The legacy transcription was always the interviewer (H5).
    assert.strictEqual(events[0].kind, 'speech');
    assert.strictEqual(events[0].speaker, 'them');
    assert.strictEqual(events[0].text, 'What is your experience?');
    assert.strictEqual(events[1].kind, 'ask');
    assert.strictEqual(events[1].answer, 'Say 15 years.');
    assert.strictEqual(events[2].kind, 'screen');
});

test('an already migrated session is returned untouched', () => {
    const modern = { sessionId: 's2', profileName: 'interview', events: [{ t: 1, kind: 'speech', speaker: 'me', text: 'hi' }] };
    assert.deepStrictEqual(migrateLegacySession(modern), modern);
});

test('tolerates an empty session', () => {
    const { events } = migrateLegacySession({ sessionId: 's3' });
    assert.deepStrictEqual(events, []);
});

test('sorts the migrated events by time', () => {
    const { events } = migrateLegacySession({
        sessionId: 's4',
        conversationHistory: [{ timestamp: 500, transcription: 'late' }],
        screenAnalysisHistory: [{ timestamp: 100, response: 'early' }],
    });
    assert.strictEqual(events[0].kind, 'screen');
    assert.strictEqual(events[1].text, 'late');
});
