import { DEFAULT_ROOM_TEMPLATE_ID } from "@/config/app";
import type {
  ClassSession,
  MonitoringCode,
  MonitoringState,
  Observation,
  RoomSlot,
  SessionStudent,
  Student,
} from "@/types/monitoring";

// Estado mínimo y ficticio para las pruebas del dominio. No usar en la aplicación.

export const COURSE_ID = "curso-prueba";
export const OTHER_COURSE_ID = "otro-curso";
export const TEACHER_ID = "docente-activo";
export const INACTIVE_TEACHER_ID = "docente-inactivo";
// La plantilla principal usa el id por defecto porque moveStudent solo
// sincroniza Student.seatRow/seatCol para esa plantilla.
export const MAIN_TEMPLATE_ID = DEFAULT_ROOM_TEMPLATE_ID;
export const SECOND_TEMPLATE_ID = "taller-prueba";
export const INACTIVE_TEMPLATE_ID = "plantilla-inactiva";
export const OTHER_TEMPLATE_ID = "sala-otro-curso";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

export function buildStudent(
  id: string,
  number: number,
  overrides: Partial<Student> = {},
): Student {
  return {
    id,
    courseId: COURSE_ID,
    number,
    fullName: `Estudiante ficticio ${id}`,
    displayName: `Estudiante ${id}`,
    seatRow: null,
    seatCol: null,
    active: true,
    ...overrides,
  };
}

function slots(
  templateId: string,
  positions: Array<[number, number]>,
  status: RoomSlot["status"] = "available",
): RoomSlot[] {
  return positions.map(([seatRow, seatCol]) => ({ templateId, seatRow, seatCol, status }));
}

/**
 * Curso con cuatro estudiantes activos, uno inactivo y una sala principal de
 * 2 × 3 donde (1,2) no está disponible y (2,0) no existe (pasillo).
 * «a» ocupa (0,0) y «b» (0,1); «c» y «d» no tienen puesto.
 */
export function buildState(): MonitoringState {
  return {
    teachers: [
      { id: TEACHER_ID, fullName: "Docente Activo", role: "teacher", active: true, createdAt: CREATED_AT },
      { id: INACTIVE_TEACHER_ID, fullName: "Docente Inactivo", role: "teacher", active: false, createdAt: CREATED_AT },
    ],
    courses: [
      { id: COURSE_ID, name: "Curso Prueba", createdAt: CREATED_AT },
      { id: OTHER_COURSE_ID, name: "Otro Curso", createdAt: CREATED_AT },
    ],
    roomTemplates: [
      { id: MAIN_TEMPLATE_ID, courseId: COURSE_ID, name: "Sala principal", description: "", rowCount: 2, columnCount: 3, active: true, createdAt: CREATED_AT },
      { id: SECOND_TEMPLATE_ID, courseId: COURSE_ID, name: "Taller", description: "", rowCount: 1, columnCount: 2, active: true, createdAt: CREATED_AT },
      { id: INACTIVE_TEMPLATE_ID, courseId: COURSE_ID, name: "Antigua", description: "", rowCount: 1, columnCount: 1, active: false, createdAt: CREATED_AT },
      { id: OTHER_TEMPLATE_ID, courseId: OTHER_COURSE_ID, name: "Otra sala", description: "", rowCount: 1, columnCount: 1, active: true, createdAt: CREATED_AT },
    ],
    roomSlots: [
      ...slots(MAIN_TEMPLATE_ID, [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]]),
      ...slots(MAIN_TEMPLATE_ID, [[1, 2]], "unavailable"),
      ...slots(SECOND_TEMPLATE_ID, [[0, 0], [0, 1]]),
      ...slots(OTHER_TEMPLATE_ID, [[0, 0]]),
    ],
    seatAssignments: [
      { templateId: MAIN_TEMPLATE_ID, studentId: "a", seatRow: 0, seatCol: 0 },
      { templateId: MAIN_TEMPLATE_ID, studentId: "b", seatRow: 0, seatCol: 1 },
      { templateId: SECOND_TEMPLATE_ID, studentId: "a", seatRow: 0, seatCol: 0 },
    ],
    students: [
      buildStudent("a", 1, { seatRow: 0, seatCol: 0 }),
      buildStudent("b", 2, { seatRow: 0, seatCol: 1 }),
      buildStudent("c", 3),
      buildStudent("d", 4),
      buildStudent("inactivo", 5, { active: false }),
      buildStudent("otro", 1, { courseId: OTHER_COURSE_ID }),
    ],
    sessions: [],
    sessionStudents: [],
    observations: [],
    source: { title: "Prueba", tabs: [], importedAt: CREATED_AT, mode: "demo" },
  };
}

export function buildSession(overrides: Partial<ClassSession> = {}): ClassSession {
  return {
    id: 1,
    courseId: COURSE_ID,
    teacherId: TEACHER_ID,
    roomTemplateId: MAIN_TEMPLATE_ID,
    date: "2026-03-10",
    module: "Módulo",
    objective: "Objetivo",
    successCriteria: "Criterios",
    status: "active",
    startedAt: CREATED_AT,
    closedAt: null,
    ...overrides,
  };
}

export function presenceRows(
  sessionId: number,
  studentIds: string[],
  absentIds: string[] = [],
): SessionStudent[] {
  return studentIds.map((studentId) => ({
    sessionId,
    studentId,
    present: !absentIds.includes(studentId),
  }));
}

type ObservationInput = {
  studentId: string;
  code: MonitoringCode;
  progress?: number;
  round?: number;
  sessionId?: number;
};

/** Observaciones en orden de registro, con ids correlativos. */
export function observationRows(rows: ObservationInput[]): Observation[] {
  return rows.map((row, index) => ({
    id: index + 1,
    sessionId: row.sessionId ?? 1,
    studentId: row.studentId,
    round: row.round ?? 1,
    code: row.code,
    progress: row.progress ?? (row.code === "C" ? 100 : row.code === "I" ? 0 : null),
    note: null,
    createdAt: CREATED_AT,
  }));
}
