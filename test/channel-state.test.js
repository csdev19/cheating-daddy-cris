const test = require('node:test');
const assert = require('node:assert');
const { createVad, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

// Reproduce el fallo que la Tarea 7 corrige: si dos canales comparten VAD,
// el silencio de uno cierra el segmento del otro.
test('canales independientes no cierran el segmento del vecino', () => {
    const cerrados = { them: 0, me: 0 };
    const canales = {
        them: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => cerrados.them++ }),
        me: createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => cerrados.me++ }),
    };

    for (let i = 0; i < 10; i++) {
        canales.them.process(frame16k(0.5));
        canales.me.process(frame16k(0));
    }

    assert.strictEqual(canales.them.isSpeaking(), true);
    assert.strictEqual(canales.me.isSpeaking(), false);
    assert.strictEqual(cerrados.them, 0);

    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) {
        canales.them.process(frame16k(0));
        canales.me.process(frame16k(0));
    }

    assert.strictEqual(cerrados.them, 1);
    assert.strictEqual(cerrados.me, 0);
});

test('localai expone processLocalAudio con hablante y setTranscriptionHandler', () => {
    const localai = require('../src/utils/localai');
    assert.strictEqual(typeof localai.setTranscriptionHandler, 'function');
    assert.strictEqual(typeof localai.processLocalAudio, 'function');
    // No debe lanzar con un hablante desconocido, solo avisar.
    assert.doesNotThrow(() => localai.processLocalAudio(Buffer.alloc(100), 'desconocido'));
});
