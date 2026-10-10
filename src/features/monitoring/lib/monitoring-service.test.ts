import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringState } from "@/types/monitoring";
import { metricsForSession } from "./metrics";
import {
  addObservation,
  createSession,
  importStudents,
  moveStudent,
  setPresence,
  setSessionStatus,
  type CreateSessionInput,
} from "./monitoring-service";
import {
  COURSE_ID,
  INACTIVE_TEACHER_ID,
  INACTIVE_TEMPLATE_ID,
  MAIN_TEMPLATE_ID,
  OTHER_COURSE_ID,
  OTHER_TEMPLATE_ID,
  SECOND_TEMPLATE_ID,
  TEACHER_ID,
  buildSession,
  buildState,
  buildStudent,
} from "./test-fixtures";

const NOW = "2026-03-10T13:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

function sessionInput(overrides: Partial<CreateSessionInput> = {}): CreateSessionInput {
  return {
    courseId: COURSE_ID,
    teacherId: TEACHER_ID,
    roomTemplateId: MAIN_TEMPLATE_ID,
    date: "2026-03-10",
    module: "Unidad 2",
    objective: "Resolver ecuaciones",
    successCriteria: "Despeja la incógnita",
    ...overrides,
  };
}

/** Estado con una sesión activa recién creada, lista para registrar. */
function withActiveSession() {
  const { state, sessionId } = createSession(buildState(), sessionInput());
  return { state, sessionId };
}

function seatOf(state: MonitoringState, templateId: string, studentId: string) {
  const assignment = state.seatAssignments.find(
    (item) => item.templateId === templateId && item.studentId === studentId,
  );
  return assignment ? [assignment.seatRow, assignment.seatCol] : null;
}

describe("createSession", () => {
  it("crea una sesión activa con docente, curso, plantilla y fecha", () => {
    const { state, sessionId } = createSession(buildState(), sessionInput());
    const session = state.sessions.find((item) => item.id === sessionId);

    expect(session).toMatchObject({
      courseId: COURSE_ID,
      teacherId: TEACHER_ID,
      roomTemplateId: MAIN_TEMPLATE_ID,
      date: "2026-03-10",
      status: "active",
      startedAt: NOW,
      closedAt: null,
    });
  });

  it("numera la sesión a continuación del mayor id existente y la deja primera", () => {
    const base = buildState();
    base.sessions = [buildSession({ id: 3 }), buildSession({ id: 7 })];

    const { state, sessionId } = createSession(base, sessionInput());

    expect(sessionId).toBe(8);
    expect(state.sessions[0].id).toBe(8);
  });

  it("toma la fotografía de la nómina: solo estudiantes activos del curso, todos presentes", () => {
    const { state, sessionId } = createSession(buildState(), sessionInput());
    const rows = state.sessionStudents.filter((row) => row.sessionId === sessionId);

    expect(rows.map((row) => row.studentId).sort()).toEqual(["a", "b", "c", "d"]);
    expect(rows.every((row) => row.present)).toBe(true);
  });

  it("recorta los textos y usa valores por defecto cuando vienen vacíos", () => {
    const filled = createSession(buildState(), sessionInput({ module: "  Unidad 3  " }));
    expect(filled.state.sessions[0].module).toBe("Unidad 3");

    const empty = createSession(
      buildState(),
      sessionInput({ module: "  ", objective: "", successCriteria: " " }),
    );
    expect(empty.state.sessions[0]).toMatchObject({
      module: "Práctica independiente",
      objective: "Actividad de práctica independiente",
      successCriteria: "Cumple los criterios de éxito definidos para la actividad.",
    });
  });

  it("no toca la distribución de puestos: el orden de sala se conserva entre sesiones", () => {
    const base = buildState();
    const { state } = createSession(base, sessionInput());

    expect(state.seatAssignments).toEqual(base.seatAssignments);
  });

  it.each([
    ["el docente está inactivo", { teacherId: INACTIVE_TEACHER_ID }],
    ["el docente no existe", { teacherId: "nadie" }],
    ["el curso no existe", { courseId: "curso-inexistente" }],
    ["la plantilla es de otro curso", { roomTemplateId: OTHER_TEMPLATE_ID }],
    ["la plantilla está inactiva", { roomTemplateId: INACTIVE_TEMPLATE_ID }],
    ["falta la fecha", { date: "" }],
  ])("rechaza crear la sesión si %s", (_, overrides) => {
    expect(() => createSession(buildState(), sessionInput(overrides))).toThrow(
      "Docente, curso, plantilla, fecha y nómina son obligatorios.",
    );
  });

  it("rechaza un curso sin estudiantes activos", () => {
    const base = buildState();
    base.students = base.students.map((student) => ({ ...student, active: false }));

    expect(() => createSession(base, sessionInput())).toThrow("nómina son obligatorios");
  });

  it("no modifica el estado recibido", () => {
    const base = buildState();
    const before = structuredClone(base);

    createSession(base, sessionInput());

    expect(base).toEqual(before);
  });
});

describe("addObservation", () => {
  function record(input: Partial<Parameters<typeof addObservation>[1]> = {}) {
    const { state, sessionId } = withActiveSession();
    return addObservation(state, {
      sessionId,
      studentId: "a",
      round: 1,
      code: "R",
      progress: 50,
      ...input,
    }).state;
  }

  it("I registra 0 % y C registra 100 % aunque llegue otro porcentaje", () => {
    expect(record({ code: "I", progress: 70 }).observations.at(-1)?.progress).toBe(0);
    expect(record({ code: "C", progress: 25 }).observations.at(-1)?.progress).toBe(100);
  });

  it.each([25, 50, 70, 90])("R conserva el %i %%", (progress) => {
    expect(record({ code: "R", progress }).observations.at(-1)?.progress).toBe(progress);
  });

  it.each([
    ["sin porcentaje", undefined],
    ["con 0", 0],
    ["con un valor no numérico", Number.NaN],
  ])("R %s usa 50 %%", (_, progress) => {
    expect(record({ code: "R", progress }).observations.at(-1)?.progress).toBe(50);
  });

  it("R se acota entre 1 y 99", () => {
    expect(record({ code: "R", progress: 150 }).observations.at(-1)?.progress).toBe(99);
    expect(record({ code: "R", progress: -10 }).observations.at(-1)?.progress).toBe(1);
  });

  it.each([
    [2, 2],
    [5, 3],
    [0, 1],
    [-1, 1],
  ])("el recorrido %i se guarda como %i", (round, expected) => {
    expect(record({ round }).observations.at(-1)?.round).toBe(expected);
  });

  it("recorta la observación breve y guarda null si viene vacía", () => {
    expect(record({ note: "  necesita ejemplo  " }).observations.at(-1)?.note).toBe("necesita ejemplo");
    expect(record({ note: "   " }).observations.at(-1)?.note).toBeNull();
  });

  it("conserva el historial: cada registro se agrega con id correlativo", () => {
    const { state, sessionId } = withActiveSession();
    const first = addObservation(state, { sessionId, studentId: "a", round: 1, code: "I" }).state;
    const second = addObservation(first, { sessionId, studentId: "a", round: 2, code: "C" }).state;

    expect(second.observations.map((row) => [row.id, row.code])).toEqual([[1, "I"], [2, "C"]]);
    expect(second.observations[1]).toMatchObject({ createdAt: NOW, sessionId, studentId: "a" });
  });

  it("registrar a un estudiante ausente lo vuelve a marcar presente", () => {
    const { state, sessionId } = withActiveSession();
    const absent = setPresence(state, sessionId, "a", false).state;

    const after = addObservation(absent, { sessionId, studentId: "a", round: 1, code: "C" }).state;

    expect(
      after.sessionStudents.find((row) => row.sessionId === sessionId && row.studentId === "a")?.present,
    ).toBe(true);
  });

  it("rechaza registrar en una sesión cerrada", () => {
    const { state, sessionId } = withActiveSession();
    const closed = setSessionStatus(state, sessionId, "closed").state;

    expect(() =>
      addObservation(closed, { sessionId, studentId: "a", round: 1, code: "C" }),
    ).toThrow("no están disponibles para registrar");
  });

  it("rechaza una sesión o un estudiante inexistentes", () => {
    const { state, sessionId } = withActiveSession();

    expect(() => addObservation(state, { sessionId: 99, studentId: "a", round: 1, code: "C" })).toThrow();
    expect(() => addObservation(state, { sessionId, studentId: "nadie", round: 1, code: "C" })).toThrow();
  });

  it("no modifica el estado recibido", () => {
    const { state, sessionId } = withActiveSession();
    const before = structuredClone(state);

    addObservation(state, { sessionId, studentId: "a", round: 1, code: "R", progress: 70 });

    expect(state).toEqual(before);
  });
});

describe("setPresence", () => {
  it("marca ausente y vuelve a marcar presente", () => {
    const { state, sessionId } = withActiveSession();
    const presence = (current: MonitoringState) =>
      current.sessionStudents.find((row) => row.sessionId === sessionId && row.studentId === "b")?.present;

    const absent = setPresence(state, sessionId, "b", false).state;
    expect(presence(absent)).toBe(false);
    expect(presence(setPresence(absent, sessionId, "b", true).state)).toBe(true);
  });

  it("rechaza a un estudiante que no está en la nómina de la sesión", () => {
    const { state, sessionId } = withActiveSession();

    expect(() => setPresence(state, sessionId, "otro", false)).toThrow(
      "No se encontró al estudiante en esta sesión.",
    );
  });
});

describe("setSessionStatus", () => {
  it("cerrar fija closedAt y reabrir lo limpia", () => {
    const { state, sessionId } = withActiveSession();

    const closed = setSessionStatus(state, sessionId, "closed").state;
    expect(closed.sessions[0]).toMatchObject({ status: "closed", closedAt: NOW });

    const reopened = setSessionStatus(closed, sessionId, "active").state;
    expect(reopened.sessions[0]).toMatchObject({ status: "active", closedAt: null });
  });

  it("rechaza una sesión inexistente", () => {
    expect(() => setSessionStatus(buildState(), 99, "closed")).toThrow("No se encontró la sesión.");
  });
});

describe("moveStudent", () => {
  it("ubica a un estudiante sin puesto en un puesto libre", () => {
    const state = moveStudent(buildState(), "c", MAIN_TEMPLATE_ID, 0, 2).state;

    expect(seatOf(state, MAIN_TEMPLATE_ID, "c")).toEqual([0, 2]);
  });

  it("mueve a un estudiante con puesto a uno libre y desocupa el anterior", () => {
    const state = moveStudent(buildState(), "a", MAIN_TEMPLATE_ID, 1, 0).state;

    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toEqual([1, 0]);
    expect(state.seatAssignments.some(
      (item) => item.templateId === MAIN_TEMPLATE_ID && item.seatRow === 0 && item.seatCol === 0,
    )).toBe(false);
  });

  it("intercambia lugares si el puesto de destino está ocupado", () => {
    const state = moveStudent(buildState(), "a", MAIN_TEMPLATE_ID, 0, 1).state;

    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toEqual([0, 1]);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "b")).toEqual([0, 0]);
  });

  it("si quien se mueve no tenía puesto, el ocupante queda sin puesto", () => {
    const state = moveStudent(buildState(), "c", MAIN_TEMPLATE_ID, 0, 0).state;

    expect(seatOf(state, MAIN_TEMPLATE_ID, "c")).toEqual([0, 0]);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toBeNull();
  });

  it("mover a un estudiante a su propio puesto no cambia nada", () => {
    const base = buildState();
    const state = moveStudent(base, "a", MAIN_TEMPLATE_ID, 0, 0).state;

    expect(state.seatAssignments).toEqual(base.seatAssignments);
  });

  it("«Dejar sin puesto» quita la asignación", () => {
    const state = moveStudent(buildState(), "a", MAIN_TEMPLATE_ID, null, null).state;

    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toBeNull();
    expect(state.students.find((student) => student.id === "a")).toMatchObject({ seatRow: null, seatCol: null });
  });

  it("dejar sin puesto en otra plantilla no toca la sala habitual", () => {
    const state = moveStudent(buildState(), "a", SECOND_TEMPLATE_ID, null, null).state;

    expect(seatOf(state, SECOND_TEMPLATE_ID, "a")).toBeNull();
    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toEqual([0, 0]);
    expect(state.students.find((student) => student.id === "a")).toMatchObject({ seatRow: 0, seatCol: 0 });
  });

  it.each([
    ["no disponible", 1, 2],
    ["inexistente (pasillo)", 2, 0],
  ])("rechaza un puesto %s", (_, row, col) => {
    expect(() => moveStudent(buildState(), "c", MAIN_TEMPLATE_ID, row, col)).toThrow(
      "Ese puesto no está disponible.",
    );
  });

  it("rechaza una plantilla de otro curso o un estudiante inexistente", () => {
    expect(() => moveStudent(buildState(), "a", OTHER_TEMPLATE_ID, 0, 0)).toThrow(
      "Plantilla o estudiante no válido.",
    );
    expect(() => moveStudent(buildState(), "nadie", MAIN_TEMPLATE_ID, 0, 2)).toThrow(
      "Plantilla o estudiante no válido.",
    );
  });

  it("cada plantilla conserva su propia distribución", () => {
    const state = moveStudent(buildState(), "a", MAIN_TEMPLATE_ID, 1, 1).state;

    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toEqual([1, 1]);
    expect(seatOf(state, SECOND_TEMPLATE_ID, "a")).toEqual([0, 0]);
  });

  it("sincroniza seatRow y seatCol del estudiante solo en la plantilla por defecto", () => {
    const swapped = moveStudent(buildState(), "a", MAIN_TEMPLATE_ID, 0, 1).state;
    const student = (state: MonitoringState, id: string) =>
      state.students.find((item) => item.id === id);
    expect(student(swapped, "a")).toMatchObject({ seatRow: 0, seatCol: 1 });
    expect(student(swapped, "b")).toMatchObject({ seatRow: 0, seatCol: 0 });

    const inWorkshop = moveStudent(buildState(), "a", SECOND_TEMPLATE_ID, 0, 1).state;
    expect(student(inWorkshop, "a")).toMatchObject({ seatRow: 0, seatCol: 0 });
  });

  it("no modifica el estado recibido", () => {
    const base = buildState();
    const before = structuredClone(base);

    moveStudent(base, "a", MAIN_TEMPLATE_ID, 0, 1);

    expect(base).toEqual(before);
  });
});

describe("importStudents", () => {
  const names = ["Ana Rivas Soto", "Bruno Tapia León", "Camila Ovalle Díaz"];

  it("crea el curso, una sala habitual de 7 × 6 y los estudiantes sin puesto", () => {
    const { state, courseId, roomTemplateId } = importStudents(buildState(), "III°B 2026", names);

    expect(state.courses.some((course) => course.id === courseId && course.name === "III°B 2026")).toBe(true);
    expect(state.roomTemplates.find((item) => item.id === roomTemplateId)).toMatchObject({
      courseId,
      name: "Sala habitual",
      rowCount: 7,
      columnCount: 6,
      active: true,
    });
    const roomSlots = state.roomSlots.filter((slot) => slot.templateId === roomTemplateId);
    expect(roomSlots).toHaveLength(42);
    expect(roomSlots.every((slot) => slot.status === "available")).toBe(true);
    const imported = state.students.filter((student) => student.courseId === courseId);
    expect(imported.map((student) => student.fullName)).toEqual(names);
    expect(imported.every((student) => student.active && student.seatRow === null)).toBe(true);
  });

  it("no crea asignaciones de puesto: la sala se ordena dentro de la aplicación", () => {
    const { state, roomTemplateId } = importStudents(buildState(), "III°B 2026", names);

    expect(state.seatAssignments.some((item) => item.templateId === roomTemplateId)).toBe(false);
  });

  it("abrevia el nombre visible como nombre e inicial del primer apellido", () => {
    const { state, courseId } = importStudents(buildState(), "III°B 2026", names);

    expect(state.students.find((student) => student.courseId === courseId)?.displayName).toBe("Ana R.");
  });

  it("recorta, descarta filas vacías y elimina duplicados", () => {
    const { state, courseId } = importStudents(buildState(), "III°B 2026", [
      "  Ana Rivas Soto ",
      "",
      "Ana Rivas Soto",
      "   ",
      "Bruno Tapia León",
    ]);

    expect(state.students.filter((student) => student.courseId === courseId).map((student) => student.fullName))
      .toEqual(["Ana Rivas Soto", "Bruno Tapia León"]);
  });

  it("numera según el orden de las filas (la importación del N° real queda para otra rama)", () => {
    const { state, courseId } = importStudents(buildState(), "III°B 2026", names);

    expect(state.students.filter((student) => student.courseId === courseId).map((student) => student.number))
      .toEqual([1, 2, 3]);
  });

  it("importa como máximo 80 estudiantes", () => {
    const many = Array.from({ length: 85 }, (_, index) => `Estudiante ficticio ${index + 1}`);
    const { state, courseId } = importStudents(buildState(), "III°B 2026", many);

    expect(state.students.filter((student) => student.courseId === courseId)).toHaveLength(80);
  });

  it("genera un id de curso único si el nombre ya está en uso", () => {
    const first = importStudents(buildState(), "Curso Prueba", names);
    expect(first.courseId).toBe(`${COURSE_ID}-2`);

    const second = importStudents(first.state, "Curso Prueba", names);
    expect(second.courseId).toBe(`${COURSE_ID}-3`);
  });

  it("usa «nuevo-curso» si el nombre no tiene caracteres válidos", () => {
    expect(importStudents(buildState(), "¡¡ !!", names).courseId).toBe("nuevo-curso");
  });

  it("marca la fuente de datos como importada", () => {
    const { state } = importStudents(buildState(), "III°B 2026", names);

    expect(state.source).toMatchObject({ title: "III°B 2026", mode: "imported", importedAt: NOW });
  });

  it("rechaza una lista sin nombres", () => {
    expect(() => importStudents(buildState(), "III°B 2026", ["", "   "])).toThrow(
      "No se encontraron nombres para importar.",
    );
  });

  it("no modifica el estado recibido", () => {
    const base = buildState();
    const before = structuredClone(base);

    importStudents(base, "III°B 2026", names);

    expect(base).toEqual(before);
    expect(base.students.some((student) => student.courseId === OTHER_COURSE_ID)).toBe(true);
  });
});

describe("cambios de nómina después de una sesión", () => {
  it("una baja posterior no altera el informe de una sesión ya cerrada", () => {
    const { state: initial, sessionId } = withActiveSession();
    let state = initial;
    state = addObservation(state, { sessionId, studentId: "d", round: 1, code: "C" }).state;
    state = setSessionStatus(state, sessionId, "closed").state;
    const before = metricsForSession(state, state.sessions[0]);

    state = {
      ...state,
      students: state.students.map((student) => (student.id === "d" ? { ...student, active: false } : student)),
    };
    const after = metricsForSession(state, state.sessions[0]);

    expect(after.roster.map((student) => student.id)).toEqual(before.roster.map((student) => student.id));
    expect({ counts: after.counts, coverage: after.coverage, cRate: after.cRate })
      .toEqual({ counts: before.counts, coverage: before.coverage, cRate: before.cRate });
  });

  it("un estudiante agregado después no aparece en sesiones anteriores, pero sí en las nuevas", () => {
    const { state: initial, sessionId } = withActiveSession();
    let state = initial;
    state = setSessionStatus(state, sessionId, "closed").state;
    state = { ...state, students: [...state.students, buildStudent("nuevo", 6)] };

    const previous = metricsForSession(state, state.sessions[0]);
    expect(previous.roster.map((student) => student.id)).not.toContain("nuevo");

    state = createSession(state, sessionInput({ date: "2026-03-17" })).state;
    const next = metricsForSession(state, state.sessions[0]);
    expect(next.roster.map((student) => student.id)).toContain("nuevo");
  });
});

describe("flujo completo de una clase", () => {
  it("tres recorridos, una ausencia, cierre y reapertura", () => {
    // El curso tiene además un estudiante inactivo: no entra en la nómina de la sesión.
    let { state } = createSession(buildState(), sessionInput());
    const sessionId = state.sessions[0].id;
    const rec = (studentId: string, round: number, code: "I" | "R" | "C", progress?: number) => {
      state = addObservation(state, { sessionId, studentId, round, code, progress }).state;
    };

    rec("a", 1, "I");
    rec("b", 1, "R", 50);
    rec("c", 1, "I");
    state = setPresence(state, sessionId, "d", false).state;
    rec("a", 2, "R", 70);
    rec("b", 2, "C");
    rec("c", 2, "I");
    rec("a", 3, "C");
    state = setSessionStatus(state, sessionId, "closed").state;

    const metrics = metricsForSession(state, state.sessions[0]);
    expect({
      roster: metrics.roster.map((student) => student.id),
      present: metrics.present.length,
      absent: metrics.absent,
      counts: metrics.counts,
      coverage: metrics.coverage,
      cRate: metrics.cRate,
      progressed: metrics.progressed,
    }).toEqual({
      roster: ["a", "b", "c", "d"],
      present: 3,
      absent: 1,
      counts: { I: 1, R: 0, C: 2 },
      coverage: 100,
      cRate: 67,
      progressed: 1,
    });

    expect(() => rec("c", 3, "C")).toThrow();
    state = setSessionStatus(state, sessionId, "active").state;
    rec("c", 3, "C");
    expect(metricsForSession(state, state.sessions[0]).counts).toEqual({ I: 0, R: 0, C: 3 });
  });
});
