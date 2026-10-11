import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo-state";
import { parseMonitoringState } from "./state-validation";
import { buildSession, buildState, observationRows, presenceRows } from "./test-fixtures";

function fullState() {
  const state = buildState();
  state.sessions = [buildSession({ id: 1, teacherId: null, roomTemplateId: null })];
  state.sessionStudents = presenceRows(1, ["a", "b"], ["b"]);
  state.observations = observationRows([
    { studentId: "a", code: "R", progress: 50 },
    { studentId: "a", code: "C" },
  ]);
  return state;
}

function withChange(change: (state: Record<string, unknown>) => void) {
  const state = structuredClone(fullState()) as unknown as Record<string, unknown>;
  change(state);
  return state;
}

describe("parseMonitoringState", () => {
  it("acepta la demostración y un estado completo sin cambiarlos", () => {
    expect(parseMonitoringState(createDemoState())).toEqual({ ok: true, state: createDemoState() });
    expect(parseMonitoringState(fullState())).toEqual({ ok: true, state: fullState() });
  });

  it("conserva la fotografía de la nómina cuando existe", () => {
    const value = withChange((state) => {
      (state.sessionStudents as Array<Record<string, unknown>>)[0] = {
        sessionId: 1, studentId: "a", present: true, number: null, fullName: "A", displayName: "A", seatRow: 0, seatCol: null,
      };
    });

    const result = parseMonitoringState(value);

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.state.sessionStudents[0]).toEqual({
        sessionId: 1, studentId: "a", present: true, number: null, fullName: "A", displayName: "A", seatRow: 0, seatCol: null,
      });
      expect(result.state.sessionStudents[1]).not.toHaveProperty("number");
    }
  });

  it("descarta campos desconocidos, como el createdAt de estudiantes del Site anterior", () => {
    const value = withChange((state) => {
      (state.students as Array<Record<string, unknown>>)[0].createdAt = "2026-08-01T00:00:00.000Z";
      state.extra = "no se guarda";
    });

    const result = parseMonitoringState(value);

    expect(result).toEqual({ ok: true, state: fullState() });
  });

  it("completa la fuente cuando falta su modo o la fuente completa", () => {
    const withoutMode = withChange((state) => {
      delete (state.source as Record<string, unknown>).mode;
    });
    const withoutSource = withChange((state) => {
      delete state.source;
    });

    expect(parseMonitoringState(withoutMode)).toMatchObject({ ok: true, state: { source: { mode: "imported" } } });
    expect(parseMonitoringState(withoutSource)).toMatchObject({
      ok: true,
      state: { source: { title: "Respaldo", tabs: [], mode: "imported" } },
    });
  });

  it.each([
    ["no es un objeto", [], "estado: se esperaba un objeto."],
    ["falta una lista", withChange((state) => { delete state.observations; }), "observations: se esperaba una lista."],
    ["una fila no es objeto", withChange((state) => { state.students = [1]; }), "students[0]: se esperaba un objeto."],
    ["código inválido", withChange((state) => {
      (state.observations as Array<Record<string, unknown>>)[1].code = "X";
    }), "observations[1].code: se esperaba I, R, C."],
    ["recorrido 4", withChange((state) => {
      (state.observations as Array<Record<string, unknown>>)[0].round = 4;
    }), "observations[0].round: se esperaba un entero entre 1 y 3."],
    ["avance sobre 100", withChange((state) => {
      (state.observations as Array<Record<string, unknown>>)[0].progress = 101;
    }), "observations[0].progress: se esperaba un entero entre 0 y 100."],
    ["fecha con otro formato", withChange((state) => {
      (state.sessions as Array<Record<string, unknown>>)[0].date = "10/03/2026";
    }), "sessions[0].date: se esperaba una fecha AAAA-MM-DD."],
    ["asistencia como número", withChange((state) => {
      (state.sessionStudents as Array<Record<string, unknown>>)[0].present = 1;
    }), "sessionStudents[0].present: se esperaba verdadero o falso."],
    ["id de clase que no es entero positivo", withChange((state) => {
      (state.sessions as Array<Record<string, unknown>>)[0].id = "1";
    }), "sessions[0].id: se esperaba un entero mayor o igual a 1."],
    ["N° de lista decimal", withChange((state) => {
      (state.students as Array<Record<string, unknown>>)[0].number = 1.5;
    }), "students[0].number: se esperaba un entero."],
    ["ids de clase repetidos", withChange((state) => {
      const sessions = state.sessions as Array<Record<string, unknown>>;
      sessions.push({ ...sessions[0] });
    }), "sessions: el id 1 está repetido."],
  ])("rechaza: %s", (_case, value, error) => {
    expect(parseMonitoringState(value)).toEqual({ ok: false, error });
  });
});
