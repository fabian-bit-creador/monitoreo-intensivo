# ADR 0005: identidad de marca «Monitoreo Intensivo»

- Estado: aceptada por Fabián (12-10-2026). Implementación en la rama `feat/marca-oficial`.
- Reemplaza: el ícono provisional `Activity` y los conceptos de `docs/brand/concepts`.

## Contexto

La app mostraba «Monitoreo PI», el subtítulo «Práctica independiente» y el ícono genérico
`Activity` de lucide; el favicon era un ícono de plantilla. Fabián entregó un kit con tres
isotipos (A «Círculo esencial», B «Seguimiento activo», C «Acento estratégico») y pidió una
marca general, sencilla y coherente con la interfaz azul y blanca.

La evaluación (tamaños 128 a 16 px, fondos claros y oscuros, contraste) mostró que:

- B se vuelve ruido a 16 px (tres tramos, un nodo y un borde) y su nodo parece una notificación.
- C usa un coral (2,5:1 sobre blanco) que choca con los colores de estado: ámbar = I, rojo =
  error. En esta app el color significa estado.
- A es la idea más clara y legible, pero su degradado, su turquesa (2,1:1) y la poca diferencia
  entre anillo y check (2,3:1) la debilitan.

## Decisión

- **Isotipo: A refinada.** Anillo abierto (monitoreo continuo), tramo de avance y check que sale
  por el hueco (comprobación). Un solo trazo (12/128), sin degradados ni sombras.
- **Color:** solo los de la app. Anillo y check en marino `#17375E`; avance en turquesa
  `#1E8E89`. Versión oscura: `#EAF1FA`, `#5FD3C9` y blanco.
- **Nombre:** «Monitoreo Intensivo», exacto, en Arial Bold (la tipografía de la interfaz; no se
  agrega Inter). El subtítulo «Práctica independiente» deja de ser parte de la marca.
- **En la app:** isotipo libre junto al nombre (no dentro del recuadro marino). En celular el
  nombre va en dos líneas porque no cabe junto a las acciones.
- **Ícono de app y favicon:** recuadro marino con el símbolo en blanco, para que se vea en
  pestañas claras y oscuras. A 16 y 32 px el símbolo crece y el hueco se abre.
- **Nombre corto** bajo el ícono del celular: «Monitoreo» (el nombre completo se corta).
- Isotipo, versión horizontal y versión apilada son archivos separados (`public/brand`).

## Alcance

Cambia solo la marca pública: componentes de marca, metadatos, manifest, íconos, título del
PDF y mensajes que nombraban la app. **No cambian** tablas, autenticación, claves de
almacenamiento (`monitoreo-intensivo:v1`), formato de respaldo, salas, plantillas, historial ni
datos. `source.tabs` conserva «Monitoreo PI» porque es el nombre de una pestaña de la planilla
de origen, no la marca.

## Consecuencias

- La geometría vive en `src/config/brand.ts` y `scripts/generar-marca.mjs`;
  `src/config/brand.test.ts` comprueba que coincidan con los archivos publicados.
- Los PNG e ICO se regeneran con el script (requiere Playwright, que no es dependencia).
- Uso, tamaños mínimos y colores: `docs/marca.md`.
