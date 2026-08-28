// Which screen a capture comes from.
//
// The choice is made once in preferences, never at session start: macOS's own
// picker was rejected precisely because it interrupts every session with a dialog
// that everyone in the call can see (D27).

const AUTO = 'auto';

// desktopCapturer reports `display_id` as a string while screen reports `id` as a
// number. Comparing them raw silently never matches.
function sameDisplay(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
}

function chooseCaptureSource(sources, { preferredDisplayId, primaryDisplayId } = {}) {
    if (!Array.isArray(sources) || sources.length === 0) {
        return { source: null, fellBack: false };
    }

    const primary = sources.find(s => sameDisplay(s.display_id, primaryDisplayId)) || sources[0];
    const wantsAuto = !preferredDisplayId || preferredDisplayId === AUTO;

    if (wantsAuto) return { source: primary, fellBack: false };

    const chosen = sources.find(s => sameDisplay(s.display_id, preferredDisplayId));
    if (chosen) return { source: chosen, fellBack: false };

    // The chosen display is gone — an external monitor left behind, typically.
    // Capturing something else without saying so would be worse than the problem
    // this setting exists to solve.
    return { source: primary, fellBack: true };
}

module.exports = { chooseCaptureSource, AUTO };
