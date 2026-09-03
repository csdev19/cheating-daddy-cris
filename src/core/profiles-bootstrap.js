const fs = require('fs');
const path = require('path');
const { getProfilesDir, resolveProfileName, writeNote, BASE_INSTRUCTIONS } = require('./profiles');

// BASE_INSTRUCTIONS moved to ./profiles when the editor landed: the profile editor
// seeds a new profile with it too, and requiring it from here would be a cycle.

const DEFAULT_PROFILES = [
    {
        dir: 'interview',
        name: 'Job Interview',
        extra: 'Prioritise my concrete experience and impact figures. If they mention a technology that appears in my notes, remind me what I did with it.',
        checklist: ['Ask about the team and the day to day', 'Ask about the deployment process', 'Mention my experience leading'],
    },
    {
        dir: 'meeting',
        name: 'Work Meeting',
        extra: 'Prioritise earlier agreements and open commitments. Warn me if something already settled comes up again.',
        checklist: ['Confirm the next steps', 'Note down who does what'],
    },
    {
        dir: 'client-call',
        name: 'Client Call',
        extra: 'Prioritise the account history and whatever was promised on earlier calls.',
        checklist: ['Confirm deadlines', 'Ask about blockers'],
    },
];

function bootstrapProfiles({ configDir }) {
    const profilesDir = getProfilesDir(configDir);
    fs.mkdirSync(profilesDir, { recursive: true });

    const created = [];

    for (const template of DEFAULT_PROFILES) {
        const dir = path.join(profilesDir, template.dir);
        if (fs.existsSync(path.join(dir, 'profile.md'))) continue;

        fs.mkdirSync(path.join(dir, 'context'), { recursive: true });

        const frontmatter = ['---', `name: ${template.name}`, 'confidential: false', '---', ''].join('\n');
        fs.writeFileSync(path.join(dir, 'profile.md'), `${frontmatter}\n${BASE_INSTRUCTIONS}\n\n${template.extra}\n`);
        fs.writeFileSync(path.join(dir, 'checklist.md'), template.checklist.map(t => `- ${t}`).join('\n') + '\n');

        created.push(template.dir);
    }

    return created;
}

// The one-time move of `prefs.customPrompt` into a real note (D31).
//
// It is deliberately not part of bootstrapProfiles. Tying it to "the profiles
// folder was just created" loses the text of anyone whose profiles appeared in an
// earlier release while they carried on typing into the old textarea. Its own
// marker is what makes it run exactly once, and the marker is only recorded by the
// caller after the note is safely on disk.
const CUSTOM_PROMPT_MIGRATION_VERSION = 1;

// The name is taken by something the person wrote themselves often enough to be
// worth handling: their file is left alone and the legacy text goes beside it.
function firstFreeNoteName(profilesDir, slug) {
    const contextDir = path.join(profilesDir, slug, 'context');
    for (let attempt = 0; ; attempt++) {
        const name = attempt === 0 ? 'migrated.md' : `migrated-${attempt + 1}.md`;
        if (!fs.existsSync(path.join(contextDir, name))) return name;
    }
}

function migrateLegacyCustomPrompt({ configDir, legacyCustomPrompt, selectedProfile, migrationState }) {
    const state = Number(migrationState) || 0;
    const nothingLeftToDo = { migrated: false, profile: null, note: null, migrationState: CUSTOM_PROMPT_MIGRATION_VERSION };

    if (state >= CUSTOM_PROMPT_MIGRATION_VERSION) return { ...nothingLeftToDo, migrated: false };

    const text = typeof legacyCustomPrompt === 'string' ? legacyCustomPrompt.trim() : '';
    if (!text) return nothingLeftToDo;

    const profilesDir = getProfilesDir(configDir);
    const slug = resolveProfileName(profilesDir, selectedProfile);

    // Nowhere to put it yet. Leaving the marker where it was is what makes the
    // next launch try again instead of dropping the text.
    if (!slug) return { migrated: false, profile: null, note: null, migrationState: state };

    const note = firstFreeNoteName(profilesDir, slug);
    // Throws on failure, and the caller only records the marker on success.
    writeNote({ profilesDir, slug, noteName: note, content: `${text}\n`, expectedRevision: null });

    return { migrated: true, profile: slug, note, migrationState: CUSTOM_PROMPT_MIGRATION_VERSION };
}

module.exports = { bootstrapProfiles, migrateLegacyCustomPrompt, CUSTOM_PROMPT_MIGRATION_VERSION, BASE_INSTRUCTIONS, DEFAULT_PROFILES };
