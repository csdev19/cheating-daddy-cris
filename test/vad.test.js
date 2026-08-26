const test = require('node:test');
const assert = require('node:assert');
const { createVad, calculateRms, VAD_MODES } = require('../src/core/vad');
const { frame16k } = require('./helpers/pcm');

test('calculateRms devuelve 0 para silencio', () => {
    assert.strictEqual(calculateRms(frame16k(0)), 0);
});

test('calculateRms se aproxima a la amplitud de la señal', () => {
    const rms = calculateRms(frame16k(0.5));
    assert.ok(rms > 0.45 && rms < 0.55, `rms fuera de rango: ${rms}`);
});

test('no dispara onSpeechEnd si nunca hubo voz', () => {
    let llamadas = 0;
    const vad = createVad({ onSpeechEnd: () => llamadas++ });
    for (let i = 0; i < 50; i++) vad.process(frame16k(0));
    assert.strictEqual(llamadas, 0);
});

test('detecta voz tras speechFramesRequired frames', () => {
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: () => {} });
    assert.strictEqual(vad.isSpeaking(), false);
    for (let i = 0; i < VAD_MODES.NORMAL.speechFramesRequired; i++) vad.process(frame16k(0.5));
    assert.strictEqual(vad.isSpeaking(), true);
});

test('cierra el segmento tras silenceFramesRequired frames de silencio', () => {
    const segmentos = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, onSpeechEnd: b => segmentos.push(b) });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));
    assert.strictEqual(segmentos.length, 1);
    assert.strictEqual(vad.isSpeaking(), false);
});

test('el pre-roll incluye audio anterior al inicio de voz', () => {
    const segmentos = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 3, onSpeechEnd: b => segmentos.push(b) });

    for (let i = 0; i < 5; i++) vad.process(frame16k(0));
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    assert.strictEqual(segmentos.length, 1);
    assert.strictEqual(segmentos[0].length, 13 * 3200);
});

test('dos instancias no comparten estado', () => {
    const a = createVad({ onSpeechEnd: () => {} });
    const b = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) a.process(frame16k(0.5));
    assert.strictEqual(a.isSpeaking(), true);
    assert.strictEqual(b.isSpeaking(), false);
});

test('reset limpia el estado', () => {
    const vad = createVad({ onSpeechEnd: () => {} });
    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    vad.reset();
    assert.strictEqual(vad.isSpeaking(), false);
});

test('createVad exige onSpeechEnd', () => {
    assert.throws(() => createVad({}), /onSpeechEnd/);
});

test('recorta el silencio final y deja solo la cola configurada', () => {
    const segmentos = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 0, tailFrames: 2, onSpeechEnd: b => segmentos.push(b) });

    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    // 8 frames de voz efectivos (los 2 primeros van al pre-roll, desactivado aquí) + 2 de cola.
    assert.strictEqual(segmentos[0].length, 10 * 3200);
});

test('tailFrames: 0 elimina todo el silencio final', () => {
    const segmentos = [];
    const vad = createVad({ mode: VAD_MODES.NORMAL, preRollFrames: 0, tailFrames: 0, onSpeechEnd: b => segmentos.push(b) });

    for (let i = 0; i < 10; i++) vad.process(frame16k(0.5));
    for (let i = 0; i < VAD_MODES.NORMAL.silenceFramesRequired; i++) vad.process(frame16k(0));

    assert.strictEqual(segmentos[0].length, 8 * 3200);
});
