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

// The Live API model only works over the WebSocket. Reaching for it on an HTTP
// generateContent call returns a 404 mid-meeting, which is exactly what happened:
// the fallback chain read `geminiLiveModel` for a request that is not Live.
const { resolveReasoningModel, DEFAULT_GEMINI_MODEL } = require('../src/core/modes');

test('the profile model wins when it is set', () => {
    assert.strictEqual(resolveReasoningModel({ model: 'gemini-2.5-pro' }, { geminiModel: 'gemini-3.7-flash' }), 'gemini-2.5-pro');
});

test('falls back to the configured HTTP model', () => {
    assert.strictEqual(resolveReasoningModel({}, { geminiModel: 'gemini-2.5-flash' }), 'gemini-2.5-flash');
});

test('falls back to the built-in default with no config at all', () => {
    assert.strictEqual(resolveReasoningModel({}, {}), DEFAULT_GEMINI_MODEL);
    assert.strictEqual(resolveReasoningModel(), DEFAULT_GEMINI_MODEL);
});

test('never returns a Live model id, wherever it came from', () => {
    assert.strictEqual(resolveReasoningModel({}, { geminiModel: 'gemini-3.1-flash-live-preview' }), DEFAULT_GEMINI_MODEL);
    assert.strictEqual(resolveReasoningModel({ model: 'gemini-3.1-flash-live-preview' }, {}), DEFAULT_GEMINI_MODEL);
});

test('ignores a blank or non-string model', () => {
    assert.strictEqual(resolveReasoningModel({ model: '   ' }, {}), DEFAULT_GEMINI_MODEL);
    assert.strictEqual(resolveReasoningModel({ model: 42 }, {}), DEFAULT_GEMINI_MODEL);
});

// Audio routing must follow the transcription axis, not the reasoning one. Keying
// it off the old single providerMode meant the design's own default combination
// (transcribe locally, reason in the cloud) silently dropped every audio chunk.
const { resolveAudioTarget } = require('../src/core/modes');

test('local transcription routes audio to whisper even when reasoning is in the cloud', () => {
    assert.strictEqual(resolveAudioTarget({ transcription: 'local-whisper', reasoning: 'gemini' }), 'local-whisper');
});

test('local transcription routes to whisper when reasoning is local too', () => {
    assert.strictEqual(resolveAudioTarget({ transcription: 'local-whisper', reasoning: 'local-llama' }), 'local-whisper');
});

test('gemini-live transcription routes audio to the live session', () => {
    assert.strictEqual(resolveAudioTarget({ transcription: 'gemini-live', reasoning: 'gemini' }), 'gemini-live');
});

test('cloud mode wins over the transcription axis', () => {
    assert.strictEqual(resolveAudioTarget({ transcription: 'local-whisper' }, 'cloud'), 'cloud');
});

test('falls back to local transcription with no modes at all', () => {
    assert.strictEqual(resolveAudioTarget(), 'local-whisper');
    assert.strictEqual(resolveAudioTarget({}), 'local-whisper');
    assert.strictEqual(resolveAudioTarget({ transcription: 'nonsense' }), 'local-whisper');
});
