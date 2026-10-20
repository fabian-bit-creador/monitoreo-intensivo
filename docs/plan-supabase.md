# Plan: cuentas, permisos y datos compartidos

Fecha: 2026-10-11 · Decisiones: ADR 0002 y ADR 0003

Cada etapa se entrega en ramas y Pull Requests pequeños, con `npm run check` en verde y sin
fusionar a `main` sin la aprobación de Fabián o Diego.

## Etapa 1 — Integridad y resguardo (sin servidor)

| Entrega | Contenido |
|---|---|
| 1a. Resguardo local | Nunca reemplazar datos guardados; respaldo descargable y restauración con vista previa (acepta el JSON del Site anterior); comandos en vez de guardar el estado completo; pestañas que no se sobrescriben; cronología explícita; solo registrar a estudiantes de la nómina de la clase; estado de guardado honesto |
| 1b. Nómina segura | Elegir la hoja correcta y no tomar frases auxiliares como nombres; conservar homónimos con aviso; vista previa con nombre del curso dentro del modal; actualizar la nómina de un curso existente sin duplicar alumnos ni perder identidades; fotografía de N° y puesto en cada clase |

Pruebas: dominio y repositorio con almacenamiento simulado, dos pestañas, carga de versiones,
restauración, importación, y verificación en navegador de escritorio y celular.

## Etapa 2 — Esquema, autenticación y permisos

- Migraciones SQL con las tablas del ADR 0003, restricciones relacionales y políticas RLS.
- Funciones auxiliares de permisos y bootstrap del primer establecimiento.
- Ingreso con código por correo; invitaciones y asignación de cursos para administración.
- Pruebas en PostgreSQL local y en la CI: accesos permitidos y denegados por rol, por curso y
  entre establecimientos; autoría; ausencia de `DELETE` sobre la historia.

## Etapa 3 — Persistencia de clases y continuidad

- Repositorio de Supabase que implementa los mismos comandos con funciones transaccionales:
  iniciar clase, registrar observación, modificar asistencia, cerrar y reabrir, mover puestos.
- Idempotencia con identificadores del cliente; conflictos visibles.
- Estados «Pendiente», «Sincronizado» y «Error o conflicto».
- Al ingresar desde otro dispositivo, el docente recupera sus cursos y clases confirmadas.
- Respaldo obligatorio antes de pasar de modo local a servidor.
- Migración de los registros del Site a producción, **solo con autorización explícita**.
- Pruebas de concurrencia (dos dispositivos), reintentos y preservación del historial.

## Etapa 4 — Uso en clase e informes

- Continuar la clase activa al ingresar y recordar el contexto del docente.
- Reutilizar una sesión anterior como plantilla (módulo, objetivo y criterios).
- Gestión de cursos desde el celular y distribución inicial asistida de puestos.
- Siguiente estudiante, filtro «sin observar» y deshacer como anulación trazable.
- Informes: hechos observados separados de sugerencias. Definiciones a revisar:

| Indicador | Hoy | Propuesta |
|---|---|---|
| Avance promedio | Promedio de quienes están en R, sin decirlo | Etiqueta «promedio de los N en R» |
| I repetida | Dos o más registros que terminan en I (cuenta R → I) | Repetición real acordada, por ejemplo I en dos recorridos consecutivos |
| Progresaron | Tuvo I y después R o C | Separar «tuvo algún avance» de «terminó mejor de lo que empezó» |
| Porcentajes | Algunos sin denominador | Siempre con «n de N» |
| Tendencia | Compara clases con actividades distintas | Se presenta como contexto, no como evidencia de aprendizaje |

I, R y C siguen siendo descripciones del trabajo observado, no calificaciones.

## Etapa 5 — Sin conexión

Cola persistente en IndexedDB, reintentos con espera creciente y resolución de conflictos. Se
anuncia solo después de comprobarla con red cortada en celular.

## Operaciones externas pendientes

Ninguna se ejecuta sin autorización de Fabián o Diego. Ninguna requiere compartir secretos por
chat.

| # | Operación | Dónde | Necesaria para |
|---|---|---|---|
| 1 | Descargar el JSON del Site anterior y guardarlo en un lugar privado | Navegador del docente | Restaurar el historial (etapa 1) y migrarlo (etapa 3) |
| 2 | Restringir el acceso al Site anterior una vez descargado | ChatGPT Sites | Proteger los datos reales que contiene |
| 3 | Hacer privado el repositorio y proteger `main` | GitHub | Seguridad general |
| 4 | Crear `monitoreo-intensivo-dev` en sa-east-1 | Supabase | Etapa 2 |
| 5 | Reanudar `monitoreo-intensivo` (producción) | Supabase | Etapa 3 |
| 6 | Elegir el ingreso: código por correo con SMTP propio, o Google | Supabase Auth | Invitar docentes que no son miembros del proyecto |
| 7 | Variables `NEXT_PUBLIC_DATA_MODE`, `NEXT_PUBLIC_SUPABASE_URL` y la clave publicable: Preview → desarrollo, Production → producción | Vercel | Etapas 2 y 3 |
| 8 | Agregar las URL de Vercel a las direcciones de redirección permitidas | Supabase Auth | Ingreso desde Preview y Production |
| 9 | Decidir plan gratuito o Pro para producción | Supabase | Evitar pausas y tener respaldos |
