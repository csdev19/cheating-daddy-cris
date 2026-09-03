const fs = require('fs');
const path = require('path');
const { getProfilesDir, BASE_INSTRUCTIONS } = require('./profiles');

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

function bootstrapProfiles({ configDir, legacyCustomPrompt = '' }) {
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

        // Keeps whatever the user had already written in the old textarea.
        const legacy = (legacyCustomPrompt || '').trim();
        if (legacy) {
            fs.writeFileSync(path.join(dir, 'context', 'migrated.md'), `${legacy}\n`);
        }

        created.push(template.dir);
    }

    return created;
}

module.exports = { bootstrapProfiles, BASE_INSTRUCTIONS, DEFAULT_PROFILES };
