if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');
const storage = require('./storage');
const profiles = require('./core/profiles');

const geminiSessionRef = { current: null };
let mainWindow = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    return mainWindow;
}

app.whenReady().then(async () => {
    // Initialize storage (checks version, resets if needed)
    storage.initializeStorage();

    // Profiles live on disk as markdown folders (D7). On first launch they are
    // generated from the templates. Carrying the old customPrompt across is a
    // separate, idempotent step (D31).
    try {
        const { bootstrapProfiles, migrateLegacyCustomPrompt } = require('./core/profiles-bootstrap');
        const prefs = storage.getPreferences();
        const created = bootstrapProfiles({ configDir: storage.getConfigDir() });
        if (created.length > 0) {
            console.log('Created profiles:', created.join(', '));
        }

        // The stored profile may name a folder that no longer exists (renamed or
        // deleted by hand). Repairing it here means the app can always start.
        const resolved = profiles.resolveProfileName(profiles.getProfilesDir(storage.getConfigDir()), prefs.selectedProfile);
        if (resolved && resolved !== prefs.selectedProfile) {
            console.log(`Profile '${prefs.selectedProfile}' is missing; falling back to '${resolved}'`);
            storage.updatePreference('selectedProfile', resolved);
        }

        // D31: the legacy `customPrompt` becomes a real note exactly once. Its own
        // marker drives it, not "the profiles folder was just created" — someone
        // whose profiles appeared in an earlier release may still owe this. The
        // marker is recorded only after the note is safely on disk.
        const migration = migrateLegacyCustomPrompt({
            configDir: storage.getConfigDir(),
            legacyCustomPrompt: prefs.customPrompt,
            selectedProfile: resolved || prefs.selectedProfile,
            migrationState: prefs.customPromptMigrationVersion,
        });
        if (migration.migrationState !== (prefs.customPromptMigrationVersion || 0)) {
            storage.updatePreference('customPromptMigrationVersion', migration.migrationState);
        }
        if (migration.migrated) {
            console.log(`Moved the legacy custom prompt into ${migration.profile}/context/${migration.note}`);
        }
    } catch (error) {
        console.error('Could not prepare the default profiles:', error);
    }

    // A summary owed from last time is finished now. It only touches sessions that
    // were explicitly marked, never the back catalogue (D24).
    setTimeout(() => {
        require('./utils/gemini')
            .drainPendingDigests()
            .catch(error => console.error('Could not finish the pending summaries:', error));
    }, 3000);

    // Trigger screen recording permission prompt on macOS if not already granted
    if (process.platform === 'darwin') {
        const { desktopCapturer } = require('electron');
        desktopCapturer.getSources({ types: ['screen'] }).catch(() => {});
    }

    createMainWindow();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupStorageIpcHandlers();
    setupGeneralIpcHandlers();
});

app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    // On macOS the app stays alive with no windows, so quitting is not what stops
    // the local servers here: with no window there is no session, and leaving
    // whisper-server running holds ~1.7 GB per process.
    require('./utils/localai').closeLocalSession();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMacOSAudioCapture();
    require('./utils/localai').closeLocalSession();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function profilesDir() {
    return profiles.getProfilesDir(storage.getConfigDir());
}

// ProfileError already carries the code the renderer branches on; anything else
// (an fs errno, say) keeps its own rather than being flattened to one label.
function runProfileOperation(run) {
    try {
        return { success: true, data: run() };
    } catch (error) {
        console.error('Profile operation failed:', error.message);
        return { success: false, code: error.code || 'PROFILE_OPERATION_FAILED', error: error.message };
    }
}

function mutateProfile(run) {
    if (require('./utils/gemini').isSessionActive()) {
        return { success: false, code: 'SESSION_ACTIVE', error: 'End the session before editing a profile.' };
    }
    return runProfileOperation(run);
}

function setupStorageIpcHandlers() {
    // ============ CONFIG ============
    ipcMain.handle('storage:get-config', async () => {
        try {
            return { success: true, data: storage.getConfig() };
        } catch (error) {
            console.error('Error getting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-config', async (event, config) => {
        try {
            storage.setConfig(config);
            return { success: true };
        } catch (error) {
            console.error('Error setting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-config', async (event, key, value) => {
        try {
            storage.updateConfig(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating config:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CREDENTIALS ============
    ipcMain.handle('storage:get-credentials', async () => {
        try {
            return { success: true, data: storage.getCredentials() };
        } catch (error) {
            console.error('Error getting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-credentials', async (event, credentials) => {
        try {
            storage.setCredentials(credentials);
            return { success: true };
        } catch (error) {
            console.error('Error setting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-api-key', async () => {
        try {
            return { success: true, data: storage.getApiKey() };
        } catch (error) {
            console.error('Error getting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-api-key', async (event, apiKey) => {
        try {
            storage.setApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-groq-api-key', async () => {
        try {
            return { success: true, data: storage.getGroqApiKey() };
        } catch (error) {
            console.error('Error getting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-groq-api-key', async (event, groqApiKey) => {
        try {
            storage.setGroqApiKey(groqApiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ PREFERENCES ============
    // The profile picker reads from disk: a hardcoded list drifts from what
    // actually exists, and picking a missing profile breaks the session.
    ipcMain.handle('list-profiles', async () => {
        try {
            return { success: true, data: profiles.describeProfiles(profilesDir()) };
        } catch (error) {
            console.error('Error listing profiles:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    // ============ PROFILE EDITOR (D30) ============
    // The renderer sends ids, never paths, and every mutation asks the session
    // boundary again right before it runs: a disabled control in the renderer is
    // not an authority boundary. Failures carry a stable `code` so the view never
    // has to match on English prose.
    ipcMain.handle('profiles:read', async (event, { slug }) => runProfileOperation(() => profiles.readProfileForEditing(profilesDir(), slug)));

    ipcMain.handle('profiles:write', async (event, { slug, profile, expectedRevision }) =>
        mutateProfile(() => profiles.writeProfile({ profilesDir: profilesDir(), slug, profile, expectedRevision }))
    );

    ipcMain.handle('profiles:write-checklist', async (event, { slug, items, expectedRevision }) =>
        mutateProfile(() => profiles.writeChecklist({ profilesDir: profilesDir(), slug, items, expectedRevision }))
    );

    ipcMain.handle('profiles:write-note', async (event, { slug, noteName, content, expectedRevision }) =>
        mutateProfile(() => profiles.writeNote({ profilesDir: profilesDir(), slug, noteName, content, expectedRevision }))
    );

    ipcMain.handle('profiles:delete-note', async (event, { slug, noteName, expectedRevision }) =>
        mutateProfile(() => profiles.deleteNote({ profilesDir: profilesDir(), slug, noteName, expectedRevision }))
    );

    ipcMain.handle('profiles:create', async (event, { displayName }) =>
        mutateProfile(() => profiles.createProfile({ profilesDir: profilesDir(), displayName }))
    );

    ipcMain.handle('profiles:delete', async (event, { slug }) =>
        mutateProfile(() => {
            // Proven deletable first, then the summaries owed to it are called off,
            // then the folder goes. Cancelling before a delete that would have been
            // refused would call off work for a profile that still exists; deleting
            // before cancelling leaves the startup drain able to recreate it (D30).
            profiles.assertDeletable({ profilesDir: profilesDir(), slug });
            const cancelled = storage.cancelDigestsForProfile(slug);
            return { ...profiles.deleteProfile({ profilesDir: profilesDir(), slug }), cancelledDigests: cancelled.length };
        })
    );

    ipcMain.handle('profiles:session-active', async () => {
        try {
            return { success: true, data: require('./utils/gemini').isSessionActive() };
        } catch (error) {
            // Unknown means "assume a session is running": refusing an edit that
            // would have been safe is recoverable, the other way round is not.
            console.error('Could not read the session state:', error);
            return { success: true, data: true };
        }
    });

    ipcMain.handle('storage:get-preferences', async () => {
        try {
            return { success: true, data: storage.getPreferences() };
        } catch (error) {
            console.error('Error getting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-preferences', async (event, preferences) => {
        try {
            storage.setPreferences(preferences);
            return { success: true };
        } catch (error) {
            console.error('Error setting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-preference', async (event, key, value) => {
        try {
            storage.updatePreference(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating preference:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ KEYBINDS ============
    ipcMain.handle('storage:get-keybinds', async () => {
        try {
            return { success: true, data: storage.getKeybinds() };
        } catch (error) {
            console.error('Error getting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-keybinds', async (event, keybinds) => {
        try {
            storage.setKeybinds(keybinds);
            return { success: true };
        } catch (error) {
            console.error('Error setting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ HISTORY ============
    ipcMain.handle('storage:get-all-sessions', async () => {
        try {
            return { success: true, data: storage.getAllSessions() };
        } catch (error) {
            console.error('Error getting sessions:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-session', async (event, sessionId) => {
        try {
            return { success: true, data: storage.getSession(sessionId) };
        } catch (error) {
            console.error('Error getting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-session', async (event, sessionId, data) => {
        try {
            storage.saveSession(sessionId, data);
            return { success: true };
        } catch (error) {
            console.error('Error saving session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-session', async (event, sessionId) => {
        try {
            storage.deleteSession(sessionId);
            return { success: true };
        } catch (error) {
            console.error('Error deleting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-all-sessions', async () => {
        try {
            storage.deleteAllSessions();
            return { success: true };
        } catch (error) {
            console.error('Error deleting all sessions:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ LIMITS ============
    ipcMain.handle('storage:get-today-limits', async () => {
        try {
            return { success: true, data: storage.getTodayLimits() };
        } catch (error) {
            console.error('Error getting today limits:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CLEAR ALL ============
    ipcMain.handle('storage:clear-all', async () => {
        try {
            storage.clearAllData();
            return { success: true };
        } catch (error) {
            console.error('Error clearing all data:', error);
            return { success: false, error: error.message };
        }
    });
}

function setupGeneralIpcHandlers() {
    ipcMain.handle('get-app-version', async () => {
        return app.getVersion();
    });

    ipcMain.handle('quit-application', async event => {
        try {
            stopMacOSAudioCapture();
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            // Also save to storage
            storage.setKeybinds(newKeybinds);
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    // Debug logging from renderer
    ipcMain.on('log-message', (event, msg) => {
        console.log(msg);
    });
}
