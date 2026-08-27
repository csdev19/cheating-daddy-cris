const fs = require('node:fs');
const path = require('node:path');

// Las capturas no caben en el hilo: el hilo se persiste como JSON y un jpeg en
// base64 lo multiplicaría por sesión. Se guardan como archivo bajo la carpeta de
// la sesión y el evento se queda con la ruta relativa (`imageRef`).

function sessionDir(historyDir, sessionId) {
    return path.join(historyDir, String(sessionId));
}

function saveScreenshot({ historyDir, sessionId, t, base64 }) {
    if (!base64) return null;

    const dir = sessionDir(historyDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });

    const ref = path.join(String(sessionId), `screen-${t}.jpg`);
    fs.writeFileSync(path.join(historyDir, ref), Buffer.from(base64, 'base64'));
    return ref;
}

// La ref viene de un JSON en disco, así que se trata como entrada no confiable:
// cualquier ruta que se salga del historial se descarta.
function resolveScreenshotPath(historyDir, ref) {
    if (!ref) return null;

    const resolved = path.resolve(historyDir, ref);
    const root = path.resolve(historyDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

    return resolved;
}

function deleteSessionScreenshots(historyDir, sessionId) {
    fs.rmSync(sessionDir(historyDir, sessionId), { recursive: true, force: true });
}

module.exports = { saveScreenshot, resolveScreenshotPath, deleteSessionScreenshots };
