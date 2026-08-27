const test = require('node:test');
const assert = require('node:assert');
const { frame16k } = require('./helpers/pcm');

test('the test runner works', () => {
    assert.strictEqual(1 + 1, 2);
});

test('the PCM helper produces the expected size and amplitude', () => {
    const buffer = frame16k(0.5);
    assert.strictEqual(buffer.length, 3200);
    assert.strictEqual(Math.abs(buffer.readInt16LE(0)) > 16000, true);
});
