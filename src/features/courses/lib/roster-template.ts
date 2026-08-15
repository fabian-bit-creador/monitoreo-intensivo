export const ROSTER_NUMBER_HEADER = "N°";
export const ROSTER_NAME_HEADER = "Nombre Completo Alumno";
export const ROSTER_SHEET_NAME = "Nómina";
export const ROSTER_TEMPLATE_FILENAME = "plantilla-nomina-monitoreo.xlsx";

const INSTRUCTIONS: string[][] = [
  ["Cómo completar esta plantilla"],
  [],
  ["1", `Escribe un estudiante por fila en la hoja "${ROSTER_SHEET_NAME}", desde la fila 2.`],
  ["2", `La columna "${ROSTER_NAME_HEADER}" es la única obligatoria.`],
  ["3", `La columna "${ROSTER_NUMBER_HEADER}" es el número de lista. Si la dejas vacía se asigna por orden.`],
  ["4", "No cambies los nombres de las columnas ni el orden de las hojas."],
  ["5", "No agregues RUT, correos, diagnósticos, calificaciones ni datos de apoderados."],
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
