#!/usr/bin/env node
// Compares Whisper models over the SAME audio file.
// What decides is not a leaderboard's WER, but which one understands YOUR audio (D4/D21).
//
// Usage: npm run bench:stt -- recording.wav [large-v3-turbo small.en ...]
const fs = require('fs');
const path = require('path');
const {
    ensureNativeBinary,
    ensureWhisperModel,
    getAvailablePort,
    startNativeServer,
    stopNativeServer,
    waitForServer,
} = require('../src/utils/native-ai-runtime');

const DEFAULT_MODELS = ['tiny.en', 'small.en', 'large-v3-turbo'];

async function transcribe(baseUrl, wavPath) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(wavPath)]), path.basename(wavPath));
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0.0');

    const response = await fetch(`${baseUrl}/inference`, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const segments = Array.isArray(json.segments) ? json.segments : [];

    // B3/B10: per-segment no_speech_prob, so the hallucination filter is calibrated
    // from your own data instead of by eye.
    const lines = segments.map(seg => `  [${(seg.no_speech_prob ?? 0).toFixed(2)}] ${(seg.text || '').trim()}`);
    return lines.length ? lines.join('\n') : (json.text || '').trim();
}

async function runModel(binary, model, wavPath) {
    const modelPath = await ensureWhisperModel(model, () => {});
    const port = await getAvailablePort();
    const proc = startNativeServer({
        executablePath: binary,
        arguments: ['-m', modelPath, '--host', '127.0.0.1', '--port', String(port)],
        name: `whisper-${model}`,
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        await waitForServer(`${baseUrl}/`, proc, 120000);
        const startedAt = Date.now();
        const text = await transcribe(baseUrl, wavPath);
        return { text, ms: Date.now() - startedAt };
    } finally {
        stopNativeServer(proc);
    }
}

async function main() {
    const [wavPath, ...models] = process.argv.slice(2);

    if (!wavPath || !fs.existsSync(wavPath)) {
        console.error('Usage: npm run bench:stt -- <file.wav> [model...]');
        console.error(`Default models: ${DEFAULT_MODELS.join(', ')}`);
        process.exit(1);
    }

    const toTest = models.length > 0 ? models : DEFAULT_MODELS;
    console.log(`File: ${wavPath}`);
    console.log(`Models: ${toTest.join(', ')}\n`);

    const binary = await ensureNativeBinary('whisper', () => {});

    for (const model of toTest) {
        try {
            const { text, ms } = await runModel(binary, model, wavPath);
            const warning = ms > 4000 ? '  ⚠️  >4s: check whether the binary uses Metal (B10)' : '';
            console.log(`${'='.repeat(72)}\n${model}  —  ${ms} ms${warning}\n${'='.repeat(72)}\n${text}\n`);
        } catch (error) {
            console.error(`${model}: ERROR — ${error.message}\n`);
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
