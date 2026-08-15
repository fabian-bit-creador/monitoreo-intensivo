# Monitoreo Intensivo

Aplicación web para registrar y analizar el avance de estudiantes durante la práctica independiente. Esta versión es una migración limpia e independiente del Site **Monitoreo PI**: conserva su diseño, navegación, mapa de sala, recorridos, códigos I/R/C, informes y responsive, pero funciona fuera de ChatGPT Work.

## Objetivo pedagógico

Monitoreo Intensivo ayuda al docente a recorrer la sala con una pauta común y obtener evidencia descriptiva para ajustar la enseñanza:

- `I` — en instrucciones: el estudiante todavía no inicia o necesita reorientación.
- `R` — en revisión: el producto está en avance, con 25 %, 50 %, 70 % o 90 %.
- `C` — correcto: los criterios de éxito fueron comprobados.

La herramienta distingue asistencia, cobertura y estudiantes sin observar. Sus análisis no son calificaciones; orientan la retroalimentación y la próxima intervención docente.

## Alcance de la versión 0.1

Incluye:

- mapa y lista de estudiantes;
- dos plantillas de espacio: sala habitual y taller empresarial;
- tres recorridos por sesión;
- registro I, R y C, porcentaje y observación breve;
- asistencia y movimiento/intercambio de puestos;
- resumen en vivo;
- informe automático, tendencias y priorización;
- historial separado por docente;
- importación de nómina desde Excel o CSV;
- exportación a PDF y Excel;
- navegación responsive para computador y celular;
- persistencia local en el navegador.

No incluye todavía autenticación, pagos, multi-colegio, inteligencia artificial, nuevas analíticas ni base de datos permanente.

## Tecnologías

- Next.js 16 con App Router
- React 19
- TypeScript estricto
- Tailwind CSS 4 y CSS de producto preservado
- Recharts para tendencias
- jsPDF y SheetJS para exportaciones
- `localStorage` mediante un contrato de repositorio reemplazable

## Requisitos

- Node.js 20.9 o superior
- npm 10 o superior
- Git

## Instalación y ejecución local

```bash
git clone <URL-DEL-REPOSITORIO>
cd monitoreo-intensivo
npm install
cp .env.example .env.local
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

La aplicación arranca con 40 estudiantes inequívocamente ficticios, cinco cursos, cinco docentes, dos plantillas y tres sesiones demostrativas. Los cambios se guardan únicamente en el navegador utilizado.

## Comandos

```bash
npm run dev        # servidor de desarrollo
npm run typecheck  # revisión de TypeScript
npm run lint       # revisión estática
npm run build      # compilación de producción
npm run start      # ejecuta la compilación
npm run check      # tipos + lint + build
```

## Arquitectura

```text
src/
  app/                         # App Router, metadata y estilos globales
  components/
    layout/                    # barra superior, sidebar y navegación móvil
    ui/                        # modal, estados vacíos y badges
  config/                      # constantes y códigos I/R/C
  data/                        # datos ficticios reproducibles
  features/
    courses/                   # importación y estado de cursos
    history/                   # historial longitudinal
    monitoring/
      components/              # mapa, vista principal y formularios
      hooks/                   # store de la aplicación
      lib/                     # métricas y operaciones del dominio
      repositories/            # contrato y almacenamiento local
    reports/                   # informe y exportaciones
    settings/                  # configuración
    students/                  # tarjetas, lista y hoja de registro
    teachers/                  # selector/lista de docentes
  lib/                         # fechas y texto
  types/                       # modelos del dominio
docs/
  decisions/                   # decisiones de arquitectura
  architecture.md
  migration-inventory.md
  known-differences.md
```

La interfaz no conoce dónde se guardan los datos. `MonitoringRepository` define el contrato y `LocalStorageMonitoringRepository` es la implementación de esta etapa. Un adaptador Supabase futuro deberá cumplir el mismo contrato.

## Variables de entorno

La versión 0.1 no necesita secretos ni servicios externos.

| Variable | Uso actual |
| --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | Documenta el modo local de esta etapa |
| `NEXT_PUBLIC_SUPABASE_URL` | Reservada; dejar vacía |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Reservada; dejar vacía |

Nunca confirmes `.env.local`, tokens, claves, credenciales ni archivos con datos reales.

## Desarrollar una funcionalidad

1. Revisa `AGENTS.md`, `docs/migration-inventory.md` y los ADR relacionados.
2. Define si el cambio pertenece a UI, dominio o persistencia.
3. Crea o modifica componentes pequeños dentro de la funcionalidad correspondiente.
4. Mantén las operaciones de datos en `monitoring-service.ts` y no directamente en las vistas.
5. Ejecuta `npm run check`.
6. Comprueba las cuatro vistas a 1366 px, 900 px y 390 px.
7. Documenta cualquier diferencia visual o funcional intencional.

## Flujo con ramas

La rama principal es `main`. No desarrolles directamente sobre ella.

```bash
git switch main
git pull --ff-only
git switch -c feat/nombre-breve

# realizar cambios
git add .
git commit -m "feat: describe el cambio"
git push -u origin feat/nombre-breve
```

Prefijos sugeridos: `feat/`, `fix/`, `docs/`, `refactor/` y `chore/`.

## Pull Requests

Al abrir un Pull Request hacia `main`:

1. explica qué problema resuelve;
2. indica qué vistas o reglas toca;
3. agrega capturas de escritorio y celular si modifica interfaz;
4. confirma que no contiene datos reales ni secretos;
5. adjunta el resultado de `npm run check`;
6. solicita revisión del otro socio antes de fusionar.

En GitHub conviene proteger `main`, exigir Pull Request, al menos una aprobación y checks exitosos.

## Crear y subir el repositorio privado a GitHub

Después de crear en GitHub un repositorio **privado** vacío llamado `monitoreo-intensivo`:

```bash
git init
git add .
git commit -m "feat: migración inicial de Monitoreo Intensivo"
git branch -M main
git remote add origin git@github.com:<USUARIO-O-ORGANIZACION>/monitoreo-intensivo.git
git push -u origin main
```

Agrega a Fabián y Diego como colaboradores desde **Settings → Collaborators**. No copies el historial del repositorio interno del Site: versiones anteriores contenían datos reales que fueron eliminados de esta migración.

## Despliegue posterior en Vercel

1. En Vercel selecciona **Add New → Project**.
2. Importa el repositorio privado `monitoreo-intensivo`.
3. Mantén el framework detectado como Next.js.
4. Usa `npm run build`; no hace falta cambiar el directorio de salida.
5. No agregues variables de Supabase en esta etapa.
6. Despliega y realiza la comparación visual indicada en `docs/migration-inventory.md`.

Cada Pull Request puede usar un Preview Deployment. La rama `main` debe alimentar producción solo cuando los checks y la revisión estén aprobados.

## Privacidad

- El repositorio contiene únicamente estudiantes ficticios.
- No agregues RUT, correos, diagnósticos, calificaciones ni datos de apoderados.
- Una nómina importada queda en `localStorage`; no se envía a un servidor en esta versión.
- Antes de integrar Supabase se deben definir autenticación, roles, políticas RLS, retención y tratamiento de datos.

## Documentación de referencia

- [Inventario visual y funcional](docs/migration-inventory.md)
- [Arquitectura de migración](docs/architecture.md)
- [Diferencias conocidas](docs/known-differences.md)
- [ADR 0001: persistencia local](docs/decisions/0001-portable-client-storage.md)
