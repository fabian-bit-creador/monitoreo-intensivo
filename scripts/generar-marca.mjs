// Genera los recursos de marca de Monitoreo Intensivo (ADR 0005, docs/marca.md).
//
//   node scripts/generar-marca.mjs            → solo SVG (sin dependencias)
//   PLAYWRIGHT_MODULE=playwright node scripts/generar-marca.mjs
//                                             → además PNG e ICO
//
// Los PNG e ICO se rasterizan con Chromium mediante Playwright, que no es
// dependencia del proyecto: PLAYWRIGHT_MODULE debe apuntar a una instalación
// existente (por ejemplo, la global). La geometría debe coincidir con
// src/config/brand.ts; src/config/brand.test.ts lo comprueba.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "Monitoreo Intensivo";
const COLORS = {
  navy: "#17375E",
  teal: "#1E8E89",
  ice: "#EAF1FA",
  lightTeal: "#5FD3C9",
  white: "#FFFFFF",
};

// Cuadrícula 128, centro 64, radio 44. Anillo de 75° a 310° en sentido horario,
// avance de 20° a 75°; la punta del check sale por el hueco.
const point = (degrees) => {
  const angle = (degrees * Math.PI) / 180;
  return `${(64 + 44 * Math.cos(angle)).toFixed(2)} ${(64 + 44 * Math.sin(angle)).toFixed(2)}`;
};
const CHECK = "M 38 65 L 56 83 L 96 40";

function symbol({ ring, progress, check, width = 12, ringEnd = 310 }) {
  const stroke = `fill="none" stroke-width="${width}" stroke-linecap="round"`;
  return [
    `<path d="M ${point(75)} A 44 44 0 1 1 ${point(ringEnd)}" stroke="${ring}" ${stroke}/>`,
    `<path d="M ${point(20)} A 44 44 0 0 1 ${point(75)}" stroke="${progress}" ${stroke}/>`,
    `<path d="${CHECK}" stroke="${check}" ${stroke} stroke-linejoin="round"/>`,
  ].join("");
}

const PALETTES = {
  light: { ring: COLORS.navy, progress: COLORS.teal, check: COLORS.navy },
  dark: { ring: COLORS.ice, progress: COLORS.lightTeal, check: COLORS.white },
  navy: { ring: COLORS.navy, progress: COLORS.navy, check: COLORS.navy },
  white: { ring: COLORS.white, progress: COLORS.white, check: COLORS.white },
};
const onTile = { ring: COLORS.white, progress: COLORS.lightTeal, check: COLORS.white };

function svg(viewBox, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${NAME}"><title>${NAME}</title>${body}</svg>\n`;
}

const isotype = (palette) => svg("0 0 128 128", symbol(PALETTES[palette]));

/**
 * Ícono de app. `small` (16 y 32 px): el símbolo ocupa más del recuadro, con
 * un trazo más grueso y el hueco abierto desde 300°. `shape`: «rounded» con
 * esquinas transparentes; «square» lo recortan iOS y Android.
 */
function appIcon({ small = false, shape = "rounded", scale } = {}) {
  const factor = scale ?? (small ? 0.96 : 0.8);
  const offset = ((128 - 128 * factor) / 2).toFixed(2);
  const radius = shape === "square" ? 0 : small ? 22 : 28;
  const mark = symbol({ ...onTile, width: small ? 15 : 13, ringEnd: small ? 300 : 310 });
  return svg(
    "0 0 128 128",
    `<rect width="128" height="128" rx="${radius}" fill="${COLORS.navy}"/><g transform="translate(${offset} ${offset}) scale(${factor})">${mark}</g>`,
  );
}

// Nombre en Arial Bold. Anchos de avance de Arial Bold (por 1000 unidades),
// los mismos de Liberation Sans Bold.
const ADVANCE = { M: 833, o: 611, n: 611, i: 278, t: 333, r: 389, e: 556, I: 278, s: 556, v: 556, " ": 278 };
const FONT_SIZE = 60; // 17 px junto a un isotipo de 36 px, como en el encabezado.
const TRACKING = -0.6; // −1 %
const TEXT_X = 171; // separación de 12 px a esa misma escala
const CAP_HEIGHT = 0.716 * FONT_SIZE;
// Las versiones con nombre se recortan al trazo (el anillo empieza en 14) con
// un margen mínimo para el suavizado.
const INK_START = 14;
const MARGIN = 2;
const textWidth = (text) =>
  [...text].reduce((sum, char) => sum + (ADVANCE[char] * FONT_SIZE) / 1000, 0) + TRACKING * (text.length - 1);
const textAttrs = (fill) =>
  `font-family="Arial, Helvetica, 'Liberation Sans', sans-serif" font-size="${FONT_SIZE}" font-weight="700" letter-spacing="${TRACKING}" fill="${fill}"`;

function horizontal(palette, textFill) {
  const right = Math.ceil(TEXT_X + textWidth(NAME) + MARGIN);
  const baseline = (64 + CAP_HEIGHT / 2).toFixed(1);
  return svg(
    `${INK_START - MARGIN} ${INK_START - MARGIN} ${right - INK_START + MARGIN} ${100 + 2 * MARGIN}`,
    `${symbol(PALETTES[palette])}<text x="${TEXT_X}" y="${baseline}" ${textAttrs(textFill)}>${NAME}</text>`,
  );
}

function stacked(palette, textFill) {
  const [first, second] = NAME.split(" ");
  const lineHeight = FONT_SIZE * 1.08;
  const top = 64 - (CAP_HEIGHT + lineHeight) / 2;
  const firstBaseline = top + CAP_HEIGHT;
  const secondBaseline = firstBaseline + lineHeight;
  const minY = Math.floor(Math.min(INK_START, top) - MARGIN);
  const maxY = Math.ceil(Math.max(128 - INK_START, secondBaseline) + MARGIN);
  const right = Math.ceil(TEXT_X + Math.max(textWidth(first), textWidth(second)) + MARGIN);
  return svg(
    `${INK_START - MARGIN} ${minY} ${right - INK_START + MARGIN} ${maxY - minY}`,
    `${symbol(PALETTES[palette])}<text ${textAttrs(textFill)}><tspan x="${TEXT_X}" y="${firstBaseline.toFixed(1)}">${first}</tspan><tspan x="${TEXT_X}" y="${secondBaseline.toFixed(1)}">${second}</tspan></text>`,
  );
}

const SVG_FILES = {
  "public/brand/isotipo.svg": isotype("light"),
  "public/brand/isotipo-oscuro.svg": isotype("dark"),
  "public/brand/isotipo-marino.svg": isotype("navy"),
  "public/brand/isotipo-blanco.svg": isotype("white"),
  "public/brand/horizontal.svg": horizontal("light", COLORS.navy),
  "public/brand/horizontal-oscuro.svg": horizontal("dark", COLORS.white),
  "public/brand/apilada.svg": stacked("light", COLORS.navy),
  "public/brand/apilada-oscura.svg": stacked("dark", COLORS.white),
  "public/brand/icono-app.svg": appIcon(),
  "src/app/icon.svg": appIcon({ small: true }),
};

// [destino, svg, ancho, alto, fondo transparente]
const PNG_FILES = [
  ["public/icons/icon-192.png", appIcon(), 192, 192],
  ["public/icons/icon-512.png", appIcon(), 512, 512],
  // Zona segura de Android: el símbolo cabe en el círculo central del 80 %.
  ["public/icons/icon-maskable-512.png", appIcon({ shape: "square", scale: 0.64 }), 512, 512],
  ["src/app/apple-icon.png", appIcon({ shape: "square", scale: 0.72 }), 180, 180],
  ["public/brand/isotipo-512.png", isotype("light"), 512, 512],
  ["public/brand/horizontal.png", SVG_FILES["public/brand/horizontal.svg"], null, 200],
  ["public/brand/horizontal-oscuro.png", SVG_FILES["public/brand/horizontal-oscuro.svg"], null, 200],
];
const ICO_SIZES = [
  [16, appIcon({ small: true })],
  [32, appIcon({ small: true })],
  [48, appIcon()],
];

async function write(relative, content) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  console.log("✓", relative);
}

/** ICO con imágenes PNG (admitido por todos los navegadores actuales). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

async function rasterize() {
  const specifier = process.env.PLAYWRIGHT_MODULE;
  if (!specifier) {
    console.log("PNG e ICO omitidos: define PLAYWRIGHT_MODULE para generarlos.");
    return;
  }
  const playwright = await import(path.isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier);
  const { chromium } = playwright.default ?? playwright;
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function render(source, width, height) {
    const viewBox = source.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
    const w = width ?? Math.round((height * viewBox[2]) / viewBox[3]);
    await page.setViewportSize({ width: w, height });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${height}px}</style>${source}`,
    );
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height } });
  }
  // El nombre debe caber en el ancho calculado.
  await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg"><text ${textAttrs("#000")}>${NAME}</text></svg>`);
  const measured = await page.evaluate(() => document.querySelector("text").getComputedTextLength());
  console.log(`Ancho del nombre: calculado ${textWidth(NAME).toFixed(1)}, medido ${measured.toFixed(1)}`);

  for (const [relative, source, width, height] of PNG_FILES) {
    await write(relative, await render(source, width, height));
  }
  const images = [];
  for (const [size, source] of ICO_SIZES) images.push({ size, png: await render(source, size, size) });
  await write("src/app/favicon.ico", ico(images));
  await browser.close();
}

for (const [relative, content] of Object.entries(SVG_FILES)) await write(relative, content);
await rasterize();
