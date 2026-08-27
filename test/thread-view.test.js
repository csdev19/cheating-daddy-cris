const test = require('node:test');
const assert = require('node:assert');
const { projectThread, formatClock } = require('../src/core/thread-view');

// Reloj legible: t(14, 2) es hoy a las 14:02 hora local, así el test no depende de TZ.
function t(hora, minuto, segundo = 0) {
    const d = new Date(2026, 0, 15, hora, minuto, segundo);
    return d.getTime();
}

test('un hilo vacío no produce filas', () => {
    assert.deepStrictEqual(projectThread([]), []);
    assert.deepStrictEqual(projectThread(undefined), []);
});

test('cada turno de voz es una fila etiquetada con su hablante', () => {
    const filas = projectThread([
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: '¿Cómo manejarías un deadlock?' },
        { t: t(14, 3), kind: 'speech', speaker: 'me', text: 'Miraría los logs del pool.' },
    ]);

    assert.strictEqual(filas.length, 2);
    assert.strictEqual(filas[0].kind, 'speech');
    assert.strictEqual(filas[0].speaker, 'them');
    assert.strictEqual(filas[0].text, '¿Cómo manejarías un deadlock?');
    assert.strictEqual(filas[1].speaker, 'me');
});

// Whisper emite un segmento por pausa del VAD, así que una sola frase hablada
// llega troceada. Sin fusionar, la vista es una lista de fragmentos ilegibles.
test('fusiona segmentos seguidos del mismo hablante dentro de la ventana', () => {
    const filas = projectThread([
        { t: t(14, 2, 0), kind: 'speech', speaker: 'them', text: 'Vale,' },
        { t: t(14, 2, 3), kind: 'speech', speaker: 'them', text: 'entonces el lock' },
        { t: t(14, 2, 6), kind: 'speech', speaker: 'them', text: 'está en otro servicio.' },
    ]);

    assert.strictEqual(filas.length, 1);
    assert.strictEqual(filas[0].text, 'Vale, entonces el lock está en otro servicio.');
    assert.strictEqual(filas[0].t, t(14, 2, 0), 'la fila conserva el inicio del primer segmento');
    assert.strictEqual(filas[0].tEnd, t(14, 2, 6));
});

test('no fusiona si cambia el hablante', () => {
    const filas = projectThread([
        { t: t(14, 2, 0), kind: 'speech', speaker: 'them', text: '¿Y el timeout?' },
        { t: t(14, 2, 2), kind: 'speech', speaker: 'me', text: 'Treinta segundos.' },
    ]);

    assert.strictEqual(filas.length, 2);
});

test('no fusiona si pasa demasiado tiempo entre segmentos', () => {
    const filas = projectThread(
        [
            { t: t(14, 2, 0), kind: 'speech', speaker: 'them', text: 'Primera idea.' },
            { t: t(14, 5, 0), kind: 'speech', speaker: 'them', text: 'Segunda idea.' },
        ],
        { mergeWindowMs: 8000 }
    );

    assert.strictEqual(filas.length, 2);
});

test('una pregunta al asistente es una fila con pregunta y respuesta', () => {
    const filas = projectThread([{ t: t(14, 4), kind: 'ask', question: '¿Qué me falta?', answer: 'Menciona lock ordering.' }]);

    assert.strictEqual(filas.length, 1);
    assert.strictEqual(filas[0].kind, 'ask');
    assert.strictEqual(filas[0].question, '¿Qué me falta?');
    assert.strictEqual(filas[0].answer, 'Menciona lock ordering.');
    assert.strictEqual(filas[0].imageRef, null);
});

// La captura y la pregunta que la usa son un solo gesto del usuario; pintarlas
// como dos filas separadas rompe la lectura.
test('la captura que precede a una pregunta se adjunta a esa pregunta', () => {
    const filas = projectThread([
        { t: t(14, 4, 0), kind: 'screen', imageRef: 'sesion/screen-1.jpg', caption: null },
        { t: t(14, 4, 1), kind: 'ask', question: 'Ayúdame con esto', answer: 'Es un deadlock.' },
    ]);

    assert.strictEqual(filas.length, 1);
    assert.strictEqual(filas[0].kind, 'ask');
    assert.strictEqual(filas[0].imageRef, 'sesion/screen-1.jpg');
});

test('una captura sin pregunta detrás se queda como fila propia', () => {
    const filas = projectThread([
        { t: t(14, 4, 0), kind: 'screen', imageRef: 'sesion/screen-1.jpg', caption: 'LeetCode' },
        { t: t(14, 9, 0), kind: 'ask', question: 'Otra cosa', answer: 'Vale.' },
    ]);

    assert.strictEqual(filas.length, 2);
    assert.strictEqual(filas[0].kind, 'screen');
    assert.strictEqual(filas[0].imageRef, 'sesion/screen-1.jpg');
    assert.strictEqual(filas[0].caption, 'LeetCode');
    assert.strictEqual(filas[1].imageRef, null);
});

test('una captura no se adjunta a dos preguntas', () => {
    const filas = projectThread([
        { t: t(14, 4, 0), kind: 'screen', imageRef: 'sesion/screen-1.jpg' },
        { t: t(14, 4, 1), kind: 'ask', question: 'Primera', answer: 'Una.' },
        { t: t(14, 4, 2), kind: 'ask', question: 'Segunda', answer: 'Dos.' },
    ]);

    assert.strictEqual(filas.length, 2);
    assert.strictEqual(filas[0].imageRef, 'sesion/screen-1.jpg');
    assert.strictEqual(filas[1].imageRef, null);
});

test('los eventos de checklist son su propia fila', () => {
    const filas = projectThread([{ t: t(14, 6), kind: 'checklist', itemId: 'salario', status: 'hecho' }]);

    assert.strictEqual(filas[0].kind, 'checklist');
    assert.strictEqual(filas[0].itemId, 'salario');
    assert.strictEqual(filas[0].status, 'hecho');
});

test('mantiene el orden cronológico entre tipos distintos', () => {
    const filas = projectThread([
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: 'Uno' },
        { t: t(14, 3), kind: 'ask', question: 'Dos', answer: 'Dos.' },
        { t: t(14, 4), kind: 'speech', speaker: 'me', text: 'Tres' },
    ]);

    assert.deepStrictEqual(
        filas.map(f => f.kind),
        ['speech', 'ask', 'speech']
    );
});

test('cada fila lleva un id estable para que Lit no repinte de más', () => {
    const eventos = [
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: 'Uno' },
        { t: t(14, 3), kind: 'speech', speaker: 'me', text: 'Dos' },
    ];

    const primeros = projectThread(eventos).map(f => f.id);
    const segundos = projectThread(eventos).map(f => f.id);

    assert.deepStrictEqual(primeros, segundos);
    assert.strictEqual(new Set(primeros).size, 2, 'los ids no se repiten entre filas');
});

test('ignora turnos de voz vacíos', () => {
    const filas = projectThread([
        { t: t(14, 2), kind: 'speech', speaker: 'them', text: '   ' },
        { t: t(14, 3), kind: 'speech', speaker: 'me', text: 'Real.' },
    ]);

    assert.strictEqual(filas.length, 1);
    assert.strictEqual(filas[0].text, 'Real.');
});

test('formatClock da la hora local en HH:MM con cero a la izquierda', () => {
    assert.strictEqual(formatClock(t(9, 5)), '09:05');
    assert.strictEqual(formatClock(t(14, 2)), '14:02');
    assert.strictEqual(formatClock(t(0, 0)), '00:00');
});
