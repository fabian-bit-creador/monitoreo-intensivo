import type { RosterEntry } from "@/types/monitoring";
import { ROSTER_NAME_HEADER, ROSTER_NUMBER_HEADER } from "./roster-template";

export type RosterParseResult =
  | { ok: true; entries: RosterEntry[]; numberedByOrder: boolean }
  | { ok: false; errors: string[] };

const NAME_HEADERS = [ROSTER_NAME_HEADER, "Nombre completo", "Nombre", "Estudiante", "Alumno"];
const NUMBER_HEADERS = [ROSTER_NUMBER_HEADER, "Nº", "N", "No", "No.", "Número", "Numero", "Número de lista"];

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("es");
const NAME_KEYS = NAME_HEADERS.map(normalize);
const NUMBER_KEYS = new Set(NUMBER_HEADERS.map(normalize));
const HEADER_KEYS = new Set([...NAME_KEYS, ...NUMBER_KEYS]);

export const EMPTY_ROSTER_MESSAGE =
  `La planilla no tiene estudiantes. Completa la columna “${ROSTER_NAME_HEADER}” y vuelve a subirla.`;

function parseListNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  const text = String(value).trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : null;
}

/**
 * Convierte las filas de la primera hoja en la nómina a importar.
 * Respeta el N° si la columna viene completa; si viene vacía en todas las
 * filas, numera por orden. Cualquier otro caso se rechaza con la fila exacta.
 * `firstRowNumber` es el número de fila de la planilla que corresponde a rows[0].
 */
export function parseRoster(rows: unknown[][], firstRowNumber = 1): RosterParseResult {
  const headerIndex = rows.findIndex((row) => row.some((cell) => NAME_KEYS.includes(normalize(cell))));
  if (headerIndex < 0) return parseWithoutHeader(rows);

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

  const hasNumbers = filled.some((row) => String(row.rawNumber ?? "").trim() !== "");
  if (!hasNumbers) {
    const unique = [...new Set(filled.map((row) => row.fullName))];
    return { ok: true, numberedByOrder: true, entries: unique.map((fullName, index) => ({ number: index + 1, fullName })) };
  }

  const errors: string[] = [];
  const rowsByNumber = new Map<number, number[]>();
  const rowsByName = new Map<string, number[]>();
  const entries: RosterEntry[] = [];
  for (const row of filled) {
    rowsByName.set(row.fullName, [...(rowsByName.get(row.fullName) ?? []), row.sheetRow]);
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
  for (const [fullName, sheetRows] of rowsByName) {
    if (sheetRows.length > 1) errors.push(`«${fullName}» aparece más de una vez (filas ${sheetRows.join(", ")}).`);
  }
  if (errors.length) return { ok: false, errors };

  return { ok: true, numberedByOrder: false, entries: entries.sort((a, b) => a.number - b.number) };
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

// Planillas propias sin encabezado reconocible: se toman las celdas que
// parecen nombres completos, en orden de lectura, y se numera por orden.
function parseWithoutHeader(rows: unknown[][]): RosterParseResult {
  const names = rows
    .flatMap((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((value) => value.split(/\s+/).length >= 2)
    .filter((value) => !HEADER_KEYS.has(normalize(value)));
  const unique = [...new Set(names)];
  if (!unique.length) return { ok: false, errors: [EMPTY_ROSTER_MESSAGE] };
  return { ok: true, numberedByOrder: true, entries: unique.map((fullName, index) => ({ number: index + 1, fullName })) };
}
