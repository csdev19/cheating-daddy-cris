// Without headphones the microphone picks up whatever comes out of the speakers,
// so the same words are transcribed twice: once on the system channel and again on
// the mic. The design calls channel labelling "correct by construction" (D6), and
// that only holds with headphones (B1).
//
// Matches are flagged, never dropped (D23). Repeating a question back — "and how
// was your day?" — is normal conversation, and silently deleting the turn would
// lose something the person actually said, with no way for them to notice.

const DEFAULT_WINDOW_MS = 15000;
const DEFAULT_THRESHOLD = 0.85;
// Below this many words, two turns collide by chance often enough to be useless.
const MIN_WORDS = 5;

function tokenize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

// Dice coefficient over the word multisets. Chosen over intersection-over-smaller
// because that scores a subset as a perfect match, which is exactly the repeated
// question case we must not flag.
function similarity(a, b) {
    const left = tokenize(a);
    const right = tokenize(b);
    if (left.length === 0 || right.length === 0) return 0;

    const pool = new Map();
    for (const word of left) pool.set(word, (pool.get(word) || 0) + 1);

    let shared = 0;
    for (const word of right) {
        const available = pool.get(word) || 0;
        if (available > 0) {
            shared += 1;
            pool.set(word, available - 1);
        }
    }

    return (2 * shared) / (left.length + right.length);
}

function createEchoDetector({ windowMs = DEFAULT_WINDOW_MS, threshold = DEFAULT_THRESHOLD, now = Date.now } = {}) {
    let recentFromSpeakers = [];

    function remember(speaker, text) {
        // Only the system channel is a source of echo: it is what the speakers played.
        if (speaker !== 'them') return;
        recentFromSpeakers.push({ text, t: now() });
    }

    function check(speaker, text) {
        if (speaker !== 'me') return { isEcho: false, similarity: 0 };
        if (tokenize(text).length < MIN_WORDS) return { isEcho: false, similarity: 0 };

        const cutoff = now() - windowMs;
        recentFromSpeakers = recentFromSpeakers.filter(entry => entry.t >= cutoff);

        let best = 0;
        for (const entry of recentFromSpeakers) {
            best = Math.max(best, similarity(entry.text, text));
        }

        return { isEcho: best >= threshold, similarity: best };
    }

    function reset() {
        recentFromSpeakers = [];
    }

    return { remember, check, reset };
}

module.exports = { createEchoDetector, similarity, DEFAULT_WINDOW_MS, DEFAULT_THRESHOLD, MIN_WORDS };
