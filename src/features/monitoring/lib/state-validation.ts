import type {
  ClassSession,
  Course,
  MonitoringState,
  Observation,
  RoomSlot,
  RoomTemplate,
  SeatAssignment,
  SessionStudent,
  SourceMetadata,
  Student,
  Teacher,
} from "@/types/monitoring";

export type StateParseResult =
  | { ok: true; state: MonitoringState }
  | { ok: false; error: string };

type Row = Record<string, unknown>;

class InvalidState extends Error {}

function fail(path: string, expected: string): never {
  throw new InvalidState(`${path}: se esperaba ${expected}.`);
}

export function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, path: string): string {
  return typeof value === "string" ? value : fail(path, "texto");
}

function nullableText(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : text(value, path);
}

function integer(value: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) {
    return value;
  }
  if (Number.isFinite(max)) return fail(path, `un entero entre ${min} y ${max}`);
  return fail(path, Number.isFinite(min) ? `un entero mayor o igual a ${min}` : "un entero");
}

function nullableInteger(value: unknown, path: string, min?: number): number | null {
  return value === null || value === undefined ? null : integer(value, path, min);
}

function bool(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path, "verdadero o falso");
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  return options.includes(value as T) ? (value as T) : fail(path, options.join(", "));
}

function list<T>(value: unknown, path: string, read: (row: Row, path: string) => T): T[] {
  if (!Array.isArray(value)) fail(path, "una lista");
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    return isRecord(item) ? read(item, itemPath) : fail(itemPath, "un objeto");
  });
}

const readTeacher = (row: Row, path: string): Teacher => ({
  id: text(row.id, `${path}.id`),
  fullName: text(row.fullName, `${path}.fullName`),
  role: oneOf(row.role, ["admin", "teacher"], `${path}.role`),
  active: bool(row.active, `${path}.active`),
  createdAt: text(row.createdAt, `${path}.createdAt`),
});

const readCourse = (row: Row, path: string): Course => ({
  id: text(row.id, `${path}.id`),
  name: text(row.name, `${path}.name`),
  createdAt: text(row.createdAt, `${path}.createdAt`),
  ...(row.spaceId === undefined ? {} : { spaceId: text(row.spaceId, `${path}.spaceId`) }),
});

const readRoomTemplate = (row: Row, path: string): RoomTemplate => ({
  id: text(row.id, `${path}.id`),
  courseId: text(row.courseId, `${path}.courseId`),
  name: text(row.name, `${path}.name`),
  description: nullableText(row.description, `${path}.description`) ?? "",
  rowCount: integer(row.rowCount, `${path}.rowCount`, 1, 50),
  columnCount: integer(row.columnCount, `${path}.columnCount`, 1, 50),
  active: bool(row.active, `${path}.active`),
  createdAt: text(row.createdAt, `${path}.createdAt`),
  ...(row.layout === undefined
    ? {}
    : { layout: oneOf(row.layout, ["classic", "rows", "lab", "groups", "custom"] as const, `${path}.layout`) }),
});

const readRoomSlot = (row: Row, path: string): RoomSlot => ({
  templateId: text(row.templateId, `${path}.templateId`),
  seatRow: integer(row.seatRow, `${path}.seatRow`, 0, 49),
  seatCol: integer(row.seatCol, `${path}.seatCol`, 0, 49),
  status: oneOf(row.status, ["available", "unavailable"], `${path}.status`),
  ...(row.groupLabel === undefined || row.groupLabel === null
    ? {}
    : { groupLabel: text(row.groupLabel, `${path}.groupLabel`) }),
});

const readSeatAssignment = (row: Row, path: string): SeatAssignment => ({
  templateId: text(row.templateId, `${path}.templateId`),
  studentId: text(row.studentId, `${path}.studentId`),
  seatRow: integer(row.seatRow, `${path}.seatRow`, 0, 49),
  seatCol: integer(row.seatCol, `${path}.seatCol`, 0, 49),
});

// Las exportaciones del Site anterior traen además `createdAt`; se descarta.
const readStudent = (row: Row, path: string): Student => ({
  id: text(row.id, `${path}.id`),
  courseId: text(row.courseId, `${path}.courseId`),
  number: nullableInteger(row.number, `${path}.number`),
  fullName: text(row.fullName, `${path}.fullName`),
  displayName: text(row.displayName, `${path}.displayName`),
  seatRow: nullableInteger(row.seatRow, `${path}.seatRow`, 0),
  seatCol: nullableInteger(row.seatCol, `${path}.seatCol`, 0),
  active: bool(row.active, `${path}.active`),
});

function isoDate(value: unknown, path: string): string {
  const date = text(value, path);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fail(path, "una fecha AAAA-MM-DD");
}

const readSession = (row: Row, path: string): ClassSession => ({
  id: integer(row.id, `${path}.id`, 1),
  courseId: text(row.courseId, `${path}.courseId`),
  teacherId: nullableText(row.teacherId, `${path}.teacherId`),
  roomTemplateId: nullableText(row.roomTemplateId, `${path}.roomTemplateId`),
  date: isoDate(row.date, `${path}.date`),
  module: text(row.module, `${path}.module`),
  objective: text(row.objective, `${path}.objective`),
  successCriteria: text(row.successCriteria, `${path}.successCriteria`),
  status: oneOf(row.status, ["active", "closed"], `${path}.status`),
  startedAt: text(row.startedAt, `${path}.startedAt`),
  closedAt: nullableText(row.closedAt, `${path}.closedAt`),
});

// La fotografía es opcional: se conservan solo los campos presentes.
function readSessionStudent(row: Row, path: string): SessionStudent {
  const result: SessionStudent = {
    sessionId: integer(row.sessionId, `${path}.sessionId`, 1),
    studentId: text(row.studentId, `${path}.studentId`),
    present: bool(row.present, `${path}.present`),
  };
  if ("number" in row) result.number = nullableInteger(row.number, `${path}.number`);
  if ("fullName" in row) result.fullName = text(row.fullName, `${path}.fullName`);
  if ("displayName" in row) result.displayName = text(row.displayName, `${path}.displayName`);
  if ("seatRow" in row) result.seatRow = nullableInteger(row.seatRow, `${path}.seatRow`, 0);
  if ("seatCol" in row) result.seatCol = nullableInteger(row.seatCol, `${path}.seatCol`, 0);
  return result;
}

const readObservation = (row: Row, path: string): Observation => ({
  id: integer(row.id, `${path}.id`, 1),
  sessionId: integer(row.sessionId, `${path}.sessionId`, 1),
  studentId: text(row.studentId, `${path}.studentId`),
  round: integer(row.round, `${path}.round`, 1, 3),
  code: oneOf(row.code, ["I", "R", "C"], `${path}.code`),
  progress: row.progress === null || row.progress === undefined
    ? null
    : integer(row.progress, `${path}.progress`, 0, 100),
  note: nullableText(row.note, `${path}.note`),
  createdAt: text(row.createdAt, `${path}.createdAt`),
});

// El Site anterior no guardaba `mode`: sus datos siempre fueron importados.
function readSource(value: unknown): SourceMetadata {
  if (!isRecord(value)) return { title: "Respaldo", tabs: [], importedAt: "", mode: "imported" };
  return {
    title: text(value.title, "source.title"),
    tabs: Array.isArray(value.tabs)
      ? value.tabs.map((tab, index) => text(tab, `source.tabs[${index}]`))
      : fail("source.tabs", "una lista"),
    importedAt: nullableText(value.importedAt, "source.importedAt") ?? "",
    mode: value.mode === undefined ? "imported" : oneOf(value.mode, ["demo", "imported"], "source.mode"),
  };
}

function assertUniqueIds(rows: Array<{ id: string | number }>, path: string) {
  const seen = new Set<string | number>();
  for (const row of rows) {
    if (seen.has(row.id)) throw new InvalidState(`${path}: el id ${String(row.id)} está repetido.`);
    seen.add(row.id);
  }
}

/**
 * Valida y normaliza un estado leído de un archivo o del almacenamiento.
 * Conserva solo los campos conocidos y rechaza tipos incorrectos o ids
 * repetidos, indicando la ruta del primer problema.
 */
export function parseMonitoringState(value: unknown): StateParseResult {
  if (!isRecord(value)) return { ok: false, error: "estado: se esperaba un objeto." };
  try {
    const state: MonitoringState = {
      teachers: list(value.teachers, "teachers", readTeacher),
      courses: list(value.courses, "courses", readCourse),
      roomTemplates: list(value.roomTemplates, "roomTemplates", readRoomTemplate),
      roomSlots: list(value.roomSlots, "roomSlots", readRoomSlot),
      seatAssignments: list(value.seatAssignments, "seatAssignments", readSeatAssignment),
      students: list(value.students, "students", readStudent),
      sessions: list(value.sessions, "sessions", readSession),
      sessionStudents: list(value.sessionStudents, "sessionStudents", readSessionStudent),
      observations: list(value.observations, "observations", readObservation),
      source: readSource(value.source),
    };
    assertUniqueIds(state.teachers, "teachers");
    assertUniqueIds(state.courses, "courses");
    assertUniqueIds(state.roomTemplates, "roomTemplates");
    assertUniqueIds(state.students, "students");
    assertUniqueIds(state.sessions, "sessions");
    assertUniqueIds(state.observations, "observations");
    return { ok: true, state };
  } catch (caught) {
    if (caught instanceof InvalidState) return { ok: false, error: caught.message };
    throw caught;
  }
}
