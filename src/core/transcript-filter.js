// Whisper invents sentences over silence and noise, and marks non-speech audio
// with bracketed tags. Without this, "Thank you for watching" enters the thread as
// something the interviewer said, and the model is later asked to reason about it.
//
// This used to be an inline expression in localai.js referencing a constant that
// was never declared, so every transcription threw and nothing was ever recorded.
// It lives here now so it is covered by tests.

const NO_SPEECH_THRESHOLD = 0.6;

const JUNK_PATTERNS = [
    /thank you for watching/i,
    /subt[ií]tulos/i,
    // A segment that is nothing but a bracketed tag: [BLANK_AUDIO], (music)...
    /^\s*\[[^\]]*\]\s*$/,
    /^\s*\([^)]*\)\s*$/,
];

function isJunk(text) {
    return JUNK_PATTERNS.some(pattern => pattern.test(text));
}

function cleanTranscription(segments, { noSpeechThreshold = NO_SPEECH_THRESHOLD } = {}) {
    if (!Array.isArray(segments)) return '';

    return segments
        .filter(segment => (segment.no_speech_prob ?? 0) < noSpeechThreshold)
        .map(segment => (segment.text || '').trim())
        .filter(text => text && !isJunk(text))
        .join(' ')
        .trim();
}

module.exports = { cleanTranscription, isJunk, NO_SPEECH_THRESHOLD, JUNK_PATTERNS };
