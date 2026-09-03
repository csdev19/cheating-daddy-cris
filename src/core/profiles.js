const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./atomic-file');

function getProfilesDir(configDir) {
    return path.join(configDir, 'profiles');
}

// Replaces the hardcoded profilePrompts, which told the model to dictate the
// answer word by word ("no coaching, just the direct response"). That prompt was
// the opposite of a memory assistant (finding H6). It seeds both the default
// profiles and any profile created from the editor, so a new one is never blank.
const BASE_INSTRUCTIONS = `You are my memory assistant, not a teleprompter. Do not tell me what to say.

When I call on you, give me what I have probably forgotten: the exact figure, the
project name, the term they just used. Keep it short — I will be reading you while
talking to someone.

If something is not in my notes, say so. Do not make it up: I would rather hear
"I don't have that" than a confident falsehood.`;

// Minimal frontmatter parser: only `key: value` pairs in the header. Enough for
// name/confidential/model, and it avoids taking on a YAML dependency.
function parseFrontmatter(raw) {
    const text = (raw || '').replace(/^﻿/, '');
    if (!text.startsWith('---')) {
        return { meta: {}, body: text.trim() };
    }

    const cierre = text.indexOf('\n---', 3);
    if (cierre === -1) {
        return { meta: {}, body: text.trim() };
    }

    const cabecera = text.slice(3, cierre);
    const body = text.slice(cierre + 4).trim();
    const meta = {};

    for (const linea of cabecera.split('\n')) {
        const limpia = linea.trim();
        if (!limpia || limpia.startsWith('#')) continue;

        const sep = limpia.indexOf(':');
        if (sep === -1) continue;

        const clave = limpia.slice(0, sep).trim();
        // Strip a trailing comment and any wrapping quotes.
        let valor = limpia
            .slice(sep + 1)
            .replace(/\s+#.*$/, '')
            .trim();
        valor = valor.replace(/^["'](.*)["']$/, '$1');

        if (valor === 'true') meta[clave] = true;
        else if (valor === 'false') meta[clave] = false;
        else meta[clave] = valor;
    }

    return { meta, body };
}

// A profile is a folder with a profile.md. Anything else is not offered: if the
// picker lists it, choosing it breaks the session on start.
function listProfiles(profilesDir) {
    if (!fs.existsSync(profilesDir)) return [];
    return fs
        .readdirSync(profilesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .filter(name => fs.existsSync(path.join(profilesDir, name, 'profile.md')))
        .sort();
}

// What the picker needs: the folder (the real id) and the name to display. Coming
// from disk, the list cannot drift out of sync with what actually exists.
function describeProfiles(profilesDir) {
    return listProfiles(profilesDir).map(dir => {
        const { meta } = parseFrontmatter(fs.readFileSync(path.join(profilesDir, dir, 'profile.md'), 'utf8'));
        return { dir, name: meta.name || dir };
    });
}

// The profile stored in preferences may have been renamed or deleted by hand.
// Without this fallback the app cannot start and has no way to recover.
function resolveProfileName(profilesDir, preferred) {
    const available = listProfiles(profilesDir);
    if (available.length === 0) return null;
    return available.includes(preferred) ? preferred : available[0];
}

function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function readChecklist(profileDir) {
    const ruta = path.join(profileDir, 'checklist.md');
    if (!fs.existsSync(ruta)) return [];

    return fs
        .readFileSync(ruta, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('- '))
        .map(l => l.slice(2).trim())
        .filter(Boolean)
        .map(text => ({ id: slugify(text), text }));
}

function readContextFiles(profileDir) {
    const dir = path.join(profileDir, 'context');
    if (!fs.existsSync(dir)) return [];

    // Stable alphabetical order: the cached prefix must not change between calls.
    return fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(file => ({ file, content: fs.readFileSync(path.join(dir, file), 'utf8').trim() }));
}

function loadProfile(profilesDir, name) {
    const profileDir = path.join(profilesDir, name);
    const profileFile = path.join(profileDir, 'profile.md');

    if (!fs.existsSync(profileFile)) {
        throw new Error(`Profile '${name}' has no profile.md in ${profileDir}`);
    }

    const { meta, body } = parseFrontmatter(fs.readFileSync(profileFile, 'utf8'));

    return {
        name,
        meta: {
            name: meta.name || name,
            confidential: meta.confidential === true,
            model: meta.model || null,
        },
        instructions: body,
        contextFiles: readContextFiles(profileDir),
        checklist: readChecklist(profileDir),
    };
}

// ---------------------------------------------------------------------------
// The write half (D30).
//
// The folder is the source of truth, which only means something if editing a file
// by hand stays safe. So every write carries the revision its caller read, and a
// mismatch is refused rather than resolved: the editor keeps the draft and asks.
// Nothing here normalises a file a person wrote — unknown frontmatter keys,
// comments and ordering all survive a save.
// ---------------------------------------------------------------------------

// The renderer branches on `code`; `message` is for a person to read. Both stay
// English (there is no i18n layer).
class ProfileError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'ProfileError';
        this.code = code;
    }
}

// A profile that was created by hand may be called anything, so this is not the
// slug pattern: it only refuses names that could address a file somewhere else.
function assertSafeName(value, code, label) {
    const name = typeof value === 'string' ? value.trim() : '';
    const safe = name.length > 0 && !name.includes('/') && !name.includes('\\') && !name.startsWith('.') && path.basename(name) === name;

    if (!safe) throw new ProfileError(code, `'${value}' is not a valid ${label} name.`);
    return name;
}

// Read from disk, so it is treated as untrusted input (same reasoning as
// resolveScreenshotPath): the name is checked, and the resolved path is checked
// again against the folder it must stay inside.
function profileDirOf(profilesDir, slug) {
    const name = assertSafeName(slug, 'INVALID_SLUG', 'profile');
    const root = path.resolve(profilesDir);
    const dir = path.resolve(root, name);

    if (!dir.startsWith(root + path.sep)) throw new ProfileError('INVALID_SLUG', `'${slug}' escapes the profiles folder.`);
    return dir;
}

// `readContextFiles` only ever reads `.md`, so a note saved as anything else is
// silently never sent to the model. The editor refuses the name instead.
function assertNoteName(noteName) {
    const name = assertSafeName(noteName, 'INVALID_NOTE_NAME', 'note');
    if (!name.endsWith('.md') || name.slice(0, -3).trim().length === 0) {
        throw new ProfileError('INVALID_NOTE_NAME', `A note is named '<something>.md', not '${noteName}'.`);
    }
    return name;
}

function notePathOf(profileDir, noteName) {
    const name = assertNoteName(noteName);
    const contextDir = path.resolve(profileDir, 'context');
    const file = path.resolve(contextDir, name);

    if (!file.startsWith(contextDir + path.sep)) throw new ProfileError('INVALID_NOTE_NAME', `'${noteName}' escapes the context folder.`);
    return file;
}

function assertProfileExists(profileDir, slug) {
    if (!fs.existsSync(path.join(profileDir, 'profile.md'))) {
        throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${slug}' does not exist.`);
    }
}

// Over the exact bytes on disk, so any hand edit changes it — including one that
// only touches whitespace.
function revisionOf(file) {
    if (!fs.existsSync(file)) return null;
    return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function assertRevision(file, expectedRevision) {
    const current = revisionOf(file);
    const expected = expectedRevision === undefined ? null : expectedRevision;

    if (current !== expected) {
        throw new ProfileError('PROFILE_CONFLICT', 'This file changed on disk since it was read. Reload it or copy your draft out.');
    }
}

const MANAGED_KEYS = ['name', 'confidential', 'model'];

function frontmatterKey(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;

    const separator = trimmed.indexOf(':');
    return separator === -1 ? null : trimmed.slice(0, separator).trim();
}

// Splits the header into its raw lines instead of a map: that is what lets an
// unmanaged key or a comment come back out unchanged.
function splitFrontmatter(raw) {
    const text = (raw || '').replace(/^﻿/, '');
    if (!text.startsWith('---')) return { header: null, body: text.trim() };

    const close = text.indexOf('\n---', 3);
    if (close === -1) return { header: null, body: text.trim() };

    return { header: text.slice(3, close).split('\n').filter(Boolean), body: text.slice(close + 4).trim() };
}

function serialiseValue(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';

    // parseFrontmatter strips a trailing `#` comment and unwraps quotes, so a value
    // holding either has to be quoted or it would not survive the round trip.
    const text = String(value);
    return /#|^\s|\s$|^["']/.test(text) ? JSON.stringify(text) : text;
}

function renderProfileDocument({ header, meta, instructions }) {
    const lines = [];
    const seen = new Set();

    for (const line of header || []) {
        const key = frontmatterKey(line);
        if (!key || !MANAGED_KEYS.includes(key)) {
            lines.push(line);
            continue;
        }

        seen.add(key);
        // A managed key set to null is dropped rather than written empty.
        if (meta[key] !== null && meta[key] !== undefined) lines.push(`${key}: ${serialiseValue(meta[key])}`);
    }

    for (const key of MANAGED_KEYS) {
        if (seen.has(key) || meta[key] === null || meta[key] === undefined) continue;
        lines.push(`${key}: ${serialiseValue(meta[key])}`);
    }

    return ['---', ...lines, '---', '', String(instructions || '').trim(), ''].join('\n');
}

function validateMeta(meta = {}) {
    const name = typeof meta.name === 'string' ? meta.name.trim() : '';
    if (!name || /[\r\n]/.test(name)) throw new ProfileError('INVALID_NAME', 'A profile needs a display name.');

    if (meta.confidential !== undefined && typeof meta.confidential !== 'boolean') {
        throw new ProfileError('INVALID_META', 'confidential is true or false.');
    }

    const model = meta.model === null || meta.model === undefined ? null : String(meta.model).trim();
    if (model && /[\r\n]/.test(model)) throw new ProfileError('INVALID_META', 'A model id is a single line.');

    return { name, confidential: meta.confidential === true, model: model || null };
}

// The id identifies checklist events inside a session thread, so two items that
// slugify the same would make those events ambiguous after the fact.
function validateChecklist(items) {
    if (!Array.isArray(items)) throw new ProfileError('INVALID_CHECKLIST', 'The checklist is a list of lines.');

    const texts = [];
    const ids = new Set();

    for (const item of items) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (!text) throw new ProfileError('INVALID_CHECKLIST', 'A checklist item cannot be empty.');

        const id = slugify(text);
        if (!id) throw new ProfileError('INVALID_CHECKLIST', `'${text}' has no letters or digits to identify it by.`);
        if (ids.has(id)) throw new ProfileError('INVALID_CHECKLIST', `'${text}' collides with another item; both are '${id}'.`);

        ids.add(id);
        texts.push(text);
    }

    return texts;
}

function readProfileForEditing(profilesDir, slug) {
    const dir = profileDirOf(profilesDir, slug);
    assertProfileExists(dir, slug);

    const profileFile = path.join(dir, 'profile.md');
    const { meta, body } = parseFrontmatter(fs.readFileSync(profileFile, 'utf8'));
    const revisions = { 'profile.md': revisionOf(profileFile) };

    const checklistFile = path.join(dir, 'checklist.md');
    if (fs.existsSync(checklistFile)) revisions['checklist.md'] = revisionOf(checklistFile);

    // Not readContextFiles: that one trims for the prompt, and an editor has to
    // hand back the file exactly as it is or the first save rewrites it.
    const contextDir = path.join(dir, 'context');
    const notes = [];
    if (fs.existsSync(contextDir)) {
        for (const file of fs
            .readdirSync(contextDir)
            .filter(f => f.endsWith('.md'))
            .sort()) {
            const content = fs.readFileSync(path.join(contextDir, file), 'utf8');
            notes.push({ name: file, content, bytes: Buffer.byteLength(content) });
            revisions[path.join('context', file)] = revisionOf(path.join(contextDir, file));
        }
    }

    return {
        profile: {
            slug: path.basename(dir),
            meta: { name: meta.name || slug, confidential: meta.confidential === true, model: meta.model || null },
            instructions: body,
            checklist: readChecklist(dir),
            notes,
        },
        revisions,
    };
}

// The name, the model, the confidential flag and the instructions are four fields
// in one file. They are written as one document on purpose: saving them
// separately lets an older debounce erase a newer field, and writing atomically
// does not help with that.
function writeProfile({ profilesDir, slug, profile, expectedRevision }) {
    const dir = profileDirOf(profilesDir, slug);
    assertProfileExists(dir, slug);

    const file = path.join(dir, 'profile.md');
    const meta = validateMeta(profile && profile.meta);
    assertRevision(file, expectedRevision);

    const { header } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    writeFileAtomic(file, renderProfileDocument({ header, meta, instructions: profile.instructions }));

    return { revision: revisionOf(file) };
}

function writeChecklist({ profilesDir, slug, items, expectedRevision }) {
    const dir = profileDirOf(profilesDir, slug);
    assertProfileExists(dir, slug);

    const texts = validateChecklist(items);
    const file = path.join(dir, 'checklist.md');
    assertRevision(file, expectedRevision);

    writeFileAtomic(file, texts.length > 0 ? `${texts.map(text => `- ${text}`).join('\n')}\n` : '');
    return { revision: revisionOf(file) };
}

// A null revision means "this note is new", so an existing file is a collision
// rather than a conflict: the caller never read it, and would be overwriting
// something it has not seen.
function writeNote({ profilesDir, slug, noteName, content, expectedRevision }) {
    const dir = profileDirOf(profilesDir, slug);
    assertProfileExists(dir, slug);

    const file = notePathOf(dir, noteName);
    if (expectedRevision === null || expectedRevision === undefined) {
        if (fs.existsSync(file)) throw new ProfileError('NOTE_EXISTS', `'${noteName}' already exists.`);
    } else {
        assertRevision(file, expectedRevision);
    }

    writeFileAtomic(file, String(content == null ? '' : content));
    return { revision: revisionOf(file) };
}

function deleteNote({ profilesDir, slug, noteName, expectedRevision }) {
    const dir = profileDirOf(profilesDir, slug);
    assertProfileExists(dir, slug);

    const file = notePathOf(dir, noteName);
    if (!fs.existsSync(file)) throw new ProfileError('NOTE_NOT_FOUND', `'${noteName}' does not exist.`);

    assertRevision(file, expectedRevision);
    fs.rmSync(file, { force: true });
    return { deleted: path.basename(file) };
}

// Staged in a sibling folder and renamed into place, so a failure leaves either
// nothing or a complete profile — never a half-built folder holding the slug
// hostage.
function createProfile({ profilesDir, displayName }) {
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    const slug = slugify(name);
    if (!name || !slug) throw new ProfileError('INVALID_NAME', 'A profile name needs at least one letter or digit.');

    fs.mkdirSync(profilesDir, { recursive: true });
    const target = path.join(profilesDir, slug);

    // existsSync rather than a string comparison against listProfiles: macOS is
    // case-insensitive, so a hand-made 'Client-Call' would collide with this slug
    // while comparing as a different name.
    if (fs.existsSync(target)) throw new ProfileError('PROFILE_EXISTS', `A profile folder named '${slug}' already exists.`);

    const staging = path.join(profilesDir, `.new-${crypto.randomBytes(6).toString('hex')}`);
    try {
        fs.mkdirSync(path.join(staging, 'context'), { recursive: true });
        fs.writeFileSync(
            path.join(staging, 'profile.md'),
            renderProfileDocument({ header: null, meta: { name, confidential: false, model: null }, instructions: BASE_INSTRUCTIONS })
        );
        fs.writeFileSync(path.join(staging, 'checklist.md'), '');
        fs.renameSync(staging, target);
    } catch (error) {
        fs.rmSync(staging, { recursive: true, force: true });
        throw error;
    }

    return { slug, profile: readProfileForEditing(profilesDir, slug).profile };
}

function deleteProfile({ profilesDir, slug }) {
    const dir = profileDirOf(profilesDir, slug);

    let stats;
    try {
        stats = fs.lstatSync(dir);
    } catch (error) {
        throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${slug}' does not exist.`);
    }

    // lstat, not stat: a symlink here would delete whatever it points at.
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new ProfileError('UNSAFE_TARGET', `'${slug}' is not a profile folder.`);

    const available = listProfiles(profilesDir);
    if (available.includes(slug) && available.length === 1) {
        throw new ProfileError('LAST_PROFILE', 'This is the only profile left; the app cannot start a session without one.');
    }

    fs.rmSync(dir, { recursive: true, force: true });
    return { deleted: slug };
}

module.exports = {
    getProfilesDir,
    parseFrontmatter,
    listProfiles,
    describeProfiles,
    resolveProfileName,
    loadProfile,
    slugify,
    BASE_INSTRUCTIONS,
    ProfileError,
    profileDirOf,
    readProfileForEditing,
    writeProfile,
    writeChecklist,
    writeNote,
    deleteNote,
    createProfile,
    deleteProfile,
};
