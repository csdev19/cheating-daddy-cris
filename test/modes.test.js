const test = require('node:test');
const assert = require('node:assert');
const { resolveModes } = require('../src/core/modes');

test('default: whisper local + gemini', () => {
    assert.deepStrictEqual(resolveModes({}), { transcription: 'local-whisper', reasoning: 'gemini' });
});

test('respeta las preferencias nuevas', () => {
    assert.deepStrictEqual(resolveModes({ transcription: 'gemini-live', reasoning: 'local-llama' }), {
        transcription: 'gemini-live',
        reasoning: 'local-llama',
    });
});

test('migra providerMode antiguo', () => {
    assert.deepStrictEqual(resolveModes({ providerMode: 'local' }), { transcription: 'local-whisper', reasoning: 'local-llama' });
    assert.deepStrictEqual(resolveModes({ providerMode: 'byok' }), { transcription: 'gemini-live', reasoning: 'gemini' });
});

test('un perfil confidencial fuerza todo local (D13)', () => {
    assert.deepStrictEqual(resolveModes({ reasoning: 'gemini' }, { confidential: true }), {
        transcription: 'local-whisper',
        reasoning: 'local-llama',
    });
});

test('ignora valores inválidos y cae al default', () => {
    assert.deepStrictEqual(resolveModes({ transcription: 'inventado', reasoning: 'otro' }), {
        transcription: 'local-whisper',
        reasoning: 'gemini',
    });
});
