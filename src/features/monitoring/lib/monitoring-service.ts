import { DEFAULT_ROOM_TEMPLATE_ID } from "@/config/app";
import { layoutError, type RoomLayout } from "@/features/courses/lib/room-layouts";
import { displayName, slugify } from "@/lib/text";
import type {
  MonitoringCode,
  MonitoringState,
  RoomSlot,
  RosterEntry,
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
  // Fotografía de la nómina: N°, nombre y puesto con que el estudiante empezó la clase.
  const seats = new Map(
    state.seatAssignments
      .filter((assignment) => assignment.templateId === roomTemplate.id)
      .map((assignment) => [assignment.studentId, assignment]),
  );
  state.sessionStudents.push(
    ...roster.map((student) => ({
      sessionId,
      studentId: student.id,
      present: true,
      number: student.number,
      fullName: student.fullName,
      displayName: student.displayName,
      seatRow: seats.get(student.id)?.seatRow ?? null,
      seatCol: seats.get(student.id)?.seatCol ?? null,
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
  // Solo cuenta quien está en la fotografía de la nómina de la clase.
  const presence = state.sessionStudents.find(
    (item) => item.sessionId === session.id && item.studentId === student.id,
  );
  if (!presence) {
    throw new Error("El estudiante no pertenece a la nómina de esta clase.");
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

  presence.present = true;

  return { state };
}

export function setPresence(
  current: MonitoringState,
  sessionId: number,
  studentId: string,
  present: boolean,
): StateResult {
  const state = structuredClone(current);
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session || session.status !== "active") {
    throw new Error("La asistencia solo se modifica en una clase en curso.");
  }
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

/**
 * Asignar puestos por N°: ubica a los estudiantes activos sin puesto en los
 * puestos libres de la plantilla, en orden de lectura (fila y columna) y por
 * N° de lista. Es una acción explícita; no mueve a quien ya tiene puesto.
 */
export function assignSeatsByNumber(
  current: MonitoringState,
  roomTemplateId: string,
): StateResult & { assigned: number } {
  const state = structuredClone(current);
  const template = state.roomTemplates.find((item) => item.id === roomTemplateId);
  if (!template) throw new Error("Plantilla no válida.");

  const assignments = state.seatAssignments.filter((item) => item.templateId === roomTemplateId);
  const taken = new Set(assignments.map((item) => `${item.seatRow}-${item.seatCol}`));
  const seated = new Set(assignments.map((item) => item.studentId));
  // En salas por grupos o mesones, los N° consecutivos quedan juntos: se
  // llenan los grupos en el orden de su primer puesto (ADR 0004).
  const available = state.roomSlots.filter((slot) => slot.templateId === roomTemplateId && slot.status === "available");
  const groupStart = new Map<string, number>();
  for (const slot of available) {
    if (!slot.groupLabel) continue;
    const position = slot.seatRow * 100 + slot.seatCol;
    groupStart.set(slot.groupLabel, Math.min(groupStart.get(slot.groupLabel) ?? Infinity, position));
  }
  const startOf = (slot: RoomSlot) =>
    (slot.groupLabel ? groupStart.get(slot.groupLabel) : undefined) ?? slot.seatRow * 100 + slot.seatCol;
  const freeSlots = available
    .filter((slot) => !taken.has(`${slot.seatRow}-${slot.seatCol}`))
    .sort((first, second) =>
      startOf(first) - startOf(second) || first.seatRow - second.seatRow || first.seatCol - second.seatCol);
  const unseated = state.students
    .filter((student) => student.courseId === template.courseId && student.active && !seated.has(student.id))
    .sort((first, second) =>
      (first.number ?? Infinity) - (second.number ?? Infinity)
      || first.fullName.localeCompare(second.fullName, "es"));

  const pairs = unseated.slice(0, freeSlots.length).map((student, index) => ({ student, slot: freeSlots[index] }));
  for (const { student, slot } of pairs) {
    state.seatAssignments.push({
      templateId: roomTemplateId,
      studentId: student.id,
      seatRow: slot.seatRow,
      seatCol: slot.seatCol,
    });
    if (roomTemplateId === DEFAULT_ROOM_TEMPLATE_ID) {
      student.seatRow = slot.seatRow;
      student.seatCol = slot.seatCol;
    }
  }
  return { state, assigned: pairs.length };
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

/**
 * Agrega al estado (ya clonado) la sala habitual de 7 × 6, sin asignaciones:
 * los puestos se ordenan dentro de la aplicación. Devuelve su id.
 */
export function addDefaultRoomTemplate(
  state: MonitoringState,
  courseId: string,
  courseName: string,
  now = new Date().toISOString(),
) {
  const roomTemplateId = `${courseId}-sala-habitual`;
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
  return roomTemplateId;
}

export function importStudents(
  current: MonitoringState,
  courseName: string,
  entries: RosterEntry[],
): StateResult & { courseId: string; roomTemplateId: string } {
  const state = structuredClone(current);
  // La validación de N° vacíos, inválidos y repetidos ocurre al leer la planilla
  // (features/courses/lib/roster-import.ts); aquí se ordena por N° de lista.
  const roster = entries
    .map((entry) => ({ number: entry.number, fullName: entry.fullName.trim() }))
    .filter((entry) => entry.fullName)
    .sort((first, second) => first.number - second.number)
    .slice(0, 80);
  if (!roster.length) throw new Error("No se encontraron nombres para importar.");

  const courseId = nextAvailableCourseId(state, courseName);
  const now = new Date().toISOString();
  state.courses.push({ id: courseId, name: courseName, createdAt: now });
  const roomTemplateId = addDefaultRoomTemplate(state, courseId, courseName, now);

  const importedStudents: Student[] = roster.map((entry, index) => ({
    id: `${courseId}-${slugify(entry.fullName)}-${index + 1}`,
    courseId,
    number: entry.number,
    fullName: entry.fullName,
    displayName: displayName(entry.fullName),
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

function slotsFor(templateId: string, layout: RoomLayout): RoomSlot[] {
  return layout.slots.map((slot) => ({
    templateId,
    seatRow: slot.row,
    seatCol: slot.col,
    status: "available",
    ...(slot.group ? { groupLabel: slot.group } : {}),
  }));
}

function checkRoom(name: string, layout: RoomLayout) {
  const roomName = name.trim();
  if (!roomName) throw new Error("Escribe el nombre de la sala.");
  const error = layoutError(layout);
  if (error) throw new Error(error);
  return roomName;
}

/**
 * Agrega una sala al curso con la forma elegida (filas, laboratorio o
 * trabajo grupal). Un curso puede tener varias: la sala habitual y el
 * laboratorio, por ejemplo.
 */
export function createRoomTemplate(
  current: MonitoringState,
  courseId: string,
  name: string,
  layout: RoomLayout,
): StateResult & { roomTemplateId: string } {
  const state = structuredClone(current);
  if (!state.courses.some((course) => course.id === courseId)) throw new Error("No se encontró el curso.");
  const roomName = checkRoom(name, layout);
  const base = `${courseId}-${slugify(roomName) || "sala"}`;
  let roomTemplateId = base;
  for (let suffix = 2; state.roomTemplates.some((item) => item.id === roomTemplateId); suffix += 1) {
    roomTemplateId = `${base}-${suffix}`;
  }
  state.roomTemplates.push({
    id: roomTemplateId,
    courseId,
    name: roomName,
    description: "",
    rowCount: layout.rows,
    columnCount: layout.cols,
    active: true,
    createdAt: new Date().toISOString(),
    layout: layout.kind,
  });
  state.roomSlots.push(...slotsFor(roomTemplateId, layout));
  return { state, roomTemplateId };
}

/**
 * Cambia la forma de una sala. Quien queda sin puesto pasa a «Sin puesto
 * asignado»; las demás asignaciones se conservan. Las clases ya iniciadas
 * conservan su fotografía.
 */
export function updateRoomLayout(
  current: MonitoringState,
  roomTemplateId: string,
  name: string,
  layout: RoomLayout,
): StateResult & { released: number } {
  const state = structuredClone(current);
  const template = state.roomTemplates.find((item) => item.id === roomTemplateId);
  if (!template) throw new Error("Plantilla no válida.");
  const roomName = checkRoom(name, layout);
  const seats = new Set(layout.slots.map((slot) => `${slot.row}-${slot.col}`));

  const released = state.seatAssignments.filter(
    (item) => item.templateId === roomTemplateId && !seats.has(`${item.seatRow}-${item.seatCol}`),
  );
  const releasedIds = new Set(released.map((item) => item.studentId));
  state.seatAssignments = state.seatAssignments.filter((item) => !released.includes(item));
  if (roomTemplateId === DEFAULT_ROOM_TEMPLATE_ID) {
    for (const student of state.students) {
      if (releasedIds.has(student.id)) {
        student.seatRow = null;
        student.seatCol = null;
      }
    }
  }

  state.roomSlots = [
    ...state.roomSlots.filter((slot) => slot.templateId !== roomTemplateId),
    ...slotsFor(roomTemplateId, layout),
  ];
  template.name = roomName;
  template.rowCount = layout.rows;
  template.columnCount = layout.cols;
  template.layout = layout.kind;
  return { state, released: released.length };
}
