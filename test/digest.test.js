const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDigestPrompt, appendDigest } = require('../src/core/digest');
const { ProfileError } = require('../src/core/profiles');

// appendDigest writes into a profile it does not own, and it runs detached from the
// session that produced it (D24). Both mean it has to prove the profile is still
// there rather than assume it.
function makeProfile(root, slug) {
    fs.mkdirSync(path.join(root, slug, 'context'), { recursive: true });
    fs.writeFileSync(path.join(root, slug, 'profile.md'), '---\nname: Test\n---\n\nInstructions.\n');
    return path.join(root, slug);
}

test('the prompt asks for agreements, open items, names and figures', () => {
    const prompt = buildDigestPrompt('[Them]: Hello');
    assert.ok(/agreements/i.test(prompt));
    assert.ok(/open items/i.test(prompt));
    assert.ok(prompt.includes('[Them]: Hello'));
});

test('appendDigest creates history.md and appends dated entries in order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    makeProfile(root, 'client-call');

    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'We agreed on X.', date: '2026-08-26' });
    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'Y is pending.', date: '2026-08-27' });

    const content = fs.readFileSync(path.join(root, 'client-call', 'context', 'history.md'), 'utf8');
    assert.ok(content.includes('## 2026-08-26'));
    assert.ok(content.includes('We agreed on X.'));
    assert.ok(content.indexOf('2026-08-26') < content.indexOf('2026-08-27'));
});

test('appendDigest trims down to the last maxEntries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    makeProfile(root, 'p');
    for (let i = 1; i <= 5; i++) {
        appendDigest({ profilesDir: root, profileName: 'p', digest: `e${i}`, date: `2026-01-0${i}`, maxEntries: 3 });
    }

    const content = fs.readFileSync(path.join(root, 'p', 'context', 'history.md'), 'utf8');
    assert.ok(!content.includes('2026-01-01'));
    assert.ok(content.includes('2026-01-05'));
    assert.strictEqual((content.match(/^## /gm) || []).length, 3);
});

test('appendDigest creates the context directory of a profile that exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'new'), { recursive: true });
    fs.writeFileSync(path.join(root, 'new', 'profile.md'), 'Instructions.');

    const file = appendDigest({ profilesDir: root, profileName: 'new', digest: 'x', date: '2026-01-01' });
    assert.ok(fs.existsSync(file));
});

test('appendDigest refuses to resurrect a profile that was deleted while it ran', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    makeProfile(root, 'client-call');
    fs.rmSync(path.join(root, 'client-call'), { recursive: true, force: true });

    assert.throws(
        () => appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'Too late.', date: '2026-01-01' }),
        error => error instanceof ProfileError && error.code === 'PROFILE_NOT_FOUND'
    );
    assert.ok(!fs.existsSync(path.join(root, 'client-call')), 'a late summary must not recreate the folder');
});

test('appendDigest refuses a profile name that escapes the profiles folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    makeProfile(root, 'client-call');

    assert.throws(
        () => appendDigest({ profilesDir: root, profileName: '../escape', digest: 'x', date: '2026-01-01' }),
        error => error instanceof ProfileError && error.code === 'INVALID_SLUG'
    );
});

test('appendDigest keeps a history.md written by hand and writes an English header', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    makeProfile(root, 'client-call');
    const file = path.join(root, 'client-call', 'context', 'history.md');
    fs.writeFileSync(file, '# Meeting history\n\n## 2026-01-01\n\nSomething I wrote myself.\n');

    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'And then this.', date: '2026-01-02' });

    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes('Something I wrote myself.'), 'an entry written by hand must survive');
    assert.ok(content.includes('And then this.'));
    assert.ok(content.startsWith('# Meeting history'), 'the header is English (there is no i18n layer)');
});

test('loadProfile picks the generated history up as one more note', () => {
    const { loadProfile } = require('../src/core/profiles');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'client-call'), { recursive: true });
    fs.writeFileSync(path.join(root, 'client-call', 'profile.md'), 'Instructions.');
    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'We agreed on X.', date: '2026-08-26' });

    const profile = loadProfile(root, 'client-call');
    const history = profile.contextFiles.find(f => f.file === 'history.md');
    assert.ok(history, 'history.md must load as a context file');
    assert.ok(history.content.includes('We agreed on X.'));
});
