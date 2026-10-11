# Supabase: operación

Decisiones en `docs/decisions/0002-persistencia-por-operaciones.md` y
`docs/decisions/0003-supabase-auth-y-rls.md`. Aquí están los pasos reproducibles.

## Qué hay en el repositorio

| Ruta | Contenido |
|---|---|
| `supabase/migrations/20261011120000_esquema_inicial.sql` | Tablas, restricciones, RLS de lectura y operaciones (`start_session`, `record_observation`, `set_attendance`, `set_session_status`, `move_seat`, `assign_seats_by_number`, `create_course`, `update_roster`, `invite_member`, `claim_invitations`, `assign_course_teacher`, `update_my_profile`, `bootstrap_school`) |
| `supabase/migrations/20261011120100_importar_respaldo.sql` | `import_legacy_state`: sube un respaldo o los datos del Site anterior, sin duplicar |
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

## Primer establecimiento y administración

El usuario debe existir en **Authentication → Users**. Desde el editor SQL:

```sql
select public.bootstrap_school('Nombre del establecimiento', '<id del usuario>');
```

La función no se puede llamar desde la aplicación.

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

## Subir los datos del Site anterior

1. Descarga el JSON del Site desde tu navegador y guárdalo en un lugar privado.
2. Ingresa con una cuenta de administración → Configuración → **Subir datos al servidor**.
3. La vista previa muestra lo que contiene. Las clases quedan a nombre de la cuenta que importa.
4. Se puede repetir sin duplicar: cada fila guarda su identificador anterior en `legacy_id`.

Los datos van directo del navegador a Supabase: no pasan por el repositorio ni por la CI.
