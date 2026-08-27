// Assembles the payload in the order prompt caching demands: stable first
// (instructions + notes + checklist), volatile after (transcript + image +
// question). If the prefix changes between calls the whole cache is invalidated,
// so nothing here may depend on the clock or on the conversation.
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
