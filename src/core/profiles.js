const fs = require('fs');
const path = require('path');

function getProfilesDir(configDir) {
    return path.join(configDir, 'profiles');
}

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

module.exports = { getProfilesDir, parseFrontmatter, listProfiles, describeProfiles, resolveProfileName, loadProfile, slugify };
