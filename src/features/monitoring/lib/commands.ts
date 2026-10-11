import { updateRoster, type RosterUpdatePlan } from "@/features/courses/lib/roster-update";
import type {
  MonitoringState,
  RosterEntry,
  SessionStatus,
} from "@/types/monitoring";
import {
  addObservation,
  assignSeatsByNumber,
  createSession,
  importStudents,
  moveStudent,
  setPresence,
  setSessionStatus,
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
  | { type: "importStudents"; courseName: string; entries: RosterEntry[] }
  | { type: "updateRoster"; courseId: string; entries: RosterEntry[] }
  | { type: "assignSeatsByNumber"; roomTemplateId: string };

type CommandOutputs = {
  createSession: { sessionId: number };
  addObservation: object;
  setPresence: object;
  setSessionStatus: object;
  moveStudent: object;
  importStudents: { courseId: string; roomTemplateId: string };
  updateRoster: { plan: RosterUpdatePlan };
  assignSeatsByNumber: { assigned: number };
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
      return importStudents(state, command.courseName, command.entries);
    case "updateRoster":
      return updateRoster(state, command.courseId, command.entries);
    case "assignSeatsByNumber":
      return assignSeatsByNumber(state, command.roomTemplateId);
  }
}

/** Aplica un comando sin modificar el estado recibido. */
export function applyCommand<C extends MonitoringCommand>(
  state: MonitoringState,
  command: C,
): CommandResult<C> {
  return run(state, command) as CommandResult<C>;
}
