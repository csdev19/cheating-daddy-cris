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
    await assert.rejects(() => gestor.ask({ question: 'x' }), /sesión/i);
});

test('ask rechaza una segunda petición mientras la primera está en curso (B6)', async () => {
    let resolver;
    const gestor = createSessionManager({
        configDir: crearConfigDir(),
        sendToProvider: () => new Promise(r => (resolver = r)),
    });
    gestor.start({ profileName: 'entrevista', sessionId: 's1' });

    const primera = gestor.ask({ question: 'a' });
    await assert.rejects(() => gestor.ask({ question: 'b' }), /en curso/);
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
