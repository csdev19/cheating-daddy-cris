const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./atomic-file');
const { profileDirOf, ProfileError } = require('./profiles');

const HISTORY_HEADER = '# Meeting history';

function buildDigestPrompt(transcript) {
    return [
        'Summarise this meeting in 10-15 lines so I can read it before the next one with the same people.',
        'Sections: **Agreements**, **Open items** (who owes what), **Names and roles** mentioned, **Figures and dates** quoted.',
        'Only what was actually said. If a section would be empty, leave it out.',
        '',
        '---',
        transcript,
    ].join('\n');
}

// Appends the summary to the profile's history, which the next session loads as
// one more note (D17). Trimmed so the cached prefix cannot grow without bound.
//
// This runs detached from the session that produced it (D24), so by the time it
// lands the profile may be gone. It proves the profile is still there instead of
// creating what it needs: a late summary must not resurrect a folder someone
// deleted on purpose (D30).
function appendDigest({ profilesDir, profileName, digest, date, maxEntries = 20 }) {
    const profileDir = profileDirOf(profilesDir, profileName);
    if (!fs.existsSync(path.join(profileDir, 'profile.md'))) {
        throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${profileName}' no longer exists, so its summary was dropped.`);
    }

    const file = path.join(profileDir, 'context', 'history.md');

    // Read here rather than before the model call: another append can land while
    // this one is waiting on the provider.
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const entries = existing
        .split(/^(?=## )/m)
        .map(e => e.trim())
        .filter(e => e.startsWith('## '));

    entries.push(`## ${date}\n\n${digest.trim()}`);

    // Atomic like every other write into a profile: this file is also something a
    // person reads and edits by hand.
    writeFileAtomic(file, `${HISTORY_HEADER}\n\n${entries.slice(-maxEntries).join('\n\n')}\n`);
    return file;
}

module.exports = { buildDigestPrompt, appendDigest };
