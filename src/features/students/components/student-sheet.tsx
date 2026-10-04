import { useState } from "react";
import { UserRoundX, X } from "lucide-react";
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
  } = props;
  const [showProgress, setShowProgress] = useState(false);

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
            <p>Recorrido {round}</p>
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
              <span>Observación breve <small>opcional</small></span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Ej.: requiere ejemplo del paso 2"
              />
            </label>
            <p className="status-prompt">Selecciona el estado comprobado</p>
            <div className="status-actions">
              <button className="action-i" onClick={() => onRecord("I", 0)} disabled={busy}>
                <b>I</b><span>{CODE_META.I.label}</span><small>{CODE_META.I.detail}</small>
              </button>
              <button className="action-r" onClick={() => setShowProgress(!showProgress)} disabled={busy}>
                <b>R</b><span>{CODE_META.R.label}</span><small>{CODE_META.R.detail}</small>
              </button>
              <button className="action-c" onClick={() => onRecord("C", 100)} disabled={busy}>
                <b>C</b><span>{CODE_META.C.label}</span><small>{CODE_META.C.detail}</small>
              </button>
            </div>
            <div className={`progress-reveal ${showProgress ? "open" : ""}`}>
              <div className="progress-reveal-inner">
                <div className="progress-picker">
                  <p>¿Qué porcentaje del producto está avanzado?</p>
                  <div>
                    {[25, 50, 70, 90].map((value) => (
                      <button
                        key={value}
                        onClick={() => onRecord("R", value)}
                        disabled={busy || !showProgress}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
