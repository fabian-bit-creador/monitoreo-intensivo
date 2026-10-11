# ADR 0004: espacios personales, ingreso con Google y salas configurables

- Estado: aceptada por Fabián (11-10-2026). Implementación en la rama `feat/espacios-y-salas`.
- Complementa: ADR 0003 (Supabase Auth y RLS).

## Contexto

Con ADR 0003, solo entra quien recibe una invitación de un establecimiento, los cursos se
crean importando un Excel y todas las salas son una grilla fija de 7 × 6. Fabián pidió:

1. Que un docente pueda usar la aplicación por su cuenta, sin que un establecimiento lo
   habilite, y que además pueda trabajar en los cursos de un colegio que lo invite.
2. Crear cursos dentro de la plataforma.
3. Elegir la forma de la sala: sala en filas, laboratorio o trabajo grupal.

Decisiones tomadas por Fabián: «Espacio personal + colegios», «Ingreso con Google» y salas
«en filas», «laboratorio» y «trabajo grupal».

## Decisión

### Espacios

- Un **espacio** es una fila de `schools` con `kind`:
  - `personal`: uno por persona, con `owner_id`.
  - `institution`: un establecimiento, como hasta ahora.
- Al crearse un usuario, el disparador de perfiles crea su espacio personal («Mi espacio») y lo
  deja como administración de ese espacio. Así, quien entra por primera vez puede crear cursos
  de inmediato.
- Los permisos y la RLS no cambian: un espacio personal es un establecimiento con un solo
  miembro. Nadie ve el espacio de otra persona.
- Las invitaciones a establecimientos siguen igual. Quien pertenece a varios espacios ve sus
  cursos agrupados por espacio.

### Ingreso con Google

- Botón «Continuar con Google» mediante Supabase Auth (OAuth con PKCE). Correo y contraseña
  siguen disponibles para las cuentas que crea administración.
- El botón aparece solo si el proveedor está activo en Supabase: la app lo consulta en
  `/auth/v1/settings`.
- Configuración que hace el dueño del proyecto; las credenciales nunca pasan por el
  repositorio:
  - credencial OAuth en Google Cloud;
  - el proveedor Google en Supabase;
  - las URL de retorno autorizadas.
- Abrir el registro significa que cualquiera con Google puede crear una cuenta. Solo obtiene un
  espacio vacío; la RLS impide ver datos ajenos. Si se quisiera restringir, más adelante se
  puede limitar por dominio.

### Crear cursos en la plataforma

- «Nuevo curso» acepta tres fuentes de estudiantes: escribir o pegar la lista (una línea por
  estudiante, con N° opcional), subir un Excel/CSV o descargar la plantilla.
- Todas pasan por la misma vista previa y validación. No hay otra ruta de importación.
- Después de los estudiantes se elige la sala.

### Salas configurables

- `room_templates.layout`:
  - `classic`: las salas existentes, que se dibujan como antes;
  - `rows`, `lab` y `groups`: las formas generadas;
  - `custom`: una forma ajustada a mano.
- `room_slots.group_label`: nombre del grupo o mesón al que pertenece un puesto («Grupo 3»,
  «Mesón 2»). Un pasillo es una celda sin puesto.
- Las formas se generan en la aplicación a partir de pocos parámetros:
  - **Sala en filas:** filas, puestos por fila y pasillo cada N puestos.
  - **Laboratorio:** mesones por fila, filas de mesones y puestos por lado. Cada mesón tiene
    estudiantes a ambos lados.
  - **Trabajo grupal:** cantidad de grupos, 4 o 6 integrantes y grupos por fila. Son islas
    separadas por pasillos.
- Después se puede tocar cualquier celda para quitar o agregar un puesto.
- Operaciones nuevas:
  - `create_room_template` agrega otra sala al curso; por ejemplo, la sala habitual y el
    laboratorio.
  - `update_room_layout` cambia la forma de una sala existente. Libera los puestos que dejan
    de existir y conserva las asignaciones que siguen siendo válidas.
- Lo pueden hacer quien enseña el curso y la administración del espacio, con la misma regla
  que para mover puestos.
- Las clases ya realizadas conservan su fotografía de N°, nombre y puesto (ADR 0003). Si se
  cambia la forma de una sala, el mapa de una clase pasada puede mostrar puestos que ya no
  existen; los informes no dependen del mapa.

### Migraciones

Las migraciones con `revoke` exigen una confirmación que el conector de Supabase no alcanza a
mostrar en las sesiones en la nube. Se agrega un flujo de GitHub Actions, «Aplicar
migraciones», que ejecuta `supabase db push` con un botón y usa *secrets* del repositorio.

## Consecuencias

- La app deja de depender de que un colegio dé de alta a cada docente.
- No cambia el modelo de permisos ni la RLS; se agregan dos columnas y dos operaciones,
  probadas con las pruebas de base de datos.
- El dueño del proyecto debe configurar Google, las URL de retorno y los *secrets* de GitHub.
  Hasta entonces, el botón de Google no aparece y todo lo demás funciona.
