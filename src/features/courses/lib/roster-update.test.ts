import { describe, expect, it } from "vitest";
import { metricsForSession } from "@/features/monitoring/lib/metrics";
import {
  addObservation,
  createSession,
  setSessionStatus,
} from "@/features/monitoring/lib/monitoring-service";
import {
  COURSE_ID,
  MAIN_TEMPLATE_ID,
  OTHER_COURSE_ID,
  SECOND_TEMPLATE_ID,
  TEACHER_ID,
  buildState,
  buildStudent,
} from "@/features/monitoring/lib/test-fixtures";
import type { MonitoringState, RosterEntry } from "@/types/monitoring";
import { planRosterUpdate, rosterOverlap, updateRoster } from "./roster-update";

// Curso de prueba: a (1), b (2), c (3), d (4) activos e «inactivo» (5).
const CURRENT: RosterEntry[] = [
  { number: 1, fullName: "Estudiante ficticio a" },
  { number: 2, fullName: "Estudiante ficticio b" },
  { number: 3, fullName: "Estudiante ficticio c" },
  { number: 4, fullName: "Estudiante ficticio d" },
];

const sessionInput = {
  courseId: COURSE_ID,
  teacherId: TEACHER_ID,
  roomTemplateId: MAIN_TEMPLATE_ID,
  date: "2026-03-10",
  module: "Módulo",
  objective: "Objetivo",
  successCriteria: "Criterios",
};

function student(state: MonitoringState, id: string) {
  const found = state.students.find((item) => item.id === id);
  if (!found) throw new Error(`No existe ${id}`);
  return found;
}

describe("planRosterUpdate", () => {
  it("la misma nómina no cambia nada", () => {
    const plan = planRosterUpdate(buildState(), COURSE_ID, CURRENT);

    expect(plan.kept.map((item) => item.student.id)).toEqual(["a", "b", "c", "d"]);
    expect(plan).toMatchObject({ updated: [], added: [], withdrawn: [] });
  });

  it("reconoce al mismo estudiante aunque cambien tildes, mayúsculas o espacios", () => {
    const plan = planRosterUpdate(buildState(), COURSE_ID, [
      ...CURRENT.slice(0, 3),
      { number: 4, fullName: "  ESTUDIANTE   Fícticio D " },
    ]);

    expect(plan.updated).toEqual([expect.objectContaining({
      student: expect.objectContaining({ id: "d" }),
      nameChanged: true,
      numberChanged: false,
    })]);
    expect(plan.added).toEqual([]);
  });

  it("toma una corrección de tipeo con el mismo N° como el mismo estudiante", () => {
    const plan = planRosterUpdate(buildState(), COURSE_ID, [
      ...CURRENT.slice(0, 3),
      { number: 4, fullName: "Estudiante ficticio dd" },
    ]);

    expect(plan.updated.map((item) => item.student.id)).toEqual(["d"]);
    expect(plan.added).toEqual([]);
    expect(plan.withdrawn).toEqual([]);
  });

  it("un nombre distinto con el mismo N° es otro estudiante", () => {
    const plan = planRosterUpdate(buildState(), COURSE_ID, [
      ...CURRENT.slice(0, 3),
      { number: 4, fullName: "Ana Rivas Soto" },
    ]);

    expect(plan.added).toEqual([{ number: 4, fullName: "Ana Rivas Soto" }]);
    expect(plan.withdrawn.map((item) => item.id)).toEqual(["d"]);
  });

  it("empareja homónimos por N° y luego por orden, sin cruzarlos", () => {
    const state = buildState();
    state.students.push(
      buildStudent("ana-1", 6, { fullName: "Ana Rivas Soto" }),
      buildStudent("ana-2", 7, { fullName: "Ana Rivas Soto" }),
    );
    const plan = planRosterUpdate(state, COURSE_ID, [
      ...CURRENT,
      { number: 7, fullName: "Ana Rivas Soto" },
      { number: 8, fullName: "Ana Rivas Soto" },
    ]);

    expect(plan.kept.map((item) => item.student.id)).toContain("ana-2");
    expect(plan.updated).toEqual([expect.objectContaining({
      student: expect.objectContaining({ id: "ana-1" }),
      entry: { number: 8, fullName: "Ana Rivas Soto" },
    })]);
    expect(plan.added).toEqual([]);
  });

  it("reincorpora a un estudiante inactivo que vuelve a la nómina", () => {
    const plan = planRosterUpdate(buildState(), COURSE_ID, [
      ...CURRENT,
      { number: 5, fullName: "Estudiante ficticio inactivo" },
    ]);

    expect(plan.updated).toEqual([expect.objectContaining({
      student: expect.objectContaining({ id: "inactivo" }),
      reactivated: true,
    })]);
  });

  it("no considera a estudiantes de otros cursos", () => {
    const plan = planRosterUpdate(buildState(), COURSE_ID, [{ number: 1, fullName: "Estudiante ficticio otro" }]);

    expect(plan.added).toEqual([{ number: 1, fullName: "Estudiante ficticio otro" }]);
    expect(plan.withdrawn.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("updateRoster", () => {
  const RENEWED: RosterEntry[] = [
    { number: 1, fullName: "Estudiante ficticio b" },
    { number: 2, fullName: "Estudiante ficticio a" },
    { number: 3, fullName: "Estudiante ficticio c" },
    { number: 4, fullName: "Estudiante ficticio nuevo" },
  ];

  it("conserva identidades y puestos, agrega a los nuevos sin puesto y archiva a quien sale", () => {
    const before = buildState();
    const { state, plan } = updateRoster(before, COURSE_ID, RENEWED);

    expect(student(state, "a")).toMatchObject({ number: 2, seatRow: 0, seatCol: 0, active: true });
    expect(student(state, "b")).toMatchObject({ number: 1, seatRow: 0, seatCol: 1, active: true });
    expect(student(state, "d")).toMatchObject({ active: false, seatRow: null, seatCol: null });
    const added = state.students.find((item) => item.fullName === "Estudiante ficticio nuevo");
    expect(added).toMatchObject({ courseId: COURSE_ID, number: 4, seatRow: null, seatCol: null, active: true });
    expect(added?.displayName).toBe("Estudiante f.");
    expect(state.students.filter((item) => item.courseId === COURSE_ID)).toHaveLength(before.students.filter((item) => item.courseId === COURSE_ID).length + 1);
    expect(state.courses).toEqual(before.courses);
    expect(plan.withdrawn.map((item) => item.id)).toEqual(["d"]);
  });

  it("libera en todas las plantillas los puestos de quien deja el curso", () => {
    const { state } = updateRoster(buildState(), COURSE_ID, CURRENT.slice(1));

    expect(state.seatAssignments.filter((item) => item.studentId === "a")).toEqual([]);
    expect(state.seatAssignments.some((item) => item.templateId === SECOND_TEMPLATE_ID)).toBe(false);
    expect(state.seatAssignments).toContainEqual({ templateId: MAIN_TEMPLATE_ID, studentId: "b", seatRow: 0, seatCol: 1 });
  });

  it("corrige el nombre y recalcula el nombre visible", () => {
    const { state } = updateRoster(buildState(), COURSE_ID, [
      ...CURRENT.slice(0, 3),
      { number: 4, fullName: "Estudiante Fícticio D" },
    ]);

    expect(student(state, "d")).toMatchObject({ fullName: "Estudiante Fícticio D", displayName: "Estudiante F." });
  });

  it("genera ids únicos aunque el nombre ya exista en otro curso", () => {
    const base = buildState();
    base.students.push(buildStudent(`${COURSE_ID}-ana-rivas-soto-9`, 9, { courseId: "otro-curso", fullName: "Ana Rivas Soto" }));
    const { state } = updateRoster(base, COURSE_ID, [...CURRENT, { number: 9, fullName: "Ana Rivas Soto" }]);

    const ids = state.students.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no altera el informe de una clase anterior", () => {
    let state = createSession(buildState(), sessionInput).state;
    state = addObservation(state, { sessionId: 1, studentId: "a", round: 1, code: "C" }).state;
    state = addObservation(state, { sessionId: 1, studentId: "d", round: 1, code: "I" }).state;
    state = setSessionStatus(state, 1, "closed").state;
    // Una clase creada antes de existir la fotografía: sin N° ni nombre guardados.
    state.sessionStudents = state.sessionStudents.map(({ sessionId, studentId, present }) => ({ sessionId, studentId, present }));
    const before = metricsForSession(state, state.sessions[0]);

    const after = metricsForSession(updateRoster(state, COURSE_ID, RENEWED).state, state.sessions[0]);

    expect(after.roster.map((item) => [item.id, item.number, item.fullName]))
      .toEqual(before.roster.map((item) => [item.id, item.number, item.fullName]));
    expect(after.counts).toEqual(before.counts);
    expect(after.coverage).toBe(before.coverage);
  });

  it("la clase en curso conserva su nómina; los cambios rigen desde la próxima", () => {
    const started = createSession(buildState(), sessionInput).state;
    const { state } = updateRoster(started, COURSE_ID, RENEWED);
    const newcomer = state.students.find((item) => item.fullName === "Estudiante ficticio nuevo");

    expect(metricsForSession(state, state.sessions[0]).roster.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(() => addObservation(state, { sessionId: 1, studentId: newcomer?.id ?? "", round: 1, code: "C" }))
      .toThrow("no pertenece a la nómina");

    const next = createSession(state, { ...sessionInput, date: "2026-03-11" });
    const roster = metricsForSession(next.state, next.state.sessions[0]).roster;
    expect(roster.map((item) => [item.number, item.id])).toEqual([[1, "b"], [2, "a"], [3, "c"], [4, newcomer?.id]]);
  });

  it.each([
    ["un curso inexistente", "no-existe", CURRENT, "No se encontró el curso a actualizar."],
    ["una lista sin nombres", COURSE_ID, [{ number: 1, fullName: "  " }], "No se encontraron nombres para importar."],
    [
      "más de 80 estudiantes",
      COURSE_ID,
      Array.from({ length: 81 }, (_, index) => ({ number: index + 1, fullName: `Estudiante Ficticio ${index + 1}` })),
      "Una nómina puede tener hasta 80 estudiantes.",
    ],
  ])("rechaza %s", (_case, courseId, entries, error) => {
    expect(() => updateRoster(buildState(), courseId, entries)).toThrow(error);
  });

  it("en un curso con plantilla no crea otra", () => {
    const { state } = updateRoster(buildState(), OTHER_COURSE_ID, [{ number: 1, fullName: "Ana Rivas Soto" }]);

    expect(state.roomTemplates.filter((template) => template.courseId === OTHER_COURSE_ID)).toHaveLength(1);
  });

  it("completa un curso pendiente, sin plantilla, con la sala habitual de 7 × 6 sin puestos", () => {
    const base = buildState();
    base.courses.push({ id: "pendiente", name: "Curso Pendiente", createdAt: "2026-01-01T00:00:00.000Z" });

    const { state } = updateRoster(base, "pendiente", [{ number: 1, fullName: "Ana Rivas Soto" }]);

    expect(state.roomTemplates.filter((template) => template.courseId === "pendiente"))
      .toEqual([expect.objectContaining({ id: "pendiente-sala-habitual", name: "Sala habitual", rowCount: 7, columnCount: 6 })]);
    expect(state.roomSlots.filter((slot) => slot.templateId === "pendiente-sala-habitual")).toHaveLength(42);
    expect(state.students.filter((item) => item.courseId === "pendiente")).toHaveLength(1);
  });

  it("no modifica el estado recibido", () => {
    const state = buildState();
    const before = structuredClone(state);

    updateRoster(state, COURSE_ID, RENEWED);

    expect(state).toEqual(before);
  });
});

describe("rosterOverlap", () => {
  it("cuenta coincidencias por nombre sin tildes ni mayúsculas", () => {
    expect(rosterOverlap(buildState(), COURSE_ID, [
      { number: 1, fullName: "ESTUDIANTE FÍCTICIO A" },
      { number: 2, fullName: "Otra Persona Ficticia" },
    ])).toBe(1);
  });
});
