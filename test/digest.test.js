const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDigestPrompt, appendDigest } = require('../src/core/digest');

test('el prompt pide acuerdos, pendientes, nombres y cifras', () => {
    const prompt = buildDigestPrompt('[Entrevistador]: Hola');
    assert.ok(/acuerdos/i.test(prompt));
    assert.ok(/pendientes/i.test(prompt));
    assert.ok(prompt.includes('[Entrevistador]: Hola'));
});

test('appendDigest crea historial.md y añade entradas fechadas en orden', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    fs.mkdirSync(path.join(raiz, 'cliente', 'context'), { recursive: true });

    appendDigest({ profilesDir: raiz, profileName: 'cliente', digest: 'Acordamos X.', date: '2026-08-26' });
    appendDigest({ profilesDir: raiz, profileName: 'cliente', digest: 'Pendiente Y.', date: '2026-08-27' });

    const contenido = fs.readFileSync(path.join(raiz, 'cliente', 'context', 'historial.md'), 'utf8');
    assert.ok(contenido.includes('## 2026-08-26'));
    assert.ok(contenido.includes('Acordamos X.'));
    assert.ok(contenido.indexOf('2026-08-26') < contenido.indexOf('2026-08-27'));
});

test('appendDigest recorta a las últimas maxEntries', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    fs.mkdirSync(path.join(raiz, 'p', 'context'), { recursive: true });
    for (let i = 1; i <= 5; i++) {
        appendDigest({ profilesDir: raiz, profileName: 'p', digest: `e${i}`, date: `2026-01-0${i}`, maxEntries: 3 });
    }

    const contenido = fs.readFileSync(path.join(raiz, 'p', 'context', 'historial.md'), 'utf8');
    assert.ok(!contenido.includes('2026-01-01'));
    assert.ok(contenido.includes('2026-01-05'));
    assert.strictEqual((contenido.match(/^## /gm) || []).length, 3);
});

test('appendDigest crea el directorio context si no existe', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    const ruta = appendDigest({ profilesDir: raiz, profileName: 'nuevo', digest: 'x', date: '2026-01-01' });
    assert.ok(fs.existsSync(ruta));
});

test('el historial generado lo lee loadProfile como una nota más', () => {
    const { loadProfile } = require('../src/core/profiles');
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    fs.mkdirSync(path.join(raiz, 'cliente'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'cliente', 'profile.md'), 'Instrucciones.');
    appendDigest({ profilesDir: raiz, profileName: 'cliente', digest: 'Acordamos X.', date: '2026-08-26' });

    const perfil = loadProfile(raiz, 'cliente');
    const historial = perfil.contextFiles.find(f => f.file === 'historial.md');
    assert.ok(historial, 'historial.md debe cargarse como archivo de contexto');
    assert.ok(historial.content.includes('Acordamos X.'));
});
