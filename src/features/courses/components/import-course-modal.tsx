import { ChangeEvent, useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  decodeCsv,
  parseRosterWorkbook,
  type RosterSheet,
  type RosterWorkbookResult,
} from "@/features/courses/lib/roster-import";
import { rosterOverlap } from "@/features/courses/lib/roster-update";
import type { MonitoringState, RosterEntry } from "@/types/monitoring";
import { downloadRosterTemplate } from "@/features/courses/lib/roster-template";
import { RosterPreview, type ImportTarget } from "./roster-preview";

type ImportCourseModalProps = {
  data: MonitoringState;
  /** Curso seleccionado: si está pendiente de nómina, es el destino natural. */
  currentCourseId: string;
  suggestedCourseName: string;
  busy: boolean;
  error: string;
  onImport: (courseName: string, entries: RosterEntry[]) => Promise<boolean>;
  onUpdate: (courseId: string, entries: RosterEntry[]) => Promise<boolean>;
  onClose: () => void;
};

type Preview = { fileName: string; workbook: RosterWorkbookResult; sheetIndex: number };

/**
 * Destino sugerido: el curso seleccionado si está pendiente de nómina; si no,
 * el curso que comparte al menos la mitad de los nombres; si no, uno nuevo.
 */
function suggestTarget(
  data: MonitoringState,
  currentCourseId: string,
  entries: RosterEntry[],
  suggestedCourseName: string,
): ImportTarget {
  const pending = !data.students.some((student) => student.courseId === currentCourseId && student.active);
  if (pending && data.courses.some((course) => course.id === currentCourseId)) {
    return { mode: "update", courseId: currentCourseId };
  }
  const [best] = data.courses
    .map((course) => ({ courseId: course.id, overlap: rosterOverlap(data, course.id, entries) }))
    .sort((a, b) => b.overlap - a.overlap);
  return best && best.overlap > 0 && best.overlap >= entries.length / 2
    ? { mode: "update", courseId: best.courseId }
    : { mode: "new", courseName: suggestedCourseName };
}

export function ImportCourseModal(props: ImportCourseModalProps) {
  const {
    data,
    currentCourseId,
    suggestedCourseName,
    busy,
    error,
    onImport,
    onUpdate,
    onClose,
  } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [target, setTarget] = useState<ImportTarget>({ mode: "new", courseName: suggestedCourseName });
  // El error del store solo se muestra si surge al confirmar.
  const [attempted, setAttempted] = useState(false);

  function showSheet(next: Preview) {
    const result = next.workbook.options[next.sheetIndex].result;
    setPreview(next);
    setTarget(suggestTarget(data, currentCourseId, result.ok ? result.entries : [], suggestedCourseName));
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    setReadError("");
    setAttempted(false);
    try {
      const XLSX = await import("xlsx");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const workbook = /\.csv$/i.test(file.name) || file.type === "text/csv"
        ? XLSX.read(decodeCsv(bytes), { type: "string" })
        : XLSX.read(bytes, { type: "array" });
      const sheets: RosterSheet[] = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        return {
          name,
          rows: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true }),
          firstRowNumber: sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r + 1 : 1,
        };
      });
      const parsed = parseRosterWorkbook(sheets);
      showSheet({ fileName: file.name, workbook: parsed, sheetIndex: parsed.preferred });
    } catch {
      setReadError("No pudimos leer el archivo. Usa una planilla Excel o CSV con una columna de nombres.");
    } finally {
      setReading(false);
      event.target.value = "";
    }
  }

  async function confirm(entries: RosterEntry[]) {
    setAttempted(true);
    const done = target.mode === "update"
      ? await onUpdate(target.courseId, entries)
      : await onImport(target.courseName.trim(), entries);
    if (done) onClose();
  }

  return (
    <Modal title="Importar nómina" onClose={onClose}>
      {preview ? (
        <RosterPreview
          data={data}
          fileName={preview.fileName}
          options={preview.workbook.options}
          sheetIndex={preview.sheetIndex}
          onSheetChange={(sheetIndex) => showSheet({ ...preview, sheetIndex })}
          target={target}
          onTargetChange={setTarget}
          suggestedCourseName={suggestedCourseName}
          busy={busy}
          error={attempted ? error : ""}
          onBack={() => setPreview(null)}
          onConfirm={(entries) => void confirm(entries)}
        />
      ) : (
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
            onChange={(event) => void readFile(event)}
          />
          {readError ? (
            <div className="error-banner" role="alert"><AlertTriangle size={17} /> {readError}</div>
          ) : null}
          <div className="import-actions">
            <button
              className="secondary-button wide"
              onClick={() => void downloadRosterTemplate().catch(
                () => setReadError("No fue posible generar la plantilla."),
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
            Antes de cargar verás la lista y podrás elegir si crea un curso nuevo o actualiza
            uno existente. Los puestos no van en la planilla: se asignan aquí, sobre el mapa
            del curso, con «Mover puestos».
          </p>
        </div>
      )}
    </Modal>
  );
}
