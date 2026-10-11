import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands";
import {
  addObservation,
  createSession,
  importStudents,
  moveStudent,
  setPresence,
  setSessionStatus,
} from "./monitoring-service";
import { COURSE_ID, MAIN_TEMPLATE_ID, TEACHER_ID, buildState } from "./test-fixtures";

const input = {
  courseId: COURSE_ID,
  teacherId: TEACHER_ID,
  roomTemplateId: MAIN_TEMPLATE_ID,
  date: "2026-03-10",
  module: "Módulo",
  objective: "Objetivo",
  successCriteria: "Criterios",
};

// Las horas de registro dependen del reloj: se comparan sin ellas.
function withoutTimes<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, field) => (
    ["createdAt", "startedAt", "closedAt", "importedAt"].includes(key) ? "<hora>" : field
  )));
}

describe("applyCommand", () => {
  it("cada comando equivale a su operación del dominio", () => {
    const base = buildState();
    const started = createSession(base, input);
    const state = started.state;
    const { sessionId } = started;

    expect(withoutTimes(applyCommand(base, { type: "createSession", input })))
      .toEqual(withoutTimes(started));
    expect(withoutTimes(applyCommand(state, {
      type: "addObservation",
      input: { sessionId, studentId: "a", round: 2, code: "R", progress: 70 },
    }))).toEqual(withoutTimes(addObservation(state, {
      sessionId, studentId: "a", round: 2, code: "R", progress: 70,
    })));
    expect(applyCommand(state, { type: "setPresence", sessionId, studentId: "b", present: false }))
      .toEqual(setPresence(state, sessionId, "b", false));
    expect(withoutTimes(applyCommand(state, { type: "setSessionStatus", sessionId, status: "closed" })))
      .toEqual(withoutTimes(setSessionStatus(state, sessionId, "closed")));
    expect(applyCommand(state, {
      type: "moveStudent", studentId: "c", roomTemplateId: MAIN_TEMPLATE_ID, row: 1, col: 0,
    })).toEqual(moveStudent(state, "c", MAIN_TEMPLATE_ID, 1, 0));
    expect(withoutTimes(applyCommand(state, {
      type: "importStudents", courseName: "Curso nuevo", entries: [{ number: 1, fullName: "Ana Ficticia Uno" }],
    }))).toEqual(withoutTimes(importStudents(state, "Curso nuevo", [{ number: 1, fullName: "Ana Ficticia Uno" }])));
  });

  it("no modifica el estado recibido", () => {
    const base = buildState();
    const before = structuredClone(base);

    applyCommand(base, { type: "createSession", input });

    expect(base).toEqual(before);
  });
});
