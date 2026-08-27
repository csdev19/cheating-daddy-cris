const test = require('node:test');
const assert = require('node:assert');
const { createVad, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

// Reproduces the bug task 7 fixes: when two channels share a VAD, silence on one
// closes the other one's segment.
test('independent channels do not close their neighbour segment', () => {
    const closed = { them: 0, me: 0 };
    const channels = {
        them: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => closed.them++ }),
        me: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => closed.me++ }),
    };

    for (let i = 0; i < 10; i++) {
        channels.them.process(frame16k(0.5));
        channels.me.process(frame16k(0));
    }

    assert.strictEqual(channels.them.isSpeaking(), true);
    assert.strictEqual(channels.me.isSpeaking(), false);
    assert.strictEqual(closed.them, 0);

    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) {
        channels.them.process(frame16k(0));
        channels.me.process(frame16k(0));
    }

    assert.strictEqual(closed.them, 1);
    assert.strictEqual(closed.me, 0);
});

test('localai exposes processLocalAudio with a speaker and setTranscriptionHandler', () => {
    const localai = require('../src/utils/localai');
    assert.strictEqual(typeof localai.setTranscriptionHandler, 'function');
    assert.strictEqual(typeof localai.processLocalAudio, 'function');
    // An unknown speaker must only warn, never throw.
    assert.doesNotThrow(() => localai.processLocalAudio(Buffer.alloc(100), 'unknown'));
});
