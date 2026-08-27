const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseFrontmatter, listProfiles, describeProfiles, resolveProfileName, loadProfile, getProfilesDir } = require('../src/core/profiles');

function makeSampleProfile() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    const profile = path.join(root, 'backend-interview');
    fs.mkdirSync(path.join(profile, 'context'), { recursive: true });

    fs.writeFileSync(
        path.join(profile, 'profile.md'),
        ['---', 'name: Backend Interview', 'confidential: false', 'model: gemini-3.7-flash', '---', '', 'Do not tell me what to say.'].join('\n')
    );
    fs.writeFileSync(path.join(profile, 'checklist.md'), '- Ask about the team\n- Mention Kubernetes\n\n- \n');
    fs.writeFileSync(path.join(profile, 'context', 'cv.md'), '15 years of backend.');
    fs.writeFileSync(path.join(profile, 'context', 'figures.md'), 'Cut latency by 40%.');

    return root;
}

test('getProfilesDir hangs off the config folder', () => {
    assert.strictEqual(getProfilesDir('/tmp/cfg'), path.join('/tmp/cfg', 'profiles'));
});

test('parseFrontmatter splits metadata from body', () => {
    const { meta, body } = parseFrontmatter('---\nname: Sample\nconfidential: true\n---\n\nBody here.');
    assert.strictEqual(meta.name, 'Sample');
    assert.strictEqual(meta.confidential, true);
    assert.strictEqual(body, 'Body here.');
});

test('parseFrontmatter tolerates a file with no frontmatter', () => {
    const { meta, body } = parseFrontmatter('Body only.');
    assert.deepStrictEqual(meta, {});
    assert.strictEqual(body, 'Body only.');
});

test('parseFrontmatter converts booleans and leaves the rest as text', () => {
    const { meta } = parseFrontmatter('---\na: true\nb: false\nc: gemini-3.7-flash\n---\nx');
    assert.strictEqual(meta.a, true);
    assert.strictEqual(meta.b, false);
    assert.strictEqual(meta.c, 'gemini-3.7-flash');
});

test('listProfiles returns the folders in order', () => {
    const root = makeSampleProfile();
    fs.mkdirSync(path.join(root, 'aaa-first'));
    fs.writeFileSync(path.join(root, 'aaa-first', 'profile.md'), '---\nname: First\n---\n\nHello.');
    assert.deepStrictEqual(listProfiles(root), ['aaa-first', 'backend-interview']);
});

// A stray folder with no profile.md is not a profile. If the picker offers it,
// choosing it breaks the session on start.
test('listProfiles ignores folders without a profile.md', () => {
    const root = makeSampleProfile();
    fs.mkdirSync(path.join(root, 'half-made'));

    assert.deepStrictEqual(listProfiles(root), ['backend-interview']);
});

test('describeProfiles gives the folder and the display name of each profile', () => {
    const root = makeSampleProfile();

    assert.deepStrictEqual(describeProfiles(root), [{ dir: 'backend-interview', name: 'Backend Interview' }]);
});

test('describeProfiles falls back to the folder name when the frontmatter has none', () => {
    const root = makeSampleProfile();
    fs.mkdirSync(path.join(root, 'unnamed'));
    fs.writeFileSync(path.join(root, 'unnamed', 'profile.md'), 'No frontmatter.');

    assert.deepStrictEqual(describeProfiles(root), [
        { dir: 'backend-interview', name: 'Backend Interview' },
        { dir: 'unnamed', name: 'unnamed' },
    ]);
});

test('resolveProfileName honours the requested profile when it exists', () => {
    const root = makeSampleProfile();

    assert.strictEqual(resolveProfileName(root, 'backend-interview'), 'backend-interview');
});

// The profile stored in preferences may have been renamed or deleted by hand.
// Without this fallback the app cannot start and has no way to recover.
test('resolveProfileName falls back to the first available profile', () => {
    const root = makeSampleProfile();

    assert.strictEqual(resolveProfileName(root, 'does-not-exist'), 'backend-interview');
    assert.strictEqual(resolveProfileName(root, null), 'backend-interview');
});

test('resolveProfileName returns null when there is no profile at all', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));

    assert.strictEqual(resolveProfileName(root, 'interview'), null);
});

test('listProfiles returns empty when the directory does not exist', () => {
    assert.deepStrictEqual(listProfiles('/path/that/does/not/exist'), []);
});

test('loadProfile reads instructions, context and checklist', () => {
    const root = makeSampleProfile();
    const profile = loadProfile(root, 'backend-interview');

    assert.strictEqual(profile.meta.name, 'Backend Interview');
    assert.strictEqual(profile.meta.confidential, false);
    assert.strictEqual(profile.meta.model, 'gemini-3.7-flash');
    assert.strictEqual(profile.instructions, 'Do not tell me what to say.');

    assert.deepStrictEqual(
        profile.contextFiles.map(f => f.file),
        ['cv.md', 'figures.md']
    );
    assert.strictEqual(profile.contextFiles[0].content, '15 years of backend.');
});

test('loadProfile parses the checklist and skips empty lines', () => {
    const root = makeSampleProfile();
    const profile = loadProfile(root, 'backend-interview');

    assert.strictEqual(profile.checklist.length, 2);
    assert.strictEqual(profile.checklist[0].text, 'Ask about the team');
    assert.strictEqual(profile.checklist[0].id, 'ask-about-the-team');
});

test('loadProfile works with no checklist and no context folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'minimal'));
    fs.writeFileSync(path.join(root, 'minimal', 'profile.md'), 'Instructions only.');

    const profile = loadProfile(root, 'minimal');
    assert.deepStrictEqual(profile.contextFiles, []);
    assert.deepStrictEqual(profile.checklist, []);
    assert.strictEqual(profile.meta.name, 'minimal');
});

test('loadProfile fails clearly when the profile does not exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    assert.throws(() => loadProfile(root, 'missing'), /missing/);
});

// Accented input is the point of this test: checklist ids must stay URL-safe
// whatever language the user writes their checklist in.
test('slugify normalises accents and spaces', () => {
    const { slugify } = require('../src/core/profiles');
    assert.strictEqual(slugify('Ask about the Migración de BD'), 'ask-about-the-migracion-de-bd');
});
