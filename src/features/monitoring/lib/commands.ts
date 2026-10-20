import type { RoomLayout } from "@/features/courses/lib/room-layouts";
import { updateRoster, type RosterUpdatePlan } from "@/features/courses/lib/roster-update";
import type {
  MonitoringState,
  RosterEntry,
  SessionStatus,
} from "@/types/monitoring";
import {
  addObservation,
  assignSeatsByNumber,
  createRoomTemplate,
  createSession,
  importStudents,
  moveStudent,
  setPresence,
  setSessionStatus,
  updateRoomLayout,
  setCourseArchived,
  setFocusStudents,
  updateCourseDetails,
  type AddObservationInput,
  type CreateSessionInput,
} from "./monitoring-service";

/**
 * Operaciones del docente. Las vistas emiten comandos y cada repositorio
 * decide cómo aplicarlos: el local, sobre el último estado guardado; el de
 * Supabase, con una función transaccional (ADR 0002).
 */
export type MonitoringCommand =
  | { type: "createSession"; input: CreateSessionInput }
  | { type: "addObservation"; input: AddObservationInput }
  | { type: "setPresence"; sessionId: number; studentId: string; present: boolean }
  | { type: "setSessionStatus"; sessionId: number; status: SessionStatus }
  | {
      type: "moveStudent";
      studentId: string;
      roomTemplateId: string;
      row: number | null;
      col: number | null;
    }
  /** `spaceId`: espacio donde se crea el curso (solo en la nube). */
  | {
      type: "importStudents";
      courseName: string;
      academicYear?: number;
      entries: RosterEntry[];
      focusNumbers?: number[];
      spaceId?: string;
    }
  | { type: "updateRoster"; courseId: string; entries: RosterEntry[] }
  | { type: "setFocusStudents"; courseId: string; studentIds: string[] }
  | { type: "setCourseArchived"; courseId: string; archived: boolean }
  | { type: "updateCourseDetails"; courseId: string; name: string; academicYear: number }
  | { type: "assignSeatsByNumber"; roomTemplateId: string }
  | { type: "createRoomTemplate"; courseId: string; name: string; layout: RoomLayout }
  | { type: "updateRoomLayout"; roomTemplateId: string; name: string; layout: RoomLayout };

type CommandOutputs = {
  createSession: { sessionId: number };
  addObservation: object;
  setPresence: object;
  setSessionStatus: object;
  moveStudent: object;
  importStudents: { courseId: string; roomTemplateId: string };
  updateRoster: { plan: RosterUpdatePlan };
  setFocusStudents: object;
  setCourseArchived: object;
  updateCourseDetails: object;
  assignSeatsByNumber: { assigned: number };
  createRoomTemplate: { roomTemplateId: string };
  updateRoomLayout: { released: number };
};

export type CommandResult<C extends MonitoringCommand = MonitoringCommand> =
  { state: MonitoringState } & CommandOutputs[C["type"]];

function run(state: MonitoringState, command: MonitoringCommand): CommandResult {
  switch (command.type) {
    case "createSession":
      return createSession(state, command.input);
    case "addObservation":
      return addObservation(state, command.input);
    case "setPresence":
      return setPresence(state, command.sessionId, command.studentId, command.present);
    case "setSessionStatus":
      return setSessionStatus(state, command.sessionId, command.status);
    case "moveStudent":
      return moveStudent(state, command.studentId, command.roomTemplateId, command.row, command.col);
    case "importStudents":
      return importStudents(
        state,
        command.courseName,
        command.academicYear ?? new Date().getFullYear(),
        command.entries,
        command.focusNumbers ?? [],
      );
    case "updateRoster":
      return updateRoster(state, command.courseId, command.entries);
    case "setFocusStudents":
      return setFocusStudents(state, command.courseId, command.studentIds);
    case "setCourseArchived":
      return setCourseArchived(state, command.courseId, command.archived);
    case "updateCourseDetails":
      return updateCourseDetails(state, command.courseId, command.name, command.academicYear);
    case "assignSeatsByNumber":
      return assignSeatsByNumber(state, command.roomTemplateId);
    case "createRoomTemplate":
      return createRoomTemplate(state, command.courseId, command.name, command.layout);
    case "updateRoomLayout":
      return updateRoomLayout(state, command.roomTemplateId, command.name, command.layout);
  }
}

/** Aplica un comando sin modificar el estado recibido. */
export function applyCommand<C extends MonitoringCommand>(
  state: MonitoringState,
  command: C,
): CommandResult<C> {
  return run(state, command) as CommandResult<C>;
}
