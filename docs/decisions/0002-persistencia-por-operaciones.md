# ADR 0002: persistencia por operaciones, cronología explícita y resguardo local

- Estado: propuesta, pendiente de aprobación de Fabián o Diego
- Fecha: 2026-10-11
- Complementa: ADR 0001. Se aplica primero al modo local y prepara el ADR 0003.

## Contexto

La aplicación guarda el **estado completo** en `localStorage` después de cada acción. La revisión
del 11 de octubre confirmó en el código cuatro defectos de integridad:

| Defecto | Dónde | Efecto |
|---|---|---|
| Datos reemplazados por la demostración | `LocalStorageMonitoringRepository.load()` | Si la versión guardada no coincide o el JSON no se puede leer, se escribe la demostración encima |
| Dos pestañas se sobrescriben | `useMonitoringStore.apply()` | Cada pestaña aplica el cambio sobre su copia en memoria y guarda todo; la última borra lo de la otra |
| Estado vigente por posición | `latestObservations()` y el cálculo de progresión | La última observación es la última del arreglo, no la más reciente |
| Registros fuera de la nómina | `addObservation()` | Acepta estudiantes que no están en la fotografía de la clase, y esos registros no cuentan |

El Site original ya trabajaba con acciones con nombre (`createSession`, `addObservation`,
`setPresence`, `moveStudent`, `closeSession`, `reopenSession`, `importStudents`). La migración
las convirtió en guardados del estado completo. Para compartir datos entre dispositivos hace falta
volver a operaciones concretas: un servidor no puede aceptar estados completos de dos
dispositivos sin que uno borre al otro.

## Decisión

### 1. Las vistas emiten comandos, no estados

El contrato `MonitoringRepository` pasa de `save(state)` a `execute(command)`. Un comando nombra
una operación del docente:

| Comando | Operación |
|---|---|
| `createSession` | Iniciar clase |
| `addObservation` | Registrar observación |
| `setPresence` | Modificar asistencia |
| `setSessionStatus` | Cerrar o reabrir clase |
| `moveStudent` | Mover o intercambiar puestos |
| `importStudents` | Cargar nómina |

Las reglas siguen siendo funciones puras de `monitoring-service.ts`. Cada repositorio decide
cómo aplicar el comando: el local, sobre el estado guardado; el de Supabase, con una función de
Postgres en una transacción (ADR 0003).

### 2. Modo local: cada comando se aplica sobre lo último guardado

- El comando se aplica sobre el estado **leído del almacenamiento en ese momento**, no sobre la
  copia en memoria de la pestaña. Si otra pestaña guardó antes, su cambio se conserva.
- La lectura, la aplicación y la escritura ocurren dentro de un bloqueo entre pestañas
  (Web Locks API) cuando el navegador lo ofrece.
- Las demás pestañas se actualizan con el evento `storage`.
- Cada escritura incrementa un número de revisión.

**Límite conocido:** `localStorage` no es transaccional. Esta medida elimina la sobrescritura del
estado completo, pero no garantiza el orden de dos escrituras simultáneas en el mismo
milisegundo. La garantía fuerte llega con el servidor (etapa 3) y la cola en IndexedDB (etapa 5).

### 3. Modo servidor: operaciones idempotentes

En la etapa 3 cada comando será una función de Postgres que se ejecuta en una transacción:

- Lo que se crea (clases, observaciones) lleva un **identificador generado en el cliente**
  (UUID). Si la red falla y la operación se reintenta, el servidor devuelve lo ya registrado en
  vez de duplicarlo.
- Cerrar y reabrir llevan un identificador de operación y la versión esperada de la clase. Si otro
  dispositivo la cambió, el servidor responde con un conflicto en vez de sobrescribir.
- Las observaciones son de **solo inserción**. Deshacer agrega una anulación trazable (quién y
  cuándo); el registro original se conserva.

### 4. Cronología explícita

El estado vigente de un estudiante es su observación **más reciente según la hora de registro**
(`createdAt` en modo local, `observed_at` en el servidor), con desempate por un identificador
creciente. Nunca por la posición en un arreglo ni por el orden de llegada.

### 5. Pertenencia a la clase

Solo se registra a estudiantes de la **nómina fotografiada** de la clase (`sessionStudents`), y
solo en clases activas. La asistencia sigue la misma regla. En el servidor lo garantizará también
una clave foránea compuesta.

### 6. Resguardo: nunca reemplazar datos locales de forma automática

| Situación al abrir | Comportamiento |
|---|---|
| No hay datos | Se cargan los datos de demostración, como hoy |
| Datos válidos de esta versión | Se abren |
| Datos de una versión **anterior** con migración conocida | Se guarda una copia y luego se migran |
| Datos de una versión **más nueva** | No se escriben; se pide recargar la página |
| Datos ilegibles | No se escriben; se ofrece descargarlos y empezar de nuevo solo si el docente lo elige |

Además:

- **Descargar respaldo** entrega un JSON con el estado completo.
- **Restaurar respaldo** muestra una vista previa con conteos antes de reemplazar, ofrece descargar
  primero los datos actuales y guarda una copia local de lo reemplazado. Acepta también el JSON
  que entrega el Site anterior, que tiene la misma forma de datos.
- Antes de cambiar de modo de almacenamiento (local → servidor) se ofrecerá el mismo respaldo.

### 7. Estados de guardado visibles

| Estado | Cuándo se muestra |
|---|---|
| Guardado en este navegador | Modo local, después de escribir sin error |
| Pendiente | Modo servidor, cambio enviado sin confirmación |
| Sincronizado | Solo después de la confirmación del servidor |
| Error o conflicto | Fallo de escritura, rechazo o conflicto que requiere revisión |

Nunca se muestra «Sincronizado» antes de la confirmación del servidor.

### 8. Sin conexión: etapa explícita

El trabajo sin conexión (cola persistente en IndexedDB, reintentos y resolución de conflictos) es
la etapa 5. No se anuncia hasta comprobarlo.

## Consecuencias

- Las vistas dejan de conocer el formato de almacenamiento: el mismo comando funciona en local y
  en Supabase.
- Una pestaña antigua deja de borrar el trabajo de otra. Una versión más nueva de los datos queda
  protegida frente a una pestaña con la aplicación desactualizada.
- Los identificadores de clase y observación son numéricos en modo local. Pasarán a UUID en la
  etapa 3, con una migración local que conserve los existentes.
- Hay más pruebas: repositorio con almacenamiento simulado, varias pestañas, carga de versiones y
  restauración.

## Alternativas descartadas

- **Guardar el JSON completo en Supabase.** Dos dispositivos se sobrescribirían igual que dos
  pestañas.
- **Pasar ya a IndexedDB.** Tiene transacciones reales, pero cambia el modo de almacenamiento sin
  servidor todavía. Queda para la cola sin conexión de la etapa 5.
- **Fusionar estados completos campo por campo.** Es frágil y no expresa la intención del docente;
  los comandos sí.
