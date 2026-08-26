const fs = require('fs');
const path = require('path');

function buildDigestPrompt(transcript) {
    return [
        'Resume esta reunión en 10-15 líneas, en español, para que yo lo lea antes de la próxima con las mismas personas.',
        'Secciones: **Acuerdos**, **Pendientes** (quién debe qué), **Nombres y roles** mencionados, **Cifras y fechas** citadas.',
        'Solo lo que se dijo. Si una sección queda vacía, omítela.',
        '',
        '---',
        transcript,
    ].join('\n');
}

// Añade el resumen al historial del perfil, que la siguiente sesión cargará como
// una nota más (D17). Se recorta para que el prefijo cacheado no crezca sin límite.
function appendDigest({ profilesDir, profileName, digest, date, maxEntries = 20 }) {
    const ruta = path.join(profilesDir, profileName, 'context', 'historial.md');
    fs.mkdirSync(path.dirname(ruta), { recursive: true });

    const existente = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '';
    const entradas = existente
        .split(/^(?=## )/m)
        .map(e => e.trim())
        .filter(e => e.startsWith('## '));

    entradas.push(`## ${date}\n\n${digest.trim()}`);
    const recortadas = entradas.slice(-maxEntries);

    fs.writeFileSync(ruta, `# Historial de reuniones\n\n${recortadas.join('\n\n')}\n`);
    return ruta;
}

module.exports = { buildDigestPrompt, appendDigest };
