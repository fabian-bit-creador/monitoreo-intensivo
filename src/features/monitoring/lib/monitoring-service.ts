import { DEFAULT_ROOM_TEMPLATE_ID } from "@/config/app";
import { displayName, slugify } from "@/lib/text";
import type {
  MonitoringCode,
  MonitoringState,
  RoomSlot,
  SeatAssignment,
  Student,
} from "@/types/monitoring";

type StateResult = { state: MonitoringState };

export type CreateSessionInput = {
  courseId: string;
  teacherId: string;
  roomTemplateId: string;
  date: string;
  module: string;
  objective: string;
  successCriteria: string;
};

export type AddObservationInput = {
  sessionId: number;
  studentId: string;
  round: number;
  code: MonitoringCode;
  progress?: number;
  note?: string;
};

export function createSession(
  current: MonitoringState,
  input: CreateSessionInput,
): StateResult & { sessionId: number } {
  const state = structuredClone(current);
  const teacher = state.teachers.find(
    (item) => item.id === input.teacherId && item.active,
  );
  const course = state.courses.find((item) => item.id === input.courseId);
  const roomTemplate = state.roomTemplates.find(
    (item) =>
      item.id === input.roomTemplateId
      && item.courseId === input.courseId
      && item.active,
  );
  const roster = state.students.filter(
    (student) => student.courseId === input.courseId && student.active,
  );

  if (!teacher || !course || !roomTemplate || !input.date || !roster.length) {
    throw new Error("Docente, curso, plantilla, fecha y nómina son obligatorios.");
  }

  const sessionId = Math.max(0, ...state.sessions.map((session) => session.id)) + 1;
  state.sessions.unshift({
    id: sessionId,
    courseId: course.id,
    teacherId: teacher.id,
    roomTemplateId: roomTemplate.id,
    date: input.date,
    module: input.module.trim() || "Práctica independiente",
    objective: input.objective.trim() || "Actividad de práctica independiente",
    successCriteria: input.successCriteria.trim()
      || "Cumple los criterios de éxito definidos para la actividad.",
    status: "active",
    startedAt: new Date().toISOString(),
    closedAt: null,
  });
  state.sessionStudents.push(
    ...roster.map((student) => ({
      sessionId,
      studentId: student.id,
      present: true,
    })),
  );

  return { state, sessionId };
}

export function addObservation(
  current: MonitoringState,
  input: AddObservationInput,
): StateResult {
  const state = structuredClone(current);
  const session = state.sessions.find((item) => item.id === input.sessionId);
  const student = state.students.find((item) => item.id === input.studentId);
  if (!session || !student || session.status !== "active") {
    throw new Error("La sesión o el estudiante no están disponibles para registrar.");
  }

  const round = Math.max(1, Math.min(3, Number(input.round) || 1));
  const progress = input.code === "C"
    ? 100
    : input.code === "I"
      ? 0
      : Math.max(1, Math.min(99, Number(input.progress) || 50));
  const observationId = Math.max(
    0,
    ...state.observations.map((observation) => observation.id),
  ) + 1;

  state.observations.push({
    id: observationId,
    sessionId: session.id,
    studentId: student.id,
    round,
    code: input.code,
    progress,
    note: input.note?.trim() || null,
    createdAt: new Date().toISOString(),
  });

  const presence = state.sessionStudents.find(
    (item) => item.sessionId === session.id && item.studentId === student.id,
  );
  if (presence) presence.present = true;

  return { state };
}

export function setPresence(
  current: MonitoringState,
  sessionId: number,
  studentId: string,
  present: boolean,
): StateResult {
  const state = structuredClone(current);
  const row = state.sessionStudents.find(
    (item) => item.sessionId === sessionId && item.studentId === studentId,
  );
  if (!row) throw new Error("No se encontró al estudiante en esta sesión.");
  row.present = present;
  return { state };
}

function assignmentAt(
  assignments: SeatAssignment[],
  templateId: string,
  row: number,
  col: number,
) {
  return assignments.find(
    (item) =>
      item.templateId === templateId
      && item.seatRow === row
      && item.seatCol === col,
  );
}

export function moveStudent(
  current: MonitoringState,
  studentId: string,
  roomTemplateId: string,
  targetRow: number | null,
  targetCol: number | null,
): StateResult {
  const state = structuredClone(current);
  const movingStudent = state.students.find((student) => student.id === studentId);
  const template = state.roomTemplates.find(
    (item) => item.id === roomTemplateId && item.courseId === movingStudent?.courseId,
  );
  if (!movingStudent || !template) throw new Error("Plantilla o estudiante no válido.");

  const movingAssignment = state.seatAssignments.find(
    (item) => item.templateId === roomTemplateId && item.studentId === studentId,
  );
  const origin = movingAssignment
    ? { seatRow: movingAssignment.seatRow, seatCol: movingAssignment.seatCol }
    : null;

  if (targetRow === null || targetCol === null) {
    state.seatAssignments = state.seatAssignments.filter(
      (item) => !(item.templateId === roomTemplateId && item.studentId === studentId),
    );
    if (roomTemplateId === DEFAULT_ROOM_TEMPLATE_ID) {
      movingStudent.seatRow = null;
      movingStudent.seatCol = null;
    }
    return { state };
  }

  const targetSlot = state.roomSlots.find(
    (slot) =>
      slot.templateId === roomTemplateId
      && slot.seatRow === targetRow
      && slot.seatCol === targetCol
      && slot.status === "available",
  );
  if (!targetSlot) throw new Error("Ese puesto no está disponible.");

  const occupantAssignment = assignmentAt(
    state.seatAssignments,
    roomTemplateId,
    targetRow,
    targetCol,
  );
  if (occupantAssignment?.studentId === studentId) return { state };

  if (occupantAssignment) {
    if (origin) {
      occupantAssignment.seatRow = origin.seatRow;
      occupantAssignment.seatCol = origin.seatCol;
    } else {
      state.seatAssignments = state.seatAssignments.filter(
        (item) => item !== occupantAssignment,
      );
    }
  }

  if (movingAssignment) {
    movingAssignment.seatRow = targetRow;
    movingAssignment.seatCol = targetCol;
  } else {
    state.seatAssignments.push({
      templateId: roomTemplateId,
      studentId,
      seatRow: targetRow,
      seatCol: targetCol,
    });
  }

  if (roomTemplateId === DEFAULT_ROOM_TEMPLATE_ID) {
    const occupant = occupantAssignment
      ? state.students.find((student) => student.id === occupantAssignment.studentId)
      : null;
    if (occupant) {
      occupant.seatRow = origin?.seatRow ?? null;
      occupant.seatCol = origin?.seatCol ?? null;
    }
    movingStudent.seatRow = targetRow;
    movingStudent.seatCol = targetCol;
  }

  return { state };
}

export function setSessionStatus(
  current: MonitoringState,
  sessionId: number,
  status: "active" | "closed",
): StateResult {
  const state = structuredClone(current);
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("No se encontró la sesión.");
  session.status = status;
  session.closedAt = status === "closed" ? new Date().toISOString() : null;
  return { state };
}

function nextAvailableCourseId(state: MonitoringState, name: string) {
  const base = slugify(name) || "nuevo-curso";
  let candidate = base;
  let suffix = 2;
  while (state.courses.some((course) => course.id === candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

export function importStudents(
  current: MonitoringState,
  courseName: string,
  rawNames: string[],
): StateResult & { courseId: string; roomTemplateId: string } {
  const state = structuredClone(current);
  const uniqueNames = [...new Set(rawNames.map((name) => name.trim()).filter(Boolean))]
    .slice(0, 80);
  if (!uniqueNames.length) throw new Error("No se encontraron nombres para importar.");

  const courseId = nextAvailableCourseId(state, courseName);
  const roomTemplateId = `${courseId}-sala-habitual`;
  const now = new Date().toISOString();
  state.courses.push({ id: courseId, name: courseName, createdAt: now });
  state.roomTemplates.push({
    id: roomTemplateId,
    courseId,
    name: "Sala habitual",
    description: `Distribución habitual de ${courseName}`,
    rowCount: 7,
    columnCount: 6,
    active: true,
    createdAt: now,
  });

  const slots: RoomSlot[] = Array.from({ length: 42 }, (_, index) => ({
    templateId: roomTemplateId,
    seatRow: Math.floor(index / 6),
    seatCol: index % 6,
    status: "available",
  }));
  state.roomSlots.push(...slots);

  const importedStudents: Student[] = uniqueNames.map((name, index) => ({
    id: `${courseId}-${slugify(name)}-${index + 1}`,
    courseId,
    number: index + 1,
    fullName: name,
    displayName: displayName(name),
    seatRow: null,
    seatCol: null,
    active: true,
  }));
  state.students.push(...importedStudents);
  state.source = {
    title: courseName,
    tabs: ["Nómina importada", "Puestos", "Monitoreo PI"],
    importedAt: now,
    mode: "imported",
  };

  return { state, courseId, roomTemplateId };
}
