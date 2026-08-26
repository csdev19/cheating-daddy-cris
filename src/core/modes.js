const TRANSCRIPTION = ['local-whisper', 'gemini-live'];
const REASONING = ['gemini', 'local-llama'];

// Dos ejes independientes (D14). Antes eran uno solo (`providerMode`), lo que hacía
// imposible la combinación por defecto del diseño: transcribir en local y razonar
// en la nube. El providerMode antiguo se traduce para no romper preferencias guardadas.
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

    // Un perfil confidencial nunca sale de la máquina, aunque las preferencias
    // digan lo contrario (D13).
    if (profileMeta.confidential === true) {
        transcription = 'local-whisper';
        reasoning = 'local-llama';
    }

    return { transcription, reasoning };
}

module.exports = { resolveModes, TRANSCRIPTION, REASONING };
