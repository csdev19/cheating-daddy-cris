# Documentación — Asistente de memoria

Análisis, decisiones y diseño para convertir `cheating-daddy` de un teleprompter
de entrevistas en un **asistente personal de memoria** para reuniones y entrevistas.

Fecha del análisis: **2026-08-25**
Estado: **diseño auditado (D1–D20), plan enmendado y listo para ejecutar**

## Resumen ejecutivo

La app hoy es un teleprompter: escucha al entrevistador y te dicta, palabra por
palabra, qué responder. El objetivo es lo contrario — que te recuerde **lo que tú
ya sabes pero se te olvida** en el momento.

Cuatro capacidades objetivo:

1. **Material previo** — tus notas, CV, cifras y decisiones afloran cuando aplican.
2. **Hilo de la reunión** — qué se dijo, quién lo dijo, qué quedó pendiente.
3. **Checklist activo** — lo que no debes olvidar decir o preguntar.
4. **Lookup al vuelo** — un concepto o un nombre que acaba de salir.

El cambio de fondo no es añadir funciones, es **construir un hilo único de contexto**
que fusione lo que la app oye, lo que ve y lo que sabe de ti. Hoy son tres cosas
desconectadas, y por eso la app se siente ciega y sin memoria.

Principio rector: **reactivo**. La app escucha y acumula contexto en silencio, y
solo responde cuando pulsas un atajo. Cero ruido durante la reunión, y de paso
deja de quemar llamadas al modelo en cada turno.

## Índice

| Documento                                              | Contenido                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| [01-estado-actual.md](01-estado-actual.md)             | Qué hace el repo hoy, con hallazgos y referencias a código       |
| [02-diseno.md](02-diseno.md)                           | El diseño objetivo: núcleo de contexto, perfiles, captura        |
| [03-decisiones.md](03-decisiones.md)                   | Registro de decisiones y por qué se tomaron                      |
| [04-evaluaciones.md](04-evaluaciones.md)               | Librerías y modelos evaluados, con datos y precios               |
| [05-plan-implementacion.md](05-plan-implementacion.md) | Plan de implementación: 15 tareas, 58 tests, enmiendas aplicadas |
| [06-auditoria.md](06-auditoria.md)                     | Auditoría: agujeros, riesgos, mejoras y enmiendas al plan        |

## Cómo leerlo

Si vas a implementar, lee `02-diseno.md` y consulta `03-decisiones.md` cuando algo
te parezca arbitrario — casi siempre hay una razón registrada, incluidas las
decisiones que se revirtieron a mitad del análisis.

Si vas a cuestionar el diseño, empieza por `01-estado-actual.md`: los hallazgos
ahí son la evidencia sobre la que se apoya todo lo demás.
