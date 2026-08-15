import { StatusBadge } from "@/components/ui/status-badge";
import type { Observation, Student } from "@/types/monitoring";

type StudentCardProps = {
  student: Student;
  observation?: Observation;
  absent: boolean;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
};

export function StudentCard({
  student,
  observation,
  absent,
  selected,
  onClick,
  compact = false,
}: StudentCardProps) {
  const state = absent ? "absent" : observation?.code.toLowerCase() ?? "empty";
  return (
    <button
      className={`student-card state-${state} ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
      onClick={onClick}
    >
      <span className="student-number">{student.number ?? "—"}</span>
      <strong>{student.displayName}</strong>
      <StatusBadge observation={observation} absent={absent} />
      {observation
        ? <small>Recorrido {observation.round}</small>
        : <small>Toca para registrar</small>}
    </button>
  );
}
