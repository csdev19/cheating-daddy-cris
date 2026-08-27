const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseFrontmatter, listProfiles, describeProfiles, resolveProfileName, loadProfile, getProfilesDir } = require('../src/core/profiles');

function crearPerfilDePrueba() {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    const perfil = path.join(raiz, 'entrevista-backend');
    fs.mkdirSync(path.join(perfil, 'context'), { recursive: true });

    fs.writeFileSync(
        path.join(perfil, 'profile.md'),
        ['---', 'name: Entrevista Backend', 'confidential: false', 'model: gemini-3.7-flash', '---', '', 'No me dictes qué decir.'].join('\n')
    );
    fs.writeFileSync(path.join(perfil, 'checklist.md'), '- Preguntar por el equipo\n- Mencionar Kubernetes\n\n- \n');
    fs.writeFileSync(path.join(perfil, 'context', 'cv.md'), '15 años de backend.');
    fs.writeFileSync(path.join(perfil, 'context', 'cifras.md'), 'Reduje latencia un 40%.');

    return raiz;
}

test('getProfilesDir cuelga de la carpeta de config', () => {
    assert.strictEqual(getProfilesDir('/tmp/cfg'), path.join('/tmp/cfg', 'profiles'));
});

test('parseFrontmatter separa metadatos y cuerpo', () => {
    const { meta, body } = parseFrontmatter('---\nname: Prueba\nconfidential: true\n---\n\nCuerpo aquí.');
    assert.strictEqual(meta.name, 'Prueba');
    assert.strictEqual(meta.confidential, true);
    assert.strictEqual(body, 'Cuerpo aquí.');
});

test('parseFrontmatter tolera un archivo sin frontmatter', () => {
    const { meta, body } = parseFrontmatter('Solo cuerpo.');
    assert.deepStrictEqual(meta, {});
    assert.strictEqual(body, 'Solo cuerpo.');
});

test('parseFrontmatter convierte booleanos pero deja el resto como texto', () => {
    const { meta } = parseFrontmatter('---\na: true\nb: false\nc: gemini-3.7-flash\n---\nx');
    assert.strictEqual(meta.a, true);
    assert.strictEqual(meta.b, false);
    assert.strictEqual(meta.c, 'gemini-3.7-flash');
});

test('listProfiles devuelve las carpetas ordenadas', () => {
    const raiz = crearPerfilDePrueba();
    fs.mkdirSync(path.join(raiz, 'aaa-primero'));
    fs.writeFileSync(path.join(raiz, 'aaa-primero', 'profile.md'), '---\nname: Primero\n---\n\nHola.');
    assert.deepStrictEqual(listProfiles(raiz), ['aaa-primero', 'entrevista-backend']);
});

// Una carpeta suelta sin profile.md no es un perfil. Si el selector la ofrece,
// elegirla revienta la sesión al arrancar.
test('listProfiles ignora carpetas sin profile.md', () => {
    const raiz = crearPerfilDePrueba();
    fs.mkdirSync(path.join(raiz, 'a-medias'));

    assert.deepStrictEqual(listProfiles(raiz), ['entrevista-backend']);
});

test('describeProfiles da carpeta y nombre visible de cada perfil', () => {
    const raiz = crearPerfilDePrueba();

    assert.deepStrictEqual(describeProfiles(raiz), [{ dir: 'entrevista-backend', name: 'Entrevista Backend' }]);
});

test('describeProfiles usa el nombre de la carpeta si falta en el frontmatter', () => {
    const raiz = crearPerfilDePrueba();
    fs.mkdirSync(path.join(raiz, 'sin-nombre'));
    fs.writeFileSync(path.join(raiz, 'sin-nombre', 'profile.md'), 'Sin frontmatter.');

    assert.deepStrictEqual(describeProfiles(raiz), [
        { dir: 'entrevista-backend', name: 'Entrevista Backend' },
        { dir: 'sin-nombre', name: 'sin-nombre' },
    ]);
});

test('resolveProfileName respeta el perfil pedido si existe', () => {
    const raiz = crearPerfilDePrueba();

    assert.strictEqual(resolveProfileName(raiz, 'entrevista-backend'), 'entrevista-backend');
});

// El perfil guardado en preferencias puede haber sido renombrado o borrado a mano.
// Sin este respaldo, la app se queda sin arrancar y sin forma de recuperarse.
test('resolveProfileName cae al primer perfil disponible si el pedido no existe', () => {
    const raiz = crearPerfilDePrueba();

    assert.strictEqual(resolveProfileName(raiz, 'no-existe'), 'entrevista-backend');
    assert.strictEqual(resolveProfileName(raiz, null), 'entrevista-backend');
});

test('resolveProfileName devuelve null si no hay ningún perfil', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'vacio-'));

    assert.strictEqual(resolveProfileName(raiz, 'interview'), null);
});

test('listProfiles devuelve vacío si el directorio no existe', () => {
    assert.deepStrictEqual(listProfiles('/ruta/que/no/existe'), []);
});

test('loadProfile lee instrucciones, contexto y checklist', () => {
    const raiz = crearPerfilDePrueba();
    const perfil = loadProfile(raiz, 'entrevista-backend');

    assert.strictEqual(perfil.meta.name, 'Entrevista Backend');
    assert.strictEqual(perfil.meta.confidential, false);
    assert.strictEqual(perfil.meta.model, 'gemini-3.7-flash');
    assert.strictEqual(perfil.instructions, 'No me dictes qué decir.');

    assert.deepStrictEqual(
        perfil.contextFiles.map(f => f.file),
        ['cifras.md', 'cv.md']
    );
    assert.strictEqual(perfil.contextFiles[1].content, '15 años de backend.');
});

test('loadProfile parsea el checklist e ignora líneas vacías', () => {
    const raiz = crearPerfilDePrueba();
    const perfil = loadProfile(raiz, 'entrevista-backend');

    assert.strictEqual(perfil.checklist.length, 2);
    assert.strictEqual(perfil.checklist[0].text, 'Preguntar por el equipo');
    assert.strictEqual(perfil.checklist[0].id, 'preguntar-por-el-equipo');
});

test('loadProfile funciona sin checklist ni carpeta context', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    fs.mkdirSync(path.join(raiz, 'minimo'));
    fs.writeFileSync(path.join(raiz, 'minimo', 'profile.md'), 'Solo instrucciones.');

    const perfil = loadProfile(raiz, 'minimo');
    assert.deepStrictEqual(perfil.contextFiles, []);
    assert.deepStrictEqual(perfil.checklist, []);
    assert.strictEqual(perfil.meta.name, 'minimo');
});

test('loadProfile falla claramente si el perfil no existe', () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'perfiles-'));
    assert.throws(() => loadProfile(raiz, 'inexistente'), /inexistente/);
});

test('slugify normaliza acentos y espacios', () => {
    const { slugify } = require('../src/core/profiles');
    assert.strictEqual(slugify('Preguntar por la Migración de BD'), 'preguntar-por-la-migracion-de-bd');
});
