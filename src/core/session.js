const { createSessionContext } = require('./session-context');
const { getProfilesDir, loadProfile } = require('./profiles');
const { buildPayload } = require('./payload');

// Joins the context thread, the profile and the provider. `sendToProvider` is
// injected: it is the seam that lets the provider change without touching the
// memory logic.
function createSessionManager({ configDir, sendToProvider, onEvent = null, now = Date.now }) {
    if (!configDir) throw new TypeError('createSessionManager requires configDir');
    if (typeof sendToProvider !== 'function') throw new TypeError('createSessionManager requires sendToProvider');

    let context = null;
    let profile = null;
    let pending = false;

    // The single exit point for thread events. The view subscribes here instead of
    // polling the context, and a rendering failure never takes the session down.
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
        // B6: two quick presses of the shortcut must not fire two requests.
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
