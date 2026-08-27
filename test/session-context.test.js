const test = require('node:test');
const assert = require('node:assert');
const { createSessionContext, fromJSON } = require('../src/core/session-context');

function nuevoContexto() {
    let reloj = 1000;
    return createSessionContext({ sessionId: 's1', profileName: 'entrevista', now: () => reloj++ });
}

test('empieza vacío', () => {
    const ctx = nuevoContexto();
    assert.deepStrictEqual(ctx.getEvents(), []);
    assert.strictEqual(ctx.getTranscript(), '');
});

test('acumula voz de ambos hablantes en un solo hilo', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: '¿Cuál es tu experiencia con Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Cinco años.' });

    const eventos = ctx.getEvents();
    assert.strictEqual(eventos.length, 2);
    assert.strictEqual(eventos[0].kind, 'speech');
    assert.strictEqual(eventos[0].speaker, 'them');
    assert.strictEqual(eventos[1].speaker, 'me');
});

test('pantalla y voz conviven en el mismo hilo, ordenados por tiempo', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Mira este código.' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addSpeech({ speaker: 'me', text: 'Ya lo veo.' });

    assert.deepStrictEqual(
        ctx.getEvents().map(e => e.kind),
        ['speech', 'screen', 'speech']
    );
});

test('ordena por marca de tiempo aunque lleguen desordenados', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'me', text: 'segundo', t: 200 });
    ctx.addSpeech({ speaker: 'them', text: 'primero', t: 100 });

    assert.deepStrictEqual(
        ctx.getEvents().map(e => e.text),
        ['primero', 'segundo']
    );
});

test('el transcript etiqueta a cada hablante', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Hola' });
    ctx.addSpeech({ speaker: 'me', text: 'Buenas' });

    assert.strictEqual(ctx.getTranscript(), '[Them]: Hola\n[Me]: Buenas');
});

test('el transcript ignora eventos que no son voz', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Hola' });
    ctx.addScreen({ imageRef: 'img-1' });
    ctx.addAsk({ question: '¿qué digo?', answer: 'esto' });

    assert.strictEqual(ctx.getTranscript(), '[Them]: Hola');
});

test('rechaza hablantes desconocidos', () => {
    const ctx = nuevoContexto();
    assert.throws(() => ctx.addSpeech({ speaker: 'otro', text: 'x' }), /speaker/);
});

test('descarta texto vacío o solo espacios', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: '   ' });
    ctx.addSpeech({ speaker: 'them', text: '' });
    assert.strictEqual(ctx.getEvents().length, 0);
});

test('el checklist conserva el último estado de cada ítem', () => {
    const ctx = nuevoContexto();
    ctx.addChecklist({ itemId: 'preguntar-salario', status: 'pending' });
    ctx.addChecklist({ itemId: 'mencionar-k8s', status: 'done' });
    ctx.addChecklist({ itemId: 'preguntar-salario', status: 'done' });

    const estado = ctx.getChecklistState();
    assert.strictEqual(estado.get('preguntar-salario'), 'done');
    assert.strictEqual(estado.get('mencionar-k8s'), 'done');
});

test('sobrevive a un round-trip por JSON', () => {
    const ctx = nuevoContexto();
    ctx.addSpeech({ speaker: 'them', text: 'Hola' });
    ctx.addScreen({ imageRef: 'img-1', caption: 'un IDE' });

    const restaurado = fromJSON(JSON.parse(JSON.stringify(ctx.toJSON())));
    assert.strictEqual(restaurado.getTranscript(), '[Them]: Hola');
    assert.strictEqual(restaurado.getEvents().length, 2);
    assert.strictEqual(restaurado.toJSON().sessionId, 's1');
});

test('exige sessionId', () => {
    assert.throws(() => createSessionContext({}), /sessionId/);
});
