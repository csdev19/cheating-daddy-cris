const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { saveScreenshot, resolveScreenshotPath, deleteSessionScreenshots } = require('../src/core/screenshots');

function tempHistoryDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'cd-shots-'));
}

// Un jpeg mínimo válido basta: aquí solo se prueba el almacenamiento, no el códec.
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]).toString('base64');

test('guarda la miniatura bajo la carpeta de la sesión y devuelve una ref relativa', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 1700000000000, base64: JPEG_BASE64 });

    assert.strictEqual(ref, path.join('123', 'screen-1700000000000.jpg'));
    assert.ok(fs.existsSync(path.join(historyDir, ref)), 'el archivo existe en disco');
});

test('el contenido guardado es el binario decodificado, no el base64', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 1, base64: JPEG_BASE64 });

    const written = fs.readFileSync(path.join(historyDir, ref));
    assert.deepStrictEqual(written, Buffer.from(JPEG_BASE64, 'base64'));
});

test('crea la carpeta de la sesión si no existe', () => {
    const historyDir = tempHistoryDir();
    fs.rmSync(historyDir, { recursive: true });

    const ref = saveScreenshot({ historyDir, sessionId: 'nueva', t: 7, base64: JPEG_BASE64 });
    assert.ok(fs.existsSync(path.join(historyDir, ref)));
});

test('devuelve null si no hay imagen que guardar', () => {
    const historyDir = tempHistoryDir();
    assert.strictEqual(saveScreenshot({ historyDir, sessionId: '1', t: 1, base64: '' }), null);
    assert.strictEqual(saveScreenshot({ historyDir, sessionId: '1', t: 1, base64: null }), null);
});

test('resolveScreenshotPath devuelve la ruta absoluta de una ref guardada', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 5, base64: JPEG_BASE64 });

    assert.strictEqual(resolveScreenshotPath(historyDir, ref), path.join(historyDir, ref));
});

// Las refs vienen de un JSON en disco; una ref manipulada no debe poder leer
// archivos de fuera del historial.
test('resolveScreenshotPath rechaza refs que se salen del historial', () => {
    const historyDir = tempHistoryDir();
    assert.strictEqual(resolveScreenshotPath(historyDir, '../../../etc/passwd'), null);
    assert.strictEqual(resolveScreenshotPath(historyDir, '/etc/passwd'), null);
    assert.strictEqual(resolveScreenshotPath(historyDir, ''), null);
});

test('borrar una sesión se lleva sus miniaturas', () => {
    const historyDir = tempHistoryDir();
    const ref = saveScreenshot({ historyDir, sessionId: '123', t: 5, base64: JPEG_BASE64 });

    deleteSessionScreenshots(historyDir, '123');

    assert.ok(!fs.existsSync(path.join(historyDir, ref)));
    assert.ok(!fs.existsSync(path.join(historyDir, '123')));
});

test('borrar una sesión sin miniaturas no lanza', () => {
    const historyDir = tempHistoryDir();
    assert.doesNotThrow(() => deleteSessionScreenshots(historyDir, 'no-existe'));
});
