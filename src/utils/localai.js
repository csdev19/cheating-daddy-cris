const fs = require('fs');
const path = require('path');
const { sendToRenderer, initializeNewSession, saveConversationTurn } = require('./gemini');
const {
    normalizeWhisperModel,
    ensureNativeBinary,
    ensureLlamaModel,
    ensureWhisperModel,
    getAvailablePort,
    getModelsDirectory,
    startNativeServer,
    stopNativeServer,
    waitForServer,
} = require('./native-ai-runtime');

let currentWhisperModel = 'large-v3-turbo';
let llamaProcess = null;
let llamaBaseUrl = null;
let llamaModel = null;
let whisperProcess = null;
let whisperBaseUrl = null;
let localConversationHistory = [];
let currentSystemPrompt = null;
let isLocalActive = false;
let initializationController = null;
let llamaCacheSnapshot = new Set();

const { createVad, VAD_MODES } = require('../core/vad');

// Serializa las peticiones a whisper-server (atiende una a la vez) y descarta lo
// más viejo si se acumula, para que el retraso no crezca sin límite (B2).
const MAX_PENDING_PER_CHANNEL = 3;
const channelQueue = (() => {
    const pending = { them: [], me: [] };
    let busy = false;

    async function drain() {
        if (busy) return;
        busy = true;
        try {
            // Alterna canales para que ninguno monopolice el servidor.
            while (pending.them.length || pending.me.length) {
                for (const speaker of ['them', 'me']) {
                    const audio = pending[speaker].shift();
                    if (audio) await handleSpeechEnd(audio, speaker);
                }
            }
        } finally {
            busy = false;
        }
    }

    function push(speaker, audio) {
        pending[speaker].push(audio);
        if (pending[speaker].length > MAX_PENDING_PER_CHANNEL) {
            pending[speaker].shift();
            console.warn('[LocalAI] Cola llena, descartado segmento antiguo de', speaker);
        }
        drain();
    }

    function clear() {
        pending.them = [];
        pending.me = [];
    }

    return { push, clear };
})();

// Un canal = un VAD + su propio resto de resampleo. Compartirlos entre canales
// corrompe el audio y mezcla los hablantes (ver Tarea 7 del plan).
// Un canal = un VAD propio. El resampleo se hace ahora en el renderer con
// OfflineAudioContext, que filtra correctamente (H7); aquí llega PCM16 a 16 kHz.
function createChannel(speaker) {
    const vad = createVad({
        // D20: 2 s de silencio en vez de 3, para bajar la latencia total.
        mode: { ...VAD_MODES.NORMAL, silenceFramesRequired: 20 },
        preRollFrames: 3,
        onSpeechEnd: audioData => channelQueue.push(speaker, audioData),
    });

    return { vad, reset: () => vad.reset() };
}

const channels = { them: createChannel('them'), me: createChannel('me') };

function createWavBuffer(pcm16Buffer) {
    const header = Buffer.alloc(44);
    const byteRate = 16000 * 2;

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm16Buffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm16Buffer.length, 40);

    return Buffer.concat([header, pcm16Buffer]);
}

async function transcribeAudio(pcm16kBuffer) {
    if (!whisperBaseUrl) {
        throw new Error('Whisper server is not running');
    }

    const wavBuffer = createWavBuffer(pcm16kBuffer);
    const formData = new FormData();
    formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'speech.wav');
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0.0');
    // Los modelos .en solo saben inglés; los multilingües deben autodetectar.
    // Enviar language='en' a un modelo multilingüe fuerza mal el decodificado (D4).
    formData.append('language', normalizeWhisperModel(currentWhisperModel).endsWith('.en') ? 'en' : 'auto');

    const response = await fetch(`${whisperBaseUrl}/inference`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Whisper server returned HTTP ${response.status}`);
    }

    const result = await response.json();
    const segments = Array.isArray(result.segments) ? result.segments : null;

    // Whisper inventa frases en silencio y ruido; no_speech_prob y una lista corta
    // de muletillas conocidas eliminan la mayoría (B3).
    const text = segments
        ? segments
              .filter(seg => (seg.no_speech_prob ?? 0) < 0.6)
              .map(seg => (seg.text || '').trim())
              .filter(t => t && !HALLUCINATIONS.some(rx => rx.test(t)))
              .join(' ')
              .trim()
        : (result.text || '').trim();

    console.log('[LocalAI] Transcription:', text);
    return text;
}

// El consumidor (gestor de sesión) inyecta a dónde va la transcripción.
let onTranscription = () => {};
function setTranscriptionHandler(handler) {
    onTranscription = typeof handler === 'function' ? handler : () => {};
}

async function handleSpeechEnd(audioData, speaker = 'them') {
    if (!isLocalActive) return;

    if (audioData.length < 16000) {
        console.log('[LocalAI] Audio demasiado corto, se descarta');
        return;
    }

    try {
        const transcription = await transcribeAudio(audioData);

        if (!transcription || transcription.trim().length < 2) return;

        // Solo acumulamos contexto. El modelo se invoca con el atajo, no aquí (D1).
        onTranscription(speaker, transcription.trim());
    } catch (error) {
        console.error('[LocalAI] Error de transcripción:', error);
        sendToRenderer('update-status', 'Error de transcripción: ' + error.message);
    }
}

async function readStreamingResponse(response, onText) {
    const decoder = new TextDecoder();
    let pendingText = '';
    let fullText = '';

    for await (const chunk of response.body) {
        pendingText += decoder.decode(chunk, { stream: true });
        const lines = pendingText.split('\n');
        pendingText = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            const event = JSON.parse(data);
            const token = event.choices?.[0]?.delta?.content || '';
            if (!token) continue;

            fullText += token;
            onText(fullText);
        }
    }

    return fullText;
}

async function requestLlama(messages, onText) {
    if (!llamaBaseUrl) {
        throw new Error('Llama server is not running');
    }

    const response = await fetch(`${llamaBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'local',
            messages,
            stream: true,
            max_tokens: 2048,
            chat_template_kwargs: {
                enable_thinking: false,
            },
        }),
    });

    if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`Llama server returned HTTP ${response.status}: ${errorText}`);
    }

    return readStreamingResponse(response, onText);
}

async function sendToLlama(transcription) {
    localConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    if (localConversationHistory.length > 20) {
        localConversationHistory = localConversationHistory.slice(-20);
    }

    try {
        const messages = [{ role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' }, ...localConversationHistory];

        let isFirst = true;
        const fullText = await requestLlama(messages, text => {
            sendToRenderer(isFirst ? 'new-response' : 'update-response', text);
            isFirst = false;
        });

        if (fullText.trim()) {
            localConversationHistory.push({
                role: 'assistant',
                content: fullText.trim(),
            });
            saveConversationTurn(transcription, fullText);
        }

        console.log('[LocalAI] Llama response completed');
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('[LocalAI] Llama error:', error);
        sendToRenderer('update-status', 'Local AI error: ' + error.message);
        throw error;
    }
}

function formatDownloadStatus(label, progress) {
    if (!progress.expectedBytes) {
        return `Downloading ${label}...`;
    }

    const percentage = Math.floor((progress.downloadedBytes / progress.expectedBytes) * 100);
    return `Downloading ${label}... ${percentage}%`;
}

function sendDownloadProgress(label, progress = null) {
    const percentage = progress?.expectedBytes ? Math.min(100, Math.floor((progress.downloadedBytes / progress.expectedBytes) * 100)) : null;
    sendToRenderer('local-ai-download-progress', {
        active: true,
        label,
        percentage,
    });
}

function getDirectoryEntries(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        return new Set();
    }

    const entries = new Set();
    const visit = currentPath => {
        for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
            const entryPath = path.join(currentPath, entry.name);
            entries.add(entryPath);
            if (entry.isDirectory()) {
                visit(entryPath);
            }
        }
    };

    visit(directoryPath);
    return entries;
}

function removeNewLlamaCacheEntries() {
    const cacheDirectory = path.join(getModelsDirectory(), 'llama');
    const currentEntries = Array.from(getDirectoryEntries(cacheDirectory));
    currentEntries.sort((first, second) => second.length - first.length);

    for (const entryPath of currentEntries) {
        if (!llamaCacheSnapshot.has(entryPath)) {
            fs.rmSync(entryPath, { recursive: true, force: true });
        }
    }
}

const binaryProgress = label => progress => {
    sendToRenderer('update-status', formatDownloadStatus(label, progress));
    sendDownloadProgress(label, progress);
};

async function prepareNativeFiles(llamaModelReference, whisperModel, signal) {
    sendDownloadProgress('Checking Llama runner');
    const llamaBinaryPath = await ensureNativeBinary('llama', binaryProgress('Llama runner'), signal);

    sendDownloadProgress('Checking Whisper runner');
    const whisperBinaryPath = await ensureNativeBinary('whisper', binaryProgress('Whisper runner'), signal);

    let whisperModelPath;
    sendToRenderer('whisper-downloading', true);
    try {
        sendDownloadProgress('Checking Whisper model');
        whisperModelPath = await ensureWhisperModel(whisperModel, binaryProgress('Whisper model'), signal);
    } finally {
        sendToRenderer('whisper-downloading', false);
    }

    sendDownloadProgress('Checking language model');
    const llamaFiles = await ensureLlamaModel(llamaModelReference, binaryProgress('Language model'), binaryProgress('Vision model'), signal);
    return {
        llamaBinaryPath,
        whisperBinaryPath,
        whisperModelPath,
        llamaModelPath: llamaFiles.modelPath,
        projectorPath: llamaFiles.projectorPath,
    };
}

function validatePreparedNativeFiles(nativeFiles) {
    const requiredFiles = [
        ['Llama runner', nativeFiles.llamaBinaryPath],
        ['Whisper runner', nativeFiles.whisperBinaryPath],
        ['Whisper model', nativeFiles.whisperModelPath],
        ['Language model', nativeFiles.llamaModelPath],
        ['Vision model', nativeFiles.projectorPath],
    ];

    for (const [label, filePath] of requiredFiles) {
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`${label} path is invalid: ${filePath}`);
        }
    }
}

async function startWhisperServer(executablePath, modelPath) {
    const port = await getAvailablePort();
    whisperBaseUrl = `http://127.0.0.1:${port}`;
    whisperProcess = startNativeServer({
        executablePath,
        arguments: ['-m', modelPath, '--host', '127.0.0.1', '--port', String(port)],
        name: 'Whisper',
    });

    await waitForServer(`${whisperBaseUrl}/`, whisperProcess, 120000);
}

async function startLlamaServer(executablePath, modelPath, projectorPath) {
    if (!modelPath || !fs.existsSync(modelPath)) {
        throw new Error(`Language model path is invalid: ${modelPath}`);
    }
    if (!projectorPath || !fs.existsSync(projectorPath)) {
        throw new Error(`Vision model path is invalid: ${projectorPath}`);
    }

    const port = await getAvailablePort();
    const argumentsList = [
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--alias',
        'local',
        '-c',
        '8192',
        '-m',
        modelPath,
        '--mmproj',
        projectorPath,
    ];

    if (process.platform === 'darwin') {
        argumentsList.push('-ngl', '99');
    }

    llamaBaseUrl = `http://127.0.0.1:${port}`;
    llamaProcess = startNativeServer({
        executablePath,
        arguments: argumentsList,
        name: 'Llama',
    });

    await waitForServer(`${llamaBaseUrl}/health`, llamaProcess, 30 * 60 * 1000);
}

// D14: transcripción y razonamiento son ejes independientes. Antes ambos vivían
// dentro de initializeLocalSession, así que usar Whisper obligaba a descargar y
// cargar el LLM local aunque se fuera a razonar en la nube (hallazgo A1).
async function startTranscription({ whisperModel }) {
    initializationController = initializationController || new AbortController();
    const signal = initializationController.signal;

    sendDownloadProgress('Checking Whisper runner');
    const whisperBinaryPath = await ensureNativeBinary('whisper', binaryProgress('Whisper runner'), signal);

    sendToRenderer('whisper-downloading', true);
    let whisperModelPath;
    try {
        sendDownloadProgress('Checking Whisper model');
        whisperModelPath = await ensureWhisperModel(whisperModel, binaryProgress('Whisper model'), signal);
    } finally {
        sendToRenderer('whisper-downloading', false);
    }

    currentWhisperModel = whisperModel;

    sendToRenderer('update-status', 'Starting Whisper...');
    await startWhisperServer(whisperBinaryPath, whisperModelPath);

    channels.them.reset();
    channels.me.reset();
    channelQueue.clear();

    isLocalActive = true;
    sendToRenderer('local-ai-download-progress', { active: false });
    console.log('[LocalAI] Transcripción local lista con', whisperModel);
    return true;
}

async function startLocalReasoning({ model, customPrompt }) {
    initializationController = initializationController || new AbortController();
    const signal = initializationController.signal;

    sendDownloadProgress('Checking Llama runner');
    const llamaBinaryPath = await ensureNativeBinary('llama', binaryProgress('Llama runner'), signal);

    sendDownloadProgress('Checking language model');
    const llamaFiles = await ensureLlamaModel(model, binaryProgress('Language model'), binaryProgress('Vision model'), signal);

    sendToRenderer('update-status', 'Loading local language model...');
    await startLlamaServer(llamaBinaryPath, llamaFiles.modelPath, llamaFiles.projectorPath);

    llamaModel = model;
    currentSystemPrompt = customPrompt || null;
    localConversationHistory = [];
    sendToRenderer('local-ai-download-progress', { active: false });
    console.log('[LocalAI] Razonamiento local listo con', model);
    return true;
}

function isTranscriptionActive() {
    return isLocalActive && Boolean(whisperProcess);
}

function isReasoningActive() {
    return Boolean(llamaProcess);
}

async function initializeLocalSession(model, whisperModel, profile, customPrompt) {
    console.log('[LocalAI] Initializing native local session:', { model, whisperModel, profile });
    sendToRenderer('session-initializing', true);

    try {
        closeLocalSession();
        initializationController = new AbortController();
        llamaCacheSnapshot = getDirectoryEntries(path.join(getModelsDirectory(), 'llama'));
        currentSystemPrompt = customPrompt || '';
        llamaModel = model;

        const nativeFiles = await prepareNativeFiles(model, whisperModel, initializationController.signal);
        validatePreparedNativeFiles(nativeFiles);

        sendToRenderer('update-status', 'Starting Whisper...');
        sendDownloadProgress('Starting Whisper');
        await startWhisperServer(nativeFiles.whisperBinaryPath, nativeFiles.whisperModelPath);

        sendToRenderer('update-status', 'Loading local language model...');
        sendDownloadProgress('Loading language model');
        await startLlamaServer(nativeFiles.llamaBinaryPath, nativeFiles.llamaModelPath, nativeFiles.projectorPath);

        channels.them.reset();
        channels.me.reset();
        channelQueue.clear();
        localConversationHistory = [];

        initializeNewSession(profile, customPrompt);
        isLocalActive = true;
        initializationController = null;
        sendToRenderer('local-ai-download-progress', { active: false });
        sendToRenderer('session-initializing', false);
        sendToRenderer('update-status', 'Local AI ready - Listening...');
        console.log('[LocalAI] Native session initialized successfully');
        return true;
    } catch (error) {
        const wasCancelled = error.name === 'AbortError' || initializationController?.signal.aborted;
        if (wasCancelled) {
            console.log('[LocalAI] Initialization cancelled');
        } else {
            console.error('[LocalAI] Initialization error:', error);
        }
        closeLocalSession();
        if (wasCancelled) {
            removeNewLlamaCacheEntries();
        }
        sendToRenderer('local-ai-download-progress', { active: false });
        sendToRenderer('session-initializing', false);
        sendToRenderer('update-status', wasCancelled ? 'Local AI download cancelled' : 'Local AI error: ' + error.message);
        return false;
    }
}

function processLocalAudio(pcm16k, speaker = 'them') {
    if (!isLocalActive) return;

    const channel = channels[speaker];
    if (!channel) {
        console.warn('[LocalAI] Hablante desconocido:', speaker);
        return;
    }

    if (pcm16k && pcm16k.length > 0) {
        channel.vad.process(pcm16k);
    }
}

function closeLocalSession() {
    isLocalActive = false;
    initializationController?.abort();
    initializationController = null;
    stopNativeServer(llamaProcess);
    stopNativeServer(whisperProcess);
    llamaProcess = null;
    whisperProcess = null;
    llamaBaseUrl = null;
    whisperBaseUrl = null;
    llamaModel = null;
    channels.them.reset();
    channels.me.reset();
    channelQueue.clear();
    localConversationHistory = [];
    currentSystemPrompt = null;
}

async function cancelLocalInitialization() {
    if (!initializationController) {
        return false;
    }

    initializationController.abort();
    stopNativeServer(llamaProcess);
    stopNativeServer(whisperProcess);
    await new Promise(resolve => setTimeout(resolve, 300));
    removeNewLlamaCacheEntries();
    sendToRenderer('local-ai-download-progress', { active: false });
    sendToRenderer('session-initializing', false);
    return true;
}

function isLocalSessionActive() {
    return isLocalActive;
}

async function sendLocalText(text) {
    if (!isLocalActive || !llamaProcess) {
        return { success: false, error: 'No active local session' };
    }

    try {
        await sendToLlama(text);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function sendLocalImage(base64Data, prompt) {
    if (!isLocalActive || !llamaProcess) {
        return { success: false, error: 'No active local session' };
    }

    const userMessage = {
        role: 'user',
        content: [
            { type: 'text', text: prompt },
            {
                type: 'image_url',
                image_url: {
                    url: `data:image/jpeg;base64,${base64Data}`,
                },
            },
        ],
    };

    localConversationHistory.push({ role: 'user', content: prompt });
    if (localConversationHistory.length > 20) {
        localConversationHistory = localConversationHistory.slice(-20);
    }

    try {
        sendToRenderer('update-status', 'Analyzing image...');
        const messages = [
            { role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' },
            ...localConversationHistory.slice(0, -1),
            userMessage,
        ];

        let isFirst = true;
        const fullText = await requestLlama(messages, text => {
            sendToRenderer(isFirst ? 'new-response' : 'update-response', text);
            isFirst = false;
        });

        if (fullText.trim()) {
            localConversationHistory.push({ role: 'assistant', content: fullText.trim() });
            saveConversationTurn(prompt, fullText);
        }

        sendToRenderer('update-status', 'Listening...');
        return { success: true, text: fullText, model: llamaModel };
    } catch (error) {
        console.error('[LocalAI] Image error:', error);
        sendToRenderer('update-status', 'Local AI image error: ' + error.message);
        return { success: false, error: error.message };
    }
}

// Equivalente local del adaptador de proveedor: mismo payload neutro, servidor llama.cpp.
async function sendLocalPayload(payload) {
    if (!llamaProcess) {
        throw new Error('No hay razonamiento local activo');
    }

    const content = [];
    if (payload.transcript) {
        content.push({ type: 'text', text: `Conversación hasta ahora:\n\n${payload.transcript}` });
    }
    if (payload.image) {
        content.push({ type: 'image_url', image_url: { url: `data:${payload.image.mimeType};base64,${payload.image.data}` } });
    }
    content.push({ type: 'text', text: payload.question });

    const messages = [
        { role: 'system', content: payload.system },
        { role: 'user', content },
    ];

    let isFirst = true;
    const fullText = await requestLlama(messages, text => {
        sendToRenderer(isFirst ? 'new-response' : 'update-response', text);
        isFirst = false;
    });

    return fullText.trim();
}

module.exports = {
    sendLocalPayload,
    initializeLocalSession,
    startTranscription,
    startLocalReasoning,
    isTranscriptionActive,
    isReasoningActive,
    setTranscriptionHandler,
    cancelLocalInitialization,
    processLocalAudio,
    closeLocalSession,
    isLocalSessionActive,
    sendLocalText,
    sendLocalImage,
};
