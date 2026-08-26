const test = require('node:test');
const assert = require('node:assert');
const { frame16k } = require('./helpers/pcm');

test('el runner de tests funciona', () => {
    assert.strictEqual(1 + 1, 2);
});

test('el helper de PCM produce el tamaño y la amplitud esperados', () => {
    const buffer = frame16k(0.5);
    assert.strictEqual(buffer.length, 3200);
    assert.strictEqual(Math.abs(buffer.readInt16LE(0)) > 16000, true);
});
