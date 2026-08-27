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

// One independent VAD per audio channel. State lives in the closure rather than in
// the module so the system channel and the microphone cannot trample each other (D6).
function createVad({ mode = VAD_MODES.NORMAL, preRollFrames = 3, tailFrames = 2, onSpeechEnd } = {}) {
    if (typeof onSpeechEnd !== 'function') {
        throw new TypeError('createVad requires an onSpeechEnd callback');
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
                // Start the segment with the pre-roll: the attack of a phrase usually
                // falls below the threshold, and that is exactly what a strong accent
                // loses most often.
                speechBuffers = preRoll.slice();
                preRoll = [];
            }
        } else {
            silenceFrameCount += 1;
            speechFrameCount = 0;

            if (isSpeaking && silenceFrameCount >= mode.silenceFramesRequired) {
                isSpeaking = false;
                // Trim the trailing silence that triggered the close, keeping a short
                // tail. Sending 3s of silence to Whisper wastes compute and is where it
                // hallucinates most (B3); the tail avoids clipping the final word.
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
