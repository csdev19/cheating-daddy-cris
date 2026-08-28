// Decides how to continue a download that may already be partly on disk.
//
// The models are large (large-v3-turbo is 1.6 GB). Before this, every attempt
// wrote to a temp file named with pid + timestamp and deleted it on any error,
// so an interrupted download threw away everything and the next attempt started
// from byte 0 again. Hugging Face answers Range requests with 206, so the bytes
// already fetched can be kept.

function planDownload({ partialBytes, totalBytes = 0, serverStatus = null } = {}) {
    const have = Number.isFinite(partialBytes) && partialBytes > 0 ? Math.floor(partialBytes) : 0;
    const total = Number.isFinite(totalBytes) && totalBytes > 0 ? Math.floor(totalBytes) : 0;

    const fresh = { mode: 'fresh', rangeHeader: null, flags: 'w', alreadyHave: 0 };

    // More bytes than the file should have means it is not the file we think it
    // is; appending would pile garbage on garbage.
    if (have === 0 || (total && have > total)) return fresh;

    if (total && have === total) {
        return { mode: 'complete', rangeHeader: null, flags: 'a', alreadyHave: have };
    }

    const rangeHeader = `bytes=${have}-`;

    // A server that ignores Range replies 200 with the whole body. Appending that
    // would corrupt the file, so the partial has to be dropped.
    if (serverStatus !== null && serverStatus !== 206) {
        return { ...fresh, rangeHeader };
    }

    return { mode: 'resume', rangeHeader, flags: 'a', alreadyHave: have };
}

module.exports = { planDownload };
