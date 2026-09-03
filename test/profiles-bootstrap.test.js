const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapProfiles, migrateLegacyCustomPrompt, CUSTOM_PROMPT_MIGRATION_VERSION } = require('../src/core/profiles-bootstrap');
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

test('bootstrapProfiles no longer carries the legacy prompt across', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const profile = loadProfile(getProfilesDir(cfg), 'interview');
    assert.strictEqual(
        profile.contextFiles.find(f => f.file === 'migrated.md'),
        undefined,
        'the migration is its own step now (D31)'
    );
});

// ---------------------------------------------------------------------------
// The one-time legacy migration (D31). It is deliberately not coupled to "the
// profiles folder was just created": an install can have had profiles for
// releases while the person kept typing into the old textarea.
// ---------------------------------------------------------------------------

function migrate(cfg, options = {}) {
    return migrateLegacyCustomPrompt({
        configDir: cfg,
        legacyCustomPrompt: 'I am a backend dev with 15 years.',
        selectedProfile: 'interview',
        migrationState: 0,
        ...options,
    });
}

function noteNames(cfg, slug) {
    return loadProfile(getProfilesDir(cfg), slug).contextFiles.map(f => f.file);
}

test('the legacy prompt lands in the selected profile exactly once', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const first = migrate(cfg);
    assert.strictEqual(first.migrated, true);
    assert.strictEqual(first.profile, 'interview');
    assert.strictEqual(first.migrationState, CUSTOM_PROMPT_MIGRATION_VERSION);

    const migrated = loadProfile(getProfilesDir(cfg), 'interview').contextFiles.find(f => f.file === 'migrated.md');
    assert.ok(migrated);
    assert.strictEqual(migrated.content, 'I am a backend dev with 15 years.');

    // Second launch: the marker is what stops it, not the folder's existence.
    const second = migrate(cfg, { migrationState: first.migrationState });
    assert.strictEqual(second.migrated, false);
    assert.deepStrictEqual(noteNames(cfg, 'interview'), ['migrated.md']);
});

test('an install whose profiles already existed still gets its legacy prompt', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });
    assert.deepStrictEqual(bootstrapProfiles({ configDir: cfg }), [], 'nothing left to create');

    assert.strictEqual(migrate(cfg).migrated, true);
    assert.ok(noteNames(cfg, 'interview').includes('migrated.md'));
});

test('an empty legacy prompt writes nothing and is never looked at again', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const result = migrate(cfg, { legacyCustomPrompt: '   ' });
    assert.strictEqual(result.migrated, false);
    assert.strictEqual(result.migrationState, CUSTOM_PROMPT_MIGRATION_VERSION, 'nothing to do still counts as done');
    assert.deepStrictEqual(noteNames(cfg, 'interview'), []);
});

test('a selected profile that no longer exists falls back to a real one', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });

    const result = migrate(cfg, { selectedProfile: 'deleted-by-hand' });
    assert.strictEqual(result.migrated, true);
    assert.ok(listProfiles(getProfilesDir(cfg)).includes(result.profile));
    assert.ok(noteNames(cfg, result.profile).includes('migrated.md'));
});

test('an unrelated migrated.md is preserved and the legacy note takes another name', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    bootstrapProfiles({ configDir: cfg });
    const existing = path.join(getProfilesDir(cfg), 'interview', 'context', 'migrated.md');
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, 'Something I wrote myself.');

    const result = migrate(cfg);
    assert.strictEqual(result.migrated, true);
    assert.notStrictEqual(result.note, 'migrated.md');
    assert.strictEqual(fs.readFileSync(existing, 'utf8'), 'Something I wrote myself.');
    assert.strictEqual(
        loadProfile(getProfilesDir(cfg), 'interview').contextFiles.find(f => f.file === result.note).content,
        'I am a backend dev with 15 years.'
    );
});

test('a migration that cannot write does not record itself as done', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));

    // No profiles at all: there is nowhere to put the note, so the next launch
    // must try again rather than lose the text.
    const result = migrate(cfg);
    assert.strictEqual(result.migrated, false);
    assert.notStrictEqual(result.migrationState, CUSTOM_PROMPT_MIGRATION_VERSION);

    bootstrapProfiles({ configDir: cfg });
    assert.strictEqual(migrate(cfg, { migrationState: result.migrationState }).migrated, true);
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
