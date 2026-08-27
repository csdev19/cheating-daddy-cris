const fs = require('fs');
const path = require('path');

function buildDigestPrompt(transcript) {
    return [
        'Summarise this meeting in 10-15 lines so I can read it before the next one with the same people.',
        'Sections: **Agreements**, **Open items** (who owes what), **Names and roles** mentioned, **Figures and dates** quoted.',
        'Only what was actually said. If a section would be empty, leave it out.',
        '',
        '---',
        transcript,
    ].join('\n');
}

// Appends the summary to the profile's history, which the next session loads as
// one more note (D17). Trimmed so the cached prefix cannot grow without bound.
function appendDigest({ profilesDir, profileName, digest, date, maxEntries = 20 }) {
    const ruta = path.join(profilesDir, profileName, 'context', 'history.md');
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
