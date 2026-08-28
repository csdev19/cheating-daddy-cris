const SPEAKERS = ['them', 'me'];

// Feeds the recording indicator. Audio arrives in 100 ms chunks per channel, so
// the raw RMS is far too noisy and far too frequent to paint directly: this keeps
// the peak of each window and emits at most once per `intervalMs`.
//
// A channel that stops sending has to fall back to zero on its own, otherwise the
// meter freezes showing sound that is no longer there — which would be worse than
// no indicator at all, because it would lie about recording.

const DEFAULT_INTERVAL_MS = 100;
const DEFAULT_HOLD_MS = 400;

function createLevelTracker({ emit, now = Date.now, intervalMs = DEFAULT_INTERVAL_MS, holdMs = DEFAULT_HOLD_MS }) {
    if (typeof emit !== 'function') throw new TypeError('createLevelTracker requires emit');

    // `pending` is the peak collected since the last emit; `shown` is what the
    // meter is currently displaying. A channel with no new samples holds its last
    // value until `holdMs` runs out, so the bar decays instead of flickering.
    const pending = { them: null, me: null };
    const shown = { them: 0, me: 0 };
    const lastSeen = { them: 0, me: 0 };
    let lastEmit = null;

    function flush(t) {
        lastEmit = t;

        for (const speaker of SPEAKERS) {
            if (t - lastSeen[speaker] > holdMs) shown[speaker] = 0;
            else if (pending[speaker] !== null) shown[speaker] = pending[speaker];
            pending[speaker] = null;
        }

        emit({ ...shown });
    }

    function push(speaker, rms) {
        if (!SPEAKERS.includes(speaker)) return;

        const level = Math.max(0, Math.min(1, Number(rms) || 0));
        const t = now();
        pending[speaker] = Math.max(pending[speaker] ?? 0, level);
        lastSeen[speaker] = t;

        if (lastEmit === null || t - lastEmit >= intervalMs) flush(t);
    }

    function reset() {
        for (const speaker of SPEAKERS) {
            pending[speaker] = null;
            shown[speaker] = 0;
            lastSeen[speaker] = 0;
        }
        lastEmit = now();
        emit({ them: 0, me: 0 });
    }

    return { push, reset };
}

module.exports = { createLevelTracker, SPEAKERS, DEFAULT_INTERVAL_MS, DEFAULT_HOLD_MS };
