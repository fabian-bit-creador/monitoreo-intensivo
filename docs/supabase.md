# Supabase: operación

Decisiones en `docs/decisions/0002-persistencia-por-operaciones.md` y
`docs/decisions/0003-supabase-auth-y-rls.md`. Aquí están los pasos reproducibles.

## Qué hay en el repositorio

| Ruta | Contenido |
|---|---|
| `supabase/migrations/20261011120000_esquema_inicial.sql` | Tablas, restricciones, RLS de lectura y operaciones (`start_session`, `record_observation`, `set_attendance`, `set_session_status`, `move_seat`, `assign_seats_by_number`, `create_course`, `update_roster`, `invite_member`, `claim_invitations`, `assign_course_teacher`, `update_my_profile`, `bootstrap_school`) |
| `supabase/migrations/20261011120100_importar_respaldo.sql` | `import_legacy_state`: sube un respaldo o los datos del Site anterior, sin duplicar |
| `supabase/migrations/20261012120000_espacios_y_salas.sql` | Espacio personal por cuenta y salas con forma: `create_room_template`, `update_room_layout` (ADR 0004) |
| `supabase/migrations/20261012130000_asignar_por_grupo.sql` | «Asignar por N°» completa grupo por grupo (o mesón por mesón) |
| `.github/workflows/migraciones.yml` | Aplica las migraciones pendientes desde GitHub, con un botón |
| `supabase/tests/` | Emulación mínima de Supabase y pruebas de permisos, concurrencia, reintentos, historia e importación |

Reglas que no cambian:

- Los usuarios **solo leen** tablas, filtradas por RLS. Toda escritura pasa por una operación
  que verifica `auth.uid()`.
- No hay `DELETE` para usuarios: archivar cambia estados.
- La aplicación usa **solo la clave publicable**. La clave `service_role` no va en Vercel ni en
  el código.

## Pruebas locales de la base

Requieren un PostgreSQL 16 o 17 local, nunca el proyecto de Supabase:

```bash
# Por defecto usa postgres://postgres@127.0.0.1:54329/postgres
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:db
```

Cada ejecución crea una base temporal, aplica `supabase/tests/supabase-stub.sql` y todas las
migraciones en orden, y la borra al terminar. La CI hace lo mismo con PostgreSQL 17.

## Aplicar las migraciones en un proyecto

Solo con autorización explícita si el proyecto tiene datos reales.

1. Aplica cada archivo de `supabase/migrations/` en orden: con la CLI (`supabase db push`), con
   el editor SQL del panel o con el conector de Supabase.
2. Revisa **Advisors → Security** en el panel.

El conector de Supabase pide confirmar el SQL que quita permisos (`revoke`). Si el cliente no
muestra esa confirmación, la operación se cancela y no se aplica nada. En ese caso, pega los
archivos en el editor SQL entre `begin;` y `commit;`: se aplican completos o no se aplica nada.

## Aplicar migraciones desde GitHub

Configuración inicial, una sola vez. Las claves se pegan en los paneles de Supabase y GitHub:
nunca en el chat ni en el repositorio.

1. En Supabase, **Account → Access Tokens → Generate new token**. Ponle de nombre «GitHub
   migraciones».
2. En el proyecto, **Project Settings → Database**. Si no tienes la contraseña de la base,
   usa **Reset database password**. La aplicación no la usa.
3. En GitHub, **Settings → Secrets and variables → Actions**:
   - en *Secrets*: `SUPABASE_ACCESS_TOKEN` (el token) y `SUPABASE_DB_PASSWORD` (la contraseña);
   - en *Variables*: `SUPABASE_PROJECT_REF`, el identificador del proyecto, que es la parte
     inicial de su URL.
4. Si aplicaste migraciones a mano en el editor SQL, regístralas. Ve a **Actions →
   Migraciones de Supabase → Run workflow**, elige `marcar-aplicadas` y escribe sus versiones
   separadas por espacios.

Para aplicar cambios después de fusionar un PR con migraciones nuevas:

1. **Run workflow** con `ver`: muestra lo pendiente sin cambiar nada.
2. **Run workflow** con `aplicar`.

## Ingreso con Google

1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y configura
   **APIs & Services → OAuth consent screen**: tipo externo, nombre «Monitoreo PI» y tu correo
   de contacto.
2. En **Credentials → Create credentials → OAuth client ID**, elige *Web application*. Agrega
   esta URI de redirección autorizada:
   `https://<identificador del proyecto>.supabase.co/auth/v1/callback`.
3. En Supabase, **Authentication → Sign In / Providers → Google**: actívalo y pega el *Client
   ID* y el *Client Secret*.
4. En Supabase, **Authentication → URL Configuration**:
   - *Site URL*: `https://monitoreo-intensivo.vercel.app`.
   - *Redirect URLs*:
     - `https://monitoreo-intensivo.vercel.app/**`;
     - `https://monitoreo-intensivo-*-muni-app.vercel.app/**`, para las vistas previas;
     - `http://localhost:3000/**`.

El botón «Continuar con Google» aparece solo cuando el proveedor está activo. Quien entra por
primera vez recibe su espacio personal y puede crear cursos de inmediato. Nadie ve los
espacios de otras personas.

## Primer establecimiento y administración

Si el usuario ya existe en **Authentication → Users**, desde el editor SQL:

```sql
select public.bootstrap_school('Nombre del establecimiento', '<id del usuario>');
```

La función no se puede llamar desde la aplicación.

Si todavía no existe, crea el establecimiento con una invitación de administración:

```sql
with school as (
  insert into public.schools (name) values ('Nombre del establecimiento') returning id
)
insert into public.school_invitations (school_id, email, role)
select id, 'correo@dominio.cl', 'admin' from school;
```

Luego crea el usuario en **Authentication → Users → Add user → Create new user**, con ese correo,
una contraseña y **Auto Confirm User** marcado. La aplicación acepta la invitación al primer
inicio de sesión. Así la contraseña nunca pasa por otra persona.

## Agregar docentes

Mientras no exista la pantalla de equipo, administración lo hace con estas operaciones:

```sql
-- Desde el editor SQL, como dueño del proyecto:
insert into public.school_invitations (school_id, email, role)
values ('<id del establecimiento>', 'correo@dominio.cl', 'teacher');
```

Al iniciar sesión con ese correo verificado, la aplicación acepta la invitación
(`claim_invitations`). Después se asigna el curso:

```sql
insert into public.course_teachers (school_id, course_id, user_id)
values ('<id del establecimiento>', '<id del curso>', '<id del usuario>');
```

## Vercel

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_DATA_MODE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable (`sb_publishable_…`) |

Sin estas variables, la aplicación funciona en modo local, como antes.

Producción usa el proyecto oficial `kuqrulqfmpchmmjfellf`. `next.config.ts` incluye como respaldo
su URL y su clave publicable cuando `VERCEL_ENV=production`, de modo que el despliegue conserva
el inicio de sesión aunque falten las variables del panel. Las variables de Vercel siguen teniendo
prioridad y permiten cambiar el proyecto sin modificar el código. Nunca se incorpora una clave
`service_role`.

## Subir los datos del Site anterior

1. Descarga el JSON del Site desde tu navegador y guárdalo en un lugar privado.
2. Ingresa con una cuenta de administración → Configuración → **Subir datos al servidor**.
3. La vista previa muestra lo que contiene. Las clases quedan a nombre de la cuenta que importa.
4. Se puede repetir sin duplicar: cada fila guarda su identificador anterior en `legacy_id`.

Los datos van directo del navegador a Supabase: no pasan por el repositorio ni por la CI.

