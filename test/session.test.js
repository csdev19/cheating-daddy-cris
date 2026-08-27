const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionManager } = require('../src/core/session');

function crearConfigDir() {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    const perfil = path.join(cfg, 'profiles', 'entrevista');
    fs.mkdirSync(path.join(perfil, 'context'), { recursive: true });
    fs.writeFileSync(path.join(perfil, 'profile.md'), '---\nname: Entrevista\nmodel: gemini-3.7-flash\n---\n\nSé mi memoria.');
    fs.writeFileSync(path.join(perfil, 'context', 'cv.md'), 'Backend, 15 años.');
    return cfg;
}

test('start carga el perfil y abre un hilo vacío', () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'ok' });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    assert.strictEqual(gestor.getProfile().meta.name, 'Entrevista');
    assert.deepStrictEqual(gestor.getContext().getEvents(), []);
});

test('recordSpeech acumula sin llamar al proveedor', async () => {
    let llamadas = 0;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => {
            llamadas++;
            return 'respuesta';
        },
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    gestor.recordSpeech('them', '¿Qué sabes de Node?');
    gestor.recordSpeech('me', 'Bastante.');

    assert.strictEqual(llamadas, 0);
    assert.strictEqual(gestor.getContext().getEvents().length, 2);
});

test('ask envía el payload al proveedor y registra la respuesta', async () => {
    let recibido = null;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async payload => {
            recibido = payload;
            return 'Di que redujiste latencia un 40%.';
        },
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });
    gestor.recordSpeech('them', '¿Qué impacto tuviste?');

    const respuesta = await gestor.ask({ question: '¿qué digo?' });

    assert.strictEqual(respuesta, 'Di que redujiste latencia un 40%.');
    assert.ok(recibido.system.includes('Backend, 15 años.'));
    assert.ok(recibido.transcript.includes('¿Qué impacto tuviste?'));
    assert.strictEqual(recibido.model, 'gemini-3.7-flash');

    const eventos = gestor.getContext().getEvents();
    assert.strictEqual(eventos[eventos.length - 1].kind, 'ask');
});

test('ask falla claramente si no hay sesión activa', async () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'x' });
    await assert.rejects(() => gestor.ask({ question: 'x' }), /no active session/i);
});

test('ask rechaza una segunda petición mientras la primera está en curso (B6)', async () => {
    let resolver;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: () => new Promise(r => (resolver = r)),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    const primera = gestor.ask({ question: 'a' });
    await assert.rejects(() => gestor.ask({ question: 'b' }), /already in flight/i);
    resolver('ok');
    assert.strictEqual(await primera, 'ok');
});

test('ask libera el cerrojo aunque el proveedor falle', async () => {
    let fallar = true;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => {
            if (fallar) throw new Error('boom');
            return 'ok';
        },
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    await assert.rejects(() => gestor.ask({ question: 'a' }), /boom/);
    fallar = false;
    assert.strictEqual(await gestor.ask({ question: 'b' }), 'ok');
});

test('el payload lleva el flag de confidencialidad para que el adaptador lo respete', async () => {
    const cfg = crearConfigDir();
    const perfil = path.join(cfg, 'profiles', 'privado');
    fs.mkdirSync(perfil, { recursive: true });
    fs.writeFileSync(path.join(perfil, 'profile.md'), '---\nname: Privado\nconfidential: true\n---\n\nSé discreto.');

    let recibido = null;
    const gestor = createSessionManager({
        configDir: cfg,
        sendToProvider: async payload => {
            recibido = payload;
            return 'ok';
        },
    });
    gestor.start({ profileName: 'privado', sessionId: 's1' });
    await gestor.ask({ question: 'x' });

    assert.strictEqual(recibido.confidential, true);
});

test('recordScreen añade el evento al hilo', () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'x' });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });
    gestor.recordScreen('img-1');
    assert.strictEqual(gestor.getContext().getEvents()[0].kind, 'screen');
});

test('end cierra la sesión', () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'x' });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });
    gestor.end();
    assert.strictEqual(gestor.getContext(), null);
});

// La vista pinta el hilo, así que necesita enterarse de cada evento en cuanto
// ocurre. `onEvent` es el único punto por donde salen: sin él, la UI tendría que
// sondear el contexto.
test('onEvent notifica cada turno de voz recién registrado', () => {
    const vistos = [];
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => vistos.push(e),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    gestor.recordSpeech('them', '¿Qué sabes de Node?');

    assert.strictEqual(vistos.length, 1);
    assert.strictEqual(vistos[0].kind, 'speech');
    assert.strictEqual(vistos[0].speaker, 'them');
    assert.strictEqual(vistos[0].text, '¿Qué sabes de Node?');
});

test('onEvent no dispara con un turno de voz vacío', () => {
    const vistos = [];
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => vistos.push(e),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    gestor.recordSpeech('me', '   ');

    assert.deepStrictEqual(vistos, []);
});

test('onEvent notifica la captura de pantalla', () => {
    const vistos = [];
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => 'ok',
        onEvent: e => vistos.push(e),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    gestor.recordScreen('s1/screen-1.jpg');

    assert.strictEqual(vistos.length, 1);
    assert.strictEqual(vistos[0].kind, 'screen');
    assert.strictEqual(vistos[0].imageRef, 's1/screen-1.jpg');
});

test('onEvent notifica la pregunta una vez ya tiene respuesta', async () => {
    const vistos = [];
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => 'Menciona lock ordering.',
        onEvent: e => vistos.push(e),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    await gestor.ask({ question: '¿Qué me falta?' });

    assert.strictEqual(vistos.length, 1);
    assert.strictEqual(vistos[0].kind, 'ask');
    assert.strictEqual(vistos[0].question, '¿Qué me falta?');
    assert.strictEqual(vistos[0].answer, 'Menciona lock ordering.');
});

// Si el proveedor falla no hay nada que añadir al hilo: la vista debe quedarse
// como estaba, no con una pregunta huérfana.
test('una petición fallida no emite evento', async () => {
    const vistos = [];
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: async () => {
            throw new Error('sin red');
        },
        onEvent: e => vistos.push(e),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    await assert.rejects(() => gestor.ask({ question: '¿Y ahora?' }));
    assert.deepStrictEqual(vistos, []);
});

test('el gestor funciona sin onEvent', () => {
    const gestor = createSessionManager({ configDir: crearConfigDir(), sendToProvider: async () => 'ok' });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    assert.doesNotThrow(() => gestor.recordSpeech('them', 'Hola'));
});
