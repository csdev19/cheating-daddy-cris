const test = require('node:test');
const assert = require('node:assert');
const { buildPayload } = require('../src/core/payload');
const { createSessionContext } = require('../src/core/session-context');

const perfilDePrueba = {
    name: 'entrevista-backend',
    meta: { name: 'Entrevista Backend', confidential: false, model: 'gemini-3.7-flash' },
    instructions: 'No me dictes qué decir.',
    contextFiles: [
        { file: 'cifras.md', content: 'Reduje latencia un 40%.' },
        { file: 'cv.md', content: '15 años de backend.' },
    ],
    checklist: [
        { id: 'preguntar-equipo', text: 'Preguntar por el equipo' },
        { id: 'mencionar-k8s', text: 'Mencionar Kubernetes' },
    ],
};

function contextoConVoz() {
    let reloj = 1000;
    const ctx = createSessionContext({ sessionId: 's1', now: () => reloj++ });
    ctx.addSpeech({ speaker: 'them', text: '¿Qué has hecho con Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Backend a escala.' });
    return ctx;
}

test('el system incluye instrucciones y todos los archivos de contexto', () => {
    const p = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: '¿qué digo?' });
    assert.ok(p.system.includes('No me dictes qué decir.'));
    assert.ok(p.system.includes('Reduje latencia un 40%.'));
    assert.ok(p.system.includes('15 años de backend.'));
});

test('el system NO incluye el transcript (debe quedar fuera del prefijo cacheado)', () => {
    const p = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: '¿qué digo?' });
    assert.ok(!p.system.includes('Backend a escala.'));
    assert.ok(p.transcript.includes('Backend a escala.'));
});

test('el system es idéntico entre invocaciones aunque crezca el transcript', () => {
    const ctx = contextoConVoz();
    const primero = buildPayload({ profile: perfilDePrueba, sessionContext: ctx, question: 'a' });
    ctx.addSpeech({ speaker: 'them', text: 'Una pregunta más.' });
    const segundo = buildPayload({ profile: perfilDePrueba, sessionContext: ctx, question: 'b' });

    assert.strictEqual(primero.system, segundo.system);
    assert.notStrictEqual(primero.transcript, segundo.transcript);
});

test('el checklist aparece con su estado actual', () => {
    const ctx = contextoConVoz();
    ctx.addChecklist({ itemId: 'mencionar-k8s', status: 'done' });

    const p = buildPayload({ profile: perfilDePrueba, sessionContext: ctx, question: 'x' });
    assert.ok(p.system.includes('Preguntar por el equipo'));
    assert.ok(p.system.includes('Mencionar Kubernetes'));
});

test('propaga modelo y flag de confidencialidad del perfil', () => {
    const p = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: 'x' });
    assert.strictEqual(p.model, 'gemini-3.7-flash');
    assert.strictEqual(p.confidential, false);

    const confidencial = { ...perfilDePrueba, meta: { ...perfilDePrueba.meta, confidential: true } };
    assert.strictEqual(buildPayload({ profile: confidencial, sessionContext: contextoConVoz(), question: 'x' }).confidential, true);
});

test('la imagen es opcional y se propaga tal cual', () => {
    const sinImagen = buildPayload({ profile: perfilDePrueba, sessionContext: contextoConVoz(), question: 'x' });
    assert.strictEqual(sinImagen.image, null);

    const conImagen = buildPayload({
        profile: perfilDePrueba,
        sessionContext: contextoConVoz(),
        question: 'x',
        image: { data: 'YWJj', mimeType: 'image/jpeg' },
    });
    assert.strictEqual(conImagen.image.data, 'YWJj');
});

test('funciona con un perfil sin contexto ni checklist', () => {
    const minimo = { name: 'm', meta: { name: 'M', confidential: false, model: null }, instructions: 'Sé breve.', contextFiles: [], checklist: [] };
    const p = buildPayload({ profile: minimo, sessionContext: contextoConVoz(), question: 'x' });
    assert.ok(p.system.includes('Sé breve.'));
    assert.strictEqual(p.model, null);
});

test('exige profile y sessionContext', () => {
    assert.throws(() => buildPayload({ sessionContext: contextoConVoz(), question: 'x' }), /profile/);
    assert.throws(() => buildPayload({ profile: perfilDePrueba, question: 'x' }), /sessionContext/);
});
