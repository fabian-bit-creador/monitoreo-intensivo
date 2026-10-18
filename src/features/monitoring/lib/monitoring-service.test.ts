import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringState } from "@/types/monitoring";
import { metricsForSession } from "./metrics";
import {
  addObservation,
  assignSeatsByNumber,
  createRoomTemplate,
  createSession,
  importStudents,
  moveStudent,
  setPresence,
  setSessionStatus,
  setCourseArchived,
  setFocusStudents,
  updateCourseDetails,
  updateRoomLayout,
  type CreateSessionInput,
} from "./monitoring-service";
import { applyCommand } from "./commands";
import { groupsLayout, labLayout, type RoomLayout } from "@/features/courses/lib/room-layouts";
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

  it("la fotografía guarda N°, nombre y puesto de cada estudiante en la plantilla elegida", () => {
    const { state, sessionId } = createSession(buildState(), sessionInput({ roomTemplateId: SECOND_TEMPLATE_ID }));
    const row = (id: string) => state.sessionStudents.find((item) => item.sessionId === sessionId && item.studentId === id);

    expect(row("a")).toEqual({
      sessionId,
      studentId: "a",
      present: true,
      number: 1,
      fullName: "Estudiante ficticio a",
      displayName: "Estudiante a",
      seatRow: 0,
      seatCol: 0,
    });
    // «b» tiene puesto en la sala principal, pero no en el taller elegido.
    expect(row("b")).toMatchObject({ seatRow: null, seatCol: null });
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

  it.each([
    ["de otro curso", "otro"],
    ["inactivo al iniciar la clase", "inactivo"],
  ])("rechaza a un estudiante %s: no está en la nómina de la clase", (_case, studentId) => {
    const { state, sessionId } = withActiveSession();

    expect(() => addObservation(state, { sessionId, studentId, round: 1, code: "C" }))
      .toThrow("El estudiante no pertenece a la nómina de esta clase.");
  });

  it("rechaza a un estudiante agregado al curso después de iniciar la clase", () => {
    const { state, sessionId } = withActiveSession();
    state.students.push(buildStudent("nuevo", 9));

    expect(() => addObservation(state, { sessionId, studentId: "nuevo", round: 1, code: "I" }))
      .toThrow("El estudiante no pertenece a la nómina de esta clase.");
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

  it("no modifica la asistencia de una clase cerrada ni de una inexistente", () => {
    const { state, sessionId } = withActiveSession();
    const closed = setSessionStatus(state, sessionId, "closed").state;

    expect(() => setPresence(closed, sessionId, "a", false))
      .toThrow("La asistencia solo se modifica en una clase en curso.");
    expect(() => setPresence(state, 99, "a", false))
      .toThrow("La asistencia solo se modifica en una clase en curso.");
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

describe("assignSeatsByNumber", () => {
  it("ubica a quienes no tienen puesto en los libres, por N° y en orden de lectura", () => {
    // Sala principal: «a» en (0,0), «b» en (0,1); libres (0,2), (1,0) y (1,1); (1,2) no disponible.
    const { state, assigned } = assignSeatsByNumber(buildState(), MAIN_TEMPLATE_ID);

    expect(assigned).toBe(2);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "c")).toEqual([0, 2]);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "d")).toEqual([1, 0]);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toEqual([0, 0]);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "inactivo")).toBeNull();
    expect(state.students.find((student) => student.id === "c")).toMatchObject({ seatRow: 0, seatCol: 2 });
  });

  it("si faltan puestos, ubica a los primeros por N° y deja al resto sin puesto", () => {
    const base = buildState();
    base.roomSlots = base.roomSlots.filter((slot) => !(slot.templateId === MAIN_TEMPLATE_ID && slot.seatRow === 1));

    const { state, assigned } = assignSeatsByNumber(base, MAIN_TEMPLATE_ID);

    expect(assigned).toBe(1);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "c")).toEqual([0, 2]);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "d")).toBeNull();
  });

  it("repetirla no mueve a nadie", () => {
    const once = assignSeatsByNumber(buildState(), MAIN_TEMPLATE_ID).state;
    const twice = assignSeatsByNumber(once, MAIN_TEMPLATE_ID);

    expect(twice.assigned).toBe(0);
    expect(twice.state.seatAssignments).toEqual(once.seatAssignments);
  });

  it("rechaza una plantilla inexistente y no modifica el estado recibido", () => {
    const state = buildState();
    const before = structuredClone(state);

    expect(() => assignSeatsByNumber(state, "no-existe")).toThrow("Plantilla no válida.");
    assignSeatsByNumber(state, MAIN_TEMPLATE_ID);
    expect(state).toEqual(before);
  });
});

describe("importStudents", () => {
  const names = ["Ana Rivas Soto", "Bruno Tapia León", "Camila Ovalle Díaz"];
  const byOrder = (list: string[]) => list.map((fullName, index) => ({ number: index + 1, fullName }));

  it("crea el curso, una sala habitual de 7 × 6 y los estudiantes sin puesto", () => {
    const { state, courseId, roomTemplateId } = importStudents(buildState(), "III°B 2026", byOrder(names));

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
    const { state, roomTemplateId } = importStudents(buildState(), "III°B 2026", byOrder(names));

    expect(state.seatAssignments.some((item) => item.templateId === roomTemplateId)).toBe(false);
  });

  it("abrevia el nombre visible como nombre e inicial del primer apellido", () => {
    const { state, courseId } = importStudents(buildState(), "III°B 2026", byOrder(names));

    expect(state.students.find((student) => student.courseId === courseId)?.displayName).toBe("Ana R.");
  });

  it("recorta los nombres y descarta los vacíos", () => {
    const { state, courseId } = importStudents(buildState(), "III°B 2026", [
      { number: 1, fullName: "  Ana Rivas Soto " },
      { number: 2, fullName: "   " },
      { number: 3, fullName: "Bruno Tapia León" },
    ]);

    expect(state.students.filter((student) => student.courseId === courseId).map((student) => student.fullName))
      .toEqual(["Ana Rivas Soto", "Bruno Tapia León"]);
  });

  it("usa el N° de lista de cada estudiante y ordena la nómina por N°", () => {
    const { state, courseId } = importStudents(buildState(), "III°B 2026", [
      { number: 7, fullName: "Ana Rivas Soto" },
      { number: 3, fullName: "Bruno Tapia León" },
      { number: 12, fullName: "Camila Ovalle Díaz" },
    ]);

    expect(state.students.filter((student) => student.courseId === courseId).map((student) => [student.number, student.fullName]))
      .toEqual([[3, "Bruno Tapia León"], [7, "Ana Rivas Soto"], [12, "Camila Ovalle Díaz"]]);
  });

  it("importa como máximo 80 estudiantes", () => {
    const many = Array.from({ length: 85 }, (_, index) => `Estudiante ficticio ${index + 1}`);
    const { state, courseId } = importStudents(buildState(), "III°B 2026", byOrder(many));

    expect(state.students.filter((student) => student.courseId === courseId)).toHaveLength(80);
  });

  it("genera un id de curso único si el nombre ya está en uso", () => {
    const first = importStudents(buildState(), "Curso Prueba", byOrder(names));
    expect(first.courseId).toBe(`${COURSE_ID}-2`);

    const second = importStudents(first.state, "Curso Prueba", byOrder(names));
    expect(second.courseId).toBe(`${COURSE_ID}-3`);
  });

  it("usa «nuevo-curso» si el nombre no tiene caracteres válidos", () => {
    expect(importStudents(buildState(), "¡¡ !!", byOrder(names)).courseId).toBe("nuevo-curso");
  });

  it("marca la fuente de datos como importada", () => {
    const { state } = importStudents(buildState(), "III°B 2026", byOrder(names));

    expect(state.source).toMatchObject({ title: "III°B 2026", mode: "imported", importedAt: NOW });
  });

  it("rechaza una lista sin nombres", () => {
    expect(() => importStudents(buildState(), "III°B 2026", byOrder(["", "   "]))).toThrow(
      "No se encontraron nombres para importar.",
    );
  });

  it("no modifica el estado recibido", () => {
    const base = buildState();
    const before = structuredClone(base);

    importStudents(base, "III°B 2026", byOrder(names));

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

describe("salas configurables", () => {
  it("agrega una sala de trabajo grupal al curso, con sus grupos", () => {
    const layout = groupsLayout({ groups: 2, groupSize: 4, groupsPerRow: 2 });
    const { state, roomTemplateId } = createRoomTemplate(buildState(), COURSE_ID, " Trabajo grupal ", layout);

    expect(state.roomTemplates.find((item) => item.id === roomTemplateId)).toMatchObject({
      courseId: COURSE_ID, name: "Trabajo grupal", rowCount: 2, columnCount: 5, layout: "groups", active: true,
    });
    const slots = state.roomSlots.filter((slot) => slot.templateId === roomTemplateId);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toEqual({ templateId: roomTemplateId, seatRow: 0, seatCol: 0, status: "available", groupLabel: "Grupo 1" });

    const seated = assignSeatsByNumber(state, roomTemplateId);
    expect(seated.assigned).toBe(4);
    expect(seatOf(seated.state, roomTemplateId, "a")).toEqual([0, 0]);
  });

  it("asignar por N° completa grupo por grupo", () => {
    const layout = groupsLayout({ groups: 2, groupSize: 4, groupsPerRow: 2 });
    const { state, roomTemplateId } = createRoomTemplate(buildState(), COURSE_ID, "Grupos", layout);
    const seated = assignSeatsByNumber(state, roomTemplateId).state;
    const groupOf = (studentId: string) => {
      const [row, col] = seatOf(seated, roomTemplateId, studentId)!;
      return seated.roomSlots.find((slot) => slot.templateId === roomTemplateId && slot.seatRow === row && slot.seatCol === col)?.groupLabel;
    };
    // Los 4 estudiantes activos (N° 1 a 4) quedan en el Grupo 1, no repartidos por fila.
    expect(["a", "b", "c", "d"].map(groupOf)).toEqual(["Grupo 1", "Grupo 1", "Grupo 1", "Grupo 1"]);
    expect(seatOf(seated, roomTemplateId, "c")).toEqual([1, 0]);
  });

  it("no repite el id de una sala con el mismo nombre", () => {
    const layout = groupsLayout({ groups: 1, groupSize: 4, groupsPerRow: 1 });
    const first = createRoomTemplate(buildState(), COURSE_ID, "Laboratorio", layout);
    const second = createRoomTemplate(first.state, COURSE_ID, "Laboratorio", layout);
    expect(second.roomTemplateId).not.toBe(first.roomTemplateId);
  });

  it("rechaza un curso inexistente, un nombre vacío o una forma inválida", () => {
    const layout = groupsLayout({ groups: 1, groupSize: 4, groupsPerRow: 1 });
    const empty: RoomLayout = { kind: "custom", rows: 1, cols: 1, slots: [] };
    expect(() => createRoomTemplate(buildState(), "no-existe", "Sala", layout)).toThrow("No se encontró el curso.");
    expect(() => createRoomTemplate(buildState(), COURSE_ID, "  ", layout)).toThrow("Escribe el nombre de la sala.");
    expect(() => createRoomTemplate(buildState(), COURSE_ID, "Sala", empty)).toThrow("al menos un puesto");
  });

  it("cambiar la forma conserva los puestos que siguen existiendo y libera los demás", () => {
    // Sala principal: «a» en (0,0) y «b» en (0,1). La nueva forma no tiene (0,1).
    const layout: RoomLayout = {
      kind: "lab", rows: 2, cols: 3,
      slots: [{ row: 0, col: 0, group: "Mesón 1" }, { row: 1, col: 0, group: "Mesón 1" }, { row: 0, col: 2, group: "Mesón 2" }],
    };
    const { state, released } = updateRoomLayout(buildState(), MAIN_TEMPLATE_ID, "Laboratorio", layout);

    expect(released).toBe(1);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "a")).toEqual([0, 0]);
    expect(seatOf(state, MAIN_TEMPLATE_ID, "b")).toBeNull();
    expect(state.students.find((student) => student.id === "b")).toMatchObject({ seatRow: null, seatCol: null });
    expect(state.roomTemplates.find((item) => item.id === MAIN_TEMPLATE_ID))
      .toMatchObject({ name: "Laboratorio", rowCount: 2, columnCount: 3, layout: "lab" });
    expect(state.roomSlots.filter((slot) => slot.templateId === MAIN_TEMPLATE_ID)).toHaveLength(3);
    // Las otras salas no cambian.
    expect(state.roomSlots.filter((slot) => slot.templateId === SECOND_TEMPLATE_ID))
      .toEqual(buildState().roomSlots.filter((slot) => slot.templateId === SECOND_TEMPLATE_ID));
  });

  it("los comandos aplican las mismas reglas sin modificar el estado recibido", () => {
    const base = buildState();
    const before = structuredClone(base);
    const created = applyCommand(base, {
      type: "createRoomTemplate", courseId: COURSE_ID, name: "Lab", layout: labLayout({ benchesPerRow: 1, benchRows: 1, seatsPerSide: 2 }),
    });
    const changed = applyCommand(created.state, {
      type: "updateRoomLayout", roomTemplateId: created.roomTemplateId, name: "Lab 2",
      layout: { kind: "custom", rows: 1, cols: 1, slots: [{ row: 0, col: 0 }] },
    });
    expect(base).toEqual(before);
    expect(changed.released).toBe(0);
    expect(changed.state.roomTemplates.find((item) => item.id === created.roomTemplateId)?.name).toBe("Lab 2");
  });

  it("crea un curso con año y foco, y fotografía el foco al iniciar la clase", () => {
    const imported = importStudents(
      buildState(),
      "Kínder A",
      2027,
      [{ number: 1, fullName: "Ana Rojas" }, { number: 2, fullName: "Bruno Díaz" }],
      [2],
    );
    expect(imported.state.courses.find((item) => item.id === imported.courseId))
      .toMatchObject({ name: "Kínder A", academicYear: 2027, focusStudentCount: 1, archivedAt: null });
    const focus = imported.state.students.find((student) => student.courseId === imported.courseId && student.number === 2);
    expect(focus?.isFocus).toBe(true);

    const session = createSession(imported.state, {
      courseId: imported.courseId,
      teacherId: TEACHER_ID,
      roomTemplateId: imported.roomTemplateId,
      date: "2026-03-10",
      module: "Módulo 1",
      objective: "Objetivo",
      successCriteria: "Criterio",
    });
    expect(session.state.sessionStudents.find((row) => row.studentId === focus?.id)?.isFocus).toBe(true);
  });

  it("cambia foco y datos del curso, y exige cerrar la clase antes de archivarlo", () => {
    const base = buildState();
    base.sessions = [buildSession()];
    const focused = setFocusStudents(base, COURSE_ID, ["a"]);
    expect(focused.state.students.find((student) => student.id === "a")?.isFocus).toBe(true);
    expect(focused.state.courses.find((course) => course.id === COURSE_ID)?.focusStudentCount).toBe(1);

    const renamed = updateCourseDetails(focused.state, COURSE_ID, "Kínder B", 2028);
    expect(renamed.state.courses.find((course) => course.id === COURSE_ID))
      .toMatchObject({ name: "Kínder B", academicYear: 2028 });
    expect(() => setCourseArchived(renamed.state, COURSE_ID, true)).toThrow("Cierra la clase");

    const closed = {
      ...renamed.state,
      sessions: renamed.state.sessions.map((session) => ({ ...session, status: "closed" as const, closedAt: NOW })),
    };
    expect(setCourseArchived(closed, COURSE_ID, true).state.courses.find((course) => course.id === COURSE_ID)?.archivedAt)
      .toBe(NOW);
  });
});
