const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapProfiles } = require('../src/core/profiles-bootstrap');
const { loadProfile, getProfilesDir, listProfiles } = require('../src/core/profiles');

test('crea los perfiles por defecto en un config vacío', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const creados = bootstrapProfiles({ configDir: cfg });

    assert.ok(creados.includes('entrevista'));
    assert.ok(listProfiles(getProfilesDir(cfg)).length >= 3);

    const perfil = loadProfile(getProfilesDir(cfg), 'entrevista');
    assert.ok(perfil.instructions.length > 0);
    // El nuevo prompt NO debe dictar palabras (H6).
    assert.ok(!/exact words to say/i.test(perfil.instructions));
    assert.ok(/no me dictes/i.test(perfil.instructions));
});

test('conserva el customPrompt antiguo como archivo de contexto', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg, legacyCustomPrompt: 'Soy backend con 15 años.' });

    const perfil = loadProfile(getProfilesDir(cfg), 'entrevista');
    const migrado = perfil.contextFiles.find(f => f.file === 'migrado.md');
    assert.ok(migrado, 'debe existir context/migrado.md');
    assert.strictEqual(migrado.content, 'Soy backend con 15 años.');
});

test('no sobrescribe perfiles ya existentes', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const ruta = path.join(getProfilesDir(cfg), 'entrevista', 'profile.md');
    fs.writeFileSync(ruta, '---\nname: Mío\n---\n\nMis instrucciones.');

    const creados = bootstrapProfiles({ configDir: cfg });
    assert.strictEqual(creados.includes('entrevista'), false);
    assert.strictEqual(loadProfile(getProfilesDir(cfg), 'entrevista').instructions, 'Mis instrucciones.');
});

test('los perfiles creados traen checklist parseable', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });
    const perfil = loadProfile(getProfilesDir(cfg), 'entrevista');
    assert.ok(perfil.checklist.length >= 2);
    assert.ok(perfil.checklist[0].id.length > 0);
});
