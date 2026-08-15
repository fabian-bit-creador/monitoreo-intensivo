# Monitoreo PI — Referencia visual y de interacción

> Documento de contexto para Claude Code. Describe **exactamente** cómo se ve y se comporta hoy
> `https://monitoreo-pi.fhee1997.chatgpt.site/`, para poder implementar mejoras visuales y de
> animación sin romper la identidad actual.
>
> Auditoría realizada el 15 de agosto de 2026 sobre el build en producción.

---

## 1. Qué es la app

Panel docente para monitorear "Práctica Independiente" en clase: el profesor ve el mapa de la sala,
toca a un estudiante y registra su estado (**I** = en instrucciones, **R** = en revisión con % de
avance, **C** = correcto, o ausente). Sobre eso construye KPIs en vivo, un informe automático y un
historial longitudinal de sesiones.

Vocabulario del dominio (respetarlo en la UI): *Recorrido 1/2/3*, *Cobertura*, *Sala habitual*,
*Sin registro*, *Docente activo*, *Curso*, *Plantilla*, *Puestos*.

---

## 2. Stack detectado

| Aspecto | Valor |
|---|---|
| Build | SPA compilada con Vite (`/assets/index-*.css`, sin `<script src>` en el HTML servido) |
| UI | React (marcado y clases consistentes con componentes React) |
| Estilos | **CSS plano con variables CSS**. No hay Tailwind, no hay CSS-in-JS. Un solo archivo (~35 KB) |
| Tipografía | **Geist** y **Geist Mono** (`next/font`, woff2 self-hosted). Clases `__variable_geist_*` en `<body>` |
| Iconos | **lucide-react** (`lucide-activity`, `lucide-chevron-down`, `lucide-search`, `lucide-layout-grid`, `lucide-move`, `lucide-wifi`…) |
| Gráficos | SVG de líneas + puntos (estilo Recharts / SVG propio) en "Cobertura y C por sesión" |
| Animación actual | **Prácticamente inexistente**: 2 `@keyframes` (`spin`, `toast-in`) y 2 reglas `transition` |
| `prefers-reduced-motion` | **No implementado** |

> Consecuencia práctica: cualquier mejora de motion debe hacerse en **CSS plano con variables**,
> no asumir Tailwind ni Framer Motion instalado. Si se agrega una librería, `motion` (Framer) o
> `vaul`/`sonner` deben añadirse explícitamente al `package.json`.

---

## 3. Tokens de diseño (valores exactos, `:root`)

```css
:root{
  --navy:#17375e;      /* color primario: títulos, botón primario, marca */
  --navy-2:#0f2948;    /* hover del primario */
  --teal:#1e8e89;      /* acento: eyebrows, botón "Finalizar clase", iconos de card */
  --teal-soft:#e7f6f4;
  --ink:#172033;       /* texto principal */
  --muted:#667085;     /* texto secundario */
  --line:#dfe5ee;      /* bordes */
  --canvas:#f4f6fa;    /* fondo de la app */
  --surface:#fff;      /* fondo de tarjetas */
  --i:#f59e0b;  --i-soft:#fff7df;   /* estado I — ámbar */
  --r:#3b82f6;  --r-soft:#eaf2ff;   /* estado R — azul */
  --c:#18a06a;  --c-soft:#e9f8f1;   /* estado C — verde */
  --danger:#d84a4a;
  --shadow:0 14px 36px #17375e14;   /* sombra estándar de .card */
}
```

Radios en uso: `9px` (botones de toolbar) · `11px` (nav) · `12–13px` (banners, student-card, empty-seat)
· `15px` (KPI) · `18px` (`.card`) · `20px` (modal) · `22px` (sheet) · `999px` (badges, toast).

Colores derivados de estado (badges y bordes):

```
status-i  texto #925800  fondo #ffe9ad    card i: bg var(--i-soft)  borde #f4d68f
status-r  texto #205ba9  fondo #d7e7ff    card r: bg var(--r-soft)  borde #bad0f4
status-c  texto #10714c  fondo #cfeede    card c: bg var(--c-soft)  borde #b6e2ce
status-empty  #6e7787 / #e9edf2
status-absent #687181 / #dde1e6           card absent: opacity .56, bg #f2f3f5
```

---

## 4. Arquitectura de layout

```
.app-shell
├── .topbar            (sticky, 72px, backdrop-filter: blur(12px), bg #fffffff5, z-index 30)
│   ├── .brand-lockup  → .brand-mark (cuadro navy 44px, radio ~14px, icono Activity blanco)
│   │                    + "Monitoreo PI" / "PRÁCTICA INDEPENDIENTE" (uppercase, tracking amplio)
│   └── .topbar-actions
│       ├── .connectivity.online   → pill verde suave, icono Wifi, "Sincronizado"
│       ├── .secondary-button      → "Importar curso" (icono Upload)
│       └── .primary-button        → "Nueva clase" (navy, icono Plus, sombra 0 7px 16px #17375e2e)
└── .workspace  (2 columnas: sidebar fija + main)
    ├── .sidebar        (~238px, fondo canvas, borde derecho)
    │   ├── .context-controls → 2 <select> nativos envueltos en .select-wrap con chevron
    │   │                       "DOCENTE ACTIVO" (Fabián Herrera) y "CURSO" (III°A 2026)
    │   ├── .sidebar-nav     → 4 <button>: Monitorear · Informe · Historial · Configuración
    │   │                      (icono lucide 18px + label bold; .active = fondo #e8eef7, texto navy)
    │   ├── .legend-card     → "ESTADOS": dot-i / dot-r / dot-c / dot-empty
    │   └── .privacy-note
    └── .main-content   (max-width ~1020px, padding generoso, scroll de página)
```

Breakpoints existentes: `@media (width<=1120px)`, `(width<=900px)`, `(width<=680px)`, y `@media print`.
En ≤680px aparecen `.mobile-nav`, `.mobile-context-bar`, `.student-sheet` con `.sheet-handle`
(hoy `display:none` en desktop) — es decir, **ya existe la estructura de bottom-sheet móvil**.

---

## 5. Vistas, una por una

### 5.1 Monitorear (vista principal)

Orden vertical del contenido:

1. **Eyebrow** teal, uppercase, tracking amplio, 11px:
   `SESIÓN EN CURSO · 5 AGO · FABIÁN HERRERA · SALA HABITUAL`
2. **`.monitor-heading`** — H1 navy muy grande (~46px, peso 800): `UIC`; debajo subtítulo muted
   `Estados financieros`. A la derecha, alineado al H1, botón teal **"Finalizar clase"** (icono ClipboardCheck).
3. **`.live-kpis`** — fila de 5 `.live-kpi` (radio 15px, min-height 100px, `overflow:hidden`).
   Cada uno: label uppercase 10px muted / número enorme navy (~34px, peso 800) / nota pequeña.
   Llevan una **barra de color de 4–5px pegada al borde izquierdo** que codifica la métrica
   (cobertura=navy, instrucciones=ámbar, revisión=azul, correctos=verde, sin registro=gris).
   Contenido observado: `COBERTURA 100% · 35 de 35` | `INSTRUCCIONES 0 · requieren inicio` |
   `EN REVISIÓN 26 · 63% avance prom.` | `CORRECTOS 9 · criterios comprobados` | `SIN REGISTRO 0 · 5 ausentes`.
4. **`.monitor-toolbar.card`** — barra horizontal en tarjeta:
   `Recorrido` + 3 botones cuadrados 36px (`1` activo en navy sólido, `2` y `3` en blanco con borde)
   · divisor vertical · `.search-box` con icono Search y placeholder "Buscar estudiante"
   · `.view-toggle` (2 botones: LayoutGrid / List, el activo en navy)
   · botón **"Mover puestos"** (icono Move). En modo mover se convierte en **"Terminar"** navy sólido
   y aparece `.move-banner` azul claro: *"Toca un estudiante y luego su puesto de destino. Si está ocupado, intercambiarán lugares."*
5. **`.classroom.card`** — mapa de sala:
   - `.room-topline`: izquierda `PUERTA` con icono; derecha `SALA HABITUAL · VISTA DESDE EL PUESTO DEL PROFESOR` (uppercase, muted, tracking).
   - `.seat-scroll` → `.seat-grid`: `repeat(6, minmax(112px,1fr))`, gap 10px, `min-width:830px`
     (⚠️ **hay scroll horizontal** en el viewport actual; las columnas 5–6 quedan cortadas).
   - `.seat-cell` min-height 116px. Contiene `.student-card` o `.empty-seat`.
   - `.board-area` al pie: `PIZARRA` y `Puesto del profesor`.
   - `.unassigned-area`: `SIN PUESTO ASIGNADO` con las cards sueltas (Constanza F., Antonia G.).

**`.student-card` — el componente más importante de la app.** Markup real:

```html
<button class="student-card state-r">
  <span class="student-number">20</span>
  <strong>Alonso M.</strong>
  <span class="status-badge status-r">R · 90%</span>
  <small>Recorrido 1</small>
</button>
```

```css
.student-card{
  position:relative; overflow:hidden; width:100%; min-height:112px;
  padding:13px 10px 10px; text-align:left; cursor:pointer;
  background:#fff; border:1px solid #dce3ed; border-radius:13px;
  transition:transform .18s, box-shadow .18s, border-color .18s;
}
.student-card:before{ content:""; position:absolute; inset:0 auto 0 0; width:4px; background:#bac3cf; }
.student-card:hover{ transform:translateY(-2px); box-shadow:0 10px 20px #17375e1c; }
```

Número de puesto arriba a la derecha en gris; nombre abreviado ("Alonso M.") en negrita navy;
badge de estado; y `Recorrido N` en la base. Ausente → `opacity:.56` y texto "Toca para registrar".

`.empty-seat`: borde punteado `1px dashed #c9d4e1`, fondo `#fafbfc`, texto "Disponible".

**Vista lista** (toggle List): filas de 68px con número en círculo gris, nombre abreviado en negrita,
nombre completo debajo en 11px muted, badge de estado a la derecha y flecha `→`.

### 5.2 Modal de registro (se abre al tocar una card)

`.modal-backdrop` — `position:fixed; inset:0; background:#0c182a94; backdrop-filter:blur(3px); z-index:80; display:grid; place-items:center`.
`.modal-card` / `.student-sheet` — `width:min(620–680px,100%)`, radio 20–22px, `box-shadow:0 30px 80px #08142547`, scroll interno.

Contenido, de arriba abajo:

1. `.student-avatar` — cuadrado ~54px, fondo `--r-soft`, inicial en navy grande.
2. Eyebrow teal `RECORRIDO 1` · H2 navy `Alonso M.` · nombre completo en 12px muted.
3. Botón cerrar `×` arriba a la derecha.
4. `.current-state` — franja gris clara: "Estado actual" + badge `R · 90%` a la derecha.
5. `.note-field` — textarea "Observación breve *opcional*", placeholder *"Ej.: requiere ejemplo del paso 2"*.
6. `.status-prompt` "Selecciona el estado comprobado" + `.status-actions` — **3 tarjetas grandes** en grid:
   `I En instrucciones / Aún no inicia o requiere reorientación` (ámbar),
   `R En revisión / Producto en avance` (azul),
   `C Correcto / Criterios de éxito comprobados` (verde). Cada una con su cuadro de letra 34px arriba.
7. Al elegir **R** se despliega `.progress-picker` (panel gris): *"¿Qué porcentaje del producto está avanzado?"*
   con 4 botones `25% · 50% · 70% · 90%`. **Este despliegue hoy es instantáneo y salta el layout.**
8. `.absence-link` al pie: "Marcar ausente" con icono UserX.

### 5.3 Informe

Eyebrow `INFORME AUTOMÁTICO · 5 AGO` · H1 `UIC` · línea de contexto
`Fabián Herrera · III°A 2026 · Sala habitual · Datos descriptivos del monitoreo`.
A la derecha dos `.secondary-button`: **PDF** (Download) y **Excel** (FileSpreadsheet).

- `.source-strip` — franja con icono de archivo: `Fuente base: III°A 2026 · pestañas III°A 2026, Puestos, Puestos Taller, Monitoreo PI Sala` y a la derecha, en teal bold, `Datos sincronizados`.
- `.report-kpis` — 5 tarjetas (Cobertura 100% · Correctos 9 · En revisión 26 · En instrucciones 0 · Progresaron 0), mismo lenguaje que los KPI vivos pero **sin barra de color lateral**.
- `.analytics-grid` — 2 columnas:
  - **ESTADO FINAL / "Distribución I · R · C"** → `.status-stack`: barra apilada de 22px, `border-radius:999px`, azul + verde; debajo `.status-breakdown` en 2×2 con dots de color y números; nota al pie en 11px.
  - **LECTURA PEDAGÓGICA / "Qué ocurrió en la sesión"** → párrafo narrativo (~16px, line-height amplio) + `.evidence-label` gris con icono `?`: *"Interpretación basada en los registros, no una calificación."*
  - **HISTORIAL / "Cobertura y C por sesión"** → gráfico de líneas SVG con 2 series (teal = cobertura, navy = correctos), puntos circulares huecos, grid punteado, eje Y 0–100 y eje X con fechas (`20 jul … 10 ago`). **Las líneas aparecen de golpe, sin dibujado.**
  - **PRÓXIMA CLASE / "Acciones sugeridas"** → lista numerada con cuadrito navy `1 2 3` y texto.
- `.priority-table` — "SEGUIMIENTO / Prioridad para la próxima intervención": tabla con
  `ESTUDIANTE · ESTADO FINAL · RECORRIDO · OBSERVACIÓN · ACCIÓN`, badges de estado y enlace "Volver a revisar".

### 5.4 Historial

Eyebrow `REGISTRO LONGITUDINAL` · H1 `Historial de clases` · subtítulo
*"Sesiones de Fabián Herrera. Compara cobertura, avance y estado final."* · botón navy "Nueva clase".

`.history-card` (button, grid `84px 70px minmax(180px,1fr) minmax(260px,auto) 24px`, min-height 100px,
sombra suave `0 6px 18px #17375e0d`):
pill de estado (`EN CURSO` verde suave · `CERRADA` gris) → fecha en dos líneas (`10 ago` / `2026`) →
título + subtítulo (`Taller empresarial · Evaluación AC`) → 3 métricas (`100% cobertura`, `17 correctos`,
`18 revisión`) → flecha `→`. La fila `EN CURSO` lleva **barra teal en el borde izquierdo**.
Hover actual: solo cambia el color del borde.

### 5.5 Configuración

Eyebrow `BETA COMPARTIDA` · H1 `Configuración` · subtítulo *"Equipo piloto, cursos disponibles y estado de preparación de cada plantilla."*

- **EQUIPO PILOTO / "Docentes de prueba"** → `.teacher-row` con avatar de iniciales (`FH`, `DO`, `DQ`),
  nombre + rol, badge `ADMIN` (amarillo) o `DOCENTE` (azul claro), y check/flecha. La fila activa
  tiene borde teal y fondo `--teal-soft`.
- **CATÁLOGO 2026 / "Cursos piloto"** → filas con badge `OPERATIVO` (verde) o `PENDIENTE` (amarillo):
  III°A 2026 (40 estudiantes · 2 plantillas), III°C, IV°A, IV°B, IV°C.
- **ALCANCE ACTUAL / "III°A operativo"** → `.pending-checklist` con 4 checks teal.
- **IMPORTANTE / "Identificación, no contraseña"** → `.beta-warning`: tarjeta con fondo crema,
  borde ámbar e icono `?` — nota de que el enlace es público.

---

## 6. Auditoría de motion (estado actual)

Todo lo que existe hoy en el CSS:

```css
@keyframes spin{ to{ transform:rotate(360deg) } }
@keyframes toast-in{ 0%{ opacity:0; transform:translate(-50%,12px) } }

.student-card{ transition:transform .18s, box-shadow .18s, border-color .18s }
/* (la otra) */ transition:transform .18s, background .18s, border-color .18s
.toast{ animation:.25s toast-in }
```

Hallazgos:

| # | Problema | Impacto |
|---|---|---|
| 1 | Ningún `easing` custom; todo cae en el `ease` por defecto del navegador | Las transiciones se sienten planas |
| 2 | **No hay animación de entrada/salida del modal** — aparece y desaparece en seco | Es la interacción más frecuente de la app |
| 3 | El `.progress-picker` (25/50/70/90) se monta sin transición y empuja el layout | Salto visual en cada registro R |
| 4 | Cambio de vista (Monitorear ↔ Informe ↔ Historial) sin ninguna transición | Se siente como recarga |
| 5 | El toggle grid/lista intercambia 35 tarjetas de golpe | Cambio violento |
| 6 | Actualizar el estado de un estudiante no se confirma visualmente en la card | Falta feedback del acto central de la app |
| 7 | Los KPI cambian de número sin transición | Se pierde el cambio |
| 8 | El gráfico de líneas se pinta instantáneo | Oportunidad barata de pulido |
| 9 | `.toast` usa `@keyframes`, no `transition` → se reinicia con toasts rápidos | Justo el caso que Sonner resuelve |
| 10 | `:hover` sin `@media (hover:hover)` | Estados "pegados" al tocar en tablet |
| 11 | **Sin `prefers-reduced-motion`** | Accesibilidad |
| 12 | `.sheet-handle{display:none}` — el bottom sheet móvil no se puede arrastrar | Estructura lista, gesto ausente |

---

## 7. Plan de animación (principios de Emil Kowalski)

Fuente: repositorio [`emilkowalski/skills` → `skills/emil-design-eng/SKILL.md`](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md)
y su curso [animations.dev](https://animations.dev/). Librerías del mismo autor que aplican aquí:
[`sonner`](https://github.com/emilkowalski/sonner) (toasts) y [`vaul`](https://github.com/emilkowalski/vaul) (drawer / bottom sheet).

### 7.1 Reglas que rigen todo el trabajo

1. **Solo animar `transform` y `opacity`** (GPU; sin layout ni paint).
2. **Duraciones de UI < 300 ms.** Botones 100–160 ms · tooltips 125–200 ms · dropdowns 150–250 ms · modales 200–300 ms.
3. **Nunca `ease-in` en UI.** Entradas/salidas → `ease-out`; movimiento en pantalla → `ease-in-out`.
4. **Nunca escalar desde 0.** Entrar desde `scale(.95)` + `opacity:0`.
5. **Transiciones antes que keyframes** en todo lo que se dispare rápido (toasts, cambios de estado).
6. **Salida más rápida que la entrada.**
7. **Nada de animación en acciones de teclado** ni en gestos repetidos decenas de veces al día.
8. **Stagger 30–80 ms**, decorativo, nunca bloqueando la interacción.
9. `@media (hover:hover) and (pointer:fine)` para todo `:hover`.
10. `@media (prefers-reduced-motion: reduce)` → conservar opacidad/color, eliminar movimiento.

### 7.2 Tokens de motion a agregar en `:root`

```css
:root{
  /* curvas — las nativas de CSS no tienen carácter */
  --ease-out:     cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out:  cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer:  cubic-bezier(0.32, 0.72, 0, 1);

  /* duraciones */
  --dur-press: 140ms;
  --dur-fast:  180ms;
  --dur-base:  240ms;
  --dur-modal: 280ms;
  --dur-exit:  160ms;
}
```

### 7.3 Especificación por componente

| Componente | Qué animar | Cómo |
|---|---|---|
| **Todos los botones** (`.primary-button`, `.secondary-button`, `.finish-button`, `.icon-button`, `.round-control button`, `.view-toggle button`) | Feedback de presión | `transition: transform var(--dur-press) var(--ease-out)` + `:active{ transform:scale(.97) }` |
| **`.student-card`** hover | Ya existe; solo refinar | Cambiar a `transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), background-color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out)` y envolver el `:hover` en `@media (hover:hover)` |
| **`.student-card` al confirmar estado** | Feedback del acto central | El cambio de `background`/`border-color` ya queda animado por la regla anterior. Añadir un pulso corto en la barra `:before` (`scaleY` desde 1 → 1 con `opacity` 1→.4→1) o `transform: scale(1.02)` durante 160 ms `ease-out`. **No usar bounce.** |
| **`.modal-backdrop`** | Entrada/salida | `opacity 0→1` en `var(--dur-modal) var(--ease-out)`; salida en `var(--dur-exit)`. `backdrop-filter` de `blur(0)`→`blur(3px)` |
| **`.modal-card` / `.student-sheet`** (desktop) | Entrada/salida | `opacity:0; transform:scale(.96) translateY(8px)` → `scale(1) translateY(0)`, `var(--dur-modal) var(--ease-out)`. `transform-origin:center` (regla explícita para modales). Salida a `scale(.98)` en `var(--dur-exit)` |
| **`.student-sheet`** (≤680px) | Bottom sheet | `translateY(100%)` → `translateY(0)` con `var(--ease-drawer)`, 300–350 ms. Activar `.sheet-handle` y drag-to-dismiss con umbral por **velocidad**: `velocity = |drag| / t; dismiss if |swipe| >= UMBRAL \|\| velocity > 0.11`. Alternativa directa: adoptar **`vaul`** |
| **`.progress-picker` (25/50/70/90)** | Despliegue al elegir R | Sustituir el montaje seco por `grid-template-rows: 0fr → 1fr` (o `max-height`) + `opacity` + `translateY(-4px)`, `var(--dur-base) var(--ease-out)`. Stagger 40 ms entre los 4 botones |
| **`.status-actions` (I/R/C)** | Selección | `:active{ transform:scale(.98) }`; la tarjeta elegida gana borde/fondo con transición de 180 ms |
| **Cambio de vista** (nav lateral) | Transición de página | Fade + `translateY(6px)` sobre `.main-content`, 200 ms `ease-out`, con `key` por vista. Sin movimiento horizontal |
| **`.sidebar-nav button.active`** | Indicador activo | El fondo `#e8eef7` debe **deslizarse** entre ítems, no aparecer. Un `<span>` absoluto animado con `transform: translateY()` + `var(--ease-in-out)` 220 ms |
| **Toggle grid ↔ lista** | Reemplazo de 35 elementos | Crossfade 180 ms + stagger 25–30 ms **limitado a las primeras ~12 tarjetas** (más allá el stagger se vuelve lento). Añadir `filter: blur(2px)` en el estado saliente como *blur bridge* |
| **`.live-kpi` (números)** | Cambio de valor | Contador tweened (~400 ms `ease-out`) **o** crossfade vertical del dígito. Nunca en cada tecla, solo cuando el dato cambia |
| **`.live-kpis` / `.report-kpis` en montaje** | Entrada | Stagger 50 ms, `opacity 0→1` + `translateY(8px)`, `var(--ease-out)` |
| **`.status-stack`** (barra I·R·C del informe) | Llenado | `transform: scaleX()` con `transform-origin:left`, 500 ms `var(--ease-out)`, solo en la primera aparición |
| **Gráfico de líneas** | Dibujado | `stroke-dasharray`/`stroke-dashoffset` animado ~700 ms `linear`, y puntos con stagger 40 ms. Alternativa moderna: `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)` |
| **`.history-card`** hover | Elevación | Además del borde, `transform: translateY(-2px)` + sombra, 180 ms `ease-out`, bajo `@media (hover:hover)` |
| **`.toast`** | Reemplazar keyframes | Migrar a `transition` + `@starting-style` (o directamente a **`sonner`**, que ya resuelve stack, pausa al ocultar la pestaña y swipe) |
| **`.move-banner`** | Entrada del modo mover | `opacity` + `translateY(-6px)` + `grid-template-rows:0fr→1fr`, 200 ms `ease-out` |
| **Intercambio de puestos** | Movimiento espacial | Es el caso ideal de **FLIP**: medir posición previa, aplicar `transform` inverso y transicionar a `none` con `var(--ease-in-out)` 280 ms. Es lo único que justifica `ease-in-out` |
| **`.connectivity`** | Cambio online/offline | Solo color + opacidad, 200 ms. Sin movimiento |
| **Spinner (`spin`)** | — | Dejarlo. Sí subir la velocidad: un spinner más rápido hace percibir la carga como más corta |

### 7.4 Bloque de accesibilidad obligatorio

```css
@media (prefers-reduced-motion: reduce){
  *, *::before, *::after{
    animation-duration:.01ms !important;
    animation-iteration-count:1 !important;
    transition-duration:.01ms !important;
    scroll-behavior:auto !important;
  }
  /* conservar cambios de opacidad/color suaves donde comunican estado */
  .student-card, .status-badge{ transition: background-color 150ms ease, border-color 150ms ease !important; }
}
```

### 7.5 Orden de implementación sugerido

1. Tokens de motion + bloque `prefers-reduced-motion` + `@media (hover:hover)` en todos los `:hover`. *(base, sin riesgo)*
2. `:active{scale(.97)}` en todos los botones. *(máximo retorno por línea escrita)*
3. Entrada/salida del modal de registro + `.progress-picker`. *(la interacción más usada)*
4. Feedback en `.student-card` al confirmar estado.
5. Indicador deslizante del nav + transición de vista.
6. Toast → transición/`sonner`.
7. Bottom sheet móvil con gesto → `vaul`.
8. FLIP en "Mover puestos".
9. Gráfico, `.status-stack` y contadores de KPI. *(pulido)*

### 7.6 Criterios de aceptación

- Ninguna transición de UI supera 300 ms (excepto sheet 350 ms y gráfico 700 ms, que son decorativos).
- No queda ningún `transition: all` en el CSS.
- No queda ningún `ease-in` sobre UI.
- Ningún elemento entra desde `scale(0)`.
- Todo `:hover` está detrás de `@media (hover:hover) and (pointer:fine)`.
- Con `prefers-reduced-motion: reduce` la app sigue siendo completamente usable y no hay movimiento.
- Solo se animan `transform`, `opacity`, `clip-path` y colores — nunca `width`, `height`, `margin` o `padding`.
- Verificación en cámara lenta (durations ×4) sin saltos de easing ni `transform-origin` incorrectos.

---

## 8. Deudas visuales detectadas (no son animación, pero conviene atacarlas)

1. **`.seat-grid` tiene `min-width:830px`** → el mapa de sala se corta horizontalmente en pantallas
   angostas y las columnas 5–6 quedan fuera. Considerar `repeat(auto-fit, minmax(112px,1fr))`
   o zoom-out con `transform: scale()` sobre el contenedor.
2. Los `.live-kpi` y los `.report-kpis` usan lenguajes ligeramente distintos (barra lateral sí/no).
   Unificar.
3. El `<select>` nativo de la sidebar rompe la coherencia con el resto de controles custom.
4. `.status-actions` en el modal tiene dos reglas de `gap` en conflicto (`9px` y luego `6px`).
5. No hay modo oscuro ni tokens preparados para él.

---

## Fuentes

- [emilkowalski/skills — `skills/emil-design-eng/SKILL.md`](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md)
- [emilkowalski (Emil Kowalski) · GitHub](https://github.com/emilkowalski/)
- [emilkowalski/sonner](https://github.com/emilkowalski/sonner)
- [Emil Kowalski — emilkowal.ski](https://emilkowal.ski/)
- [Animation Techniques — DeepWiki de `emilkowalski/skill`](https://deepwiki.com/emilkowalski/skill/3-animation-techniques)
- App auditada: `https://monitoreo-pi.fhee1997.chatgpt.site/` (hoja de estilos `/assets/index-GNlIetQS.css`)
