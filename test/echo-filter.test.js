const test = require('node:test');
const assert = require('node:assert');
const { createEchoDetector, similarity } = require('../src/core/echo-filter');

// Taken from a real session: a song playing on the speakers was transcribed once
// from the system channel and again from the microphone that picked it up.
const FROM_SPEAKERS =
    'I met her on the way to Chicago, where she was all alone. So was I, so I asked her for a name. She smiled and looked at me. I was surprised to see.';
const FROM_MIC = 'I met her on the way to Chicago Where she was all alone So as I saw her name She smiled and looked at me I was surprised to see';

test('similarity ignores case, punctuation and spacing', () => {
    assert.strictEqual(similarity('Hello, there!', 'hello   there'), 1);
});

test('similarity is 0 for unrelated text and 1 for identical', () => {
    assert.strictEqual(similarity('one two three', 'one two three'), 1);
    assert.strictEqual(similarity('completely different words', 'nothing at all alike'), 0);
});

test('similarity is symmetric', () => {
    assert.strictEqual(similarity(FROM_SPEAKERS, FROM_MIC), similarity(FROM_MIC, FROM_SPEAKERS));
});

test('the real speaker bleed is caught', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    detector.remember('them', FROM_SPEAKERS);

    assert.strictEqual(detector.check('me', FROM_MIC).isEcho, true);
});

// The case that makes dropping the turn wrong: repeating a question back is normal
// conversation, not echo.
test('a genuine repeat with added words is not flagged', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    detector.remember('them', 'how was your day today');

    assert.strictEqual(detector.check('me', 'pretty good, and how was your day today').isEcho, false);
});

test('only the microphone can echo the speakers, never the other way round', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    detector.remember('me', FROM_MIC);

    assert.strictEqual(detector.check('them', FROM_SPEAKERS).isEcho, false);
});

// The mic hears the speakers as they play, so an echo lands within seconds. Text
// repeated much later is a real repeat.
test('a match outside the time window is not an echo', () => {
    let clock = 1000;
    const detector = createEchoDetector({ windowMs: 5000, now: () => clock });
    detector.remember('them', FROM_SPEAKERS);

    clock = 20000;
    assert.strictEqual(detector.check('me', FROM_MIC).isEcho, false);
});

test('with nothing remembered nothing is an echo', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    assert.strictEqual(detector.check('me', FROM_MIC).isEcho, false);
});

test('the same mic turn is not flagged twice against itself', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    detector.remember('me', 'something I said');

    assert.strictEqual(detector.check('me', 'something I said').isEcho, false);
});

test('check reports the score it used, so the threshold can be tuned', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    detector.remember('them', FROM_SPEAKERS);

    const result = detector.check('me', FROM_MIC);
    assert.ok(result.similarity > 0.85, `expected a high score, got ${result.similarity}`);
});

test('very short turns are never flagged, since they collide by chance', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    detector.remember('them', 'yes');

    assert.strictEqual(detector.check('me', 'yes').isEcho, false);
});

test('reset forgets everything', () => {
    const detector = createEchoDetector({ now: () => 1000 });
    detector.remember('them', FROM_SPEAKERS);
    detector.reset();

    assert.strictEqual(detector.check('me', FROM_MIC).isEcho, false);
});
