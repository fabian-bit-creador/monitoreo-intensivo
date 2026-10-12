# Activar Supabase en producción

**Estado: preparada, no activada.** Producción sigue en modo local hasta que Fabián o Diego lo
autoricen. Activarla no aplica migraciones ni mueve datos: solo cambia una variable y redespliega.

## Estado verificado (12-10-2026)

- **Esquema:** el proyecto `kpgtydpzslxkhwhbjkak` tiene exactamente lo que definen las cuatro
  migraciones de `supabase/migrations`. Se compararon funciones (cuerpo, `security definer`,
  `search_path`, permisos de `anon` y `authenticated`), columnas, políticas, disparador, RLS,
  permisos de tabla, índices y restricciones contra una base construida desde el repositorio.
  El historial de migraciones de Supabase está vacío porque se aplicaron desde el editor SQL.
- **Extra fuera del repositorio:** una tabla `public.db` (`id`, `created_at`, comentario «M.I»)
  creada desde el panel. Tiene RLS y ninguna política: la API no la puede leer ni escribir.
  Borrarla o no es decisión de Fabián.
- **Vista previa probada con datos ficticios** (PR #15):
  - ingreso, crear curso, iniciar clase, observaciones y cierre;
  - recuperación desde otro dispositivo (celular) y aislamiento entre dos cuentas, en la app y
    en la API;
  - corte de red justo después de guardar y relectura fallida, sin duplicados.
- **Cuentas de prueba:** `docente.prueba.a@…` y `docente.prueba.b@monitoreo-intensivo.invalid`.
  El dominio `.invalid` nunca recibe correo; la contraseña no está en el repositorio. La cuenta A
  tiene cuatro cursos ficticios «Curso ficticio E2E …».

## Decisión antes de activar: separar desarrollo y producción

Hoy las vistas previas y producción usarían **el mismo proyecto Supabase**: lo que se pruebe en
una vista previa queda en la base de producción. Opciones:

1. **Proyecto aparte para producción (recomendado).** El plan Free permite dos proyectos activos.
   Se crea el proyecto, se aplican las cuatro migraciones (flujo «Migraciones de Supabase» o
   editor SQL), se configuran Auth y las variables de Production en Vercel con su URL y clave
   publicable. El proyecto actual queda para vistas previas, con sus cuentas de prueba.
2. **Un solo proyecto.** Antes de activar hay que retirar las cuentas de prueba. La cuenta B se
   puede borrar desde el panel. La cuenta A no, mientras tenga clases: la base no borra clases
   ni cursos en cascada, para no perder historia. Retirarla requiere un borrado explícito por SQL,
   que necesita autorización aparte.

## Pasos para activar (cuando se autorice)

1. **Supabase → Authentication → URL Configuration:**
   - Site URL: el dominio de producción.
   - Redirect URLs: el dominio de producción y, si se usa Google en vistas previas,
     `https://monitoreo-intensivo-*-muni-app.vercel.app/**`.
2. **Vercel → Settings → Environment Variables → Production:**
   - agregar `NEXT_PUBLIC_DATA_MODE=supabase`;
   - revisar que `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` apunten al
     proyecto elegido. Hoy las agregó la integración y apuntan a `kpgtydpzslxkhwhbjkak`.
3. **Redesplegar producción.** Next.js incorpora las variables al compilar.
4. **Comprobar:** ingreso, «Mi espacio», crear un curso de prueba y cerrar sesión. La barra debe
   decir «Sincronizado».

**Volver atrás:** quitar `NEXT_PUBLIC_DATA_MODE` de Production y redesplegar. La app vuelve al modo
local y cada navegador encuentra sus datos locales intactos, porque nunca se borraron.

## Qué ve quien ya tiene datos locales

1. Al abrir la app ve el ingreso. Bajo el formulario aparece **«Datos guardados sin cuenta»**, con
   un resumen («Hay N cursos, N clases y N observaciones, guardados por última vez el …») y el
   botón **«Descargar datos de este navegador»**.
2. Esos datos **no se borran ni se suben**. Siguen en ese navegador, sin cambios. El archivo
   descargado es un respaldo que se puede restaurar en modo local.
3. Al ingresar, su cuenta empieza vacía («Mi espacio»): los cursos locales no aparecen en la
   cuenta. En Configuración sigue disponible la misma tarjeta para descargarlos.
4. Quien solo vio la demostración sin cambiarla no ve ningún aviso.

## Requisitos, por separado

| Requisito | ¿Para qué? | ¿Necesario para activar? |
|---|---|---|
| `NEXT_PUBLIC_DATA_MODE=supabase` en Production y redesplegar | Activar cuentas y datos en Supabase | **Sí** |
| Site URL y Redirect URLs en Supabase | Enlaces y redirecciones de Auth hacia el dominio correcto | **Sí** |
| Proveedor Google en Supabase (cliente OAuth de Google) | Solo si se ofrece «Continuar con Google». Además permite que un docente cree su cuenta solo | Solo si se elige ese ingreso. Sin Google, las cuentas se crean en el panel (Authentication → Add user → Auto Confirm) o por invitación de un establecimiento |
| Secrets de GitHub (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, variable `SUPABASE_PROJECT_REF`) | Aplicar **futuras** migraciones con el flujo «Migraciones de Supabase», sin pegar SQL | No: el esquema actual ya está aplicado y verificado. Si se crea un proyecto aparte, sirven para instalarlo |

## Protección de contraseñas disponible (plan Free)

En Authentication → Providers → Email:

- **Largo mínimo:** el valor por defecto es 6; se recomienda 10 o más.
- **Caracteres obligatorios:** letras y dígitos, o además mayúsculas, minúsculas y símbolos.
- **Contraseñas filtradas (HaveIBeenPwned):** solo en el plan Pro o superior; **no está disponible**
  en este proyecto. El aviso del asesor de seguridad seguirá apareciendo mientras el plan sea Free.

Si se endurecen los requisitos, las cuentas existentes pueden seguir ingresando. Según la
documentación de Supabase, el ingreso informa que la contraseña es débil y conviene cambiarla.
