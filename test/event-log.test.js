const test = require('node:test');
const assert = require('node:assert');
const { serializeEvent, parseEventLog } = require('../src/core/event-log');

test('an event becomes one line, and comes back the same', () => {
    const event = { t: 1700000000000, kind: 'speech', speaker: 'me', text: 'Hello there', echo: false };
    const line = serializeEvent(event);

    assert.strictEqual(line.endsWith('\n'), true);
    assert.strictEqual(line.trimEnd().includes('\n'), false, 'one event is exactly one line');
    assert.deepStrictEqual(parseEventLog(line).events, [event]);
});

// Speech can contain anything, including newlines, which would otherwise break the
// one-event-per-line contract that makes the log recoverable.
test('a newline inside the text does not break the line', () => {
    const event = { t: 1, kind: 'speech', speaker: 'me', text: 'first\nsecond', echo: false };

    assert.strictEqual(serializeEvent(event).trimEnd().includes('\n'), false);
    assert.strictEqual(parseEventLog(serializeEvent(event)).events[0].text, 'first\nsecond');
});

test('reads several events back in order', () => {
    const events = [
        { t: 1, kind: 'speech', speaker: 'them', text: 'one' },
        { t: 2, kind: 'speech', speaker: 'me', text: 'two' },
    ];
    const log = events.map(serializeEvent).join('');

    assert.deepStrictEqual(parseEventLog(log).events, events);
});

// The reason for the format: a crash mid-append leaves a partial last line, and
// everything written before it must still be readable.
test('a half-written last line is dropped, the rest survives', () => {
    const good = serializeEvent({ t: 1, kind: 'speech', speaker: 'me', text: 'kept' });
    const torn = '{"t":2,"kind":"speech","spea';

    const result = parseEventLog(good + torn);
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].text, 'kept');
    assert.strictEqual(result.dropped, 1);
});

test('a corrupt line in the middle is dropped without losing the ones after it', () => {
    const log = [serializeEvent({ t: 1, kind: 'speech', text: 'a' }), 'not json at all\n', serializeEvent({ t: 3, kind: 'speech', text: 'c' })].join(
        ''
    );

    const result = parseEventLog(log);
    assert.deepStrictEqual(
        result.events.map(e => e.text),
        ['a', 'c']
    );
    assert.strictEqual(result.dropped, 1);
});

test('an empty or missing log reads as no events', () => {
    assert.deepStrictEqual(parseEventLog('').events, []);
    assert.deepStrictEqual(parseEventLog(null).events, []);
    assert.deepStrictEqual(parseEventLog('\n\n  \n').events, []);
});

test('blank lines are not counted as corruption', () => {
    const log = serializeEvent({ t: 1, kind: 'speech', text: 'a' }) + '\n\n';
    assert.strictEqual(parseEventLog(log).dropped, 0);
});

test('events come back sorted by time even if appended out of order', () => {
    const log = serializeEvent({ t: 5, kind: 'speech', text: 'later' }) + serializeEvent({ t: 2, kind: 'speech', text: 'earlier' });

    assert.deepStrictEqual(
        parseEventLog(log).events.map(e => e.text),
        ['earlier', 'later']
    );
});
