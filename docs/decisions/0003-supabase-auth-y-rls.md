# ADR 0003: Supabase Auth y PostgreSQL con RLS como fuente de datos compartida

- Estado: propuesta, pendiente de aprobación de Fabián o Diego
- Fecha: 2026-10-11
- Depende de: ADR 0002

## Contexto

- El Site original guardaba todo en Cloudflare D1 y el selector de docente identificaba, pero no
  autenticaba: cualquiera con el enlace podía actuar como cualquier docente.
- La migración guarda en `localStorage`: no hay continuidad entre dispositivos.
- Infraestructura revisada el 11 de octubre, solo en modo lectura:
  - Vercel: proyecto conectado, **sin variables de entorno**.
  - Supabase: un proyecto, `monitoreo-intensivo` (sa-east-1, Postgres 17), **pausado** y sin
    tablas propias.
  - Cloudflare: la cuenta conectada **no tiene bases D1**. La D1 del Site pertenece a ChatGPT
    Sites, no a esa cuenta, así que Cloudflare no aporta acceso a los datos ni se necesita.

## Decisión

### Plataforma

- **Next.js en Vercel**, como hoy.
- **Supabase Auth** identifica a cada usuario. La autoría de clases y observaciones sale de
  `auth.uid()`, nunca de un selector.
- **PostgreSQL de Supabase** es la fuente de verdad. Las tablas tienen **RLS activado** y los
  cambios entran por funciones transaccionales (ADR 0002).
- El navegador usa **solo la clave publicable**. La clave `service_role` no se usa en la
  aplicación ni se guarda en Vercel. Las migraciones las aplica, con su propia sesión, quien tenga
  acceso al proyecto.
- Se agrega solo `@supabase/supabase-js`. La aplicación sigue siendo una página cliente, así que
  no hace falta `@supabase/ssr` en esta etapa.

### Usuarios y permisos (primera versión)

El rol define qué se **gestiona o consulta**. Qué cursos se **enseñan** lo define la asignación
docente. Así, una administradora puede también dictar clases si se asigna a un curso.

| Recurso | Docente | Coordinación | Administración |
|---|---|---|---|
| Miembros del establecimiento | Ve su propio perfil | Ve | Invita, cambia rol, desactiva |
| Cursos y asignaciones docentes | Ve sus cursos asignados | Ve todos | Crea, edita, archiva, asigna |
| Nómina (estudiantes y matrículas) | Ve la de sus cursos | Ve | Importa, actualiza, archiva |
| Plantillas de sala | Ve las de sus cursos | Ve | Crea y edita |
| Puestos | Mueve en sus cursos | Ve | Mueve |
| Clases, asistencia y observaciones | Crea y opera **las propias**, en sus cursos | Solo lectura | Solo lectura |
| Informes e historial | Los propios | Todo el establecimiento | Todo el establecimiento |

- Los estudiantes son registros de la nómina, sin cuenta.
- Nadie ve ni modifica datos de otro establecimiento: cada tabla lleva `school_id` y las claves
  foráneas compuestas impiden mezclar filas de establecimientos distintos.
- Una persona que inicia sesión **sin membresía no ve nada**.
- Ingreso de docentes por **invitación**: administración registra correo y rol; al iniciar sesión
  con ese correo verificado, la membresía se activa. No requiere claves administrativas.
- El primer establecimiento y su primera administración se crean con una función que solo puede
  ejecutar el dueño del proyecto desde el editor SQL.

### Modelo de datos

Identificadores UUID. Las filas migradas guardan además su identificador anterior en
`legacy_id`, lo que hace repetible y trazable la migración.

| Tabla | Contenido | Restricciones clave |
|---|---|---|
| `schools` | Establecimientos | |
| `profiles` | Perfil de cada usuario de Auth | 1 a 1 con `auth.users` |
| `school_memberships` | Usuario, establecimiento y rol | Rol `admin`, `coordinator` o `teacher` |
| `school_invitations` | Invitaciones pendientes por correo | Una pendiente por correo y establecimiento |
| `courses` | Cursos por año | Nombre único por establecimiento y año entre los no archivados |
| `course_teachers` | Asignaciones docentes | El docente debe ser miembro del establecimiento |
| `students` | Personas de la nómina | |
| `enrollments` | Matrículas: curso, estudiante, N° de lista, estado | N° único por curso entre las activas |
| `room_templates`, `room_slots` | Plantillas y puestos disponibles | Pasillos = puestos inexistentes |
| `seat_assignments` | Puesto vigente de cada estudiante por plantilla | Un estudiante por puesto, verificado al final de la transacción para permitir intercambios |
| `class_sessions` | Clases con objetivo, módulo y criterios de éxito | `teacher_id = auth.uid()` al crear; versión para cerrar y reabrir |
| `session_students` | Nómina de la clase y asistencia | Fotografía de N°, nombre y puesto al iniciar |
| `observations` | Registros I/R/C, solo inserción | Clave foránea a `session_students`; R entre 1 y 99, I = 0, C = 100 |
| `observation_voids` | Anulaciones trazables | Una por observación |
| `client_operations` | Operaciones ya aplicadas | Evita repetir cierres y reaperturas |

**Historia:** la fotografía de `session_students` hace que cambiar una nómina, un N° de lista o
la distribución actual no altere informes anteriores. Archivar cursos o estudiantes marca
`archived_at` o el estado de la matrícula; no borra clases. Los usuarios no tienen permiso
`DELETE` sobre clases, asistencia ni observaciones.

### Desarrollo y producción separados

| Entorno | Proyecto Supabase | Datos | Vercel |
|---|---|---|---|
| Desarrollo y Preview | Uno nuevo, `monitoreo-intensivo-dev` | Solo ficticios | Preview y local |
| Producción | `monitoreo-intensivo`, hoy pausado | Reales, con autorización | Production |

- Migraciones versionadas en `supabase/migrations/`.
- Las políticas se prueban en un PostgreSQL local con una emulación mínima del esquema `auth` de
  Supabase, y también en la CI. Incluyen accesos permitidos y denegados.
- Ninguna migración se aplica sobre producción sin autorización explícita.

### Migración de los registros del Site

1. El docente descarga el JSON del Site desde su navegador. Esos datos no pasan por el
   repositorio ni por la CI.
2. Puede restaurarlo de inmediato en modo local (ADR 0002) para seguir trabajando con su historial.
3. En la etapa 3, administración lo carga en producción con una función restringida a su rol que
   asigna UUID, guarda `legacy_id`, conserva fechas y horas, y vincula las clases al usuario
   autenticado que corresponda.
4. Se verifica que los conteos por tabla y los indicadores de cada clase coincidan antes y después.

## Consecuencias

- La autoría deja de ser manipulable y cada dispositivo ve los mismos datos confirmados.
- La seguridad depende de RLS: toda tabla nueva necesita políticas y pruebas de acceso permitido y
  denegado antes de fusionarse.
- El modo local se conserva para demostraciones y desarrollo sin cuenta.
- Requiere configuración externa que no puede hacerse desde el código (ver
  `docs/plan-supabase.md`).

## Riesgos y condiciones

- **Correo de acceso:** el servidor de correo integrado de Supabase solo envía a miembros del
  equipo del proyecto y con límites bajos. Para invitar docentes hace falta SMTP propio o ingreso
  con Google.
- **Plan gratuito:** pausa proyectos con poca actividad semanal y no permite descargar respaldos.
  Para datos reales conviene el plan Pro o, como mínimo, respaldos periódicos desde la aplicación.

## Alternativas descartadas

- **Guardar el estado completo como JSON en una tabla.** Dos dispositivos se sobrescribirían.
- **Cloudflare D1.** La base del Site no está en la cuenta conectada, y Supabase ya resuelve
  autenticación y RLS en un solo servicio.
- **Rutas de API de Next.js con la clave `service_role`.** Concentra todos los permisos en el
  servidor y saltarse RLS por error expondría a todos los establecimientos.
