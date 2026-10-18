import { describe, expect, it } from "vitest";
import { SyncError } from "./monitoring-repository";
import { mapRowsToState, type DbRows } from "./supabase-mapping";
import { toRepositoryError } from "./supabase-monitoring-repository";

const ME = "11111111-1111-1111-1111-111111111111";

function rows(overrides: Partial<DbRows> = {}): DbRows {
  return {
    userId: ME,
    userEmail: "docente.ficticia@ejemplo.cl",
    schools: [{ id: "s1", name: "Colegio Ficticio" }],
    memberships: [{ school_id: "s1", user_id: ME, role: "admin", active: true }],
    profiles: [{ id: ME, full_name: "", created_at: "2026-10-01T00:00:00Z" }],
    courses: [
      { id: "c1", school_id: "s1", name: "III°B Ficticio", archived_at: null, created_at: "2026-10-01T00:00:00Z" },
      { id: "c0", school_id: "s1", name: "Archivado", archived_at: "2026-10-02T00:00:00Z", created_at: "2026-10-01T00:00:00Z" },
    ],
    students: [
      { id: "p1", full_name: "Ana Ficticia Uno", display_name: "Ana F." },
      { id: "p2", full_name: "Bruno Ficticio Dos", display_name: "Bruno F." },
    ],
    enrollments: [
      { id: "e2", course_id: "c1", student_id: "p2", list_number: 2, active: true },
      { id: "e1", course_id: "c1", student_id: "p1", list_number: 1, active: true },
    ],
    roomTemplates: [
      { id: "t2", course_id: "c1", name: "Taller", description: "", row_count: 1, column_count: 2, active: true, created_at: "2026-10-03T00:00:00Z" },
      { id: "t1", course_id: "c1", name: "Sala habitual", description: "", row_count: 7, column_count: 6, active: true, created_at: "2026-10-01T00:00:00Z" },
    ],
    roomSlots: [{ template_id: "t1", seat_row: 0, seat_col: 0, status: "available" }],
    seatAssignments: [
      { template_id: "t1", enrollment_id: "e1", seat_row: 0, seat_col: 0 },
      { template_id: "t2", enrollment_id: "e2", seat_row: 0, seat_col: 1 },
    ],
    sessions: [
      { id: "u-old", seq: "4", course_id: "c1", teacher_id: ME, room_template_id: "t1", date: "2026-10-05", module: "M", objective: "O", success_criteria: "C", status: "closed", started_at: "2026-10-05T12:00:00Z", closed_at: "2026-10-05T13:00:00Z" },
      { id: "u-new", seq: 9, course_id: "c1", teacher_id: ME, room_template_id: "t1", date: "2026-10-11", module: "M", objective: "O", success_criteria: "C", status: "active", started_at: "2026-10-11T12:00:00Z", closed_at: null },
    ],
    sessionStudents: [
      { session_id: "u-old", enrollment_id: "e1", list_number: 5, full_name: "Ana Antes", display_name: "Ana A.", seat_row: null, seat_col: null, present: false },
    ],
    observations: [
      { id: "o2", seq: "31", session_id: "u-new", enrollment_id: "e2", round: 1, code: "R", progress: 70, note: null, observed_at: "2026-10-11T12:10:00+00:00" },
      { id: "o1", seq: 30, session_id: "u-old", enrollment_id: "e1", round: 2, code: "C", progress: 100, note: "Bien", observed_at: "2026-10-05T12:20:00+00:00" },
    ],
    ...overrides,
  };
}

describe("mapRowsToState", () => {
  it("la cuenta autenticada es el único docente: la autoría no se elige", () => {
    const { state, account } = mapRowsToState(rows());

    expect(state.teachers).toEqual([{ id: ME, fullName: "docente.ficticia", role: "admin", active: true, createdAt: "2026-10-01T00:00:00Z" }]);
    expect(account).toMatchObject({ fullName: "docente.ficticia", adminSchoolIds: ["s1"], schools: [{ id: "s1", role: "admin" }] });
  });

  it("usa el nombre del perfil cuando existe", () => {
    const { state } = mapRowsToState(rows({ profiles: [{ id: ME, full_name: "Docente Ficticia", created_at: "" }] }));
    expect(state.teachers[0].fullName).toBe("Docente Ficticia");
  });

  it("cada matrícula es un estudiante del curso, en orden de lista y con su puesto en la primera plantilla", () => {
    const { state } = mapRowsToState(rows());

    expect(state.courses.map((course) => course.id)).toEqual(["c0", "c1"]);
    expect(state.students).toEqual([
      { id: "e1", courseId: "c1", number: 1, fullName: "Ana Ficticia Uno", displayName: "Ana F.", seatRow: 0, seatCol: 0, active: true },
      { id: "e2", courseId: "c1", number: 2, fullName: "Bruno Ficticio Dos", displayName: "Bruno F.", seatRow: null, seatCol: null, active: true },
    ]);
    expect(state.seatAssignments).toContainEqual({ templateId: "t2", studentId: "e2", seatRow: 0, seatCol: 1 });
  });

  it("las clases y observaciones usan su número del servidor, con la clase más reciente primero", () => {
    const { state, index } = mapRowsToState(rows());

    expect(state.sessions.map((session) => session.id)).toEqual([9, 4]);
    expect(index.sessionUuid.get(4)).toBe("u-old");
    expect(index.sessionSeq.get("u-new")).toBe(9);
    expect(state.observations.map((row) => [row.id, row.sessionId, row.studentId])).toEqual([[30, 4, "e1"], [31, 9, "e2"]]);
    expect(state.observations[0]).toMatchObject({ createdAt: "2026-10-05T12:20:00+00:00", note: "Bien", round: 2 });
  });

  it("la nómina de cada clase conserva su fotografía", () => {
    const { state } = mapRowsToState(rows());

    expect(state.sessionStudents).toEqual([{
      sessionId: 4, studentId: "e1", present: false, number: 5, fullName: "Ana Antes", displayName: "Ana A.", seatRow: null, seatCol: null,
    }]);
  });

  it("el espacio personal va primero y cada curso sabe a qué espacio pertenece", () => {
    const { account, state } = mapRowsToState(rows({
      schools: [
        { id: "s1", name: "Colegio Ficticio", kind: "institution" },
        { id: "p1", name: "Mi espacio", kind: "personal" },
      ],
      memberships: [
        { school_id: "s1", user_id: ME, role: "teacher", active: true },
        { school_id: "p1", user_id: ME, role: "admin", active: true },
      ],
    }));

    expect(account.schools.map((school) => [school.id, school.kind, school.role]))
      .toEqual([["p1", "personal", "admin"], ["s1", "institution", "teacher"]]);
    expect(account.personalSpaceId).toBe("p1");
    expect(account.adminSchoolIds).toEqual(["p1"]);
    expect(state.courses[0].spaceId).toBe("s1");
  });

  it("lee la forma de la sala y los grupos; sin la migración, la sala es clásica", () => {
    const { state } = mapRowsToState(rows({
      roomSlots: [
        { template_id: "t1", seat_row: 0, seat_col: 0, status: "available", group_label: "Grupo 1" },
        { template_id: "t1", seat_row: 0, seat_col: 1, status: "available", group_label: null },
      ],
    }));
    expect(state.roomTemplates.map((template) => template.layout)).toEqual(["classic", "classic"]);
    expect(state.roomSlots).toEqual([
      { templateId: "t1", seatRow: 0, seatCol: 0, status: "available", groupLabel: "Grupo 1" },
      { templateId: "t1", seatRow: 0, seatCol: 1, status: "available" },
    ]);
  });

  it("sin membresías la cuenta no tiene establecimientos", () => {
    const { account, state } = mapRowsToState(rows({ memberships: [], schools: [] }));

    expect(account.schools).toEqual([]);
    expect(account.adminSchoolIds).toEqual([]);
    expect(account.personalSpaceId).toBeNull();
    expect(state.teachers[0].role).toBe("teacher");
  });
});

describe("toRepositoryError", () => {
  it.each([
    ["sin red", { code: "", message: "TypeError: Failed to fetch" }],
    ["sesión vencida", { code: "PGRST301", message: "JWT expired" }],
    ["error desconocido del servidor", { code: "XX000", message: "internal" }],
  ])("%s es una falla de sincronización", (_case, error) => {
    expect(toRepositoryError(error)).toBeInstanceOf(SyncError);
  });

  it.each([
    ["P0001", "La clase está cerrada. Reábrela para seguir registrando."],
    ["42501", "No tienes asignado este curso."],
  ])("una regla rechazada (%s) muestra su mensaje y no es falla de sincronización", (code, message) => {
    const error = toRepositoryError({ code, message });
    expect(error).not.toBeInstanceOf(SyncError);
    expect(error.message).toBe(message);
  });
});
