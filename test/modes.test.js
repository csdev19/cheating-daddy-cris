const test = require('node:test');
const assert = require('node:assert');
const { resolveModes } = require('../src/core/modes');

test('default: local whisper + gemini', () => {
    assert.deepStrictEqual(resolveModes({}), { transcription: 'local-whisper', reasoning: 'gemini' });
});

test('honours the new preferences', () => {
    assert.deepStrictEqual(resolveModes({ transcription: 'gemini-live', reasoning: 'local-llama' }), {
        transcription: 'gemini-live',
        reasoning: 'local-llama',
    });
});

test('migrates the old providerMode', () => {
    assert.deepStrictEqual(resolveModes({ providerMode: 'local' }), { transcription: 'local-whisper', reasoning: 'local-llama' });
    assert.deepStrictEqual(resolveModes({ providerMode: 'byok' }), { transcription: 'gemini-live', reasoning: 'gemini' });
});

test('a confidential profile forces everything local (D13)', () => {
    assert.deepStrictEqual(resolveModes({ reasoning: 'gemini' }, { confidential: true }), {
        transcription: 'local-whisper',
        reasoning: 'local-llama',
    });
});

test('ignores invalid values and falls back to the default', () => {
    assert.deepStrictEqual(resolveModes({ transcription: 'made-up', reasoning: 'other' }), {
        transcription: 'local-whisper',
        reasoning: 'gemini',
    });
});
