import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  Upload,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  decodeCsv,
  parseRosterWorkbook,
  rosterRowsFromText,
  type RosterSheet,
  type RosterWorkbookResult,
} from "@/features/courses/lib/roster-import";
import { layoutError } from "@/features/courses/lib/room-layouts";
import { rosterOverlap } from "@/features/courses/lib/roster-update";
import type { MonitoringState, RosterEntry } from "@/types/monitoring";
import { downloadRosterTemplate } from "@/features/courses/lib/roster-template";
import { clearCourseSetupDraft, loadCourseSetupDraft, saveCourseSetupDraft } from "@/features/courses/lib/course-draft-storage";
import { initialRoomDraft, RoomDesigner, type RoomDraft } from "./room-designer";
import { RosterPreview, type ImportTarget } from "./roster-preview";

export type NewCourseOptions = {
  room: RoomDraft;
  spaceId?: string;
  academicYear: number;
  focusNumbers: number[];
};

type ImportCourseModalProps = {
  data: MonitoringState;
  /** Curso seleccionado: si está pendiente de nómina, es el destino natural. */
  currentCourseId: string;
  suggestedCourseName: string;
  /** Espacios donde la cuenta puede crear cursos (solo en la nube). */
  spaces?: Array<{ id: string; name: string }>;
  busy: boolean;
  error: string;
  onImport: (courseName: string, entries: RosterEntry[], options: NewCourseOptions) => Promise<boolean>;
  onUpdate: (courseId: string, entries: RosterEntry[]) => Promise<boolean>;
  onClose: () => void;
};

type Preview = {
  fileName: string;
  workbook: RosterWorkbookResult;
  sheetIndex: number;
  source: "file" | "text";
};

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

/**
 * Crear un curso o actualizar una nómina. Los estudiantes se escriben o se
 * pegan, o vienen de un Excel; ambos pasan por la misma revisión. Un curso
 * nuevo termina eligiendo su sala (ADR 0004).
 */
export function ImportCourseModal(props: ImportCourseModalProps) {
  const {
    data,
    currentCourseId,
    suggestedCourseName,
    spaces = [],
    busy,
    error,
    onImport,
    onUpdate,
    onClose,
  } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [text, setText] = useState("");
  const [initialDraft] = useState(() => loadCourseSetupDraft() ?? {
    courseName: suggestedCourseName,
    academicYear: new Date().getFullYear(),
    expectedCount: 30,
    focusCount: 0,
  });
  const [courseName, setCourseName] = useState(initialDraft.courseName);
  const [academicYear, setAcademicYear] = useState(initialDraft.academicYear);
  const [expectedCount, setExpectedCount] = useState(initialDraft.expectedCount);
  const [focusCount, setFocusCount] = useState(initialDraft.focusCount);
  const [focusNumbers, setFocusNumbers] = useState<number[]>([]);
  const [validationError, setValidationError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [target, setTarget] = useState<ImportTarget>({ mode: "new", courseName: suggestedCourseName });
  const [pending, setPending] = useState<RosterEntry[] | null>(null);
  const [room, setRoom] = useState<RoomDraft>(() => initialRoomDraft(0));
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  // El error del store solo se muestra si surge al confirmar.
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    saveCourseSetupDraft({ courseName, academicYear, expectedCount, focusCount });
  }, [academicYear, courseName, expectedCount, focusCount]);

  function showSheet(next: Preview) {
    const result = next.workbook.options[next.sheetIndex].result;
    setPreview(next);
    setTarget(suggestTarget(data, currentCourseId, result.ok ? result.entries : [], courseName));
  }

  function readText() {
    setReadError("");
    setAttempted(false);
    const workbook = parseRosterWorkbook([{ name: "Lista escrita", rows: rosterRowsFromText(text), firstRowNumber: 0 }]);
    showSheet({ fileName: "Lista escrita", workbook, sheetIndex: 0, source: "text" });
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
      showSheet({ fileName: file.name, workbook: parsed, sheetIndex: parsed.preferred, source: "file" });
    } catch {
      setReadError("No pudimos leer el archivo. Usa una planilla Excel o CSV con una columna de nombres.");
    } finally {
      setReading(false);
      event.target.value = "";
    }
  }

  async function confirm(entries: RosterEntry[]) {
    if (target.mode === "new") {
      if (entries.length !== expectedCount) {
        setValidationError(`La plantilla indica ${expectedCount} estudiantes y se detectaron ${entries.length}. Corrige la nómina o ajusta la cantidad esperada.`);
        return;
      }
      setValidationError("");
      // Un curso nuevo sigue con su sala.
      setPending(entries);
      setRoom(initialRoomDraft(entries.length));
      setFocusNumbers([]);
      return;
    }
    setAttempted(true);
    if (await onUpdate(target.courseId, entries)) onClose();
  }

  async function create() {
    if (!pending || target.mode !== "new") return;
    setAttempted(true);
    if (layoutError(room.layout) || !room.name.trim() || focusNumbers.length !== focusCount) return;
    const done = await onImport(target.courseName.trim(), pending, {
      room: { name: room.name.trim(), layout: room.layout },
      spaceId: spaceId || undefined,
      academicYear,
      focusNumbers,
    });
    if (done) {
      clearCourseSetupDraft();
      onClose();
    }
  }

  const roomProblem = focusNumbers.length !== focusCount
    ? `Elige ${focusCount} ${focusCount === 1 ? "estudiante foco" : "estudiantes foco"}.`
    : !room.name.trim() ? "Escribe el nombre de la sala." : layoutError(room.layout);

  if (pending && target.mode === "new") {
    return (
      <Modal title={`Sala de ${target.courseName.trim() || "el curso"}`} onClose={onClose}>
        <div className="form-stack">
          {spaces.length > 1 ? (
            <label>
              <span>Espacio</span>
              <select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
                {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
              </select>
            </label>
          ) : null}
          <section className="focus-picker" aria-labelledby="focus-title">
            <div className="card-heading">
              <div><p className="eyebrow">Seguimiento prioritario</p><h3 id="focus-title">Estudiantes foco</h3></div>
              <strong>{focusNumbers.length}/{focusCount}</strong>
            </div>
            {focusCount ? (
              <div className="focus-picker-grid">
                {pending.map((entry) => {
                  const selected = focusNumbers.includes(entry.number);
                  return (
                    <label key={entry.number} className={selected ? "selected" : ""}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!selected && focusNumbers.length >= focusCount}
                        onChange={() => setFocusNumbers((current) => selected
                          ? current.filter((number) => number !== entry.number)
                          : [...current, entry.number])}
                      />
                      <span><b>{entry.number}</b> {entry.fullName}</span>
                    </label>
                  );
                })}
              </div>
            ) : <p className="form-help">Este curso no tendrá estudiantes foco por ahora. Podrás cambiarlos desde «Mis cursos».</p>}
          </section>
          <RoomDesigner studentCount={pending.length} value={room} onChange={setRoom} />
          <p className="room-note">
            Podrás cambiar la forma o agregar otra sala (por ejemplo, el laboratorio) desde
            «Mover puestos».
          </p>
          {attempted && (roomProblem || error) ? (
            <div className="error-banner" role="alert"><AlertTriangle size={17} /> {roomProblem || error}</div>
          ) : null}
          <div className="import-actions">
            <button className="secondary-button wide" onClick={() => setPending(null)} disabled={busy}>
              <ArrowLeft size={18} /> Volver a la lista
            </button>
            <button className="primary-button wide" onClick={() => void create()} disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
              Crear curso con {pending.length} estudiantes
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={preview ? "Revisar la lista" : "Nuevo curso o nómina"} onClose={onClose}>
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
          error={validationError || (attempted ? error : "")}
          onBack={() => setPreview(null)}
          onConfirm={(entries) => void confirm(entries)}
          backLabel={preview.source === "text" ? "Editar la lista" : "Elegir otro archivo"}
          newCourseLabel={(count) => `Continuar con ${count} estudiantes: elegir sala`}
        />
      ) : (
        <div className="course-sources">
          <section className="course-setup card">
            <div className="card-heading">
              <div><p className="eyebrow">Paso 1</p><h3>Configura tu curso</h3></div>
            </div>
            <div className="course-setup-grid">
              <label><span>Nombre del curso</span><input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="Ej.: Kínder A" /></label>
              <label><span>Año académico</span><input type="number" min="2000" max="2200" value={academicYear} onChange={(event) => setAcademicYear(Number(event.target.value))} /></label>
              <label><span>Cantidad de estudiantes</span><input type="number" min="1" max="80" value={expectedCount} onChange={(event) => setExpectedCount(Math.max(1, Math.min(80, Number(event.target.value) || 1)))} /></label>
              <label><span>Estudiantes foco</span><input type="number" min="0" max={expectedCount} value={focusCount} onChange={(event) => setFocusCount(Math.max(0, Math.min(expectedCount, Number(event.target.value) || 0)))} /></label>
            </div>
          </section>
          <section className="import-panel">
            <div className="import-icon"><ClipboardList size={30} /></div>
            <h3>Escribir o pegar la lista</h3>
            <p>
              Un estudiante por línea. Puedes anteponer su N° («12 Ana R.») o pegar dos
              columnas copiadas de una planilla. Sin N°, se numera en el orden de la lista.
            </p>
            <textarea
              className="roster-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              placeholder={"1 Ana R.\n2 Bruno D.\n3 Camila T."}
              aria-label="Lista de estudiantes"
            />
            <button className="primary-button wide" onClick={readText} disabled={!text.trim()}>
              <ClipboardList size={18} /> Revisar la lista
            </button>
          </section>

          <section className="import-panel">
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
                onClick={() => void downloadRosterTemplate(expectedCount, courseName, academicYear).catch(
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
          </section>
          <p className="course-sources-note">
            Antes de cargar verás la lista y podrás elegir si crea un curso nuevo o actualiza
            uno existente. Un curso nuevo termina eligiendo su sala: en filas, laboratorio o
            trabajo grupal.
          </p>
        </div>
      )}
    </Modal>
  );
}
