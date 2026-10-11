import { AlertTriangle, ArrowLeft, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { normalizeName } from "@/lib/text";
import type { RosterSheetOption } from "@/features/courses/lib/roster-import";
import { planRosterUpdate } from "@/features/courses/lib/roster-update";
import type { MonitoringState, RosterEntry } from "@/types/monitoring";

export type ImportTarget =
  | { mode: "new"; courseName: string }
  | { mode: "update"; courseId: string };

type RosterPreviewProps = {
  data: MonitoringState;
  fileName: string;
  options: RosterSheetOption[];
  sheetIndex: number;
  onSheetChange: (index: number) => void;
  target: ImportTarget;
  onTargetChange: (target: ImportTarget) => void;
  suggestedCourseName: string;
  busy: boolean;
  error: string;
  onBack: () => void;
  onConfirm: (entries: RosterEntry[]) => void;
  /** Texto del botón para volver; por defecto, elegir otro archivo. */
  backLabel?: string;
  /** Texto del botón para un curso nuevo; por defecto, crearlo de inmediato. */
  newCourseLabel?: (count: number) => string;
};

const MAX_ERRORS_SHOWN = 5;

function names(entries: Array<{ fullName: string }>, limit = 4) {
  const shown = entries.slice(0, limit).map((entry) => entry.fullName).join(", ");
  return entries.length > limit ? `${shown} y ${entries.length - limit} más` : shown;
}

export function RosterPreview(props: RosterPreviewProps) {
  const {
    data,
    fileName,
    options,
    sheetIndex,
    onSheetChange,
    target,
    onTargetChange,
    suggestedCourseName,
    busy,
    error,
    onBack,
    onConfirm,
    backLabel = "Elegir otro archivo",
    newCourseLabel = (count: number) => `Crear curso con ${count} estudiantes`,
  } = props;
  const result = options[sheetIndex].result;
  const entries = result.ok ? result.entries : [];
  const plan = result.ok && target.mode === "update"
    ? planRosterUpdate(data, target.courseId, entries)
    : null;
  const activeNow = target.mode === "update"
    ? data.students.filter((student) => student.courseId === target.courseId && student.active).length
    : 0;
  const hasActiveSession = target.mode === "update"
    && data.sessions.some((session) => session.courseId === target.courseId && session.status === "active");
  const sameName = target.mode === "new"
    ? data.courses.find((course) => normalizeName(course.name) === normalizeName(target.courseName))
    : undefined;
  const canConfirm = result.ok && !busy
    && (target.mode === "update" || target.courseName.trim() !== "");

  return (
    <div className="form-stack">
      <div className="restore-summary">
        <p className="eyebrow">Planilla</p>
        <strong><FileSpreadsheet size={17} /> {fileName}</strong>
        {options.length > 1 ? (
          <label className="roster-sheet">
            <span>Hoja</span>
            <select value={sheetIndex} onChange={(event) => onSheetChange(Number(event.target.value))}>
              {options.map((option, index) => (
                <option key={option.sheetName} value={index}>{option.sheetName}</option>
              ))}
            </select>
          </label>
        ) : null}
        {result.ok ? (
          <ul className="settings-list">
            <li>
              {entries.length} estudiantes de la hoja «{options[sheetIndex].sheetName}»,{" "}
              {result.numberedByOrder ? "numerados según el orden de las filas" : "con el N° de la planilla"}.
            </li>
          </ul>
        ) : null}
      </div>

      {!result.ok ? (
        <div className="error-banner roster-errors" role="alert">
          <AlertTriangle size={17} />
          <div>
            <p>No se importará nada hasta corregir la planilla:</p>
            <ul>
              {result.errors.slice(0, MAX_ERRORS_SHOWN).map((item) => <li key={item}>{item}</li>)}
            </ul>
            {result.errors.length > MAX_ERRORS_SHOWN ? (
              <p>Y {result.errors.length - MAX_ERRORS_SHOWN} problemas más.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {result.ok && result.warnings.length ? (
        <div className="form-help warning">
          <AlertTriangle size={17} />
          <div>{result.warnings.map((item) => <p key={item}>{item}</p>)}</div>
        </div>
      ) : null}

      {result.ok ? (
        <fieldset className="import-target">
          <legend>¿Dónde se carga?</legend>
          <label className={`target-option ${target.mode === "update" ? "selected" : ""}`}>
            <input
              type="radio"
              name="import-target"
              checked={target.mode === "update"}
              disabled={!data.courses.length}
              onChange={() => onTargetChange({ mode: "update", courseId: data.courses[0]?.id ?? "" })}
            />
            <span>
              <strong>Actualizar la nómina de un curso</strong>
              <small>Conserva a cada estudiante con sus registros y su puesto.</small>
            </span>
          </label>
          {target.mode === "update" ? (
            <select
              aria-label="Curso a actualizar"
              value={target.courseId}
              onChange={(event) => onTargetChange({ mode: "update", courseId: event.target.value })}
            >
              {data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          ) : null}
          <label className={`target-option ${target.mode === "new" ? "selected" : ""}`}>
            <input
              type="radio"
              name="import-target"
              checked={target.mode === "new"}
              onChange={() => onTargetChange({ mode: "new", courseName: suggestedCourseName })}
            />
            <span>
              <strong>Crear un curso nuevo</strong>
              <small>Con una sala habitual de 7 × 6 y los puestos por asignar.</small>
            </span>
          </label>
          {target.mode === "new" ? (
            <input
              aria-label="Nombre del curso"
              value={target.courseName}
              onChange={(event) => onTargetChange({ mode: "new", courseName: event.target.value })}
              placeholder="Ej.: III°B 2026"
            />
          ) : null}
        </fieldset>
      ) : null}

      {sameName ? (
        <div className="form-help warning">
          <AlertTriangle size={17} />
          <p>Ya existe el curso «{sameName.name}». Si es el mismo, elige «Actualizar la nómina» para no duplicarlo.</p>
        </div>
      ) : null}

      {plan ? (
        <ul className="settings-list roster-diff">
          <li>{plan.kept.length} sin cambios.</li>
          {plan.updated.length ? (
            <li>
              {plan.updated.length} con cambios de N°, nombre o que vuelven al curso: {names(plan.updated.map((item) => item.entry))}.
            </li>
          ) : null}
          {plan.added.length ? (
            <li>
              {plan.added.length} {plan.added.length === 1 ? "nuevo" : "nuevos"}, sin puesto:{" "}
              {names(plan.added)}.
            </li>
          ) : null}
          {plan.withdrawn.length ? (
            <li>
              {plan.withdrawn.length} {plan.withdrawn.length === 1 ? "deja" : "dejan"} el curso:{" "}
              {names(plan.withdrawn)}. Se archivan y liberan su puesto; sus clases anteriores no
              cambian.
            </li>
          ) : null}
          {hasActiveSession ? (
            <li>La clase en curso conserva su nómina; los cambios rigen desde la próxima clase.</li>
          ) : null}
        </ul>
      ) : null}

      {plan && activeNow > 0 && plan.withdrawn.length > activeNow / 2 ? (
        <div className="form-help warning">
          <AlertTriangle size={17} />
          <p>Más de la mitad de la nómina actual dejaría el curso. Revisa que sea el curso correcto.</p>
        </div>
      ) : null}

      {result.ok ? (
        <details className="roster-list">
          <summary>Ver los {entries.length} estudiantes</summary>
          <ol>
            {entries.map((entry, index) => (
              <li key={`${entry.number}-${index}`}><span>{entry.number}</span>{entry.fullName}</li>
            ))}
          </ol>
        </details>
      ) : null}

      {error ? (
        <div className="error-banner" role="alert"><AlertTriangle size={17} /> {error}</div>
      ) : null}

      <div className="import-actions">
        <button className="secondary-button wide" onClick={onBack} disabled={busy}>
          <ArrowLeft size={18} /> {backLabel}
        </button>
        <button className="primary-button wide" onClick={() => onConfirm(entries)} disabled={!canConfirm}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
          {target.mode === "update" ? "Actualizar nómina" : newCourseLabel(entries.length)}
        </button>
      </div>
    </div>
  );
}
