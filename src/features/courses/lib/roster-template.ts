export const ROSTER_NUMBER_HEADER = "N°";
export const ROSTER_NAME_HEADER = "Nombre Completo Alumno";
export const ROSTER_SHEET_NAME = "Nómina";
export const ROSTER_TEMPLATE_FILENAME = "plantilla-nomina-monitoreo.xlsx";

const INSTRUCTIONS: string[][] = [
  ["Cómo completar esta plantilla"],
  [],
  ["1", `Escribe un estudiante por fila en la hoja "${ROSTER_SHEET_NAME}", desde la fila 2.`],
  ["2", `La columna "${ROSTER_NAME_HEADER}" es la única obligatoria.`],
  [
    "3",
    `La columna "${ROSTER_NUMBER_HEADER}" es el número de lista y la nómina se ordena según él.`
    + " Si la dejas vacía en todas las filas, se numera según el orden de las filas.",
  ],
  ["4", "No dejes algunos N° vacíos ni repitas un número: la planilla se rechazará indicando la fila."],
  ["5", "Las filas con N° pero sin nombre se ignoran, así que puedes dejar cupos libres."],
  ["6", "Dos estudiantes con el mismo nombre se conservan como estudiantes distintos; distínguelos por su N°."],
  [
    "7",
    "Para actualizar un curso, sube su nómina completa: antes de cargar verás quién entra, quién"
    + " cambia de N° y quién deja el curso. Cada estudiante conserva sus registros y su puesto.",
  ],
  ["8", "No cambies los nombres de las columnas."],
  ["9", "No agregues RUT, correos, diagnósticos, calificaciones ni datos de apoderados."],
  [],
  ["Puestos"],
  [
    "",
    "Esta plantilla no incluye la distribución de la sala. Los puestos se asignan"
    + " dentro de la aplicación, con «Mover puestos», sobre el mapa del curso.",
  ],
  [],
  ["Privacidad"],
  [
    "",
    "El archivo queda solo en el navegador que lo importa. No lo subas al"
    + " repositorio ni lo compartas por canales abiertos.",
  ],
];

/**
 * Genera y descarga la plantilla de nómina en blanco.
 * Es el mismo formato que espera la importación, para que los cursos no
 * lleguen cada uno con una planilla distinta.
 */
export async function downloadRosterTemplate() {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const roster = XLSX.utils.aoa_to_sheet([[ROSTER_NUMBER_HEADER, ROSTER_NAME_HEADER]]);
  roster["!cols"] = [{ wch: 6 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(workbook, roster, ROSTER_SHEET_NAME);

  const instructions = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
  instructions["!cols"] = [{ wch: 4 }, { wch: 92 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Instrucciones");

  XLSX.writeFile(workbook, ROSTER_TEMPLATE_FILENAME);
}
