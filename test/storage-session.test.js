const test = require('node:test');
const assert = require('node:assert');
const { migrateLegacySession } = require('../src/core/session-context-migrate');

test('convierte turnos antiguos en eventos del hilo', () => {
    const legacy = {
        sessionId: 's1',
        profile: 'interview',
        conversationHistory: [{ timestamp: 100, transcription: '¿Y tu experiencia?', ai_response: 'Di que 15 años.' }],
        screenAnalysisHistory: [{ timestamp: 150, prompt: 'lee esto', response: 'es un IDE', model: 'gemini' }],
    };

    const { sessionId, profileName, events } = migrateLegacySession(legacy);

    assert.strictEqual(sessionId, 's1');
    assert.strictEqual(profileName, 'interview');
    // La transcripción antigua era siempre del entrevistador (H5).
    assert.strictEqual(events[0].kind, 'speech');
    assert.strictEqual(events[0].speaker, 'them');
    assert.strictEqual(events[0].text, '¿Y tu experiencia?');
    assert.strictEqual(events[1].kind, 'ask');
    assert.strictEqual(events[1].answer, 'Di que 15 años.');
    assert.strictEqual(events[2].kind, 'screen');
});

test('una sesión ya migrada se devuelve intacta', () => {
    const nueva = { sessionId: 's2', profileName: 'entrevista', events: [{ t: 1, kind: 'speech', speaker: 'me', text: 'hola' }] };
    assert.deepStrictEqual(migrateLegacySession(nueva), nueva);
});

test('tolera una sesión vacía', () => {
    const { events } = migrateLegacySession({ sessionId: 's3' });
    assert.deepStrictEqual(events, []);
});

test('ordena los eventos migrados por tiempo', () => {
    const { events } = migrateLegacySession({
        sessionId: 's4',
        conversationHistory: [{ timestamp: 500, transcription: 'tarde' }],
        screenAnalysisHistory: [{ timestamp: 100, response: 'pronto' }],
    });
    assert.strictEqual(events[0].kind, 'screen');
    assert.strictEqual(events[1].text, 'tarde');
});
