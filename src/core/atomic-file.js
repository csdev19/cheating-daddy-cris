const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Writing in place truncates the file first, so a crash or a power cut during the
// write leaves it empty or half-written — losing everything that was in it, not
// just the part being added. Sessions were written this way and grew with the
// meeting, so the exposure grew with them.
//
// Writing to a sibling and renaming makes the swap atomic on POSIX: a reader sees
// either the whole old file or the whole new one, never a torn one.
function writeFileAtomic(filePath, contents) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    // Unique per call, not just per process: the profile editor can have writes to
    // different files in flight at once, and a failed cleanup must never remove the
    // temporary file another write is still using.
    const temporaryPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
    try {
        fs.writeFileSync(temporaryPath, contents, 'utf8');
        fs.renameSync(temporaryPath, filePath);
    } catch (error) {
        fs.rmSync(temporaryPath, { force: true });
        throw error;
    }
}

module.exports = { writeFileAtomic };
