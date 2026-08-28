const test = require('node:test');
const assert = require('node:assert');
const { planDownload } = require('../src/core/download-plan');

test('with nothing on disk it starts from scratch', () => {
    assert.deepStrictEqual(planDownload({ partialBytes: 0, totalBytes: 1000 }), {
        mode: 'fresh',
        rangeHeader: null,
        flags: 'w',
        alreadyHave: 0,
    });
});

// The whole point: a 1.6 GB download that dies at 90% must not start over.
test('a partial file resumes from where it stopped', () => {
    assert.deepStrictEqual(planDownload({ partialBytes: 900, totalBytes: 1000 }), {
        mode: 'resume',
        rangeHeader: 'bytes=900-',
        flags: 'a',
        alreadyHave: 900,
    });
});

test('a partial file of the full size needs no transfer', () => {
    assert.deepStrictEqual(planDownload({ partialBytes: 1000, totalBytes: 1000 }), {
        mode: 'complete',
        rangeHeader: null,
        flags: 'a',
        alreadyHave: 1000,
    });
});

// A partial bigger than the target means the file on disk is not what we think
// it is; resuming would append garbage onto garbage.
test('a partial bigger than the total starts from scratch', () => {
    assert.strictEqual(planDownload({ partialBytes: 1500, totalBytes: 1000 }).mode, 'fresh');
    assert.strictEqual(planDownload({ partialBytes: 1500, totalBytes: 1000 }).flags, 'w');
});

// Without a known total there is no way to tell a finished file from a truncated
// one, so resuming is still right but completion cannot be claimed.
test('resumes even when the total size is unknown', () => {
    const plan = planDownload({ partialBytes: 900, totalBytes: 0 });
    assert.strictEqual(plan.mode, 'resume');
    assert.strictEqual(plan.rangeHeader, 'bytes=900-');
});

test('treats a missing or negative partial as nothing', () => {
    assert.strictEqual(planDownload({ partialBytes: null, totalBytes: 1000 }).mode, 'fresh');
    assert.strictEqual(planDownload({ partialBytes: -5, totalBytes: 1000 }).mode, 'fresh');
    assert.strictEqual(planDownload({}).mode, 'fresh');
});

// The server may ignore Range and answer 200 with the whole body. Appending then
// would corrupt the file, so the plan has to be reconsidered from the status.
test('a server that ignores Range forces a rewrite from zero', () => {
    const plan = planDownload({ partialBytes: 900, totalBytes: 1000 });
    assert.deepStrictEqual(planDownload({ partialBytes: 900, totalBytes: 1000, serverStatus: 200 }), {
        mode: 'fresh',
        rangeHeader: plan.rangeHeader,
        flags: 'w',
        alreadyHave: 0,
    });
});

test('a 206 confirms the resume', () => {
    assert.strictEqual(planDownload({ partialBytes: 900, totalBytes: 1000, serverStatus: 206 }).mode, 'resume');
    assert.strictEqual(planDownload({ partialBytes: 900, totalBytes: 1000, serverStatus: 206 }).flags, 'a');
});
