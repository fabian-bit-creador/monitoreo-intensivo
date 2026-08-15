import { ArrowRight, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  sessionMetrics,
  sessionRoomTemplateId,
  sessionTeacherId,
} from "@/features/monitoring/lib/metrics";
import { shortDate } from "@/lib/date";
import type { MonitoringState, Teacher } from "@/types/monitoring";

type HistoryViewProps = {
  data: MonitoringState;
  courseId: string;
  teacher: Teacher | null;
  teacherId: string;
  activeSessionId: number | null;
  onOpen: (id: number) => void;
  onStart: () => void;
};

export function HistoryView(props: HistoryViewProps) {
  const {
    data,
    courseId,
    teacher,
    teacherId,
    activeSessionId,
    onOpen,
    onStart,
  } = props;
  const rows = data.sessions.filter(
    (session) =>
      session.courseId === courseId
      && sessionTeacherId(session) === teacherId,
  );

  return (
    <>
      <div className="report-heading">
        <div>
          <p className="eyebrow">Registro longitudinal</p>
          <h1>Historial de clases</h1>
          <p>Sesiones de {teacher?.fullName}. Compara cobertura, avance y estado final.</p>
        </div>
        <button className="primary-button" onClick={onStart}>
          <Plus size={18} /> Nueva clase
        </button>
      </div>
      {!rows.length ? (
        <EmptyState
          onStart={onStart}
          courseName={data.courses.find((course) => course.id === courseId)?.name}
        />
      ) : (
        <div className="history-list">
          {rows.map((session) => {
            const metrics = sessionMetrics(
              session,
              data.students,
              data.sessionStudents,
              data.observations,
            );
            const template = data.roomTemplates.find(
              (item) => item.id === sessionRoomTemplateId(session),
            );
            return (
              <button
                key={session.id}
                className={`history-card card ${activeSessionId === session.id ? "current" : ""}`}
                onClick={() => onOpen(session.id)}
              >
                <span className={`history-status ${session.status}`}>
                  {session.status === "active" ? "En curso" : "Cerrada"}
                </span>
                <div className="history-date">
                  <strong>{shortDate(session.date)}</strong>
                  <small>{new Date(`${session.date}T12:00:00`).getFullYear()}</small>
                </div>
                <div className="history-title">
                  <strong>{session.module}</strong>
                  <small>{template?.name ?? "Sala"} · {session.objective}</small>
                </div>
                <div className="history-metrics">
                  <span><b>{metrics.coverage}%</b> cobertura</span>
                  <span><b>{metrics.counts.C}</b> correctos</span>
                  <span><b>{metrics.counts.R}</b> revisión</span>
                </div>
                <ArrowRight size={19} />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
