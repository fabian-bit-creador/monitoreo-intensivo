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
      || (observation.code === "R" && (observation.progress ?? 0) < 50),
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
      ? `${metrics.counts.C} estudiantes finalizaron en C después de comprobar los criterios de éxito.`
      : "Aún no se registran estudiantes en C; conviene revisar si los criterios de éxito fueron visibles y alcanzables.",
    metrics.counts.R
      ? `${metrics.counts.R} ${metrics.counts.R === 1 ? "permanece" : "permanecen"} en R, con un avance promedio del ${metrics.avgProgress}%.`
      : "No quedaron estudiantes en revisión al cierre.",
  ].join(" ");
  const recommendations = [
    metrics.unobserved > 0
      ? `Comenzar la próxima ronda por los ${metrics.unobserved} estudiantes que quedaron sin registro.`
      : "La cobertura fue completa; mantener el recorrido sistemático.",
    repeatedI > 0
      ? `Reenseñar la instrucción inicial y verificar comprensión con los ${repeatedI} estudiantes que permanecieron en I durante más de una observación.`
      : "No se detectó persistencia repetida en I dentro de la sesión.",
    metrics.counts.R > 0 && metrics.avgProgress < 60
      ? "Modelar nuevamente el checkpoint con mayor dificultad antes de retomar el trabajo independiente."
      : "Realizar una retroalimentación breve y focalizada para quienes permanecen en R.",
  ];
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
        logro: itemMetrics.cRate,
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
        <span className="source-status">Guardado local</span>
      </div>

      <section className="report-kpis">
        <article><span>Cobertura</span><strong>{metrics.coverage}%</strong><small>{metrics.observed} de {metrics.present.length} presentes</small></article>
        <article><span>Correctos</span><strong>{metrics.counts.C}</strong><small>{metrics.cRate}% de presentes</small></article>
        <article><span>En revisión</span><strong>{metrics.counts.R}</strong><small>{metrics.avgProgress}% avance promedio</small></article>
        <article><span>En instrucciones</span><strong>{metrics.counts.I}</strong><small>{repeatedI} con I repetida</small></article>
        <article><span>Progresaron</span><strong>{metrics.progressed}</strong><small>desde I hacia R o C</small></article>
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
            Base: estudiantes presentes. “Sin registro” no equivale a dificultad; indica falta
            de observación.
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
            <div><p className="eyebrow">Historial</p><h2>Cobertura y C por sesión</h2></div>
            <History size={19} />
          </div>
          {historical.length > 1 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historical} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf2" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#657187" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#657187" }} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Line type="monotone" dataKey="cobertura" name="Cobertura" stroke="#1e8e89" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="logro" name="C" stroke="#17375e" strokeWidth={3} dot={{ r: 3 }} />
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
