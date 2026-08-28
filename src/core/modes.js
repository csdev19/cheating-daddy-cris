const TRANSCRIPTION = ['local-whisper', 'gemini-live'];
const REASONING = ['gemini', 'local-llama'];

// Two independent axes (D14). They used to be a single one (`providerMode`), which
// made the design's default combination impossible: transcribe locally and reason in
// the cloud. The old providerMode is translated so stored preferences keep working.
function resolveModes(prefs = {}, profileMeta = {}) {
    let transcription = TRANSCRIPTION.includes(prefs.transcription) ? prefs.transcription : null;
    let reasoning = REASONING.includes(prefs.reasoning) ? prefs.reasoning : null;

    if (!transcription || !reasoning) {
        if (prefs.providerMode === 'local') {
            transcription = transcription || 'local-whisper';
            reasoning = reasoning || 'local-llama';
        } else if (prefs.providerMode === 'byok') {
            transcription = transcription || 'gemini-live';
            reasoning = reasoning || 'gemini';
        }
    }

    transcription = transcription || 'local-whisper';
    reasoning = reasoning || 'gemini';

    // A confidential profile never leaves the machine, whatever the preferences
    // happen to say (D13).
    if (profileMeta.confidential === true) {
        transcription = 'local-whisper';
        reasoning = 'local-llama';
    }

    return { transcription, reasoning };
}

// Verified against ListModels and a real call on 2026-08-28. A GA model is the
// default on purpose: `gemini-3.7-flash` is valid but was returning 503 (high
// demand), and a default that fails mid-meeting is worse than a slightly older one.
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// The Live API models only work over the WebSocket. Sending one to an HTTP
// generateContent call returns a 404 in the middle of a meeting, so the id is
// filtered here rather than trusted from config or from a profile.
function isLiveModel(id) {
    return /(^|[-.])live([-.]|$)/.test(id);
}

function resolveReasoningModel(profileMeta = {}, config = {}) {
    for (const candidate of [profileMeta.model, config.geminiModel]) {
        if (typeof candidate !== 'string') continue;
        const clean = candidate.trim();
        if (clean && !isLiveModel(clean)) return clean;
    }
    return DEFAULT_GEMINI_MODEL;
}

// Where a chunk of captured audio has to go. It follows the transcription axis on
// purpose: routing it by the old single `providerMode` (which really tracks the
// reasoning side) silently dropped every chunk under the default combination of
// local Whisper plus cloud reasoning.
function resolveAudioTarget(modes = {}, providerMode = null) {
    if (providerMode === 'cloud') return 'cloud';
    return TRANSCRIPTION.includes(modes.transcription) ? modes.transcription : 'local-whisper';
}

module.exports = { resolveModes, resolveReasoningModel, resolveAudioTarget, TRANSCRIPTION, REASONING, DEFAULT_GEMINI_MODEL };
