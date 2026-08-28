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
function createVad({ mode = VAD_MODES.NORMAL, preRollFrames = 3, tailFrames = 2, maxSegmentFrames = 0, cutSearchFrames = 10, onSpeechEnd } = {}) {
    if (typeof onSpeechEnd !== 'function') {
        throw new TypeError('createVad requires an onSpeechEnd callback');
    }

    let isSpeaking = false;
    let speechBuffers = [];
    // RMS of each buffered frame, so a forced cut can look for a micro-pause.
    let speechLevels = [];
    let preRoll = [];
    let speechFrameCount = 0;
    let silenceFrameCount = 0;

    function reset() {
        isSpeaking = false;
        speechBuffers = [];
        speechLevels = [];
        preRoll = [];
        speechFrameCount = 0;
        silenceFrameCount = 0;
    }

    // Cutting mid-syllable is what degrades the words either side of the boundary,
    // so the cut looks back over the last frames and lands on the quietest one.
    function quietestCutIndex() {
        const from = Math.max(0, speechLevels.length - cutSearchFrames);
        let best = speechLevels.length - 1;
        for (let i = from; i < speechLevels.length; i++) {
            if (speechLevels[i] < speechLevels[best]) best = i;
        }
        return best;
    }

    function process(pcm16kBuffer) {
        if (!pcm16kBuffer || pcm16kBuffer.length === 0) return;

        const level = calculateRms(pcm16kBuffer);
        const isVoice = level > mode.energyThreshold;

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
                const trailingSilence = silenceFrameCount - 1;
                const toDrop = Math.max(0, trailingSilence - tailFrames);
                const useful = toDrop > 0 ? speechBuffers.slice(0, speechBuffers.length - toDrop) : speechBuffers;

                const audioData = Buffer.concat(useful);
                speechBuffers = [];
                speechLevels = [];
                onSpeechEnd(audioData);
                return;
            }
        }

        const frame = Buffer.from(pcm16kBuffer);

        if (isSpeaking) {
            speechBuffers.push(frame);
            speechLevels.push(level);

            // Someone who talks without pausing would otherwise see nothing at all
            // until they stopped. The segment is closed on length too, and what
            // falls after the cut starts the next one so no audio is lost.
            //
            // Only voice frames can trip it: during trailing silence the buffer keeps
            // growing, and a forced cut there would ship pure silence to Whisper,
            // which is exactly where it hallucinates (B3).
            if (isVoice && maxSegmentFrames > 0 && speechBuffers.length >= maxSegmentFrames) {
                const cutAt = quietestCutIndex();
                const audioData = Buffer.concat(speechBuffers.slice(0, cutAt + 1));
                speechBuffers = speechBuffers.slice(cutAt + 1);
                speechLevels = speechLevels.slice(cutAt + 1);
                onSpeechEnd(audioData);
            }
        } else if (preRollFrames > 0) {
            preRoll.push(frame);
            if (preRoll.length > preRollFrames) preRoll.shift();
        }
    }

    return { process, reset, isSpeaking: () => isSpeaking };
}

module.exports = { VAD_MODES, calculateRms, createVad };
