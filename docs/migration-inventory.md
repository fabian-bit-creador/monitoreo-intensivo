# Inventario de migración

Fecha de auditoría: 15 de agosto de 2026

Referencia: Site público `Monitoreo PI`, versión 5

Objetivo: preservar la experiencia visual y funcional antes de independizarla de ChatGPT Work.

## Alcance observado

La aplicación implementa monitoreo intensivo de la práctica independiente. El docente recorre la sala hasta tres veces y registra por estudiante uno de tres códigos:

- `I`: en instrucciones; todavía no inicia o requiere reorientación.
- `R`: en revisión; producto en avance, acompañado de 25 %, 50 %, 70 % o 90 %.
- `C`: correcto; criterios de éxito comprobados.

También distingue estudiantes ausentes y presentes sin registro. El resultado es descriptivo y no equivale a una calificación.

## Pantallas y navegación

| Vista | Contenido principal | Acciones observadas |
| --- | --- | --- |
| Monitorear | Encabezado de sesión, cinco KPI, selector de recorrido, búsqueda, mapa/lista de estudiantes, pizarra y estudiantes sin puesto | Iniciar/finalizar clase, cambiar recorrido, registrar I/R/C, anotar, marcar asistencia, mover puestos |
| Informe | KPI finales, distribución I/R/C, lectura pedagógica, tendencia histórica, recomendaciones y tabla priorizada | Exportar PDF/Excel y reabrir sesión |
| Historial | Tarjetas longitudinales por docente y curso con estado, fecha, módulo, plantilla, cobertura, C y R | Abrir una sesión o iniciar otra |
| Configuración | Equipo piloto, cursos, estado operativo/pendiente, alcance actual y advertencia de privacidad | Cambiar el docente activo |

La navegación de escritorio se presenta en una barra lateral. Bajo 900 px se reemplaza por una barra fija inferior con cuatro opciones. Los selectores de docente y curso pasan a una tarjeta contextual dentro del contenido.

## Componentes visuales

- Barra superior fija con marca, estado de conexión, importar curso y nueva clase.
- Barra lateral fija con contexto, navegación, leyenda I/R/C y advertencia de privacidad.
- Tarjetas con radio de 18 px, borde gris azulado y sombra azul suave.
- KPI con acento lateral según categoría.
- Mapa de seis columnas, pasillos diferenciados y pizarra al frente.
- Tarjetas de estudiante coloreadas por estado y con número, nombre, código, porcentaje y recorrido.
- Hoja/modal de registro con acciones grandes I, R y C; en celular aparece desde la parte inferior.
- Tablas, gráfico de líneas y barra apilada para informes.
- Estados vacíos para cursos pendientes y sesiones no iniciadas.

## Sistema visual preservado

| Token | Valor original | Uso |
| --- | --- | --- |
| Azul principal | `#17375E` | Marca, títulos, botones y selección |
| Azul oscuro | `#0F2948` | Hover y contraste |
| Turquesa | `#1E8E89` | Acentos pedagógicos y acciones de cierre |
| Fondo | `#F4F6FA` | Lienzo general |
| I | `#F59E0B` | Instrucciones |
| R | `#3B82F6` | Revisión |
| C | `#18A06A` | Correcto |
| Tipografía | Arial, Helvetica, sans-serif | Interfaz completa |

## Comportamiento responsive observado

- Escritorio: barra lateral de 238 px y contenido de hasta 1500 px.
- Menos de 900 px: se oculta la barra lateral, aparecen contexto móvil y navegación inferior.
- Menos de 680 px: KPI en dos columnas, herramientas en varias filas, modales como hoja inferior y tarjetas analíticas en una columna.
- El mapa mantiene su geometría mediante desplazamiento horizontal; no se comprimen los puestos hasta volverlos ilegibles.
- La exportación impresa oculta navegación y controles.

## Lógica funcional existente

- Selección separada de docente y curso.
- Cursos operativos solo cuando poseen nómina y plantilla.
- Sesiones activas/cerradas con objetivo, módulo, criterios de éxito, fecha, docente y plantilla.
- Tres recorridos y múltiples observaciones por estudiante.
- Última observación como estado vigente.
- Cobertura, tasa C, promedio de avance R, ausencias y progresión I → R/C.
- Priorización automática: sin registro, I o R bajo 50 %.
- Recomendaciones pedagógicas basadas en cobertura, I repetida y avance promedio.
- Importación de nómina desde Excel/CSV sin RUT ni correos.
- Movimiento e intercambio de puestos por plantilla.
- Exportación de informe a PDF y Excel.

## Elementos que no se trasladan

- La base D1 administrada por ChatGPT Sites/Cloudflare.
- Los encabezados de identidad de ChatGPT Work.
- Los registros reales almacenados en el Site y cualquier nombre real de estudiante.
- Scripts de compilación exclusivos de Sites/Vinext.

La réplica usa datos inequívocamente ficticios y conserva la misma forma de datos para facilitar una futura integración con Supabase.
