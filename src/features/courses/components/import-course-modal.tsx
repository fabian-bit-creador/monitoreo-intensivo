import { ChangeEvent, useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type ImportCourseModalProps = {
  suggestedCourseName: string;
  busy: boolean;
  onImport: (courseName: string, names: string[]) => Promise<boolean>;
  onError: (message: string) => void;
  onClose: () => void;
};

const NAME_HEADERS = [
  "Nombre Completo Alumno",
  "Nombre completo",
  "Nombre",
  "Estudiante",
  "Alumno",
];

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
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const header = NAME_HEADERS.find((candidate) =>
        rows.some((row) => String(row[candidate] ?? "").trim()),
      );
      const names = header
        ? rows.map((row) => String(row[header] ?? "").trim()).filter(Boolean)
        : XLSX.utils
            .sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })
            .flatMap((row) => row.map((cell) => String(cell).trim()))
            .filter((value) => value.split(/\s+/).length >= 2);
      const courseName = window.prompt("Nombre del curso", suggestedCourseName)?.trim();
      if (!courseName) return;
      const imported = await onImport(courseName, names);
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
          Buscaremos una columna llamada “Nombre Completo Alumno”, “Nombre”, “Estudiante”
          o “Alumno”. No se importarán RUT ni correos.
        </p>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={importFile}
        />
        <button
          className="primary-button wide"
          onClick={() => fileInput.current?.click()}
          disabled={busy || reading}
        >
          {busy || reading
            ? <LoaderCircle className="spin" size={18} />
            : <Upload size={18} />}
          Seleccionar planilla
        </button>
      </div>
    </Modal>
  );
}
