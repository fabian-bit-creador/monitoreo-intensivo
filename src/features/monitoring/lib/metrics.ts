import {
  DEFAULT_ROOM_TEMPLATE_ID,
  DEFAULT_TEACHER_ID,
} from "@/config/app";
import type {
  ClassSession,
  MonitoringState,
  Observation,
  SessionMetrics,
  SessionStudent,
  Student,
} from "@/types/monitoring";

/**
 * Orden cronológico explícito: hora de registro y, a igual hora o si alguna
 * no se puede leer, id creciente. No depende de la posición en el arreglo.
 */
export function compareObservations(first: Observation, second: Observation) {
  const firstTime = Date.parse(first.createdAt);
  const secondTime = Date.parse(second.createdAt);
  if (Number.isFinite(firstTime) && Number.isFinite(secondTime) && firstTime !== secondTime) {
    return firstTime - secondTime;
  }
  return first.id - second.id;
}

export function sortObservations(rows: Observation[]) {
  return [...rows].sort(compareObservations);
}

/** Observación vigente de cada estudiante: la más reciente. */
export function latestObservations(rows: Observation[]) {
  const latest = new Map<string, Observation>();
  rows.forEach((row) => {
    const current = latest.get(row.studentId);
    if (!current || compareObservations(current, row) < 0) latest.set(row.studentId, row);
  });
  return latest;
}

export function sessionTeacherId(session: ClassSession) {
  return session.teacherId ?? DEFAULT_TEACHER_ID;
}

export function sessionRoomTemplateId(session: ClassSession) {
  return session.roomTemplateId ?? DEFAULT_ROOM_TEMPLATE_ID;
}

export function preferredSession(
  sessions: ClassSession[],
  courseId: string,
  teacherId: string,
) {
  return sessions.find(
    (session) =>
      session.courseId === courseId
      && sessionTeacherId(session) === teacherId
      && session.status === "active",
  ) ?? sessions.find(
    (session) =>
      session.courseId === courseId
      && sessionTeacherId(session) === teacherId,
  );
}

/** El estudiante como estaba al iniciar la clase, si hay fotografía. */
function withSnapshot(student: Student, row: SessionStudent): Student {
  return {
    ...student,
    number: row.number !== undefined ? row.number : student.number,
    fullName: row.fullName ?? student.fullName,
    displayName: row.displayName ?? student.displayName,
    isFocus: row.isFocus ?? student.isFocus,
  };
}

export function sessionMetrics(
  session: ClassSession,
  students: Student[],
  presence: SessionStudent[],
  observations: Observation[],
): SessionMetrics {
  // La nómina de la sesión es la fotografía guardada en sessionStudents al
  // crearla, no los estudiantes actuales del curso: así, altas, bajas o
  // cambios de N° y nombre posteriores no alteran un informe ya realizado.
  const snapshots = new Map(
    presence
      .filter((row) => row.sessionId === session.id)
      .map((row) => [row.studentId, row]),
  );
  const presenceMap = new Map(
    [...snapshots].map(([studentId, row]) => [studentId, row.present]),
  );
  // Orden de lista: N° de la fotografía y, a igual N°, el orden de students.
  const roster = students
    .filter((student) => snapshots.has(student.id))
    .map((student) => withSnapshot(student, snapshots.get(student.id) as SessionStudent))
    .sort((first, second) => (first.number ?? Infinity) - (second.number ?? Infinity));
  const present = roster.filter((student) => presenceMap.get(student.id) === true);
  const sessionObs = sortObservations(
    observations.filter((row) => row.sessionId === session.id),
  );
  const latest = latestObservations(sessionObs);
  const counts = { I: 0, R: 0, C: 0 };

  present.forEach((student) => {
    const code = latest.get(student.id)?.code;
    if (code) counts[code] += 1;
  });

  const observed = counts.I + counts.R + counts.C;
  const reviewRows = present
    .map((student) => latest.get(student.id))
    .filter((row): row is Observation => row?.code === "R");
  const avgProgress = reviewRows.length
    ? Math.round(
        reviewRows.reduce((sum, row) => sum + (row.progress ?? 0), 0)
        / reviewRows.length,
      )
    : 0;
  const progressed = present.filter((student) => {
    const history = sessionObs.filter((row) => row.studentId === student.id);
    const firstI = history.findIndex((row) => row.code === "I");
    return firstI >= 0
      && history.slice(firstI + 1).some((row) => row.code === "R" || row.code === "C");
  }).length;

  return {
    roster,
    present,
    presenceMap,
    sessionObs,
    latest,
    counts,
    observed,
    unobserved: Math.max(0, present.length - observed),
    absent: Math.max(0, roster.length - present.length),
    coverage: present.length ? Math.round((observed / present.length) * 100) : 0,
    // El porcentaje de logro usa como denominador a quienes tienen evidencia.
    // Ausentes y estudiantes sin registro nunca se interpretan como no logro.
    cRate: observed ? Math.round((counts.C / observed) * 100) : 0,
    avgProgress,
    progressed,
  };
}

export function metricsForSession(state: MonitoringState, session: ClassSession) {
  return sessionMetrics(
    session,
    state.students,
    state.sessionStudents,
    state.observations,
  );
}


export type CourseIndicatorSummary = {
  indicator: string;
  sessions: number;
  opportunities: number;
  observed: number;
  demonstrated: number;
  unobserved: number;
  coverage: number;
  demonstratedRate: number;
};

/**
 * Agrega evidencia del mismo indicador entre sesiones cerradas del curso y docente.
 * Una oportunidad es un estudiante presente en una sesión que trabajó ese indicador;
 * no representa estudiantes únicos ni una calificación.
 */
export function courseIndicatorSummaries(
  state: MonitoringState,
  courseId: string,
  teacherId: string,
): CourseIndicatorSummary[] {
  const groups = new Map<string, CourseIndicatorSummary>();
  state.sessions
    .filter((session) =>
      session.courseId === courseId
      && sessionTeacherId(session) === teacherId
      && session.status === "closed"
      && session.successCriteria.trim(),
    )
    .forEach((session) => {
      const indicator = session.successCriteria.trim().replace(/\s+/g, " ");
      const key = indicator.toLocaleLowerCase("es-CL");
      const metrics = sessionMetrics(
        session,
        state.students,
        state.sessionStudents,
        state.observations,
      );
      const summary = groups.get(key) ?? {
        indicator,
        sessions: 0,
        opportunities: 0,
        observed: 0,
        demonstrated: 0,
        unobserved: 0,
        coverage: 0,
        demonstratedRate: 0,
      };
      summary.sessions += 1;
      summary.opportunities += metrics.present.length;
      summary.observed += metrics.observed;
      summary.demonstrated += metrics.counts.C;
      summary.unobserved += metrics.unobserved;
      groups.set(key, summary);
    });
  return [...groups.values()]
    .map((summary) => ({
      ...summary,
      coverage: summary.opportunities
        ? Math.round((summary.observed / summary.opportunities) * 100)
        : 0,
      demonstratedRate: summary.observed
        ? Math.round((summary.demonstrated / summary.observed) * 100)
        : 0,
    }))
    .sort((first, second) =>
      second.sessions - first.sessions || first.indicator.localeCompare(second.indicator, "es"),
    );
}
