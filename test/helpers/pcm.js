// Genera PCM16 mono little-endian. amplitude va de 0 (silencio) a 1 (fondo de escala).
// Usa ruido determinista para que el RMS sea estable entre ejecuciones.
function makePcm16({ samples, amplitude = 0 }) {
    const buffer = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        // Alterna signo para que la media sea ~0 y el RMS sea ~amplitude.
        const value = Math.round((i % 2 === 0 ? 1 : -1) * amplitude * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
    }
    return buffer;
}

// Un frame de 100 ms a 16 kHz = 1600 muestras.
function frame16k(amplitude) {
    return makePcm16({ samples: 1600, amplitude });
}

// Un frame de 100 ms a 24 kHz = 2400 muestras.
function frame24k(amplitude) {
    return makePcm16({ samples: 2400, amplitude });
}

module.exports = { makePcm16, frame16k, frame24k };
