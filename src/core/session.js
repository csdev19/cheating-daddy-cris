const { createSessionContext } = require('./session-context');
const { getProfilesDir, loadProfile } = require('./profiles');
const { buildPayload } = require('./payload');

// Une el hilo de contexto, el perfil y el proveedor. `sendToProvider` se inyecta:
// es el seam que permite cambiar de proveedor sin tocar la lógica de memoria.
function createSessionManager({ configDir, sendToProvider, onEvent = null, now = Date.now }) {
    if (!configDir) throw new TypeError('createSessionManager requires configDir');
    if (typeof sendToProvider !== 'function') throw new TypeError('createSessionManager requires sendToProvider');

    let context = null;
    let profile = null;
    let pending = false;

    // Único punto de salida de los eventos del hilo. La vista se suscribe aquí en
    // vez de sondear el contexto, y un fallo pintando nunca corta la sesión.
    function emit(event) {
        if (!event || !onEvent) return event;
        try {
            onEvent(event);
        } catch (error) {
            console.error('onEvent failed:', error);
        }
        return event;
    }

    function start({ profileName, sessionId = String(now()) }) {
        profile = loadProfile(getProfilesDir(configDir), profileName);
        context = createSessionContext({ sessionId, profileName, now });
        return { sessionId, profile };
    }

    function recordSpeech(speaker, text) {
        if (!context) return null;
        return emit(context.addSpeech({ speaker, text }));
    }

    function recordScreen(imageRef, caption = null) {
        if (!context) return null;
        return emit(context.addScreen({ imageRef, caption }));
    }

    async function ask({ question, image = null }) {
        if (!context || !profile) throw new Error('No active session');
        // B6: dos pulsaciones seguidas del atajo no deben lanzar dos peticiones.
        if (pending) throw new Error('A request is already in flight');

        pending = true;
        try {
            const payload = buildPayload({ profile, sessionContext: context, question, image });
            const answer = await sendToProvider(payload);
            emit(context.addAsk({ question, answer }));
            return answer;
        } finally {
            pending = false;
        }
    }

    function end() {
        context = null;
        profile = null;
        pending = false;
    }

    return { start, recordSpeech, recordScreen, ask, end, getContext: () => context, getProfile: () => profile };
}

module.exports = { createSessionManager };
