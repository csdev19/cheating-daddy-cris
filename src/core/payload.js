// Ensambla el payload en el orden que exige el prompt caching:
// estable primero (instrucciones + notas + checklist), volátil después
// (transcript + imagen + pregunta). Si el prefijo cambia entre invocaciones
// la caché se invalida entera, así que aquí nada puede depender del tiempo
// ni del contenido de la conversación.
function buildPayload({ profile, sessionContext, question, image = null }) {
    if (!profile) throw new TypeError('buildPayload requires profile');
    if (!sessionContext) throw new TypeError('buildPayload requires sessionContext');

    const secciones = [profile.instructions];

    if (profile.contextFiles.length > 0) {
        const notas = profile.contextFiles.map(f => `### ${f.file}\n\n${f.content}`).join('\n\n');
        secciones.push(`## My notes\n\n${notas}`);
    }

    if (profile.checklist.length > 0) {
        const items = profile.checklist.map(i => `- [${i.id}] ${i.text}`).join('\n');
        secciones.push(`## Session checklist\n\n${items}`);
    }

    return {
        system: secciones.join('\n\n'),
        transcript: sessionContext.getTranscript(),
        question: (question || '').trim(),
        image,
        model: profile.meta.model || null,
        confidential: profile.meta.confidential === true,
    };
}

module.exports = { buildPayload };
