import { normalizeName } from "@/lib/text";
import type { RosterEntry } from "@/types/monitoring";
import { ROSTER_NAME_HEADER, ROSTER_NUMBER_HEADER, ROSTER_SHEET_NAME } from "./roster-template";

export const MAX_ROSTER_SIZE = 80;

/**
 * - `header`: se encontró la columna de nombres por su encabezado.
 * - `shape`: no había encabezado y los nombres se reconocieron por su forma.
 */
export type RosterParseResult =
  | {
      ok: true;
      entries: RosterEntry[];
      numberedByOrder: boolean;
      detectedBy: "header" | "shape";
      warnings: string[];
    }
  | { ok: false; errors: string[] };

export type RosterSheet = { name: string; rows: unknown[][]; firstRowNumber: number };

export type RosterSheetOption = { sheetName: string; result: RosterParseResult };

export type RosterWorkbookResult = { options: RosterSheetOption[]; preferred: number };

const NAME_HEADERS = [ROSTER_NAME_HEADER, "Nombre completo", "Nombre", "Estudiante", "Alumno"];
const NUMBER_HEADERS = [ROSTER_NUMBER_HEADER, "Nº", "N", "No", "No.", "Número", "Numero", "Número de lista"];

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("es");
const NAME_KEYS = NAME_HEADERS.map(normalize);
const NUMBER_KEYS = new Set(NUMBER_HEADERS.map(normalize));

// Palabras de títulos, instrucciones o rótulos que nunca forman parte de un
// nombre: evitan tomar «Lista de estudiantes» o «Profesor jefe» por alumnos.
const AUXILIARY_WORDS = new Set([
  "lista", "listado", "nomina", "curso", "cursos", "estudiante", "estudiantes", "alumno",
  "alumnos", "alumna", "alumnas", "profesor", "profesora", "jefe", "jefa", "asignatura",
  "fecha", "colegio", "liceo", "escuela", "instrucciones", "escribe", "completa", "nombre",
  "nombres", "apellido", "apellidos", "total", "semestre", "ano", "basico", "basica", "medio",
  "media", "seccion", "plantilla", "fila", "filas", "columna", "hoja", "numero",
]);

export const EMPTY_ROSTER_MESSAGE =
  `La planilla no tiene estudiantes. Completa la columna “${ROSTER_NAME_HEADER}” y vuelve a subirla.`;

function parseListNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  const text = String(value).trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : null;
}

function columnLetter(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : `${columnLetter(Math.floor(index / 26) - 1)}${letter}`;
}

function findHeaderIndex(rows: unknown[][]) {
  return rows.findIndex((row) => row.some((cell) => NAME_KEYS.includes(normalize(cell))));
}

function tooManyError(count: number) {
  return `La planilla tiene ${count} estudiantes y el máximo es ${MAX_ROSTER_SIZE}. Revisa si incluye más de un curso.`;
}

/** Los homónimos se conservan: pueden ser dos estudiantes distintos. */
function homonymWarnings(rows: Array<{ fullName: string; sheetRow: number }>) {
  const rowsByName = new Map<string, Array<{ fullName: string; sheetRow: number }>>();
  rows.forEach((row) => {
    const key = normalizeName(row.fullName);
    rowsByName.set(key, [...(rowsByName.get(key) ?? []), row]);
  });
  return [...rowsByName.values()]
    .filter((group) => group.length > 1)
    .map((group) => `«${group[0].fullName}» aparece ${group.length} veces (filas ${group.map((row) => row.sheetRow).join(", ")}); se importarán como estudiantes distintos.`);
}

function parseWithHeader(rows: unknown[][], headerIndex: number, firstRowNumber: number): RosterParseResult {
  const header = rows[headerIndex].map(normalize);
  const nameColumn = NAME_KEYS.map((key) => header.indexOf(key)).find((index) => index >= 0) as number;
  const numberColumn = header.findIndex((cell) => NUMBER_KEYS.has(cell));

  const filled = rows
    .map((row, index) => ({
      sheetRow: firstRowNumber + index,
      fullName: String(row[nameColumn] ?? "").trim(),
      rawNumber: numberColumn >= 0 ? row[numberColumn] : "",
    }))
    .slice(headerIndex + 1)
    // Una fila con N° pero sin nombre es un cupo libre de una plantilla prenumerada.
    .filter((row) => row.fullName);
  if (!filled.length) return { ok: false, errors: [EMPTY_ROSTER_MESSAGE] };
  if (filled.length > MAX_ROSTER_SIZE) return { ok: false, errors: [tooManyError(filled.length)] };

  const warnings = homonymWarnings(filled);
  const hasNumbers = filled.some((row) => String(row.rawNumber ?? "").trim() !== "");
  if (!hasNumbers) {
    return {
      ok: true,
      numberedByOrder: true,
      detectedBy: "header",
      warnings,
      entries: filled.map((row, index) => ({ number: index + 1, fullName: row.fullName })),
    };
  }

  const errors: string[] = [];
  const rowsByNumber = new Map<number, number[]>();
  const entries: RosterEntry[] = [];
  for (const row of filled) {
    if (String(row.rawNumber ?? "").trim() === "") {
      errors.push(`Fila ${row.sheetRow}: falta el N° de «${row.fullName}».`);
      continue;
    }
    const number = parseListNumber(row.rawNumber);
    if (number === null) {
      errors.push(`Fila ${row.sheetRow}: «${String(row.rawNumber).trim()}» no es un N° de lista válido.`);
      continue;
    }
    rowsByNumber.set(number, [...(rowsByNumber.get(number) ?? []), row.sheetRow]);
    entries.push({ number, fullName: row.fullName });
  }
  for (const [number, sheetRows] of rowsByNumber) {
    if (sheetRows.length > 1) errors.push(`El N° ${number} está repetido (filas ${sheetRows.join(", ")}).`);
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    numberedByOrder: false,
    detectedBy: "header",
    warnings,
    entries: entries.sort((a, b) => a.number - b.number),
  };
}

/** Un nombre completo: de 2 a 6 palabras, solo letras y sin palabras de rótulos. */
export function looksLikeFullName(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  if (!/^\p{L}[\p{L}'’.\- ,]*$/u.test(value) || value.endsWith(".")) return false;
  if ((value.match(/,/g) ?? []).length > 1) return false;
  return !normalizeName(value)
    .split(/[\s,]+/)
    .some((word) => AUXILIARY_WORDS.has(word));
}

/**
 * Planillas propias sin encabezado reconocible: se elige la columna con más
 * celdas que parecen nombres completos y se toman solo esas celdas, en orden.
 */
function parseByShape(rows: unknown[][], firstRowNumber: number): RosterParseResult {
  const candidates = rows.flatMap((row, rowIndex) => row.flatMap((cell, column) => {
    const value = String(cell ?? "").trim();
    return looksLikeFullName(value)
      ? [{ column, fullName: value, sheetRow: firstRowNumber + rowIndex }]
      : [];
  }));
  if (!candidates.length) return { ok: false, errors: [EMPTY_ROSTER_MESSAGE] };

  const countByColumn = new Map<number, number>();
  candidates.forEach(({ column }) => countByColumn.set(column, (countByColumn.get(column) ?? 0) + 1));
  const [column] = [...countByColumn].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const chosen = candidates.filter((candidate) => candidate.column === column);
  if (chosen.length > MAX_ROSTER_SIZE) return { ok: false, errors: [tooManyError(chosen.length)] };

  return {
    ok: true,
    numberedByOrder: true,
    detectedBy: "shape",
    warnings: [
      `No encontramos la columna «${ROSTER_NAME_HEADER}»: se tomaron los nombres de la columna ${columnLetter(column)} por su forma. Revisa la lista antes de importar.`,
      ...homonymWarnings(chosen),
    ],
    entries: chosen.map((candidate, index) => ({ number: index + 1, fullName: candidate.fullName })),
  };
}

/**
 * Convierte las filas de una hoja en la nómina a importar.
 * Respeta el N° si la columna viene completa; si viene vacía en todas las
 * filas, numera por orden. Cualquier otro caso se rechaza con la fila exacta.
 * `firstRowNumber` es el número de fila de la planilla que corresponde a rows[0].
 */
export function parseRoster(rows: unknown[][], firstRowNumber = 1): RosterParseResult {
  const headerIndex = findHeaderIndex(rows);
  return headerIndex >= 0
    ? parseWithHeader(rows, headerIndex, firstRowNumber)
    : parseByShape(rows, firstRowNumber);
}

/**
 * Elige la hoja de la nómina. Si alguna hoja tiene el encabezado de nombres,
 * solo esas hojas son candidatas: así una hoja de instrucciones nunca se lee
 * como nómina. Se prefiere la hoja «Nómina» y luego la que tenga más nombres.
 */
export function parseRosterWorkbook(sheets: RosterSheet[]): RosterWorkbookResult {
  const withHeader = sheets.filter((sheet) => findHeaderIndex(sheet.rows) >= 0);
  const parsed = (withHeader.length ? withHeader : sheets).map((sheet) => ({
    sheetName: sheet.name,
    result: parseRoster(sheet.rows, sheet.firstRowNumber),
  }));
  const useful = withHeader.length ? parsed : parsed.filter((option) => option.result.ok);
  const options = useful.length
    ? useful
    : [{ sheetName: sheets[0]?.name ?? "", result: { ok: false, errors: [EMPTY_ROSTER_MESSAGE] } as RosterParseResult }];

  const named = options.findIndex(
    (option) => option.result.ok && normalizeName(option.sheetName) === normalizeName(ROSTER_SHEET_NAME),
  );
  const sizes = options.map((option) => (option.result.ok ? option.result.entries.length : -1));
  const largest = sizes.indexOf(Math.max(...sizes));
  return { options, preferred: named >= 0 ? named : largest };
}

/**
 * Decodifica un CSV. SheetJS lee los bytes de un CSV sin BOM como Latin-1, así
 * que un archivo UTF-8 sin BOM (el que descarga Google Sheets) convertía «León»
 * en «LeÃ³n». Se intenta UTF-8 estricto y, si no es válido, Windows-1252, que es
 * lo que guarda Excel como «CSV delimitado por comas».
 */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
