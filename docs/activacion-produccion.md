# Supabase en producción

**Estado: activada el 19-10-2026** (PR #18, Diego). Producción usa el proyecto
`kuqrulqfmpchmmjfellf`, fijado en `next.config.ts` cuando `VERCEL_ENV=production`. Desde el commit
`95d42ce`, esa configuración **reemplaza** las variables del panel de Vercel: cambiar el proyecto de
producción requiere modificar el código.

## Proyectos en uso

| Proyecto | Uso | Esquema |
|---|---|---|
| `kuqrulqfmpchmmjfellf` | Producción | No verificado desde la cuenta de Supabase de esta sesión (está en otra cuenta) |
| `kpgtydpzslxkhwhbjkak` (piloto) | Vistas previas de cada PR (variables de Preview) | Cuatro migraciones verificadas el 12-10-2026; **falta** `20261018193145_cursos_personales_y_foco` |

Cada proyecto es independiente (su base, su Auth, sus claves): usar uno no afecta a los demás. El
plan Free permite dos proyectos activos por persona dueña o administradora, sumando sus
organizaciones; los pausados no cuentan.

### Consecuencias en las vistas previas

- Cargan y permiten registrar observaciones gracias a la consulta alternativa para columnas no
  migradas (`42703`), que corrige el PR #15.
- **No pueden crear cursos** ni usar estudiantes foco, archivar o editar cursos: el piloto no tiene
  esas operaciones (`PGRST202`). Se resuelve aplicando la migración `20261018193145` al piloto.

### Verificación pendiente en producción

Quien tenga acceso al proyecto `kuqrulqfmpchmmjfellf` debería comprobar que tiene las cinco
migraciones de `supabase/migrations`. La comparación de huellas usada con el piloto (funciones,
políticas, permisos, columnas, índices y restricciones) se puede repetir allí.

## Cuentas de prueba (solo en el piloto)

`docente.prueba.a@…` y `docente.prueba.b@monitoreo-intensivo.invalid`: dominio que nunca recibe
correo, contraseña fuera del repositorio. La cuenta A tiene cursos «Curso ficticio E2E …». No
existen en producción.

## Quien ya tenía datos locales

Activar Supabase no borra ni sube los datos del navegador (`monitoreo-intensivo:v1`); ningún código
de la app los elimina.

- **Con el PR #15:** al abrir la app ve, bajo el ingreso, **«Datos guardados sin cuenta»** con un
  resumen y «Descargar datos de este navegador». Al ingresar, su cuenta empieza vacía y la misma
  tarjeta sigue en Configuración. Quien solo vio la demostración no ve ningún aviso.
- **Hoy, sin el PR #15:** ve el ingreso sin aviso. Sus datos siguen en el navegador, pero no tiene
  dónde descargarlos mientras la app use Supabase.

**Volver atrás:** quitar el bloque de producción de `next.config.ts` (y `NEXT_PUBLIC_DATA_MODE` de
Vercel, si existe) y redesplegar. La app vuelve al modo local con los datos locales intactos.

## Requisitos, por separado

| Requisito | ¿Para qué? | ¿Necesario? |
|---|---|---|
| Site URL y Redirect URLs en el proyecto de producción | Enlaces y redirecciones de Auth hacia el dominio correcto | Sí |
| Proveedor Google (cliente OAuth de Google) | Solo si se ofrece «Continuar con Google»; además permite que un docente cree su cuenta solo | Solo si se elige ese ingreso. Sin Google, las cuentas se crean en el panel (Authentication → Add user → Auto Confirm) |
| Secrets de GitHub (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, variable `SUPABASE_PROJECT_REF`) | Aplicar **futuras** migraciones con el flujo «Migraciones de Supabase», sin pegar SQL | No para usar la app. Sirven para mantener al día el piloto y producción |

## Protección de contraseñas (plan Free)

En Authentication → Providers → Email de cada proyecto:

- **Largo mínimo:** el valor por defecto es 6; se recomienda 10 o más.
- **Caracteres obligatorios:** letras y dígitos, o además mayúsculas, minúsculas y símbolos.
- **Contraseñas filtradas (HaveIBeenPwned):** solo en el plan Pro o superior. No está disponible en
  la organización del piloto (Free). El plan del proyecto de producción depende de su cuenta.

Si se endurecen los requisitos, las cuentas existentes pueden seguir ingresando; según la
documentación de Supabase, el ingreso informa que la contraseña es débil y conviene cambiarla.

## Compilación sin caché de Turbopack

Desde Next.js 16.3, `next build` reutiliza una caché en disco que Vercel restaura entre
despliegues. Una vista previa se publicó con el CSS de la compilación anterior. `next.config.ts`
desactiva esa caché (`turbopackFileSystemCacheForBuild: false`).
