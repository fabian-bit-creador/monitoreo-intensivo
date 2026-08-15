import type { Observation } from "@/types/monitoring";

type StatusBadgeProps = {
  observation?: Observation;
  absent?: boolean;
};

export function StatusBadge({ observation, absent = false }: StatusBadgeProps) {
  if (absent) return <span className="status-badge status-absent">Ausente</span>;
  if (!observation) return <span className="status-badge status-empty">Sin registro</span>;

  return (
    <span className={`status-badge status-${observation.code.toLowerCase()}`}>
      {observation.code}
      {observation.code === "R" ? ` · ${observation.progress ?? 0}%` : ""}
    </span>
  );
}
