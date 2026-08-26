const VAD_MODES = {
    NORMAL: { energyThreshold: 0.01, speechFramesRequired: 3, silenceFramesRequired: 30 },
    AGGRESSIVE: { energyThreshold: 0.015, speechFramesRequired: 2, silenceFramesRequired: 20 },
    VERY_AGGRESSIVE: { energyThreshold: 0.02, speechFramesRequired: 2, silenceFramesRequired: 15 },
};

function calculateRms(pcm16Buffer) {
    const samples = Math.floor(pcm16Buffer.length / 2);
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
        const sample = pcm16Buffer.readInt16LE(i * 2) / 32768;
        sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / samples);
}

// Un VAD independiente por canal de audio. El estado vive en el closure, no en el módulo,
// para que el canal del sistema y el del micrófono no se pisen (ver D6).
function createVad({ mode = VAD_MODES.NORMAL, preRollFrames = 3, tailFrames = 2, onSpeechEnd } = {}) {
    if (typeof onSpeechEnd !== 'function') {
        throw new TypeError('createVad requiere un callback onSpeechEnd');
    }

    let isSpeaking = false;
    let speechBuffers = [];
    let preRoll = [];
    let speechFrameCount = 0;
    let silenceFrameCount = 0;

    function reset() {
        isSpeaking = false;
        speechBuffers = [];
        preRoll = [];
        speechFrameCount = 0;
        silenceFrameCount = 0;
    }

    function process(pcm16kBuffer) {
        if (!pcm16kBuffer || pcm16kBuffer.length === 0) return;

        const isVoice = calculateRms(pcm16kBuffer) > mode.energyThreshold;

        if (isVoice) {
            speechFrameCount += 1;
            silenceFrameCount = 0;

            if (!isSpeaking && speechFrameCount >= mode.speechFramesRequired) {
                isSpeaking = true;
                // Arrancamos el segmento con el pre-roll: el ataque de la frase suele
                // caer por debajo del umbral y es justo lo que más se pierde con acento.
                speechBuffers = preRoll.slice();
                preRoll = [];
            }
        } else {
            silenceFrameCount += 1;
            speechFrameCount = 0;

            if (isSpeaking && silenceFrameCount >= mode.silenceFramesRequired) {
                isSpeaking = false;
                // Recortamos el silencio final que disparó el cierre y dejamos solo una
                // cola corta. Mandar 3 s de silencio a Whisper malgasta proceso y es
                // donde más alucina (B3); la cola evita cortar el final de la palabra.
                const silencioAcumulado = silenceFrameCount - 1;
                const aDescartar = Math.max(0, silencioAcumulado - tailFrames);
                const utiles = aDescartar > 0 ? speechBuffers.slice(0, speechBuffers.length - aDescartar) : speechBuffers;

                const audioData = Buffer.concat(utiles);
                speechBuffers = [];
                onSpeechEnd(audioData);
                return;
            }
        }

        const frame = Buffer.from(pcm16kBuffer);

        if (isSpeaking) {
            speechBuffers.push(frame);
        } else if (preRollFrames > 0) {
            preRoll.push(frame);
            if (preRoll.length > preRollFrames) preRoll.shift();
        }
    }

    return { process, reset, isSpeaking: () => isSpeaking };
}

module.exports = { VAD_MODES, calculateRms, createVad };
