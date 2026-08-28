const test = require('node:test');
const assert = require('node:assert');
const { selectPendingDigests, MAX_DIGEST_ATTEMPTS } = require('../src/core/digest-queue');

const pending = (over = {}) => ({ sessionId: 's1', digestPending: true, digestAttempts: 0, createdAt: 100, ...over });

test('a session marked pending is picked up', () => {
    assert.deepStrictEqual(
        selectPendingDigests([pending()]).map(s => s.sessionId),
        ['s1']
    );
});

// The whole point of the explicit mark: scanning for "sessions without a summary"
// would sweep up the entire back catalogue and burn a model call on each one.
test('a session with no summary but no mark is left alone', () => {
    const old = { sessionId: 'old', digest: null, createdAt: 1 };
    assert.deepStrictEqual(selectPendingDigests([old]), []);
});

test('a session already summarised is not repeated', () => {
    assert.deepStrictEqual(selectPendingDigests([pending({ digest: 'already done' })]), []);
});

// A session that keeps failing must not retry for ever on every launch.
test('gives up after the attempt limit', () => {
    assert.strictEqual(selectPendingDigests([pending({ digestAttempts: MAX_DIGEST_ATTEMPTS })]).length, 0);
    assert.strictEqual(selectPendingDigests([pending({ digestAttempts: MAX_DIGEST_ATTEMPTS - 1 })]).length, 1);
});

test('oldest first, so the queue drains in the order things happened', () => {
    const sessions = [pending({ sessionId: 'newer', createdAt: 300 }), pending({ sessionId: 'older', createdAt: 100 })];

    assert.deepStrictEqual(
        selectPendingDigests(sessions).map(s => s.sessionId),
        ['older', 'newer']
    );
});

test('tolerates a missing or malformed list', () => {
    assert.deepStrictEqual(selectPendingDigests(null), []);
    assert.deepStrictEqual(selectPendingDigests(undefined), []);
    assert.deepStrictEqual(selectPendingDigests([null, undefined]), []);
});

test('a missing attempt count counts as none', () => {
    assert.strictEqual(selectPendingDigests([{ sessionId: 's1', digestPending: true }]).length, 1);
});
