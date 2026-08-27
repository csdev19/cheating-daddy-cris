// Builds mono little-endian PCM16. `amplitude` runs from 0 (silence) to 1 (full
// scale). Deterministic so the RMS stays stable across runs.
function makePcm16({ samples, amplitude = 0 }) {
    const buffer = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        // Alternating sign keeps the mean at ~0 and the RMS at ~amplitude.
        const value = Math.round((i % 2 === 0 ? 1 : -1) * amplitude * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
    }
    return buffer;
}

// A 100 ms frame at 16 kHz = 1600 samples.
function frame16k(amplitude) {
    return makePcm16({ samples: 1600, amplitude });
}

// A 100 ms frame at 24 kHz = 2400 samples.
function frame24k(amplitude) {
    return makePcm16({ samples: 2400, amplitude });
}

module.exports = { makePcm16, frame16k, frame24k };
