const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./core/atomic-file');
const os = require('os');

const CONFIG_VERSION = 1;

// Default values
const DEFAULT_CONFIG = {
    configVersion: CONFIG_VERSION,
    onboarded: false,
    layout: 'normal',
    // Two different APIs, two different ids: `geminiLiveModel` is the WebSocket
    // Live model, `geminiModel` is the HTTP one used to reason.
    geminiLiveModel: 'gemini-3.1-flash-live-preview',
    geminiModel: 'gemini-2.5-flash',
    groqModel: 'qwen/qwen3.6-27b',
    groqImageModel: 'qwen/qwen3.6-27b',
    disableGroqThinking: true,
};

const DEFAULT_CREDENTIALS = {
    apiKey: '',
    groqApiKey: '',
};

const DEFAULT_PREFERENCES = {
    // Legacy and read-only (D31). Nothing writes it any more; it exists so an
    // install that predates profiles still has its old prompt to migrate once.
    customPrompt: '',
    customPromptMigrationVersion: 0,
    providerMode: 'byok',
    // D14: independent axes. providerMode is kept around to migrate old preferences.
    transcription: 'local-whisper',
    reasoning: 'gemini',
    selectedProfile: 'interview',
    selectedLanguage: 'en-US',
    selectedScreenshotInterval: '5',
    selectedImageQuality: 'medium',
    advancedMode: false,
    audioMode: 'speaker_only',
    fontSize: 'medium',
    backgroundTransparency: 0.8,
    googleSearchEnabled: false,
    localLlmModel: 'unsloth/Qwen3.5-4B-GGUF:Q4_K_M',
    whisperModel: 'large-v3-turbo',
    // How long a single stretch of speech can run before it is cut and transcribed
    // anyway. Whisper works in 30 s windows, so anything under that costs one pass;
    // lower means you see text sooner and more sentences get split. See D22.
    maxSegmentSeconds: 12,
    // Which screen screenshots come from. `auto` means the primary display; the
    // choice is made once here, never with a dialog at session start (D29).
    captureDisplayId: 'auto',
};

const DEFAULT_KEYBINDS = null; // null means use system defaults

const DEFAULT_LIMITS = {
    data: [], // Array of { date: 'YYYY-MM-DD', flash: { count }, flashLite: { count }, groq: { 'qwen3-32b': { chars, limit }, 'gpt-oss-120b': { chars, limit }, 'gpt-oss-20b': { chars, limit } }, gemini: { 'gemma-4-26b-a4b-it': { chars } } }
};

// Get the config directory path based on OS
function getConfigDir() {
    const platform = os.platform();
    let configDir;

    if (platform === 'win32') {
        configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'cheating-daddy-config');
    } else if (platform === 'darwin') {
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'cheating-daddy-config');
    } else {
        configDir = path.join(os.homedir(), '.config', 'cheating-daddy-config');
    }

    return configDir;
}

// File paths
function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}

function getCredentialsPath() {
    return path.join(getConfigDir(), 'credentials.json');
}

function getPreferencesPath() {
    return path.join(getConfigDir(), 'preferences.json');
}

function getKeybindsPath() {
    return path.join(getConfigDir(), 'keybinds.json');
}

function getLimitsPath() {
    return path.join(getConfigDir(), 'limits.json');
}

function getHistoryDir() {
    return path.join(getConfigDir(), 'history');
}

// Helper to read JSON file safely
function readJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`Error reading ${filePath}:`, error.message);
    }
    return defaultValue;
}

// Helper to write JSON file safely
function writeJsonFile(filePath, data) {
    try {
        // Atomic: writing in place truncates first, so a crash mid-write used to
        // destroy the whole file rather than lose the last change.
        writeFileAtomic(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error.message);
        return false;
    }
}

// Check if we need to reset (no configVersion or wrong version)
function needsReset() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return true;
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return !config.configVersion || config.configVersion !== CONFIG_VERSION;
    } catch {
        return true;
    }
}

// Wipe and reinitialize the config directory
function resetConfigDir() {
    const configDir = getConfigDir();

    console.log('Resetting config directory...');

    // Remove existing directory if it exists
    if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
    }

    // Create fresh directory structure
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(getHistoryDir(), { recursive: true });

    // Initialize with defaults
    writeJsonFile(getConfigPath(), DEFAULT_CONFIG);
    writeJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
    writeJsonFile(getPreferencesPath(), DEFAULT_PREFERENCES);

    console.log('Config directory initialized with defaults');
}

// Initialize storage - call this on app startup
function initializeStorage() {
    if (needsReset()) {
        resetConfigDir();
    } else {
        // Ensure history directory exists
        const historyDir = getHistoryDir();
        if (!fs.existsSync(historyDir)) {
            fs.mkdirSync(historyDir, { recursive: true });
        }
    }
}

// ============ CONFIG ============

function getConfig() {
    const saved = readJsonFile(getConfigPath(), {});
    return { ...DEFAULT_CONFIG, ...saved };
}

function setConfig(config) {
    const current = getConfig();
    const updated = { ...current, ...config, configVersion: CONFIG_VERSION };
    return writeJsonFile(getConfigPath(), updated);
}

function updateConfig(key, value) {
    const config = getConfig();
    config[key] = value;
    return writeJsonFile(getConfigPath(), config);
}

// ============ CREDENTIALS ============

function getCredentials() {
    return readJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
}

function setCredentials(credentials) {
    const current = getCredentials();
    const updated = { ...current, ...credentials };
    return writeJsonFile(getCredentialsPath(), updated);
}

function getApiKey() {
    return getCredentials().apiKey || '';
}

function setApiKey(apiKey) {
    return setCredentials({ apiKey });
}

function getGroqApiKey() {
    return getCredentials().groqApiKey || '';
}

function setGroqApiKey(groqApiKey) {
    return setCredentials({ groqApiKey });
}

// ============ PREFERENCES ============

function getPreferences() {
    const saved = readJsonFile(getPreferencesPath(), {});
    const preferences = { ...DEFAULT_PREFERENCES, ...saved };
    const legacyWhisperModels = {
        'Xenova/whisper-tiny': 'tiny.en',
        'Xenova/whisper-base': 'base.en',
        'Xenova/whisper-small': 'small.en',
    };

    preferences.whisperModel = legacyWhisperModels[preferences.whisperModel] || preferences.whisperModel;
    return preferences;
}

function setPreferences(preferences) {
    const current = getPreferences();
    const updated = { ...current, ...preferences };
    return writeJsonFile(getPreferencesPath(), updated);
}

function updatePreference(key, value) {
    const preferences = getPreferences();
    preferences[key] = value;
    return writeJsonFile(getPreferencesPath(), preferences);
}

// ============ KEYBINDS ============

function getKeybinds() {
    return readJsonFile(getKeybindsPath(), DEFAULT_KEYBINDS);
}

function setKeybinds(keybinds) {
    return writeJsonFile(getKeybindsPath(), keybinds);
}

// ============ LIMITS (Rate Limiting) ============

function getLimits() {
    return readJsonFile(getLimitsPath(), DEFAULT_LIMITS);
}

function setLimits(limits) {
    return writeJsonFile(getLimitsPath(), limits);
}

function getTodayDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTodayLimits() {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find today's entry
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry) {
        // ensure new fields exist
        if (!todayEntry.groq) {
            todayEntry.groq = {
                'qwen3-32b': { chars: 0, limit: 1500000 },
                'gpt-oss-120b': { chars: 0, limit: 600000 },
                'gpt-oss-20b': { chars: 0, limit: 600000 },
                'kimi-k2-instruct': { chars: 0, limit: 600000 },
            };
        }
        if (!todayEntry.gemini) {
            todayEntry.gemini = {
                'gemma-4-26b-a4b-it': { chars: 0 },
            };
        }
        setLimits(limits);
        return todayEntry;
    }

    // No entry for today - clean old entries and create new one
    limits.data = limits.data.filter(entry => entry.date === today);
    const newEntry = {
        date: today,
        flash: { count: 0 },
        flashLite: { count: 0 },
        groq: {
            'qwen3-32b': { chars: 0, limit: 1500000 },
            'gpt-oss-120b': { chars: 0, limit: 600000 },
            'gpt-oss-20b': { chars: 0, limit: 600000 },
            'kimi-k2-instruct': { chars: 0, limit: 600000 },
        },
        gemini: {
            'gemma-4-26b-a4b-it': { chars: 0 },
        },
    };
    limits.data.push(newEntry);
    setLimits(limits);

    return newEntry;
}

function incrementLimitCount(model) {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find or create today's entry
    let todayEntry = limits.data.find(entry => entry.date === today);

    if (!todayEntry) {
        // Clean old entries and create new one
        limits.data = [];
        todayEntry = {
            date: today,
            flash: { count: 0 },
            flashLite: { count: 0 },
        };
        limits.data.push(todayEntry);
    } else {
        // Clean old entries, keep only today
        limits.data = limits.data.filter(entry => entry.date === today);
    }

    // Increment the appropriate model count
    if (model === 'gemini-2.5-flash') {
        todayEntry.flash.count++;
    } else if (model === 'gemini-2.5-flash-lite') {
        todayEntry.flashLite.count++;
    }

    setLimits(limits);
    return todayEntry;
}

function incrementCharUsage(provider, model, charCount) {
    getTodayLimits();

    const limits = getLimits();
    const today = getTodayDateString();
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry[provider] && todayEntry[provider][model]) {
        todayEntry[provider][model].chars += charCount;
        setLimits(limits);
    }

    return todayEntry;
}

function getAvailableModel() {
    const todayLimits = getTodayLimits();

    // RPD limits: flash = 20, flash-lite = 20
    // After both exhausted, fall back to flash (for paid API users)
    if (todayLimits.flash.count < 20) {
        return 'gemini-2.5-flash';
    } else if (todayLimits.flashLite.count < 20) {
        return 'gemini-2.5-flash-lite';
    }

    return 'gemini-2.5-flash'; // Default to flash for paid API users
}

function getModelForToday() {
    const todayEntry = getTodayLimits();
    const groq = todayEntry.groq;

    if (groq['gpt-oss-120b'].chars < groq['gpt-oss-120b'].limit) {
        return 'openai/gpt-oss-120b';
    }
    if (groq['gpt-oss-20b'].chars < groq['gpt-oss-20b'].limit) {
        return 'openai/gpt-oss-20b';
    }
    if (groq['kimi-k2-instruct'].chars < groq['kimi-k2-instruct'].limit) {
        return 'moonshotai/kimi-k2-instruct';
    }

    // All limits exhausted
    return null;
}

// ============ HISTORY ============

// Legacy layout: one growing JSON per session, rewritten on every change.
function getLegacySessionPath(sessionId) {
    return path.join(getHistoryDir(), `${sessionId}.json`);
}

// Current layout: a folder per session. Metadata is written atomically and rarely;
// the thread is an append-only log; screenshots already lived here. Nothing that
// grows is ever rewritten, so a crash cannot take the session with it (D26).
function getSessionDir(sessionId) {
    return path.join(getHistoryDir(), String(sessionId));
}

function getSessionMetaPath(sessionId) {
    return path.join(getSessionDir(sessionId), 'session.json');
}

function getEventLogPath(sessionId) {
    return path.join(getSessionDir(sessionId), 'events.jsonl');
}

function getTranscriptPath(sessionId) {
    return path.join(getSessionDir(sessionId), 'transcript.md');
}

// One line, one event, appended the moment it happens. No debounce: the reason the
// thread used to sit in memory for up to a second was that saving meant rewriting
// the whole document.
function appendSessionEvent(sessionId, event) {
    try {
        const { serializeEvent } = require('./core/event-log');
        fs.mkdirSync(getSessionDir(sessionId), { recursive: true });
        fs.appendFileSync(getEventLogPath(sessionId), serializeEvent(event), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error appending event to session ${sessionId}:`, error.message);
        return false;
    }
}

function readSessionEvents(sessionId) {
    try {
        const { parseEventLog } = require('./core/event-log');
        if (!fs.existsSync(getEventLogPath(sessionId))) return [];

        const { events, dropped } = parseEventLog(fs.readFileSync(getEventLogPath(sessionId), 'utf8'));
        if (dropped > 0) {
            console.warn(`Session ${sessionId}: ${dropped} unreadable line(s) skipped, probably a crash mid-write`);
        }
        return events;
    } catch (error) {
        console.error(`Error reading the event log for ${sessionId}:`, error.message);
        return [];
    }
}

function writeSessionTranscript(sessionId, markdown) {
    try {
        writeFileAtomic(getTranscriptPath(sessionId), markdown);
        return true;
    } catch (error) {
        console.error(`Error writing the transcript for ${sessionId}:`, error.message);
        return false;
    }
}

// Saves the session metadata. The thread is NOT written here: events go to the
// append-only log as they happen. `data.events` is still accepted so a legacy
// session being migrated can be folded into the log once.
function saveSession(sessionId, data) {
    const metaPath = getSessionMetaPath(sessionId);
    const existingSession = readJsonFile(metaPath, null) || readJsonFile(getLegacySessionPath(sessionId), null);

    if (Array.isArray(data.events) && data.events.length > 0 && !fs.existsSync(getEventLogPath(sessionId))) {
        for (const event of data.events) appendSessionEvent(sessionId, event);
    }

    const sessionData = {
        sessionId,
        createdAt: existingSession?.createdAt || parseInt(sessionId),
        lastUpdated: Date.now(),
        // Profile context - set once when session starts
        profile: data.profile || existingSession?.profile || null,
        customPrompt: data.customPrompt || existingSession?.customPrompt || null,
        digest: data.digest ?? existingSession?.digest ?? null,
        // Marked when the summary call starts, cleared when it lands. A summary lost
        // to a crash is unfinished work, and this is what makes it findable (D24).
        digestPending: data.digestPending ?? existingSession?.digestPending ?? false,
        digestAttempts: data.digestAttempts ?? existingSession?.digestAttempts ?? 0,
        // Set when the profile this summary was owed to is deleted (D30). The
        // session itself is untouched: only the unfinished work is called off.
        digestCancelled: data.digestCancelled ?? existingSession?.digestCancelled ?? false,
    };
    return writeJsonFile(metaPath, sessionData);
}

function getSession(sessionId) {
    const meta = readJsonFile(getSessionMetaPath(sessionId), null);
    if (meta) {
        return { ...meta, events: readSessionEvents(sessionId) };
    }

    // Sessions written before the folder layout, and before the single thread, are
    // migrated as they are read. Nothing on disk is rewritten to do it.
    const raw = readJsonFile(getLegacySessionPath(sessionId), null);
    if (!raw) return null;

    const { migrateLegacySession } = require('./core/session-context-migrate');
    return { ...raw, ...migrateLegacySession(raw) };
}

function getAllSessions() {
    const historyDir = getHistoryDir();

    try {
        if (!fs.existsSync(historyDir)) {
            return [];
        }

        // Both layouts live side by side: a folder per session now, and the flat
        // JSON files written before. Neither is rewritten just to be listed.
        const entries = fs.readdirSync(historyDir, { withFileTypes: true });
        const ids = new Set();
        for (const entry of entries) {
            if (entry.isDirectory()) ids.add(entry.name);
            else if (entry.name.endsWith('.json')) ids.add(entry.name.replace('.json', ''));
        }

        return [...ids]
            .sort((a, b) => parseInt(b) - parseInt(a))
            .map(sessionId => {
                const session = getSession(sessionId);
                if (!session) return null;

                const events = session.events || [];
                return {
                    sessionId,
                    createdAt: session.createdAt,
                    lastUpdated: session.lastUpdated,
                    messageCount: events.filter(e => e.kind === 'speech').length,
                    screenAnalysisCount: events.filter(e => e.kind === 'screen').length,
                    profile: session.profileName || session.profile || null,
                    hasDigest: Boolean(session.digest),
                    digest: session.digest || null,
                    digestPending: session.digestPending === true,
                    digestAttempts: session.digestAttempts || 0,
                    digestCancelled: session.digestCancelled === true,
                };
            })
            .filter(Boolean);
    } catch (error) {
        console.error('Error reading sessions:', error.message);
        return [];
    }
}

// Called before a profile folder is removed. A summary already in flight may still
// return from the provider, and the startup drain would otherwise pick the work up
// again — either one would recreate the deleted folder (D30).
function cancelDigestsForProfile(profileSlug) {
    const { selectDigestsToCancel } = require('./core/digest-queue');

    const cancelled = selectDigestsToCancel(getAllSessions(), profileSlug);
    for (const sessionId of cancelled) {
        saveSession(sessionId, { digestPending: false, digestCancelled: true });
    }
    return cancelled;
}

function deleteSession(sessionId) {
    try {
        // The folder holds the metadata, the event log, the transcript and the
        // screenshots; the legacy flat file may also still be there.
        fs.rmSync(getSessionDir(sessionId), { recursive: true, force: true });
        fs.rmSync(getLegacySessionPath(sessionId), { force: true });
        return true;
    } catch (error) {
        console.error('Error deleting session:', error.message);
    }
    return false;
}

function deleteAllSessions() {
    const historyDir = getHistoryDir();
    try {
        if (fs.existsSync(historyDir)) {
            // Removes both layouts: the folders and the legacy flat files.
            for (const entry of fs.readdirSync(historyDir, { withFileTypes: true })) {
                fs.rmSync(path.join(historyDir, entry.name), { recursive: true, force: true });
            }
        }
        return true;
    } catch (error) {
        console.error('Error deleting all sessions:', error.message);
        return false;
    }
}

// ============ CLEAR ALL DATA ============

function clearAllData() {
    resetConfigDir();
    return true;
}

module.exports = {
    // Initialization
    initializeStorage,
    getConfigDir,

    // Config
    getConfig,
    setConfig,
    updateConfig,

    // Credentials
    getCredentials,
    setCredentials,
    getApiKey,
    setApiKey,
    getGroqApiKey,
    setGroqApiKey,

    // Preferences
    getPreferences,
    setPreferences,
    updatePreference,

    // Keybinds
    getKeybinds,
    setKeybinds,

    // Limits (Rate Limiting)
    getLimits,
    setLimits,
    getTodayLimits,
    incrementLimitCount,
    getAvailableModel,
    incrementCharUsage,
    getModelForToday,

    // History
    getHistoryDir,
    cancelDigestsForProfile,
    getSessionDir,
    appendSessionEvent,
    readSessionEvents,
    writeSessionTranscript,
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
    deleteAllSessions,

    // Clear all
    clearAllData,
};
