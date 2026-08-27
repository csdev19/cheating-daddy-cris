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

    assert.ok(creados.includes('interview'));
    assert.ok(listProfiles(getProfilesDir(cfg)).length >= 3);

    const perfil = loadProfile(getProfilesDir(cfg), 'interview');
    assert.ok(perfil.instructions.length > 0);
    // El nuevo prompt NO debe dictar palabras (H6).
    assert.ok(!/exact words to say/i.test(perfil.instructions));
    assert.ok(/do not tell me what to say/i.test(perfil.instructions));
});

test('conserva el customPrompt antiguo como archivo de contexto', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg, legacyCustomPrompt: 'Soy backend con 15 años.' });

    const perfil = loadProfile(getProfilesDir(cfg), 'interview');
    const migrado = perfil.contextFiles.find(f => f.file === 'migrated.md');
    assert.ok(migrado, 'debe existir context/migrated.md');
    assert.strictEqual(migrado.content, 'Soy backend con 15 años.');
});

test('no sobrescribe perfiles ya existentes', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const ruta = path.join(getProfilesDir(cfg), 'interview', 'profile.md');
    fs.writeFileSync(ruta, '---\nname: Mío\n---\n\nMis instrucciones.');

    const creados = bootstrapProfiles({ configDir: cfg });
    assert.strictEqual(creados.includes('interview'), false);
    assert.strictEqual(loadProfile(getProfilesDir(cfg), 'interview').instructions, 'Mis instrucciones.');
});

test('los perfiles creados traen checklist parseable', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });
    const perfil = loadProfile(getProfilesDir(cfg), 'interview');
    assert.ok(perfil.checklist.length >= 2);
    assert.ok(perfil.checklist[0].id.length > 0);
});
