import { describe, expect, it } from "vitest";
import { EMPTY_ROSTER_MESSAGE, decodeCsv, parseRoster } from "./roster-import";

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

  it("numerando por orden, un nombre repetido se importa una sola vez", () => {
    const result = entriesOf([HEADER, ["", "Ana Rivas Soto"], ["", "Ana Rivas Soto"], ["", "Bruno Tapia León"]]);

    expect(result.entries.map((entry) => entry.fullName)).toEqual(["Ana Rivas Soto", "Bruno Tapia León"]);
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

  it("si con N° un mismo nombre aparece dos veces", () => {
    expect(errorsOf([HEADER, [1, "Ana Rivas Soto"], [2, "Ana Rivas Soto"]]))
      .toEqual(["«Ana Rivas Soto» aparece más de una vez (filas 2, 3)."]);
  });

  it("informa todos los problemas, no solo el primero", () => {
    const errors = errorsOf([HEADER, ["x", "Ana Rivas Soto"], ["", "Bruno Tapia León"], [3, "Camila Ovalle Díaz"], [3, "Diego Farías Muñoz"]]);

    expect(errors).toHaveLength(3);
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

  it("sin encabezado reconocible, toma las celdas que parecen nombres completos y numera por orden", () => {
    const result = entriesOf([["Ana Rivas Soto", "x"], ["Bruno Tapia León", 7], ["Ana Rivas Soto", ""]]);

    expect(result.numberedByOrder).toBe(true);
    expect(result.entries).toEqual([
      { number: 1, fullName: "Ana Rivas Soto" },
      { number: 2, fullName: "Bruno Tapia León" },
    ]);
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
