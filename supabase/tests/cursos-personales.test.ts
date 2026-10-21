import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACADEMIC_YEAR, createCourse, createTestDatabase, createUser, personalSpaceOf, rpc, visible, type TestDatabase } from "./db";

// ADR 0006: cada cuenta crea, edita, archiva y consulta solo sus propios cursos.

let db: TestDatabase;
let docente: string;
let otra: string;
let espacio: string;
let espacioOtra: string;

const ROSTER = [
  { number: 1, fullName: "Ana Ficticia Uno" },
  { number: 2, fullName: "Bruno Ficticio Dos" },
  { number: 3, fullName: "Camila Ficticia Tres" },
  { number: 4, fullName: "Diego Ficticio Cuatro" },
];

async function courseRow(courseId: string) {
  return (await db.pool.query(
    "select school_id, name, academic_year, focus_student_count, archived_at, created_by from public.courses where id = $1",
    [courseId],
  )).rows[0];
}

async function rosterOf(courseId: string) {
  const result = await db.pool.query(
    "select id, list_number from public.enrollments where course_id = $1 order by list_number nulls last",
    [courseId],
  );
  return result.rows as Array<{ id: string; list_number: number | null }>;
}

/** N° de lista de quienes son foco hoy. */
async function focusOf(courseId: string) {
  const result = await db.pool.query(
    "select list_number from public.enrollments where course_id = $1 and active and is_focus order by list_number",
    [courseId],
  );
  return result.rows.map((row) => row.list_number as number);
}

/** N° de lista de quienes eran foco al iniciar la clase. */
async function sessionFocusOf(sessionId: string) {
  const result = await db.pool.query(
    "select list_number from public.session_students where session_id = $1 and is_focus order by list_number",
    [sessionId],
  );
  return result.rows.map((row) => row.list_number as number);
}

async function startSession(courseId: string, templateId: string) {
  const [session] = await rpc<{ id: string }>(db.pool, docente, "start_session", [
    randomUUID(), courseId, templateId, "2026-10-19", "Módulo ficticio", "Objetivo ficticio", "Criterio ficticio",
  ]);
  return session.id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  docente = await createUser(db.pool, "docente.foco@ficticio.cl");
  otra = await createUser(db.pool, "otra.cuenta@ficticio.cl");
  espacio = await personalSpaceOf(db.pool, docente);
  espacioOtra = await personalSpaceOf(db.pool, otra);
});

afterAll(async () => {
  await db?.drop();
});

describe("crear un curso personal", () => {
  it("guarda el año académico, la selección foco y la sala habitual en el espacio de la cuenta", async () => {
    const created = await createCourse(db.pool, docente, espacio, "  Física ficticia  ", ROSTER, { academicYear: 2027, focusNumbers: [2, 4] });

    expect(await courseRow(created.courseId)).toEqual({
      school_id: espacio,
      name: "Física ficticia",
      academic_year: 2027,
      focus_student_count: 2,
      archived_at: null,
      created_by: docente,
    });
    expect(await focusOf(created.courseId)).toEqual([2, 4]);
    expect((await db.pool.query("select id, name from public.room_templates where course_id = $1", [created.courseId])).rows)
      .toEqual([{ id: created.roomTemplateId, name: "Sala habitual" }]);
    expect(await visible(db.pool, docente, "course_teachers", `course_id = '${created.courseId}'`)).toBe(1);
  });

  it("sin selección foco, nadie queda marcado", async () => {
    const cases: Array<[string, number[] | null]> = [["Arte ficticio", []], ["Música ficticia", null]];
    for (const [name, focusNumbers] of cases) {
      const { courseId } = await createCourse(db.pool, docente, espacio, name, ROSTER, { focusNumbers });

      expect((await courseRow(courseId)).focus_student_count, name).toBe(0);
      expect(await focusOf(courseId), name).toEqual([]);
    }
  });

  it("rechaza un nombre vacío, un año fuera de rango y N° foco que no están en la nómina", async () => {
    await expect(createCourse(db.pool, docente, espacio, "   ", ROSTER)).rejects.toThrow("Escribe el nombre del curso.");
    for (const academicYear of [1999, 2101]) {
      await expect(createCourse(db.pool, docente, espacio, "Curso con año inválido", ROSTER, { academicYear }))
        .rejects.toThrow("El año académico no es válido.");
    }
    await expect(createCourse(db.pool, docente, espacio, "Curso con foco ajeno", ROSTER, { focusNumbers: [1, 5] }))
      .rejects.toThrow("La selección foco no coincide con la nómina.");

    expect(await visible(db.pool, docente, "courses", "name like 'Curso con%'")).toBe(0);
  });
});

describe("nombre único por cuenta y año", () => {
  it("no repite el nombre en el mismo año, sin distinguir mayúsculas ni espacios", async () => {
    await createCourse(db.pool, docente, espacio, "Historia ficticia", ROSTER);

    await expect(createCourse(db.pool, docente, espacio, "  HISTORIA ficticia ", ROSTER))
      .rejects.toThrow("Ya existe el curso «HISTORIA ficticia» este año.");
  });

  it("permite el mismo nombre en otro año y en otra cuenta", async () => {
    await expect(createCourse(db.pool, docente, espacio, "Historia ficticia", ROSTER, { academicYear: 2027 })).resolves.toBeDefined();
    await expect(createCourse(db.pool, otra, espacioOtra, "Historia ficticia", ROSTER)).resolves.toBeDefined();
  });

  it("archivar libera el nombre; restaurar o renombrar hacia un nombre vigente se rechaza", async () => {
    const archived = await createCourse(db.pool, docente, espacio, "Geografía ficticia", ROSTER);
    await rpc(db.pool, docente, "set_course_archived", [archived.courseId, true]);
    await expect(createCourse(db.pool, docente, espacio, "Geografía ficticia", ROSTER)).resolves.toBeDefined();
    const other = await createCourse(db.pool, docente, espacio, "Lenguaje ficticio", ROSTER);

    // La restricción única protege la regla; la aplicación traduce 23505 a un mensaje.
    await expect(rpc(db.pool, docente, "set_course_archived", [archived.courseId, false])).rejects.toMatchObject({ code: "23505" });
    await expect(rpc(db.pool, docente, "update_course_details", [other.courseId, " geografía ficticia ", ACADEMIC_YEAR]))
      .rejects.toMatchObject({ code: "23505" });
    expect((await courseRow(archived.courseId)).archived_at).not.toBeNull();
    expect((await courseRow(other.courseId)).name).toBe("Lenguaje ficticio");
  });
});

describe("editar un curso", () => {
  it("la cuenta dueña cambia el nombre y el año", async () => {
    const { courseId } = await createCourse(db.pool, docente, espacio, "Química ficticia", ROSTER);

    await rpc(db.pool, docente, "update_course_details", [courseId, "  Química ficticia avanzada  ", 2027]);

    expect(await courseRow(courseId)).toMatchObject({ name: "Química ficticia avanzada", academic_year: 2027 });
  });

  it("rechaza nombres y años no válidos, y a otra cuenta", async () => {
    const { courseId } = await createCourse(db.pool, docente, espacio, "Economía ficticia", ROSTER);
    const update = (user: string, name: string, year = ACADEMIC_YEAR) =>
      rpc(db.pool, user, "update_course_details", [courseId, name, year]);

    await expect(update(docente, "   ")).rejects.toThrow("Escribe un nombre de curso válido.");
    await expect(update(docente, "x".repeat(121))).rejects.toThrow("Escribe un nombre de curso válido.");
    await expect(update(docente, "Economía ficticia", 1999)).rejects.toThrow("El año académico no es válido.");
    await expect(update(otra, "Renombrado por otra cuenta")).rejects.toThrow("Este curso no pertenece a tu cuenta.");
    expect(await courseRow(courseId)).toMatchObject({ name: "Economía ficticia", academic_year: ACADEMIC_YEAR });
  });
});

describe("estudiantes foco", () => {
  it("la cuenta dueña cambia la selección y el total se recalcula", async () => {
    const { courseId } = await createCourse(db.pool, docente, espacio, "Inglés ficticio", ROSTER, { focusNumbers: [1] });
    const [, b, c] = await rosterOf(courseId);

    await rpc(db.pool, docente, "set_focus_students", [courseId, [b.id, c.id]]);
    expect(await focusOf(courseId)).toEqual([2, 3]);
    expect((await courseRow(courseId)).focus_student_count).toBe(2);

    await rpc(db.pool, docente, "set_focus_students", [courseId, []]);
    expect(await focusOf(courseId)).toEqual([]);
    expect((await courseRow(courseId)).focus_student_count).toBe(0);
  });

  it("rechaza estudiantes de otro curso o retirados, y a otra cuenta", async () => {
    const { courseId } = await createCourse(db.pool, docente, espacio, "Filosofía ficticia", ROSTER, { focusNumbers: [1] });
    const [foreign] = await rosterOf((await createCourse(db.pool, docente, espacio, "Tecnología ficticia", ROSTER)).courseId);
    const [a, b] = await rosterOf(courseId);
    await rpc(db.pool, docente, "update_roster", [courseId, JSON.stringify({ withdraws: [b.id] })]);

    for (const selection of [[a.id, foreign.id], [b.id]]) {
      await expect(rpc(db.pool, docente, "set_focus_students", [courseId, selection]))
        .rejects.toThrow("La selección foco contiene un estudiante que no pertenece al curso.");
    }
    await expect(rpc(db.pool, otra, "set_focus_students", [courseId, [a.id]])).rejects.toThrow("Este curso no pertenece a tu cuenta.");
    expect(await focusOf(courseId)).toEqual([1]);
  });

  it("retirar a un estudiante foco lo descuenta del total", async () => {
    const { courseId } = await createCourse(db.pool, docente, espacio, "Religión ficticia", ROSTER, { focusNumbers: [1, 2] });
    const [, b] = await rosterOf(courseId);

    await rpc(db.pool, docente, "update_roster", [courseId, JSON.stringify({ withdraws: [b.id] })]);

    expect(await focusOf(courseId)).toEqual([1]);
    expect((await courseRow(courseId)).focus_student_count).toBe(1);
  });

  it("cada clase guarda la fotografía del foco al iniciarse", async () => {
    const { courseId, roomTemplateId } = await createCourse(db.pool, docente, espacio, "Ciencias ficticias", ROSTER, { focusNumbers: [1] });
    const first = await startSession(courseId, roomTemplateId);
    const [, , c] = await rosterOf(courseId);

    await rpc(db.pool, docente, "set_focus_students", [courseId, [c.id]]);
    const second = await startSession(courseId, roomTemplateId);

    expect(await sessionFocusOf(first)).toEqual([1]);
    expect(await sessionFocusOf(second)).toEqual([3]);
  });
});

describe("archivar y restaurar", () => {
  it("conserva el curso y su historia, y bloquea clases y cambios hasta restaurarlo", async () => {
    const { courseId, roomTemplateId } = await createCourse(db.pool, docente, espacio, "Educación Física ficticia", ROSTER);
    const session = await startSession(courseId, roomTemplateId);
    await rpc(db.pool, docente, "set_session_status", [session, "closed"]);

    await rpc(db.pool, docente, "set_course_archived", [courseId, true]);

    expect((await courseRow(courseId)).archived_at).not.toBeNull();
    expect(await visible(db.pool, docente, "courses", `id = '${courseId}'`)).toBe(1);
    expect(await visible(db.pool, docente, "class_sessions", `id = '${session}'`)).toBe(1);
    expect(await visible(db.pool, docente, "session_students", `session_id = '${session}'`)).toBe(4);
    await expect(startSession(courseId, roomTemplateId)).rejects.toThrow("Este curso no pertenece a tu cuenta.");
    await expect(rpc(db.pool, docente, "update_roster", [courseId, JSON.stringify({ adds: [{ number: 5, fullName: "Elisa Ficticia Cinco" }] })]))
      .rejects.toThrow("Solo administración puede actualizar la nómina.");
    await expect(rpc(db.pool, docente, "create_room_template", [
      randomUUID(), courseId, "Laboratorio", "rows", 1, 1, JSON.stringify([{ row: 0, col: 0 }]),
    ])).rejects.toThrow("No puedes crear salas en este curso.");

    await rpc(db.pool, docente, "set_course_archived", [courseId, false]);

    expect((await courseRow(courseId)).archived_at).toBeNull();
    await expect(startSession(courseId, roomTemplateId)).resolves.toBeDefined();
  });

  it("no archiva un curso con una clase en curso", async () => {
    const { courseId, roomTemplateId } = await createCourse(db.pool, docente, espacio, "Matemática ficticia", ROSTER);
    const session = await startSession(courseId, roomTemplateId);

    await expect(rpc(db.pool, docente, "set_course_archived", [courseId, true]))
      .rejects.toThrow("Cierra la clase en curso antes de archivar este curso.");
    await rpc(db.pool, docente, "set_session_status", [session, "closed"]);
    await rpc(db.pool, docente, "set_course_archived", [courseId, true]);
    expect((await courseRow(courseId)).archived_at).not.toBeNull();
  });

  it("otra cuenta no archiva ni restaura", async () => {
    const { courseId } = await createCourse(db.pool, docente, espacio, "Artes visuales ficticias", ROSTER);

    for (const archived of [true, false]) {
      await expect(rpc(db.pool, otra, "set_course_archived", [courseId, archived])).rejects.toThrow("Este curso no pertenece a tu cuenta.");
    }
    expect((await courseRow(courseId)).archived_at).toBeNull();
  });
});

describe("cursos privados", () => {
  it("las operaciones de cursos no están disponibles sin sesión", async () => {
    const { courseId } = await createCourse(db.pool, docente, espacio, "Curso sin sesión ficticio", ROSTER);
    const calls: Array<[string, unknown[]]> = [
      ["create_course", [espacio, "Curso anónimo", ACADEMIC_YEAR, JSON.stringify(ROSTER), []]],
      ["set_focus_students", [courseId, []]],
      ["set_course_archived", [courseId, true]],
      ["update_course_details", [courseId, "Curso anónimo", ACADEMIC_YEAR]],
    ];

    for (const [name, args] of calls) {
      await expect(rpc(db.pool, null, name, args), name).rejects.toThrow(/permission denied/);
    }
  });

  it("otra cuenta no ve nada del curso, aunque administre un establecimiento donde participa la docente", async () => {
    const colegio = (await db.pool.query("select public.bootstrap_school('Colegio Ficticio', $1) as id", [otra])).rows[0].id;
    await db.pool.query("insert into public.school_memberships (school_id, user_id, role) values ($1, $2, 'teacher')", [colegio, docente]);
    const { courseId, roomTemplateId } = await createCourse(db.pool, docente, espacio, "Curso privado ficticio", ROSTER, { focusNumbers: [1] });
    await rpc(db.pool, docente, "assign_seats_by_number", [roomTemplateId]);
    const session = await startSession(courseId, roomTemplateId);
    const [a] = await rosterOf(courseId);
    await rpc(db.pool, docente, "record_observation", [randomUUID(), session, a.id, 1, "C", null, null, null]);
    const students = (await db.pool.query("select student_id from public.enrollments where course_id = $1", [courseId])).rows
      .map((row) => `'${row.student_id}'`).join(", ");

    const filters: Record<string, string> = {
      courses: `id = '${courseId}'`,
      course_teachers: `course_id = '${courseId}'`,
      students: `id in (${students})`,
      enrollments: `course_id = '${courseId}'`,
      room_templates: `course_id = '${courseId}'`,
      room_slots: `template_id = '${roomTemplateId}'`,
      seat_assignments: `course_id = '${courseId}'`,
      class_sessions: `id = '${session}'`,
      session_students: `session_id = '${session}'`,
      observations: `session_id = '${session}'`,
    };
    for (const [table, where] of Object.entries(filters)) {
      expect(await visible(db.pool, docente, table, where), table).toBeGreaterThan(0);
      expect(await visible(db.pool, otra, table, where), table).toBe(0);
    }
  });
});
