import { AlertTriangle, Star, UserRoundX, X } from "lucide-react";
import { CODE_META } from "@/config/app";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MonitoringCode, Observation, Student } from "@/types/monitoring";

type StudentSheetProps = {
  student: Student;
  observation?: Observation;
  present: boolean;
  round: number;
  note: string;
  setNote: (value: string) => void;
  onRecord: (code: MonitoringCode, progress?: number) => void;
  onPresence: (student: Student, present: boolean) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
};

export function StudentSheet(props: StudentSheetProps) {
  const {
    student,
    observation,
    present,
    round,
    note,
    setNote,
    onRecord,
    onPresence,
    onClose,
    busy,
    error,
  } = props;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="student-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Registrar a ${student.displayName}`}
      >
        <div className="sheet-handle" />
        <div className="student-sheet-header">
          <div className="student-avatar">{student.displayName.slice(0, 1)}</div>
          <div>
            <p>Recorrido {round}{student.isFocus ? <span className="focus-label"><Star size={13} fill="currentColor" /> Estudiante foco</span> : null}</p>
            <h2>{student.displayName}</h2>
            <span>{student.fullName}</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="current-state">
          <span>Estado actual</span>
          <StatusBadge observation={observation} absent={!present} />
        </div>
        {error ? (
          <div className="error-banner" role="alert"><AlertTriangle size={17} /> {error}</div>
        ) : null}
        {!present ? (
          <div className="absent-panel">
            <UserRoundX size={25} />
            <h3>Marcado como ausente</h3>
            <p>Puedes reincorporarlo a la sesión si llegó después.</p>
            <button className="secondary-button" onClick={() => onPresence(student, true)}>
              Marcar presente
            </button>
          </div>
        ) : (
          <>
            <label className="note-field">
              <span>Evidencia observada <small>opcional</small></span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Ej.: explicó el procedimiento y se confundió al justificar el paso 2"
              />
            </label>
            <p className="status-prompt">Registra qué muestra la evidencia respecto del indicador</p>
            <div className="status-actions">
              <button className="action-i" onClick={() => onRecord("I", 0)} disabled={busy}>
                <b>I</b><span>{CODE_META.I.label}</span><small>{CODE_META.I.detail}</small>
              </button>
              <button className="action-r" onClick={() => onRecord("R")} disabled={busy}>
                <b>R</b><span>{CODE_META.R.label}</span><small>{CODE_META.R.detail}</small>
              </button>
              <button className="action-c" onClick={() => onRecord("C", 100)} disabled={busy}>
                <b>C</b><span>{CODE_META.C.label}</span><small>{CODE_META.C.detail}</small>
              </button>
            </div>
            <button className="absence-link" onClick={() => onPresence(student, false)}>
              <UserRoundX size={16} /> Marcar ausente
            </button>
          </>
        )}
      </div>
    </div>
  );
}
