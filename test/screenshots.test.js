const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { saveScreenshot, resolveScreenshotPath, deleteSessionScreenshots } = require('../src/core/screenshots');

function tempHistoryDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'cd-shots-'));
}

// A minimal valid jpeg is enough: what is under test is the storage, not the codec.
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]).toString('base64');

test('saves the thumbnail under the session folder and returns a relative ref', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 1700000000000, base64: JPEG_BASE64 });

    assert.strictEqual(ref, path.join('123', 'screen-1700000000000.jpg'));
    assert.ok(fs.existsSync(path.join(historyDir, ref)), 'the file exists on disk');
});

test('what is written is the decoded binary, not the base64', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 1, base64: JPEG_BASE64 });

    const written = fs.readFileSync(path.join(historyDir, ref));
    assert.deepStrictEqual(written, Buffer.from(JPEG_BASE64, 'base64'));
});

test('creates the session folder when it does not exist', () => {
    const historyDir = tempHistoryDir();
    fs.rmSync(historyDir, { recursive: true });

    const ref = saveScreenshot({ historyDir, sessionId: 'fresh', t: 7, base64: JPEG_BASE64 });
    assert.ok(fs.existsSync(path.join(historyDir, ref)));
});

test('returns null when there is no image to save', () => {
    const historyDir = tempHistoryDir();
    assert.strictEqual(saveScreenshot({ historyDir, sessionId: '1', t: 1, base64: '' }), null);
    assert.strictEqual(saveScreenshot({ historyDir, sessionId: '1', t: 1, base64: null }), null);
});

test('resolveScreenshotPath returns the absolute path of a stored ref', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 5, base64: JPEG_BASE64 });

    assert.strictEqual(resolveScreenshotPath(historyDir, ref), path.join(historyDir, ref));
});

// Refs come from a JSON file on disk; a tampered ref must not be able to read
// files outside the history folder.
test('resolveScreenshotPath rejects refs that escape the history folder', () => {
    const historyDir = tempHistoryDir();
    assert.strictEqual(resolveScreenshotPath(historyDir, '../../../etc/passwd'), null);
    assert.strictEqual(resolveScreenshotPath(historyDir, '/etc/passwd'), null);
    assert.strictEqual(resolveScreenshotPath(historyDir, ''), null);
});

test('deleting a session takes its thumbnails with it', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 5, base64: JPEG_BASE64 });

    deleteSessionScreenshots(historyDir, '123');

    assert.ok(!fs.existsSync(path.join(historyDir, ref)));
    assert.ok(!fs.existsSync(path.join(historyDir, '123')));
});

test('deleting a session with no thumbnails does not throw', () => {
    const historyDir = tempHistoryDir();
    assert.doesNotThrow(() => deleteSessionScreenshots(historyDir, 'does-not-exist'));
});
