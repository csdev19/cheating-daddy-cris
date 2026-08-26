#!/usr/bin/env node
// Compara modelos de Whisper sobre el MISMO archivo de audio.
// Lo que decide no es el WER de un leaderboard, sino cuál entiende TU audio (D4/D21).
//
// Uso: npm run bench:stt -- grabacion.wav [large-v3-turbo small.en ...]
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

const MODELOS_POR_DEFECTO = ['tiny.en', 'small.en', 'large-v3-turbo'];

async function transcribir(baseUrl, wavPath) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(wavPath)]), path.basename(wavPath));
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0.0');

    const response = await fetch(`${baseUrl}/inference`, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const segments = Array.isArray(json.segments) ? json.segments : [];

    // B3/B10: mostramos no_speech_prob por segmento para calibrar el filtro
    // de alucinaciones con datos propios en vez de a ojo.
    const lineas = segments.map(seg => `  [${(seg.no_speech_prob ?? 0).toFixed(2)}] ${(seg.text || '').trim()}`);
    return lineas.length ? lineas.join('\n') : (json.text || '').trim();
}

async function correrModelo(binario, modelo, wavPath) {
    const modelPath = await ensureWhisperModel(modelo, () => {});
    const puerto = await getAvailablePort();
    const proceso = startNativeServer({
        executablePath: binario,
        arguments: ['-m', modelPath, '--host', '127.0.0.1', '--port', String(puerto)],
        name: `whisper-${modelo}`,
    });

    const baseUrl = `http://127.0.0.1:${puerto}`;
    try {
        await waitForServer(`${baseUrl}/`, proceso, 120000);
        const inicio = Date.now();
        const texto = await transcribir(baseUrl, wavPath);
        return { texto, ms: Date.now() - inicio };
    } finally {
        stopNativeServer(proceso);
    }
}

async function main() {
    const [wavPath, ...modelos] = process.argv.slice(2);

    if (!wavPath || !fs.existsSync(wavPath)) {
        console.error('Uso: npm run bench:stt -- <archivo.wav> [modelo...]');
        console.error(`Modelos por defecto: ${MODELOS_POR_DEFECTO.join(', ')}`);
        process.exit(1);
    }

    const aProbar = modelos.length > 0 ? modelos : MODELOS_POR_DEFECTO;
    console.log(`Archivo: ${wavPath}`);
    console.log(`Modelos: ${aProbar.join(', ')}\n`);

    const binario = await ensureNativeBinary('whisper', () => {});

    for (const modelo of aProbar) {
        try {
            const { texto, ms } = await correrModelo(binario, modelo, wavPath);
            const aviso = ms > 4000 ? '  ⚠️  >4s: revisa si el binario usa Metal (B10)' : '';
            console.log(`${'='.repeat(72)}\n${modelo}  —  ${ms} ms${aviso}\n${'='.repeat(72)}\n${texto}\n`);
        } catch (error) {
            console.error(`${modelo}: ERROR — ${error.message}\n`);
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
