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

export function latestObservations(rows: Observation[]) {
  const latest = new Map<string, Observation>();
  rows.forEach((row) => latest.set(row.studentId, row));
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

export function sessionMetrics(
  session: ClassSession,
  students: Student[],
  presence: SessionStudent[],
  observations: Observation[],
): SessionMetrics {
  const roster = students.filter((student) => student.courseId === session.courseId);
  const presenceMap = new Map(
    presence
      .filter((row) => row.sessionId === session.id)
      .map((row) => [row.studentId, row.present]),
  );
  const present = roster.filter((student) => presenceMap.get(student.id) !== false);
  const sessionObs = observations.filter((row) => row.sessionId === session.id);
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
    cRate: present.length ? Math.round((counts.C / present.length) * 100) : 0,
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
