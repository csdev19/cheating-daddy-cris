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

// Without a cap the segment only closes on silence, so talking for five minutes
// straight showed nothing at all for five minutes and then a wall of text. On this
// machine Whisper runs at ~25x real time, so chunking costs the same compute and
// gets the words on screen while you are still talking.
test('with no cap, continuous speech never closes a segment', () => {
    const segments = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 0, onSpeechEnd: b => segments.push(b) });

    for (let i = 0; i < 200; i++) vad.process(frame16k(0.5));

    assert.strictEqual(segments.length, 0);
    assert.strictEqual(vad.isSpeaking(), true);
});

test('the cap closes a segment mid-speech, without waiting for silence', () => {
    const segments = [];
    const vad = createVad({
        mode: VAD_MODES.NORMAL,
        preRollFrames: 0,
        maxSegmentFrames: 10,
        cutSearchFrames: 1,
        onSpeechEnd: b => segments.push(b),
    });

    for (let i = 0; i < 12; i++) vad.process(frame16k(0.5));

    assert.strictEqual(segments.length, 1);
    assert.strictEqual(vad.isSpeaking(), true, 'the speaker has not stopped, so the VAD keeps listening');
});

// A forced cut must not swallow audio: whatever falls after the cut point starts
// the next segment.
test('the frames after the cut open the next segment', () => {
    const segments = [];
    const vad = createVad({
        mode: VAD_MODES.NORMAL,
        preRollFrames: 0,
        tailFrames: 0,
        maxSegmentFrames: 10,
        cutSearchFrames: 1,
        onSpeechEnd: b => segments.push(b),
    });

    // 3 frames to open the segment; from there each one lands in the buffer.
    for (let i = 0; i < 13; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    assert.strictEqual(segments.length, 2, 'the forced cut plus the close on silence');
    assert.strictEqual(segments[0].length, 10 * 3200, 'the forced cut ships exactly the cap');
    assert.ok(segments[1].length > 0, 'what came after the cut is not lost');
});

// Cutting mid-syllable is what degrades the words around the boundary, so the cut
// looks back for the quietest frame and lands on a micro-pause.
test('the cut lands on the quietest frame in the search window', () => {
    const segments = [];
    const vad = createVad({
        mode: VAD_MODES.NORMAL,
        preRollFrames: 0,
        maxSegmentFrames: 10,
        cutSearchFrames: 3,
        onSpeechEnd: b => segments.push(b),
    });

    // The third frame opens the segment and is itself buffered, so this leaves one
    // frame in the buffer before the loop below adds nine more.
    for (let i = 0; i < 3; i++) vad.process(frame16k(0.5));
    for (let i = 1; i <= 9; i++) vad.process(frame16k(i === 8 ? 0.002 : 0.5));

    assert.strictEqual(segments.length, 1);
    // The quiet frame sits at buffered index 8, inside the 3-frame search window,
    // so the cut ships 9 frames and leaves the 10th for the next segment.
    assert.strictEqual(segments[0].length, 9 * 3200);
});

test('a cap of 0 or undefined disables the forced cut', () => {
    const segments = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 0, maxSegmentFrames: 0, onSpeechEnd: b => segments.push(b) });

    for (let i = 0; i < 200; i++) vad.process(frame16k(0.5));

    assert.strictEqual(segments.length, 0);
});
