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

// ---------------------------------------------------------------------------
// The write half (D30). A profile folder is the source of truth, so the editor
// has to survive a hand edit landing between a read and its save.
// ---------------------------------------------------------------------------

const {
    readProfileForEditing,
    writeProfile,
    writeChecklist,
    writeNote,
    deleteNote,
    createProfile,
    deleteProfile,
    ProfileError,
} = require('../src/core/profiles');

function makeWritableProfile(body = 'Original instructions.') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-write-'));
    const dir = path.join(root, 'interview');
    fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'profile.md'),
        ['---', 'name: Job Interview', 'confidential: false', 'model: gemini-2.5-flash', '---', '', body].join('\n') + '\n'
    );
    fs.writeFileSync(path.join(dir, 'checklist.md'), '- Ask about the team\n');
    fs.writeFileSync(path.join(dir, 'context', 'cv.md'), 'Backend, 15 years.\n');
    return root;
}

test('readProfileForEditing returns the editable profile and a revision per file', () => {
    const root = makeWritableProfile();
    const { profile, revisions } = readProfileForEditing(root, 'interview');

    assert.strictEqual(profile.slug, 'interview');
    assert.strictEqual(profile.meta.name, 'Job Interview');
    assert.strictEqual(profile.meta.confidential, false);
    assert.strictEqual(profile.meta.model, 'gemini-2.5-flash');
    assert.strictEqual(profile.instructions, 'Original instructions.');
    assert.deepStrictEqual(
        profile.checklist.map(i => i.text),
        ['Ask about the team']
    );
    assert.deepStrictEqual(
        profile.notes.map(n => n.name),
        ['cv.md']
    );
    assert.strictEqual(profile.notes[0].content, 'Backend, 15 years.\n');
    assert.strictEqual(profile.notes[0].bytes, Buffer.byteLength('Backend, 15 years.\n'));

    assert.ok(revisions['profile.md'], 'profile.md must carry a revision');
    assert.ok(revisions['checklist.md']);
    assert.ok(revisions[path.join('context', 'cv.md')]);
});

test('writeProfile saves the four managed fields in a single document', () => {
    const root = makeWritableProfile();
    const { profile, revisions } = readProfileForEditing(root, 'interview');

    writeProfile({
        profilesDir: root,
        slug: 'interview',
        profile: {
            meta: { name: 'Backend Interview', confidential: true, model: 'gemini-3.7-flash' },
            instructions: 'New instructions.',
        },
        expectedRevision: revisions['profile.md'],
    });

    const reread = readProfileForEditing(root, 'interview').profile;
    assert.strictEqual(reread.meta.name, 'Backend Interview');
    assert.strictEqual(reread.meta.confidential, true);
    assert.strictEqual(reread.meta.model, 'gemini-3.7-flash');
    assert.strictEqual(reread.instructions, 'New instructions.');
    assert.strictEqual(loadProfile(root, 'interview').meta.confidential, true, 'the session loader must read the same file');
});

test('writeProfile keeps hand-authored frontmatter keys and comments it does not manage', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-write-'));
    const dir = path.join(root, 'interview');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'profile.md'),
        ['---', '# my own note about this profile', 'name: Job Interview', 'language: en', 'confidential: false', '---', '', 'Body.'].join('\n') +
            '\n'
    );

    const { revisions } = readProfileForEditing(root, 'interview');
    writeProfile({
        profilesDir: root,
        slug: 'interview',
        profile: { meta: { name: 'Renamed', confidential: false, model: null }, instructions: 'Body.' },
        expectedRevision: revisions['profile.md'],
    });

    const raw = fs.readFileSync(path.join(dir, 'profile.md'), 'utf8');
    assert.ok(raw.includes('language: en'), 'an unmanaged key must survive the save');
    assert.ok(raw.includes('# my own note about this profile'), 'a comment must survive the save');
    assert.ok(raw.includes('name: Renamed'));
});

test('a stale revision is rejected and leaves the file untouched', () => {
    const root = makeWritableProfile();
    const { revisions } = readProfileForEditing(root, 'interview');
    const file = path.join(root, 'interview', 'profile.md');

    // Someone edits the file by hand while the editor holds an old read.
    fs.writeFileSync(file, ['---', 'name: Job Interview', '---', '', 'Edited by hand.'].join('\n') + '\n');
    const onDisk = fs.readFileSync(file, 'utf8');

    assert.throws(
        () =>
            writeProfile({
                profilesDir: root,
                slug: 'interview',
                profile: { meta: { name: 'From the editor', confidential: false, model: null }, instructions: 'Draft.' },
                expectedRevision: revisions['profile.md'],
            }),
        error => error instanceof ProfileError && error.code === 'PROFILE_CONFLICT'
    );

    assert.strictEqual(fs.readFileSync(file, 'utf8'), onDisk, 'the hand edit must survive');

    // The caller can recover: read again, get the new revision, save on top of it.
    const fresh = readProfileForEditing(root, 'interview');
    writeProfile({
        profilesDir: root,
        slug: 'interview',
        profile: { meta: { name: 'From the editor', confidential: false, model: null }, instructions: 'Draft.' },
        expectedRevision: fresh.revisions['profile.md'],
    });
    assert.strictEqual(readProfileForEditing(root, 'interview').profile.instructions, 'Draft.');
});

test('writeNote creates and updates a note under context/', () => {
    const root = makeWritableProfile();
    const created = writeNote({ profilesDir: root, slug: 'interview', noteName: 'figures.md', content: 'Cut latency 40%.', expectedRevision: null });
    assert.ok(created.revision);
    assert.strictEqual(fs.readFileSync(path.join(root, 'interview', 'context', 'figures.md'), 'utf8'), 'Cut latency 40%.');

    writeNote({ profilesDir: root, slug: 'interview', noteName: 'figures.md', content: 'Cut latency 45%.', expectedRevision: created.revision });
    assert.strictEqual(loadProfile(root, 'interview').contextFiles.find(f => f.file === 'figures.md').content, 'Cut latency 45%.');
});

test('writeNote refuses a name that escapes the context folder', () => {
    const root = makeWritableProfile();
    const escapes = ['../evil.md', '../../evil.md', 'sub/evil.md', 'sub\\evil.md', '/etc/passwd.md', 'evil.txt', '.md', '', '   ', 'evil'];

    for (const noteName of escapes) {
        assert.throws(
            () => writeNote({ profilesDir: root, slug: 'interview', noteName, content: 'x', expectedRevision: null }),
            error => error instanceof ProfileError && error.code === 'INVALID_NOTE_NAME',
            `note name ${JSON.stringify(noteName)} must be rejected`
        );
    }

    assert.ok(!fs.existsSync(path.join(root, 'evil.md')), 'nothing may be written outside the profile');
});

test('writeNote refuses to create a note that already exists', () => {
    const root = makeWritableProfile();
    assert.throws(
        () => writeNote({ profilesDir: root, slug: 'interview', noteName: 'cv.md', content: 'overwrite', expectedRevision: null }),
        error => error instanceof ProfileError && error.code === 'NOTE_EXISTS'
    );
    assert.strictEqual(fs.readFileSync(path.join(root, 'interview', 'context', 'cv.md'), 'utf8'), 'Backend, 15 years.\n');
});

test('deleteNote removes only the note it was given, and only with a fresh revision', () => {
    const root = makeWritableProfile();
    const { revisions } = readProfileForEditing(root, 'interview');
    const key = path.join('context', 'cv.md');

    assert.throws(
        () => deleteNote({ profilesDir: root, slug: 'interview', noteName: '../../cv.md', expectedRevision: revisions[key] }),
        error => error instanceof ProfileError && error.code === 'INVALID_NOTE_NAME'
    );

    assert.throws(
        () => deleteNote({ profilesDir: root, slug: 'interview', noteName: 'cv.md', expectedRevision: 'sha256:stale' }),
        error => error instanceof ProfileError && error.code === 'PROFILE_CONFLICT'
    );
    assert.ok(fs.existsSync(path.join(root, 'interview', 'context', 'cv.md')));

    deleteNote({ profilesDir: root, slug: 'interview', noteName: 'cv.md', expectedRevision: revisions[key] });
    assert.ok(!fs.existsSync(path.join(root, 'interview', 'context', 'cv.md')));
});

test('writeChecklist rejects empty items and ids that collide after slugify', () => {
    const root = makeWritableProfile();
    const { revisions } = readProfileForEditing(root, 'interview');

    assert.throws(
        () =>
            writeChecklist({
                profilesDir: root,
                slug: 'interview',
                items: ['Ask about the team', '   '],
                expectedRevision: revisions['checklist.md'],
            }),
        error => error instanceof ProfileError && error.code === 'INVALID_CHECKLIST'
    );

    // Both slugify to 'ask-about-the-team', and the id identifies checklist events.
    assert.throws(
        () =>
            writeChecklist({
                profilesDir: root,
                slug: 'interview',
                items: ['Ask about the team', 'Ask about the TEAM!'],
                expectedRevision: revisions['checklist.md'],
            }),
        error => error instanceof ProfileError && error.code === 'INVALID_CHECKLIST'
    );

    assert.strictEqual(fs.readFileSync(path.join(root, 'interview', 'checklist.md'), 'utf8'), '- Ask about the team\n');

    writeChecklist({
        profilesDir: root,
        slug: 'interview',
        items: ['Ask about the team', 'Ask about deployment'],
        expectedRevision: revisions['checklist.md'],
    });
    assert.deepStrictEqual(
        loadProfile(root, 'interview').checklist.map(i => i.id),
        ['ask-about-the-team', 'ask-about-deployment']
    );
});

test('createProfile derives the slug once and seeds a complete, loadable profile', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-create-'));
    const { slug } = createProfile({ profilesDir: root, displayName: 'Técnical Review!' });

    assert.strictEqual(slug, 'tecnical-review');
    assert.ok(fs.existsSync(path.join(root, slug, 'profile.md')));
    assert.ok(fs.existsSync(path.join(root, slug, 'checklist.md')));
    assert.ok(fs.statSync(path.join(root, slug, 'context')).isDirectory());

    const loaded = loadProfile(root, slug);
    assert.strictEqual(loaded.meta.name, 'Técnical Review!', 'the display name keeps what was typed');
    assert.ok(loaded.instructions.length > 0, 'a new profile is seeded, not blank');
    assert.deepStrictEqual(describeProfiles(root), [{ dir: slug, name: 'Técnical Review!' }]);
});

test('createProfile rejects a name with no slug and a name that collides', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-create-'));

    for (const displayName of ['', '   ', '!!!', '///']) {
        assert.throws(
            () => createProfile({ profilesDir: root, displayName }),
            error => error instanceof ProfileError && error.code === 'INVALID_NAME',
            `${JSON.stringify(displayName)} must be rejected`
        );
    }

    createProfile({ profilesDir: root, displayName: 'Client Call' });
    assert.throws(
        () => createProfile({ profilesDir: root, displayName: 'Client Call' }),
        error => error instanceof ProfileError && error.code === 'PROFILE_EXISTS'
    );

    // macOS is case-insensitive: 'CLIENT CALL' slugifies to a different string but
    // would land on the same folder. Checking the filesystem is what catches it.
    assert.throws(
        () => createProfile({ profilesDir: root, displayName: 'CLIENT   call' }),
        error => error instanceof ProfileError && error.code === 'PROFILE_EXISTS'
    );
});

test(
    'a failed creation leaves no directory reserving the slug',
    { skip: process.getuid && process.getuid() === 0 ? 'running as root' : false },
    () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-create-'));
        fs.chmodSync(root, 0o555);

        try {
            assert.throws(() => createProfile({ profilesDir: root, displayName: 'Client Call' }));
            assert.deepStrictEqual(fs.readdirSync(root), [], 'no folder and no staging leftovers');
        } finally {
            fs.chmodSync(root, 0o755);
        }
    }
);

test('deleteProfile removes the folder but refuses the last one', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-delete-'));
    createProfile({ profilesDir: root, displayName: 'Client Call' });
    createProfile({ profilesDir: root, displayName: 'Work Meeting' });

    deleteProfile({ profilesDir: root, slug: 'client-call' });
    assert.deepStrictEqual(listProfiles(root), ['work-meeting']);

    assert.throws(
        () => deleteProfile({ profilesDir: root, slug: 'work-meeting' }),
        error => error instanceof ProfileError && error.code === 'LAST_PROFILE'
    );
    assert.deepStrictEqual(listProfiles(root), ['work-meeting'], 'the last profile survives');
});

test('deleteProfile refuses a symlinked target and leaves what it points at alone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-delete-'));
    createProfile({ profilesDir: root, displayName: 'Client Call' });

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'precious-'));
    fs.writeFileSync(path.join(outside, 'keep.md'), 'do not delete me');
    fs.symlinkSync(outside, path.join(root, 'linked'));

    assert.throws(
        () => deleteProfile({ profilesDir: root, slug: 'linked' }),
        error => error instanceof ProfileError && error.code === 'UNSAFE_TARGET'
    );
    assert.ok(fs.existsSync(path.join(outside, 'keep.md')), 'the symlink target must survive');
});

test('a write to an unknown profile fails instead of creating one', () => {
    const root = makeWritableProfile();
    for (const call of [
        () => readProfileForEditing(root, 'ghost'),
        () => writeProfile({ profilesDir: root, slug: 'ghost', profile: { meta: { name: 'Ghost' }, instructions: 'x' }, expectedRevision: null }),
        () => writeNote({ profilesDir: root, slug: 'ghost', noteName: 'n.md', content: 'x', expectedRevision: null }),
        () => writeChecklist({ profilesDir: root, slug: 'ghost', items: ['x'], expectedRevision: null }),
    ]) {
        assert.throws(call, error => error instanceof ProfileError && error.code === 'PROFILE_NOT_FOUND');
    }
    assert.ok(!fs.existsSync(path.join(root, 'ghost')));
});

test('a slug that escapes the profiles folder is refused everywhere', () => {
    const root = makeWritableProfile();
    for (const slug of ['../interview', 'a/b', '..', '']) {
        assert.throws(
            () => readProfileForEditing(root, slug),
            error => error instanceof ProfileError && error.code === 'INVALID_SLUG',
            `slug ${JSON.stringify(slug)} must be rejected`
        );
    }
});
