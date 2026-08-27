const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDigestPrompt, appendDigest } = require('../src/core/digest');

test('the prompt asks for agreements, open items, names and figures', () => {
    const prompt = buildDigestPrompt('[Them]: Hello');
    assert.ok(/agreements/i.test(prompt));
    assert.ok(/open items/i.test(prompt));
    assert.ok(prompt.includes('[Them]: Hello'));
});

test('appendDigest creates history.md and appends dated entries in order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'client-call', 'context'), { recursive: true });

    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'We agreed on X.', date: '2026-08-26' });
    appendDigest({ profilesDir: root, profileName: 'client-call', digest: 'Y is pending.', date: '2026-08-27' });

    const content = fs.readFileSync(path.join(root, 'client-call', 'context', 'history.md'), 'utf8');
    assert.ok(content.includes('## 2026-08-26'));
    assert.ok(content.includes('We agreed on X.'));
    assert.ok(content.indexOf('2026-08-26') < content.indexOf('2026-08-27'));
});

test('appendDigest trims down to the last maxEntries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    fs.mkdirSync(path.join(root, 'p', 'context'), { recursive: true });
    for (let i = 1; i <= 5; i++) {
        appendDigest({ profilesDir: root, profileName: 'p', digest: `e${i}`, date: `2026-01-0${i}`, maxEntries: 3 });
    }

    const content = fs.readFileSync(path.join(root, 'p', 'context', 'history.md'), 'utf8');
    assert.ok(!content.includes('2026-01-01'));
    assert.ok(content.includes('2026-01-05'));
    assert.strictEqual((content.match(/^## /gm) || []).length, 3);
});

test('appendDigest creates the context directory when it is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
    const file = appendDigest({ profilesDir: root, profileName: 'new', digest: 'x', date: '2026-01-01' });
    assert.ok(fs.existsSync(file));
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
