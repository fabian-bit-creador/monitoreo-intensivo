"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  CircleHelp,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  History,
  Sparkles,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  sessionMetrics,
  sessionTeacherId,
  courseIndicatorSummaries,
} from "@/features/monitoring/lib/metrics";
import { shortDate } from "@/lib/date";
import type {
  ClassSession,
  Course,
  MonitoringState,
  Observation,
  RoomTemplate,
  SessionMetrics,
  Teacher,
} from "@/types/monitoring";

type ReportViewProps = {
  data: MonitoringState;
  course: Course | null;
  teacher: Teacher | null;
  roomTemplate: RoomTemplate | null;
  session: ClassSession | null;
  metrics: SessionMetrics | null;
  onStart: () => void;
  onExcel: () => void;
  onPdf: () => void;
  onReopen: () => void;
  storageLabel: string;
};

export function ReportView(props: ReportViewProps) {
  const {
    data,
    course,
    teacher,
    roomTemplate,
    session,
    metrics,
    onStart,
    onExcel,
    onPdf,
    onReopen,
    storageLabel,
  } = props;

  if (!session || !metrics) {
    return (
      <>
        <PageHeading
          eyebrow="Análisis"
          title="Informe de práctica independiente"
          subtitle="Aquí aparecerá el análisis al terminar una clase."
        />
        <EmptyState onStart={onStart} courseName={course?.name} />
      </>
    );
  }

  const priority = metrics.present
    .map((student) => ({ student, observation: metrics.latest.get(student.id) }))
    .filter(({ observation }) =>
      !observation
      || observation.code === "I"
      || observation.code === "R",
    )
    .sort((first, second) => {
      const score = (item: typeof first) =>
        !item.observation ? 0 : item.observation.code === "I" ? 1 : 2;
      return score(first) - score(second);
    });
  const observationsByStudent = new Map<string, Observation[]>();
  metrics.sessionObs.forEach((row) => {
    observationsByStudent.set(
      row.studentId,
      [...(observationsByStudent.get(row.studentId) ?? []), row],
    );
  });
  const repeatedI = [...observationsByStudent.values()].filter(
    (rows) => rows.length >= 2 && rows.at(-1)?.code === "I",
  ).length;
  const narrative = [
    `Se monitoreó a ${metrics.observed} de ${metrics.present.length} estudiantes presentes, alcanzando una cobertura del ${metrics.coverage}%.`,
    metrics.counts.C
      ? `${metrics.counts.C} estudiantes mostraron evidencia que satisface el indicador definido.`
      : "En esta sesión no quedó evidencia registrada de estudiantes que demostraran el indicador.",
    metrics.counts.R
      ? `${metrics.counts.R} estudiantes mostraron evidencia parcial y requieren retroalimentación o una nueva comprobación.`
      : "No quedaron registros de evidencia parcial al cierre.",
  ].join(" ");
  const recommendations = [
    metrics.unobserved > 0
      ? `Completar la observación de los ${metrics.unobserved} estudiantes presentes que quedaron sin registro.`
      : "La cobertura fue completa; revisar si la evidencia recogida permite decidir el siguiente paso.",
    repeatedI > 0
      ? `Revisar qué apoyo requieren los ${repeatedI} estudiantes con registros I reiterados y comprobar su comprensión con una nueva evidencia.`
      : "Si alguien requiere apoyo, acordar una comprobación breve en la siguiente sesión.",
    metrics.counts.R > 0
      ? "Planificar retroalimentación o un andamiaje breve para quienes mostraron evidencia parcial y volver a comprobar el indicador."
      : "Definir una nueva tarea o pregunta que permita comprobar el aprendizaje siguiente.",
  ];
  const indicatorHistory = courseIndicatorSummaries(data, session.courseId, sessionTeacherId(session));
  const historical = data.sessions
    .filter((item) =>
      item.courseId === session.courseId
      && sessionTeacherId(item) === sessionTeacherId(session),
    )
    .slice()
    .reverse()
    .map((item) => {
      const itemMetrics = sessionMetrics(
        item,
        data.students,
        data.sessionStudents,
        data.observations,
      );
      return {
        date: shortDate(item.date),
        cobertura: itemMetrics.coverage,
      };
    });

  return (
    <>
      <div className="report-heading">
        <div>
          <p className="eyebrow">Informe automático · {shortDate(session.date)}</p>
          <h1>{session.module}</h1>
          <p>
            {teacher?.fullName} · {course?.name} · {roomTemplate?.name} · Datos descriptivos
            del monitoreo
          </p>
        </div>
        <div className="report-actions">
          <button className="secondary-button" onClick={onPdf}><Download size={17} /> PDF</button>
          <button className="secondary-button" onClick={onExcel}><FileSpreadsheet size={17} /> Excel</button>
          {session.status === "closed"
            ? <button className="ghost-button" onClick={onReopen}>Reabrir</button>
            : null}
        </div>
      </div>

      <div className="source-strip">
        <FileSpreadsheet size={16} />
        <span>Fuente base: {data.source.title} · pestañas {data.source.tabs.join(", ")}</span>
        <span className="source-status">{storageLabel}</span>
      </div>

      <section className="report-kpis">
        <article><span>Cobertura</span><strong>{metrics.coverage}%</strong><small>{metrics.observed} de {metrics.present.length} presentes</small></article>
        <article><span>Indicador demostrado</span><strong>{metrics.counts.C}</strong><small>{metrics.cRate}% de observados ({metrics.observed})</small></article>
        <article><span>Evidencia parcial</span><strong>{metrics.counts.R}</strong><small>requieren nueva comprobación</small></article>
        <article><span>Requiere apoyo</span><strong>{metrics.counts.I}</strong><small>{repeatedI} con registro I reiterado</small></article>
        <article><span>Cambio observado</span><strong>{metrics.progressed}</strong><small>de I a R o C en la sesión</small></article>
      </section>

      <section className="analytics-grid">
        <article className="card analytics-card status-panel">
          <div className="card-heading">
            <div><p className="eyebrow">Estado final</p><h2>Distribución I · R · C</h2></div>
            <Activity size={19} />
          </div>
          <div className="status-stack" aria-label="Distribución de estados">
            {metrics.present.length ? (
              <>
                <span className="stack-i" style={{ width: `${(metrics.counts.I / metrics.present.length) * 100}%` }} />
                <span className="stack-r" style={{ width: `${(metrics.counts.R / metrics.present.length) * 100}%` }} />
                <span className="stack-c" style={{ width: `${(metrics.counts.C / metrics.present.length) * 100}%` }} />
                <span className="stack-empty" style={{ width: `${(metrics.unobserved / metrics.present.length) * 100}%` }} />
              </>
            ) : null}
          </div>
          <div className="status-breakdown">
            <div><i className="dot dot-i" /><span>Instrucciones</span><strong>{metrics.counts.I}</strong></div>
            <div><i className="dot dot-r" /><span>Revisión</span><strong>{metrics.counts.R}</strong></div>
            <div><i className="dot dot-c" /><span>Correctos</span><strong>{metrics.counts.C}</strong></div>
            <div><i className="dot dot-empty" /><span>Sin registro</span><strong>{metrics.unobserved}</strong></div>
          </div>
          <p className="metric-definition">
            Cobertura = observados / presentes. Indicador demostrado = C / observados.
            Ausentes y “sin registro” no se cuentan como falta de logro.
          </p>
        </article>

        <article className="card analytics-card narrative-panel">
          <div className="card-heading">
            <div><p className="eyebrow">Lectura pedagógica</p><h2>Qué ocurrió en la sesión</h2></div>
            <Sparkles size={19} />
          </div>
          <p className="narrative">{narrative}</p>
          <div className="evidence-label">
            <CircleHelp size={15} /> Interpretación basada en los registros, no una calificación.
          </div>
        </article>

        <article className="card analytics-card trend-panel">
          <div className="card-heading">
            <div><p className="eyebrow">Historial</p><h2>Cobertura por sesión</h2></div>
            <History size={19} />
          </div>
          <p className="metric-definition">La cobertura describe qué parte del curso fue observada; no permite comparar aprendizaje entre indicadores distintos.</p>
          {historical.length > 1 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historical} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf2" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#657187" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#657187" }} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Line type="monotone" dataKey="cobertura" name="Cobertura" stroke="#1e8e89" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty"><History size={28} /><p>La tendencia aparecerá después de la segunda sesión.</p></div>
          )}
        </article>

        <article className="card analytics-card recommendations-panel">
          <div className="card-heading">
            <div><p className="eyebrow">Próxima clase</p><h2>Acciones sugeridas</h2></div>
            <ClipboardCheck size={19} />
          </div>
          <ol>
            {recommendations.map((item, index) => (
              <li key={item}><span>{index + 1}</span><p>{item}</p></li>
            ))}
          </ol>
        </article>
      </section>

      <section className="card priority-table">
        <div className="card-heading">
          <div><p className="eyebrow">Curso · sesiones cerradas</p><h2>Evidencia por indicador</h2></div>
          <History size={19} />
        </div>
        <p className="metric-definition">
          Solo se agrupan sesiones del mismo curso y docente cuando el indicador tiene el mismo texto.
          “Oportunidades” cuenta estudiantes presentes por sesión, no estudiantes únicos. No es una nota.
        </p>
        {indicatorHistory.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Indicador</th><th>Sesiones</th><th>Oportunidades</th><th>Observados</th><th>Cobertura</th><th>Indicador demostrado / observados</th></tr></thead>
              <tbody>
                {indicatorHistory.map((item) => (
                  <tr key={item.indicator.toLocaleLowerCase("es-CL")}>
                    <td>{item.indicator}</td><td>{item.sessions}</td><td>{item.opportunities}</td>
                    <td>{item.observed}</td><td>{item.coverage}%</td>
                    <td>{item.demonstrated} · {item.demonstratedRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="chart-empty">Cuando cierres sesiones con un mismo indicador, aparecerá aquí la evidencia acumulada del curso.</p>
        )}
      </section>

      <section className="card priority-table">
        <div className="card-heading">
          <div><p className="eyebrow">Seguimiento</p><h2>Prioridad para la próxima intervención</h2></div>
          <AlertTriangle size={19} />
        </div>
        {priority.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Estudiante</th><th>Estado final</th><th>Recorrido</th><th>Observación</th><th>Acción</th></tr></thead>
              <tbody>
                {priority.slice(0, 12).map(({ student, observation }) => (
                  <tr key={student.id}>
                    <td><strong>{student.displayName}</strong></td>
                    <td><StatusBadge observation={observation} /></td>
                    <td>{observation?.round ?? "—"}</td>
                    <td>{observation?.note || "Sin observación"}</td>
                    <td>
                      {!observation
                        ? "Monitorear primero"
                        : observation.code === "I"
                          ? "Reorientar instrucciones"
                          : "Volver a revisar"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="all-clear">
            <Check size={22} /><p>No hay estudiantes con prioridad automática según las reglas actuales.</p>
          </div>
        )}
        {priority.length > 12 ? (
          <p className="table-note">
            Mostrando 12 de {priority.length} estudiantes priorizados. El Excel incluye el detalle completo.
          </p>
        ) : null}
      </section>
    </>
  );
}
