import { ChangeEvent, useRef, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { decodeCsv, parseRoster } from "@/features/courses/lib/roster-import";
import type { RosterEntry } from "@/types/monitoring";
import { downloadRosterTemplate } from "@/features/courses/lib/roster-template";

type ImportCourseModalProps = {
  suggestedCourseName: string;
  busy: boolean;
  onImport: (courseName: string, entries: RosterEntry[]) => Promise<boolean>;
  onError: (message: string) => void;
  onClose: () => void;
};

const MAX_ERRORS_SHOWN = 3;

export function ImportCourseModal(props: ImportCourseModalProps) {
  const { suggestedCourseName, busy, onImport, onError, onClose } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    try {
      const XLSX = await import("xlsx");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const workbook = /\.csv$/i.test(file.name) || file.type === "text/csv"
        ? XLSX.read(decodeCsv(bytes), { type: "string" })
        : XLSX.read(bytes, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
      const firstRow = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r + 1 : 1;
      const parsed = parseRoster(rows, firstRow);
      if (!parsed.ok) {
        const extra = parsed.errors.length - MAX_ERRORS_SHOWN;
        onError([
          ...parsed.errors.slice(0, MAX_ERRORS_SHOWN),
          ...(extra > 0 ? [`Y ${extra} problema${extra === 1 ? "" : "s"} más.`] : []),
        ].join(" "));
        return;
      }
      const courseName = window.prompt("Nombre del curso", suggestedCourseName)?.trim();
      if (!courseName) return;
      const imported = await onImport(courseName, parsed.entries);
      if (imported) onClose();
    } catch {
      onError("No pudimos leer el archivo. Usa una planilla con una columna de nombres.");
    } finally {
      setReading(false);
      event.target.value = "";
    }
  }

  return (
    <Modal title="Importar nómina" onClose={onClose}>
      <div className="import-panel">
        <div className="import-icon"><FileSpreadsheet size={30} /></div>
        <h3>Excel o CSV</h3>
        <p>
          Descarga la plantilla, escribe un estudiante por fila y vuelve a subirla.
          También aceptamos tu propia planilla si tiene una columna “Nombre Completo
          Alumno”, “Nombre”, “Estudiante” o “Alumno”. No se importarán RUT ni correos.
        </p>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={importFile}
        />
        <div className="import-actions">
          <button
            className="secondary-button wide"
            onClick={() => void downloadRosterTemplate().catch(
              () => onError("No fue posible generar la plantilla."),
            )}
          >
            <Download size={18} /> Descargar plantilla
          </button>
          <button
            className="primary-button wide"
            onClick={() => fileInput.current?.click()}
            disabled={busy || reading}
          >
            {busy || reading
              ? <LoaderCircle className="spin" size={18} />
              : <Upload size={18} />}
            Subir planilla
          </button>
        </div>
        <p className="import-note">
          Los puestos no van en la planilla: se asignan aquí, sobre el mapa del curso,
          con «Mover puestos».
        </p>
      </div>
    </Modal>
  );
}
