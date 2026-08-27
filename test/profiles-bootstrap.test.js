const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapProfiles } = require('../src/core/profiles-bootstrap');
const { loadProfile, getProfilesDir, listProfiles } = require('../src/core/profiles');

test('creates the default profiles in an empty config', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const created = bootstrapProfiles({ configDir: cfg });

    assert.ok(created.includes('interview'));
    assert.ok(listProfiles(getProfilesDir(cfg)).length >= 3);

    const profile = loadProfile(getProfilesDir(cfg), 'interview');
    assert.ok(profile.instructions.length > 0);
    // The new prompt must NOT dictate words (H6).
    assert.ok(!/exact words to say/i.test(profile.instructions));
    assert.ok(/do not tell me what to say/i.test(profile.instructions));
});

test('keeps the old customPrompt as a context file', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg, legacyCustomPrompt: 'I am a backend dev with 15 years.' });

    const profile = loadProfile(getProfilesDir(cfg), 'interview');
    const migrated = profile.contextFiles.find(f => f.file === 'migrated.md');
    assert.ok(migrated, 'context/migrated.md must exist');
    assert.strictEqual(migrated.content, 'I am a backend dev with 15 years.');
});

test('never overwrites a profile that already exists', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const file = path.join(getProfilesDir(cfg), 'interview', 'profile.md');
    fs.writeFileSync(file, '---\nname: Mine\n---\n\nMy own instructions.');

    const created = bootstrapProfiles({ configDir: cfg });
    assert.strictEqual(created.includes('interview'), false);
    assert.strictEqual(loadProfile(getProfilesDir(cfg), 'interview').instructions, 'My own instructions.');
});

test('the created profiles ship a parseable checklist', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });
    const profile = loadProfile(getProfilesDir(cfg), 'interview');
    assert.ok(profile.checklist.length >= 2);
    assert.ok(profile.checklist[0].id.length > 0);
});
