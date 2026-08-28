const test = require('node:test');
const assert = require('node:assert');
const { cleanTranscription, NO_SPEECH_THRESHOLD } = require('../src/core/transcript-filter');

test('joins the surviving segments into one line', () => {
    const text = cleanTranscription([
        { text: ' How would you ', no_speech_prob: 0.01 },
        { text: 'handle a deadlock?', no_speech_prob: 0.02 },
    ]);

    assert.strictEqual(text, 'How would you handle a deadlock?');
});

// Whisper returns invented sentences over silence; no_speech_prob is the signal
// that the segment was not speech at all (B3).
test('drops segments the model itself flags as non-speech', () => {
    const text = cleanTranscription([
        { text: 'Real speech.', no_speech_prob: 0.1 },
        { text: 'Invented over silence.', no_speech_prob: 0.9 },
    ]);

    assert.strictEqual(text, 'Real speech.');
});

test('a segment with no no_speech_prob is kept', () => {
    assert.strictEqual(cleanTranscription([{ text: 'Kept.' }]), 'Kept.');
});

test('drops the known junk phrases whatever their score', () => {
    const text = cleanTranscription([
        { text: 'Thank you for watching!', no_speech_prob: 0.0 },
        { text: 'Subtítulos realizados por la comunidad', no_speech_prob: 0.0 },
        { text: 'Real content.', no_speech_prob: 0.0 },
    ]);

    assert.strictEqual(text, 'Real content.');
});

// Whisper marks non-speech audio with bracketed tags like [BLANK_AUDIO] or
// (music), which are not things anybody said.
test('drops segments that are only a bracketed tag', () => {
    const text = cleanTranscription([
        { text: '[BLANK_AUDIO]', no_speech_prob: 0.0 },
        { text: '(soft music)', no_speech_prob: 0.0 },
        { text: 'Actual words.', no_speech_prob: 0.0 },
    ]);

    assert.strictEqual(text, 'Actual words.');
});

test('a bracket inside a real sentence is not junk', () => {
    const text = cleanTranscription([{ text: 'We use Redis (the cache) for that.', no_speech_prob: 0.0 }]);
    assert.strictEqual(text, 'We use Redis (the cache) for that.');
});

test('drops blank segments', () => {
    assert.strictEqual(cleanTranscription([{ text: '   ', no_speech_prob: 0 }, { text: '' }]), '');
});

test('an empty or missing segment list gives an empty string', () => {
    assert.strictEqual(cleanTranscription([]), '');
    assert.strictEqual(cleanTranscription(null), '');
    assert.strictEqual(cleanTranscription(undefined), '');
});

// The whole thing being silence must come back as empty, never as a hallucinated
// sentence entering the thread as if someone had said it.
test('all-junk input yields nothing at all', () => {
    const text = cleanTranscription([
        { text: '[BLANK_AUDIO]', no_speech_prob: 0.99 },
        { text: 'Thank you for watching', no_speech_prob: 0.8 },
    ]);

    assert.strictEqual(text, '');
});

test('the threshold is exposed and is the documented 0.6', () => {
    assert.strictEqual(NO_SPEECH_THRESHOLD, 0.6);
    assert.strictEqual(cleanTranscription([{ text: 'Edge.', no_speech_prob: 0.6 }]), '');
    assert.strictEqual(cleanTranscription([{ text: 'Edge.', no_speech_prob: 0.59 }]), 'Edge.');
});
