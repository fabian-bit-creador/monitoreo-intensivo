import { describe, expect, it } from "vitest";
import {
  EMPTY_ROSTER_MESSAGE,
  MAX_ROSTER_SIZE,
  decodeCsv,
  looksLikeFullName,
  parseRoster,
  parseRosterWorkbook,
  rosterRowsFromText,
  type RosterSheet,
} from "./roster-import";

const HEADER = ["N°", "Nombre Completo Alumno"];

function entriesOf(rows: unknown[][], firstRowNumber?: number) {
  const result = parseRoster(rows, firstRowNumber);
  if (!result.ok) throw new Error(`se esperaba una nómina válida: ${result.errors.join(" | ")}`);
  return result;
}

function errorsOf(rows: unknown[][], firstRowNumber?: number) {
  const result = parseRoster(rows, firstRowNumber);
  if (result.ok) throw new Error("se esperaba un rechazo");
  return result.errors;
}

describe("parseRoster con la columna N° completa", () => {
  it("respeta el N° de lista y ordena la nómina por N°", () => {
    const result = entriesOf([
      HEADER,
      [7, "Ana Rivas Soto"],
      [3, "Bruno Tapia León"],
      [12, "Camila Ovalle Díaz"],
    ]);

    expect(result.numberedByOrder).toBe(false);
    expect(result.entries).toEqual([
      { number: 3, fullName: "Bruno Tapia León" },
      { number: 7, fullName: "Ana Rivas Soto" },
      { number: 12, fullName: "Camila Ovalle Díaz" },
    ]);
  });

  it.each([
    ["un número", 7],
    ["un texto numérico", "7"],
    ["un texto con ceros y espacios", " 07 "],
  ])("acepta el N° escrito como %s", (_, value) => {
    expect(entriesOf([HEADER, [value, "Ana Rivas Soto"]]).entries[0].number).toBe(7);
  });

  it("ignora las filas con N° pero sin nombre: cupos libres de una plantilla prenumerada", () => {
    const result = entriesOf([HEADER, [1, "Ana Rivas Soto"], [2, ""], [3, "Bruno Tapia León"], [4, "  "]]);

    expect(result.entries.map((entry) => entry.number)).toEqual([1, 3]);
  });

  it("recorta los nombres", () => {
    expect(entriesOf([HEADER, [1, "  Ana Rivas Soto  "]]).entries[0].fullName).toBe("Ana Rivas Soto");
  });
});

describe("parseRoster sin N°", () => {
  it("si la columna N° está vacía en todas las filas, numera por orden", () => {
    const result = entriesOf([HEADER, ["", "Ana Rivas Soto"], ["", "Bruno Tapia León"]]);

    expect(result.numberedByOrder).toBe(true);
    expect(result.entries).toEqual([
      { number: 1, fullName: "Ana Rivas Soto" },
      { number: 2, fullName: "Bruno Tapia León" },
    ]);
  });

  it("si no hay columna N°, numera por orden", () => {
    const result = entriesOf([["Nombre"], ["Ana Rivas Soto"], ["Bruno Tapia León"]]);

    expect(result.entries.map((entry) => entry.number)).toEqual([1, 2]);
  });

  it("numerando por orden, conserva los homónimos y avisa", () => {
    const result = entriesOf([HEADER, ["", "Ana Rivas Soto"], ["", "Ana Rivas Soto"], ["", "Bruno Tapia León"]]);

    expect(result.entries).toEqual([
      { number: 1, fullName: "Ana Rivas Soto" },
      { number: 2, fullName: "Ana Rivas Soto" },
      { number: 3, fullName: "Bruno Tapia León" },
    ]);
    expect(result.warnings).toEqual([
      "«Ana Rivas Soto» aparece 2 veces (filas 2, 3); se importarán como estudiantes distintos.",
    ]);
  });
});

describe("parseRoster rechaza la planilla e indica la fila", () => {
  it("si faltan algunos N° y otros no", () => {
    expect(errorsOf([HEADER, [1, "Ana Rivas Soto"], ["", "Bruno Tapia León"]]))
      .toEqual(["Fila 3: falta el N° de «Bruno Tapia León»."]);
  });

  it.each([
    ["un texto", "abc"],
    ["cero", 0],
    ["un negativo", -2],
    ["un decimal", 3.5],
    ["un texto con letras", "7a"],
  ])("si el N° es %s", (_, value) => {
    expect(errorsOf([HEADER, [value, "Ana Rivas Soto"]])).toEqual([
      `Fila 2: «${String(value)}» no es un N° de lista válido.`,
    ]);
  });

  it("si un N° está repetido", () => {
    expect(errorsOf([HEADER, [4, "Ana Rivas Soto"], [5, "Bruno Tapia León"], [4, "Camila Ovalle Díaz"]]))
      .toEqual(["El N° 4 está repetido (filas 2, 4)."]);
  });

  it("informa todos los problemas, no solo el primero", () => {
    const errors = errorsOf([HEADER, ["x", "Ana Rivas Soto"], ["", "Bruno Tapia León"], [3, "Camila Ovalle Díaz"], [3, "Diego Farías Muñoz"]]);

    expect(errors).toHaveLength(3);
  });

  it(`si tiene más de ${MAX_ROSTER_SIZE} estudiantes`, () => {
    const rows = [HEADER, ...Array.from({ length: MAX_ROSTER_SIZE + 1 }, (_, index) => [index + 1, `Estudiante Ficticio ${index + 1}`])];

    expect(errorsOf(rows)).toEqual([
      `La planilla tiene ${MAX_ROSTER_SIZE + 1} estudiantes y el máximo es ${MAX_ROSTER_SIZE}. Revisa si incluye más de un curso.`,
    ]);
  });

  it("usa el número de fila real de la planilla", () => {
    const rows = [["Nómina III°B"], [], HEADER, [1, "Ana Rivas Soto"], ["", "Bruno Tapia León"]];

    expect(errorsOf(rows)).toEqual(["Fila 5: falta el N° de «Bruno Tapia León»."]);
    expect(errorsOf(rows.slice(2), 3)).toEqual(["Fila 5: falta el N° de «Bruno Tapia León»."]);
  });
});

describe("parseRoster con planillas vacías", () => {
  it.each([
    ["la plantilla en blanco", [HEADER]],
    ["una plantilla prenumerada sin nombres", [HEADER, [1, ""], [2, ""]]],
    ["una hoja vacía", []],
    ["una hoja sin nombres reconocibles", [["x", 1], ["", ""]]],
  ])("rechaza %s", (_, rows) => {
    expect(errorsOf(rows as unknown[][])).toEqual([EMPTY_ROSTER_MESSAGE]);
  });
});

describe("parseRoster con planillas propias", () => {
  it("reconoce el encabezado aunque haya filas de título antes", () => {
    const result = entriesOf([["Colegio Ficticio"], ["Nómina 2026"], HEADER, [2, "Ana Rivas Soto"]]);

    expect(result.entries).toEqual([{ number: 2, fullName: "Ana Rivas Soto" }]);
  });

  it.each([
    [["Nº", "Nombre completo"]],
    [["número de lista", "ESTUDIANTE"]],
    [["  n  ", "alumno"]],
  ])("acepta variantes de encabezado: %j", (header) => {
    expect(entriesOf([header, [5, "Ana Rivas Soto"]]).entries).toEqual([{ number: 5, fullName: "Ana Rivas Soto" }]);
  });

  it("prefiere la columna «Nombre Completo Alumno» si también hay una columna «Nombre»", () => {
    const result = entriesOf([["Nombre", "N°", "Nombre Completo Alumno"], ["Ana", 1, "Ana Rivas Soto"]]);

    expect(result.entries[0].fullName).toBe("Ana Rivas Soto");
  });

  it("con N°, conserva los homónimos con números distintos y avisa", () => {
    const result = entriesOf([HEADER, [4, "Ana Rivas Soto"], [17, "ana rivas soto"]]);

    expect(result.entries.map((entry) => entry.number)).toEqual([4, 17]);
    expect(result.warnings).toEqual([
      "«Ana Rivas Soto» aparece 2 veces (filas 2, 3); se importarán como estudiantes distintos.",
    ]);
  });
});

describe("parseRoster sin encabezado reconocible", () => {
  it("toma la columna con más nombres, numera por orden y pide revisar la lista", () => {
    const result = entriesOf([
      ["Curso III°B 2026", ""],
      ["Profesor jefe: Daniel Prueba", ""],
      ["", "Ana Rivas Soto"],
      ["", "Bruno Tapia León"],
      ["Lista de estudiantes", "Camila Ovalle Díaz"],
    ]);

    expect(result.detectedBy).toBe("shape");
    expect(result.entries).toEqual([
      { number: 1, fullName: "Ana Rivas Soto" },
      { number: 2, fullName: "Bruno Tapia León" },
      { number: 3, fullName: "Camila Ovalle Díaz" },
    ]);
    expect(result.warnings[0]).toBe(
      "No encontramos la columna «Nombre Completo Alumno»: se tomaron los nombres de la columna B por su forma. Revisa la lista antes de importar.",
    );
  });

  it("no mezcla otra columna de nombres, como la de apoderados", () => {
    const result = entriesOf([
      ["Ana Rivas Soto", "Pedro Rivas Mora"],
      ["Bruno Tapia León", "Marta León Díaz"],
      ["Camila Ovalle Díaz", ""],
    ]);

    expect(result.entries.map((entry) => entry.fullName)).toEqual(["Ana Rivas Soto", "Bruno Tapia León", "Camila Ovalle Díaz"]);
    expect(result.warnings[0]).toContain("columna A");
  });

  it("conserva los homónimos también sin encabezado", () => {
    const result = entriesOf([["Ana Rivas Soto"], ["Bruno Tapia León"], ["Ana Rivas Soto"]]);

    expect(result.entries.map((entry) => entry.fullName)).toEqual(["Ana Rivas Soto", "Bruno Tapia León", "Ana Rivas Soto"]);
    expect(result.warnings).toHaveLength(2);
  });
});

describe("looksLikeFullName", () => {
  it.each([
    "Ana Rivas Soto",
    "María de los Ángeles Pérez",
    "José-Tomás O'Higgins Muñoz",
    "Rivas Soto, Ana",
  ])("acepta «%s»", (value) => {
    expect(looksLikeFullName(value)).toBe(true);
  });

  it.each([
    "Ana",
    "Escribe un estudiante por fila.",
    "Lista de estudiantes",
    "Profesor jefe: Daniel Prueba",
    "Curso III°B 2026",
    "Nómina del curso",
    "Total alumnos",
    "uno dos tres cuatro cinco seis siete",
    "Rivas, Soto, Ana",
    "(Ana Rivas)",
  ])("descarta «%s»", (value) => {
    expect(looksLikeFullName(value)).toBe(false);
  });
});

describe("parseRosterWorkbook", () => {
  const sheet = (name: string, rows: unknown[][]): RosterSheet => ({ name, rows, firstRowNumber: 1 });
  const instructions = sheet("Instrucciones", [
    ["Cómo completar esta plantilla"],
    ["1", "Escribe un estudiante por fila en la hoja Nómina"],
    ["", "Esta plantilla no incluye la distribución de la sala"],
  ]);

  it("encuentra la nómina aunque no esté en la primera hoja", () => {
    const result = parseRosterWorkbook([instructions, sheet("Curso", [HEADER, [1, "Ana Rivas Soto"]])]);

    expect(result.options.map((option) => option.sheetName)).toEqual(["Curso"]);
    expect(result.options[0].result).toMatchObject({ ok: true, entries: [{ number: 1, fullName: "Ana Rivas Soto" }] });
  });

  it("con la nómina en blanco, rechaza en vez de leer las instrucciones", () => {
    const result = parseRosterWorkbook([sheet("Nómina", [HEADER]), instructions]);

    expect(result.options).toEqual([{ sheetName: "Nómina", result: { ok: false, errors: [EMPTY_ROSTER_MESSAGE] } }]);
  });

  it("con varias hojas con encabezado, ofrece todas y prefiere la llamada «Nómina»", () => {
    const result = parseRosterWorkbook([
      sheet("Otro curso", [HEADER, [1, "Ana Rivas Soto"], [2, "Bruno Tapia León"]]),
      sheet("NOMINA", [HEADER, [1, "Camila Ovalle Díaz"]]),
    ]);

    expect(result.options.map((option) => option.sheetName)).toEqual(["Otro curso", "NOMINA"]);
    expect(result.preferred).toBe(1);
  });

  it("sin hoja «Nómina», prefiere la que tiene más estudiantes", () => {
    const result = parseRosterWorkbook([
      sheet("A", [HEADER, [1, "Ana Rivas Soto"]]),
      sheet("B", [HEADER, [1, "Bruno Tapia León"], [2, "Camila Ovalle Díaz"]]),
    ]);

    expect(result.preferred).toBe(1);
  });

  it("sin encabezados, usa solo las hojas donde reconoce nombres", () => {
    const result = parseRosterWorkbook([instructions, sheet("Hoja2", [["Ana Rivas Soto"], ["Bruno Tapia León"]])]);

    expect(result.options.map((option) => option.sheetName)).toEqual(["Hoja2"]);
    expect(result.options[0].result).toMatchObject({ ok: true, detectedBy: "shape" });
  });

  it("si no reconoce nada, informa la planilla vacía", () => {
    expect(parseRosterWorkbook([sheet("Hoja1", [["x", 1]])])).toEqual({
      options: [{ sheetName: "Hoja1", result: { ok: false, errors: [EMPTY_ROSTER_MESSAGE] } }],
      preferred: 0,
    });
    expect(parseRosterWorkbook([]).options[0].result).toEqual({ ok: false, errors: [EMPTY_ROSTER_MESSAGE] });
  });
});

describe("decodeCsv", () => {
  const text = "Nº,Nombre completo\n2,Bruno Tapia León\n3,Ñuñoa Pérez Díaz\n";

  it.each([
    ["UTF-8 sin BOM, como lo descarga Google Sheets", new TextEncoder().encode(text)],
    ["UTF-8 con BOM, como «CSV UTF-8» de Excel", new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])],
    ["Windows-1252, como «CSV delimitado por comas» de Excel", Uint8Array.from([...text].map((char) => char.charCodeAt(0)))],
  ])("conserva tildes y ñ en %s", (_, bytes) => {
    expect(decodeCsv(bytes)).toBe(text);
  });
});

describe("rosterRowsFromText", () => {
  const parse = (text: string) => parseRoster(rosterRowsFromText(text), 0);

  it("una línea por estudiante: sin N°, se numera por orden", () => {
    const result = parse("Ana Rivas Soto\n\n  Bruno Díaz Pérez  \nCamila Ruiz\n");
    expect(result).toMatchObject({ ok: true, numberedByOrder: true });
    expect(result.ok && result.entries).toEqual([
      { number: 1, fullName: "Ana Rivas Soto" },
      { number: 2, fullName: "Bruno Díaz Pérez" },
      { number: 3, fullName: "Camila Ruiz" },
    ]);
  });

  it.each([
    ["con punto", "2. Bruno Díaz\n1. Ana Rivas"],
    ["con paréntesis", "2) Bruno Díaz\n1) Ana Rivas"],
    ["con guion", "2 - Bruno Díaz\n1 - Ana Rivas"],
    ["copiado de dos columnas", "N°\tNombre\n2\tBruno Díaz\n1\tAna Rivas"],
  ])("respeta el N° escrito %s", (_case, text) => {
    const result = parse(text);
    expect(result.ok && result.entries).toEqual([
      { number: 1, fullName: "Ana Rivas" },
      { number: 2, fullName: "Bruno Díaz" },
    ]);
  });

  it("une apellidos y nombres copiados en columnas separadas", () => {
    const result = parse("1\tRivas\tSoto\tAna");
    expect(result.ok && result.entries).toEqual([{ number: 1, fullName: "Rivas Soto Ana" }]);
  });

  it("si solo algunos tienen N°, avisa la línea", () => {
    const result = parse("1 Ana Rivas\nBruno Díaz");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(" ")).toContain("Fila 2");
  });

  it("una lista vacía no tiene estudiantes", () => {
    expect(parse("   \n").ok).toBe(false);
  });
});
