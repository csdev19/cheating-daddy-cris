const { createSessionContext } = require('./session-context');
const { getProfilesDir, loadProfile } = require('./profiles');
const { buildPayload } = require('./payload');

// Une el hilo de contexto, el perfil y el proveedor. `sendToProvider` se inyecta:
// es el seam que permite cambiar de proveedor sin tocar la lógica de memoria.
function createSessionManager({ configDir, sendToProvider, now = Date.now }) {
    if (!configDir) throw new TypeError('createSessionManager requiere configDir');
    if (typeof sendToProvider !== 'function') throw new TypeError('createSessionManager requiere sendToProvider');

    let context = null;
    let profile = null;
    let pending = false;

    function start({ profileName, sessionId = String(now()) }) {
        profile = loadProfile(getProfilesDir(configDir), profileName);
        context = createSessionContext({ sessionId, profileName, now });
        return { sessionId, profile };
    }

    function recordSpeech(speaker, text) {
        if (!context) return;
        context.addSpeech({ speaker, text });
    }

    function recordScreen(imageRef) {
        if (!context) return;
        context.addScreen({ imageRef });
    }

    async function ask({ question, image = null }) {
        if (!context || !profile) throw new Error('No hay sesión activa');
        // B6: dos pulsaciones seguidas del atajo no deben lanzar dos peticiones.
        if (pending) throw new Error('Ya hay una petición en curso');

        pending = true;
        try {
            const payload = buildPayload({ profile, sessionContext: context, question, image });
            const answer = await sendToProvider(payload);
            context.addAsk({ question, answer });
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
