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

    const temporaryPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}`);
    try {
        fs.writeFileSync(temporaryPath, contents, 'utf8');
        fs.renameSync(temporaryPath, filePath);
    } catch (error) {
        fs.rmSync(temporaryPath, { force: true });
        throw error;
    }
}

module.exports = { writeFileAtomic };
