const test = require('node:test');
const assert = require('node:assert');
const { chooseCaptureSource, AUTO } = require('../src/core/display-choice');

const src = (displayId, name) => ({ id: `screen:${displayId}:0`, display_id: String(displayId), name });
const SOURCES = [src(1, 'Built-in'), src(2, 'External')];

test('with no preference it takes the primary display', () => {
    const result = chooseCaptureSource(SOURCES, { preferredDisplayId: AUTO, primaryDisplayId: 1 });

    assert.strictEqual(result.source.display_id, '1');
    assert.strictEqual(result.fellBack, false);
});

test('a chosen display is honoured', () => {
    const result = chooseCaptureSource(SOURCES, { preferredDisplayId: '2', primaryDisplayId: 1 });

    assert.strictEqual(result.source.display_id, '2');
    assert.strictEqual(result.fellBack, false);
});

// desktopCapturer reports display_id as a string, screen reports id as a number.
// Comparing them without normalising silently never matches.
test('numeric and string display ids match each other', () => {
    assert.strictEqual(chooseCaptureSource(SOURCES, { preferredDisplayId: 2, primaryDisplayId: 1 }).source.display_id, '2');
    assert.strictEqual(chooseCaptureSource(SOURCES, { preferredDisplayId: AUTO, primaryDisplayId: '1' }).source.display_id, '1');
});

// The case that matters: the external monitor was chosen, then left at home.
// Capturing the wrong screen silently would be worse than the original problem.
test('a missing display falls back to the primary and says so', () => {
    const result = chooseCaptureSource([src(1, 'Built-in')], { preferredDisplayId: '2', primaryDisplayId: 1 });

    assert.strictEqual(result.source.display_id, '1');
    assert.strictEqual(result.fellBack, true);
});

test('if the primary is gone too it takes whatever is there, still flagged', () => {
    const result = chooseCaptureSource([src(3, 'Third')], { preferredDisplayId: '2', primaryDisplayId: 1 });

    assert.strictEqual(result.source.display_id, '3');
    assert.strictEqual(result.fellBack, true);
});

// Auto is not a fallback: nothing was chosen, so nothing was lost.
test('auto never reports a fallback, even if the primary is not listed', () => {
    const result = chooseCaptureSource([src(3, 'Third')], { preferredDisplayId: AUTO, primaryDisplayId: 1 });

    assert.strictEqual(result.source.display_id, '3');
    assert.strictEqual(result.fellBack, false);
});

test('no sources at all yields no source', () => {
    assert.strictEqual(chooseCaptureSource([], { preferredDisplayId: AUTO, primaryDisplayId: 1 }).source, null);
    assert.strictEqual(chooseCaptureSource(null, {}).source, null);
});

test('an empty or missing preference counts as auto', () => {
    for (const pref of [null, undefined, '', AUTO]) {
        const result = chooseCaptureSource(SOURCES, { preferredDisplayId: pref, primaryDisplayId: 2 });
        assert.strictEqual(result.source.display_id, '2', `preference ${JSON.stringify(pref)}`);
        assert.strictEqual(result.fellBack, false);
    }
});
