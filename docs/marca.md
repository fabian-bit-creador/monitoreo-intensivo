# Marca de Monitoreo Intensivo

Decisión y motivos: [ADR 0005](decisions/0005-identidad-de-marca.md).

## Archivos

| Archivo | Uso |
|---|---|
| `public/brand/isotipo.svg` | Isotipo en color, fondos claros |
| `public/brand/isotipo-oscuro.svg` | Isotipo sobre marino u oscuro |
| `public/brand/isotipo-marino.svg`, `isotipo-blanco.svg` | Una tinta: impresión, sellos, calados |
| `public/brand/isotipo-512.png` | Isotipo en PNG |
| `public/brand/horizontal.svg` · `.png` | Isotipo + nombre (principal) |
| `public/brand/horizontal-oscuro.svg` · `.png` | Versión horizontal sobre marino |
| `public/brand/apilada.svg`, `apilada-oscura.svg` | Nombre en dos líneas, espacios angostos |
| `public/brand/icono-app.svg` | Ícono de app (recuadro marino) |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Manifest / app instalada |
| `src/app/favicon.ico` (16, 32, 48), `icon.svg`, `apple-icon.png` (180) | Pestaña e inicio del iPhone; Next.js genera sus etiquetas |

En la interfaz, el isotipo es el componente `BrandMark` y la versión horizontal,
`BrandLockup` (`src/components/layout/brand.tsx`).

Los SVG con nombre usan texto en Arial Bold; si se abren en un equipo sin Arial, usar el PNG.

## Colores

| Color | Hex | Uso | Contraste |
|---|---|---|---|
| Marino | `#17375E` | Anillo, check y nombre | 12,0:1 sobre blanco |
| Turquesa | `#1E8E89` | Avance (acento gráfico, no texto pequeño) | 4,0:1 sobre blanco |
| Hielo | `#EAF1FA` | Anillo en versión oscura | 10,6:1 sobre marino |
| Turquesa claro | `#5FD3C9` | Avance en versión oscura | 6,7:1 sobre marino |

La marca no usa los colores de estado (ámbar I, azul R, verde C, rojo de error).

## Reglas

- Nombre oficial exacto: «Monitoreo Intensivo». «Monitoreo» solo como nombre corto bajo el
  ícono del celular.
- Área libre alrededor: ¼ del alto del isotipo.
- Tamaño mínimo: isotipo 20 px; versión horizontal 120 px de ancho. Bajo 20 px, usar el ícono
  de app.
- No deformar, rotar, recolorear, agregar sombras ni degradados, ni poner sobre fotos sin un
  fondo liso.

## Regenerar

```bash
node scripts/generar-marca.mjs                                  # solo SVG
PLAYWRIGHT_MODULE=playwright node scripts/generar-marca.mjs     # además PNG e ICO
```

Si cambia la geometría, actualizar también `src/config/brand.ts`; `npm run test` avisa si no
coinciden.
