const fs = require('fs');
const path = require('path');
const { getProfilesDir } = require('./profiles');

// Sustituye a los profilePrompts hardcodeados, que ordenaban al modelo dictar
// palabra por palabra ("no coaching, just the direct response"). Ese prompt era
// lo contrario de un asistente de memoria (hallazgo H6).
const INSTRUCCIONES_BASE = `Eres mi asistente de memoria, no un teleprompter. No me dictes qué decir.

Cuando te invoco, dame lo que probablemente he olvidado: la cifra exacta, el nombre
del proyecto, el término que acaban de usar. Sé breve — voy a leerte mientras hablo
con alguien.

Si algo no está en mis notas, dilo. No lo inventes: prefiero un "no lo tengo" a un
dato falso dicho con seguridad.`;

const PERFILES_POR_DEFECTO = [
    {
        dir: 'entrevista',
        name: 'Entrevista de trabajo',
        extra: 'Prioriza mi experiencia concreta y las cifras de impacto. Si mencionan una tecnología que está en mis notas, recuérdame qué hice con ella.',
        checklist: ['Preguntar por el equipo y el día a día', 'Preguntar por el proceso de despliegue', 'Mencionar mi experiencia liderando'],
    },
    {
        dir: 'reunion',
        name: 'Reunión de trabajo',
        extra: 'Prioriza acuerdos previos y compromisos pendientes. Avísame si se repite algo ya cerrado.',
        checklist: ['Confirmar los siguientes pasos', 'Anotar quién hace qué'],
    },
    {
        dir: 'cliente',
        name: 'Llamada con cliente',
        extra: 'Prioriza el historial de la cuenta y lo prometido en llamadas anteriores.',
        checklist: ['Confirmar plazos', 'Preguntar por bloqueos'],
    },
];

function bootstrapProfiles({ configDir, legacyCustomPrompt = '' }) {
    const profilesDir = getProfilesDir(configDir);
    fs.mkdirSync(profilesDir, { recursive: true });

    const creados = [];

    for (const plantilla of PERFILES_POR_DEFECTO) {
        const dir = path.join(profilesDir, plantilla.dir);
        if (fs.existsSync(path.join(dir, 'profile.md'))) continue;

        fs.mkdirSync(path.join(dir, 'context'), { recursive: true });

        const frontmatter = ['---', `name: ${plantilla.name}`, 'confidential: false', '---', ''].join('\n');
        fs.writeFileSync(path.join(dir, 'profile.md'), `${frontmatter}\n${INSTRUCCIONES_BASE}\n\n${plantilla.extra}\n`);
        fs.writeFileSync(path.join(dir, 'checklist.md'), plantilla.checklist.map(t => `- ${t}`).join('\n') + '\n');

        // Conservamos el contexto que el usuario ya tenía escrito en el textarea antiguo.
        const legacy = (legacyCustomPrompt || '').trim();
        if (legacy) {
            fs.writeFileSync(path.join(dir, 'context', 'migrado.md'), `${legacy}\n`);
        }

        creados.push(plantilla.dir);
    }

    return creados;
}

module.exports = { bootstrapProfiles, INSTRUCCIONES_BASE, PERFILES_POR_DEFECTO };
