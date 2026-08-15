# AGENTS.md

## Propósito

Monitoreo Intensivo permite a un docente observar la práctica independiente mediante tres recorridos y registrar I, R o C por estudiante. Esta rama representa la migración fiel del Site Monitoreo PI a un proyecto Next.js portable y mantenible por Fabián, Diego, Codex y Claude Code.

## Fuente de verdad

Para la versión 0.1, la referencia visual y funcional es `docs/migration-inventory.md`. No rediseñar, simplificar ni añadir funcionalidades importantes sin una decisión documentada y aprobada.

## Arquitectura

- `src/app`: entrada de Next.js y estilos globales.
- `src/components/layout`: estructura y navegación.
- `src/components/ui`: componentes genéricos.
- `src/features/monitoring`: estado, reglas, repositorios y vista principal.
- `src/features/students`: tarjetas, lista y registro.
- `src/features/reports`: informe y exportadores.
- `src/features/history`: historial longitudinal.
- `src/features/settings`: configuración.
- `src/features/courses` y `src/features/teachers`: componentes del dominio respectivo.
- `src/types/monitoring.ts`: modelos compartidos.
- `src/data/demo-state.ts`: única fuente de datos demostrativos.

## Reglas para modificar el código

1. Mantener TypeScript estricto y nombres descriptivos en inglés para símbolos técnicos; los textos de interfaz permanecen en español.
2. Evitar componentes monolíticos. Extraer una unidad cuando tenga una responsabilidad visual o de dominio propia.
3. Las vistas no deben escribir directamente en `localStorage`. Usar el store, el servicio de dominio y `MonitoringRepository`.
4. Las métricas y mutaciones deben permanecer independientes de React.
5. No añadir dependencias si una utilidad corta y clara resuelve el problema.
6. No incluir secretos, credenciales, tokens, datos reales de estudiantes ni archivos exportados.
7. No reintroducir D1, Vinext, Wrangler ni encabezados exclusivos de ChatGPT Work.
8. Para cambios de arquitectura, crear un ADR en `docs/decisions/` antes de implementar.
9. Ejecutar `npm run typecheck`, `npm run lint` y `npm run build` antes de entregar.

## Elementos visuales que deben preservarse

- Azul `#17375E`, turquesa `#1E8E89` y fondo `#F4F6FA`.
- Arial/Helvetica como tipografía de producto.
- Barra superior, sidebar de 238 px y navegación inferior móvil.
- Tarjetas, bordes, radios, sombras y densidad de información actuales.
- Colores semánticos: I ámbar, R azul y C verde.
- Mapa de seis columnas con desplazamiento horizontal en celular.
- Breakpoints principales de 900 px y 680 px.
- Hoja de registro inferior en celular.

No renombrar clases CSS visuales ni cambiar sus valores sin comparación antes/después.

## Funcionalidades que no deben romperse

- Cambio de docente y curso.
- Curso operativo solo con nómina y plantilla.
- Nueva sesión con fecha, módulo, objetivo, criterios y plantilla.
- Recorridos 1, 2 y 3.
- I = 0 %, C = 100 %, R = 25/50/70/90 %.
- Última observación como estado vigente.
- Asistencia, búsqueda, mapa/lista y movimiento/intercambio de puestos.
- Cobertura, I/R/C, avance promedio, progresión y ausencias.
- Priorización de sin registro, I y R menor a 50 %.
- Lectura pedagógica, recomendaciones, tendencia e historial por docente.
- Exportación PDF/Excel e importación Excel/CSV.
- Persistencia local entre recargas.

## Convenciones de Git

- Rama protegida: `main`.
- Ramas: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`.
- Commits: Conventional Commits en presente, por ejemplo `fix: corrige intercambio de puestos`.
- Todo cambio funcional se integra mediante Pull Request y revisión del otro socio.

## Checklist para agentes de IA

- Leer este archivo y el inventario antes de editar.
- Confirmar que el cambio está dentro del alcance pedido.
- Revisar `git diff` y no tocar trabajo ajeno no relacionado.
- Buscar datos personales y secretos antes del commit.
- Si cambia UI, verificar escritorio y celular y explicar la diferencia.
- Informar cualquier comportamiento que no se haya podido reproducir exactamente.
