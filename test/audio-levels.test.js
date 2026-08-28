const test = require('node:test');
const assert = require('node:assert');
const { createLevelTracker } = require('../src/core/audio-levels');

function harness({ intervalMs = 100, holdMs = 400 } = {}) {
    let clock = 0;
    const emitted = [];
    const tracker = createLevelTracker({
        emit: levels => emitted.push({ t: clock, ...levels }),
        now: () => clock,
        intervalMs,
        holdMs,
    });
    return { tracker, emitted, tick: ms => (clock += ms) };
}

test('the first sample emits straight away', () => {
    const { tracker, emitted } = harness();
    tracker.push('them', 0.4);

    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].them, 0.4);
    assert.strictEqual(emitted[0].me, 0);
});

// Audio arrives every 100 ms per channel; repainting the meter on each chunk
// would flood the IPC for no visible gain.
test('throttles: several samples inside the window emit only once', () => {
    const { tracker, emitted, tick } = harness({ intervalMs: 100 });
    tracker.push('them', 0.1);
    tick(20);
    tracker.push('them', 0.5);
    tick(20);
    tracker.push('them', 0.3);

    assert.strictEqual(emitted.length, 1);
});

test('emits again once the window has passed, with the peak of the window', () => {
    const { tracker, emitted, tick } = harness({ intervalMs: 100 });
    tracker.push('them', 0.1);
    tick(40);
    tracker.push('them', 0.9);
    tick(80);
    tracker.push('them', 0.2);

    assert.strictEqual(emitted.length, 2);
    // The peak is what the eye reads as "there is voice here", not the last sample.
    assert.strictEqual(emitted[1].them, 0.9);
});

test('each channel keeps its own level', () => {
    const { tracker, emitted, tick } = harness({ intervalMs: 100 });
    tracker.push('them', 0.8);
    tick(150);
    tracker.push('me', 0.2);

    assert.strictEqual(emitted[1].them, 0.8, 'them holds its level');
    assert.strictEqual(emitted[1].me, 0.2);
});

// A channel that stops sending audio must fall back to zero, otherwise the meter
// freezes showing sound that is no longer there.
test('a silent channel decays to zero after the hold', () => {
    const { tracker, emitted, tick } = harness({ intervalMs: 100, holdMs: 300 });
    tracker.push('them', 0.9);
    tick(400);
    tracker.push('me', 0.1);

    const last = emitted[emitted.length - 1];
    assert.strictEqual(last.them, 0);
});

test('an unknown speaker is ignored instead of throwing', () => {
    const { tracker, emitted } = harness();
    assert.doesNotThrow(() => tracker.push('nobody', 0.5));
    assert.strictEqual(emitted.length, 0);
});

test('clamps the level to the 0..1 range', () => {
    const { tracker, emitted } = harness();
    tracker.push('them', 4);
    assert.strictEqual(emitted[0].them, 1);
});

test('reset zeroes both channels and reports it', () => {
    const { tracker, emitted, tick } = harness();
    tracker.push('them', 0.7);
    tick(150);
    tracker.reset();

    const last = emitted[emitted.length - 1];
    assert.deepStrictEqual({ them: last.them, me: last.me }, { them: 0, me: 0 });
});
