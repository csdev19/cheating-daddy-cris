const test = require('node:test');
const assert = require('node:assert');
const { createVad, calculateRms, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

test('calculateRms returns 0 for silence', () => {
    assert.strictEqual(calculateRms(frame16k(0)), 0);
});

test('calculateRms approximates the signal amplitude', () => {
    const rms = calculateRms(frame16k(0.5));
    assert.ok(rms > 0.45 && rms < 0.55, `rms out of range: ${rms}`);
});

test('never fires onSpeechEnd when there was no speech', () => {
    let calls = 0;
    const vad = createVad({ onSpeechEnd: () => calls++ });
    for (let i = 0; i < 50; i++) vad.process(frame16k(0));
    assert.strictEqual(calls, 0);
});

test('detects speech after speechFramesRequired frames', () => {
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => {} });
    assert.strictEqual(vad.isSpeaking(), false);
    for (let i = 0; i < VAD_MODES.NORMAL.speechFramesRequired; i++) vad.process(frame16k(0.5));
    assert.strictEqual(vad.isSpeaking(), true);
});

test('closes the segment after silenceFramesRequired silent frames', () => {
    const segments = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: b => segments.push(b) });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));
    assert.strictEqual(segments.length, 1);
    assert.strictEqual(vad.isSpeaking(), false);
});

test('the pre-roll includes audio from before speech started', () => {
    const segments = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 3, onSpeechEnd: b => segments.push(b) });

    for (let i = 0; i < 5; i++) vad.process(frame16k(0));
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    assert.strictEqual(segments.length, 1);
    assert.strictEqual(segments[0].length, 13 * 3200);
});

test('two instances share no state', () => {
    const a = createVad({ onSpeechEnd: () => {} });
    const b = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) a.process(frame16k(0.5));
    assert.strictEqual(a.isSpeaking(), true);
    assert.strictEqual(b.isSpeaking(), false);
});

test('reset clears the state', () => {
    const vad = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    vad.reset();
    assert.strictEqual(vad.isSpeaking(), false);
});

test('createVad requires onSpeechEnd', () => {
    assert.throws(() => createVad({}), /onSpeechEnd/);
});

test('trims the trailing silence down to the configured tail', () => {
    const segments = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 0, tailFrames: 2, onSpeechEnd: b => segments.push(b) });

    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    // 8 effective speech frames (the first 2 go to the pre-roll, disabled here) + 2 of tail.
    assert.strictEqual(segments[0].length, 10 * 3200);
});

test('tailFrames: 0 removes all the trailing silence', () => {
    const segments = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 0, tailFrames: 0, onSpeechEnd: b => segments.push(b) });

    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    assert.strictEqual(segments[0].length, 8 * 3200);
});
