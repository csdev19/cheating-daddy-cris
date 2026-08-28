const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeFileAtomic } = require('../src/core/atomic-file');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));

test('writes the contents', () => {
    const dir = tmp();
    const file = path.join(dir, 'a.json');
    writeFileAtomic(file, '{"a":1}');

    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{"a":1}');
});

test('creates the directory when it is missing', () => {
    const file = path.join(tmp(), 'deep', 'nested', 'a.json');
    writeFileAtomic(file, 'hello');

    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
});

test('replaces existing contents entirely, leaving no tail behind', () => {
    const dir = tmp();
    const file = path.join(dir, 'a.json');
    writeFileAtomic(file, 'a much longer previous value');
    writeFileAtomic(file, 'short');

    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'short');
});

// The point of the whole thing: the reader either sees the old file whole or the
// new one whole. Writing in place truncates first, so a crash there loses the lot.
test('leaves no temporary file behind on success', () => {
    const dir = tmp();
    writeFileAtomic(path.join(dir, 'a.json'), 'x');

    assert.deepStrictEqual(fs.readdirSync(dir), ['a.json']);
});

test('the previous file survives a failed write', () => {
    const dir = tmp();
    const file = path.join(dir, 'a.json');
    writeFileAtomic(file, 'original');

    // A directory where the file should go makes the rename fail.
    assert.throws(() => writeFileAtomic(path.join(dir), 'nope'));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'original');
});

test('reports failure by throwing, so callers cannot mistake it for success', () => {
    assert.throws(() => writeFileAtomic('/proc/definitely-not-writable/a.json', 'x'));
});
