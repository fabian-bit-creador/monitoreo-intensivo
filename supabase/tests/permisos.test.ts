import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createCourse, createTestDatabase, createUser, personalSpaceOf, rpc, visible, type TestDatabase } from "./db";

type Ids = {
  admin: string;
  teacher1: string;
  teacher2: string;
  coordinator: string;
  outsider: string;
  nobody: string;
  school: string;
  otherSchool: string;
  personal1: string;
  courseX: string;
  templateX: string;
  courseY: string;
  courseZ: string;
};

// Horas pasadas: las futuras se recortan a «ahora» y no servirían para ordenar.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const ROSTER_X = [
  { number: 1, fullName: "Ana Ficticia Uno" },
  { number: 2, fullName: "Bruno Ficticio Dos" },
  { number: 3, fullName: "Camila Ficticia Tres" },
  { number: 4, fullName: "Diego Ficticio Cuatro" },
];

let db: TestDatabase;
let ids: Ids;

async function one<T = Record<string, unknown>>(promise: Promise<T[]>) {
  const rows = await promise;
  return rows[0];
}

async function enrollmentsOf(courseId: string) {
  const result = await db.pool.query(
    `select e.id, e.list_number, e.active, s.full_name from public.enrollments e
     join public.students s on s.id = e.student_id where e.course_id = $1 order by e.list_number nulls last, s.full_name`,
    [courseId],
  );
  return result.rows as Array<{ id: string; list_number: number | null; active: boolean; full_name: string }>;
}

async function startSession(userId: string, courseId = ids.courseX, templateId = ids.templateX, id = randomUUID()) {
  return one(rpc<{ id: string; seq: string; teacher_id: string; status: string }>(db.pool, userId, "start_session", [
    id, courseId, templateId, "2026-10-11", "Módulo ficticio", "Objetivo ficticio", "Criterio ficticio",
  ]));
}

async function record(
  userId: string,
  sessionId: string,
  enrollmentId: string,
  code: "I" | "R" | "C",
  options: { id?: string; progress?: number | null; round?: number; observedAt?: string | null; note?: string | null } = {},
) {
  return one(rpc<{ id: string; seq: string; code: string; progress: number; round: number; observed_at: Date }>(
    db.pool, userId, "record_observation",
    [options.id ?? randomUUID(), sessionId, enrollmentId, options.round ?? 1, code, options.progress ?? null, options.note ?? null, options.observedAt ?? null],
  ));
}

beforeAll(async () => {
  db = await createTestDatabase();
  const pool = db.pool;
  const admin = await createUser(pool, "admin@ficticio.cl");
  const teacher1 = await createUser(pool, "docente1@ficticio.cl");
  const teacher2 = await createUser(pool, "docente2@ficticio.cl");
  const coordinator = await createUser(pool, "coordinacion@ficticio.cl");
  const outsider = await createUser(pool, "otro@ficticio.cl");
  const nobody = await createUser(pool, "sin.acceso@ficticio.cl");
  const school = (await pool.query("select public.bootstrap_school('Colegio Ficticio', $1) as id", [admin])).rows[0].id;
  const otherSchool = (await pool.query("select public.bootstrap_school('Otro Colegio Ficticio', $1) as id", [outsider])).rows[0].id;
  await pool.query(
    `insert into public.school_memberships (school_id, user_id, role)
     values ($1, $2, 'teacher'), ($1, $3, 'teacher'), ($1, $4, 'coordinator')`,
    [school, teacher1, teacher2, coordinator],
  );
  // Cada curso pertenece a la cuenta que lo crea en su espacio personal (ADR 0006).
  const personal1 = await personalSpaceOf(pool, teacher1);
  const x = await createCourse(pool, teacher1, personal1, "III°A Ficticio", ROSTER_X);
  const y = await createCourse(pool, teacher2, await personalSpaceOf(pool, teacher2), "III°B Ficticio", [
    { number: 1, fullName: "Elena Ficticia Cinco" },
  ]);
  const z = await createCourse(pool, outsider, await personalSpaceOf(pool, outsider), "Curso de Otro Colegio", [
    { number: 1, fullName: "Persona Ficticia Seis" },
  ]);
  ids = {
    admin, teacher1, teacher2, coordinator, outsider, nobody, school, otherSchool, personal1,
    courseX: x.courseId, templateX: x.roomTemplateId, courseY: y.courseId, courseZ: z.courseId,
  };
});

afterAll(async () => {
  await db?.drop();
});

describe("lectura según la cuenta dueña del curso", () => {
  it("sin sesión iniciada no se puede leer ninguna tabla", async () => {
    for (const table of ["schools", "courses", "students", "enrollments", "class_sessions", "observations"]) {
      await expect(visible(db.pool, null, table)).rejects.toThrow(/permission denied/);
    }
  });

  it("una cuenta sin colegio solo ve su perfil y su espacio personal vacío", async () => {
    for (const table of ["schools", "courses", "students", "enrollments", "room_templates", "class_sessions", "profiles"]) {
      // Su perfil y su espacio personal (ADR 0004).
      const expected = table === "profiles" || table === "schools" ? 1 : 0;
      expect(await visible(db.pool, ids.nobody, table), table).toBe(expected);
    }
    expect(await visible(db.pool, ids.nobody, "schools", `kind = 'personal' and owner_id = '${ids.nobody}'`)).toBe(1);
  });

  it("un docente ve solo sus cursos y su nómina", async () => {
    expect(await visible(db.pool, ids.teacher1, "courses")).toBe(1);
    expect(await visible(db.pool, ids.teacher1, "courses", `id = '${ids.courseY}'`)).toBe(0);
    expect(await visible(db.pool, ids.teacher1, "enrollments")).toBe(4);
    expect(await visible(db.pool, ids.teacher1, "students")).toBe(4);
    expect(await visible(db.pool, ids.teacher1, "room_templates")).toBe(1);
    expect(await visible(db.pool, ids.teacher1, "room_slots")).toBe(42);
    expect(await visible(db.pool, ids.teacher1, "course_teachers")).toBe(1);
  });

  it("coordinación y administración de un establecimiento no ven los cursos personales de sus docentes", async () => {
    for (const user of [ids.coordinator, ids.admin]) {
      for (const table of ["courses", "course_teachers", "students", "enrollments", "room_templates", "room_slots"]) {
        expect(await visible(db.pool, user, table), table).toBe(0);
      }
    }
    expect(await visible(db.pool, ids.outsider, "courses")).toBe(1);
    expect(await visible(db.pool, ids.outsider, "students")).toBe(1);
    expect(await visible(db.pool, ids.outsider, "schools", `id = '${ids.school}'`)).toBe(0);
    expect(await visible(db.pool, ids.outsider, "profiles", `id = '${ids.teacher1}'`)).toBe(0);
  });

  it("un docente ve su membresía pero no la de otros; administración ve todas", async () => {
    const inSchool = `school_id = '${ids.school}'`;
    expect(await visible(db.pool, ids.teacher1, "school_memberships", inSchool)).toBe(1);
    expect(await visible(db.pool, ids.admin, "school_memberships", inSchool)).toBe(4);
    // Además, cada cuenta ve la membresía de su espacio personal.
    expect(await visible(db.pool, ids.teacher1, "school_memberships")).toBe(2);
    expect(await visible(db.pool, ids.teacher1, "profiles")).toBe(1);
  });
});

describe("escrituras directas", () => {
  it.each([
    ["insertar una observación", "insert into public.observations (id, session_id, enrollment_id, round, code, progress, observed_at) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'C', 100, now())"],
    ["crear una clase", "insert into public.class_sessions (id, school_id, course_id, teacher_id, room_template_id, date, module, objective, success_criteria) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), now(), 'm', 'o', 'c')"],
    ["renombrar un curso", "update public.courses set name = 'x'"],
    ["archivar un curso", "update public.courses set archived_at = now()"],
    ["marcar estudiantes foco", "update public.enrollments set is_focus = true"],
    ["borrar matrículas", "delete from public.enrollments"],
    ["borrar observaciones", "delete from public.observations"],
    ["darse un rol", "update public.school_memberships set role = 'admin'"],
  ])("nadie puede %s directamente, ni siquiera administración", async (_case, sql) => {
    for (const user of [ids.teacher1, ids.admin]) {
      await expect(asUser(db.pool, user, (client) => client.query(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it("la función de arranque no está disponible para usuarios", async () => {
    await expect(asUser(db.pool, ids.admin, (client) => client.query("select public.bootstrap_school('x', $1)", [ids.admin])))
      .rejects.toThrow(/permission denied/);
  });
});

describe("iniciar clase", () => {
  it("la autoría sale del usuario autenticado y la nómina queda fotografiada", async () => {
    const session = await startSession(ids.teacher1);

    expect(session.teacher_id).toBe(ids.teacher1);
    expect(Number(session.seq)).toBeGreaterThan(0);
    const snapshot = await db.pool.query(
      "select list_number, full_name, display_name, present from public.session_students where session_id = $1 order by list_number",
      [session.id],
    );
    expect(snapshot.rows).toEqual(ROSTER_X.map((entry) => ({
      list_number: entry.number,
      full_name: entry.fullName,
      display_name: `${entry.fullName.split(" ")[0]} ${entry.fullName.split(" ")[1][0]}.`,
      present: true,
    })));
  });

  it("reintentar con el mismo id devuelve la misma clase y no la duplica", async () => {
    const id = randomUUID();
    const first = await startSession(ids.teacher1, ids.courseX, ids.templateX, id);
    const second = await startSession(ids.teacher1, ids.courseX, ids.templateX, id);

    expect(second).toEqual(first);
    expect((await db.pool.query("select count(*)::int as n from public.session_students where session_id = $1", [id])).rows[0].n).toBe(4);
  });

  it.each([
    ["otro docente del establecimiento", "teacher2"],
    ["coordinación", "coordinator"],
    ["administración del establecimiento", "admin"],
    ["otro establecimiento", "outsider"],
  ] as const)("%s no puede iniciar clase en un curso de otra cuenta", async (_case, user) => {
    await expect(startSession(ids[user])).rejects.toThrow("Este curso no pertenece a tu cuenta.");
  });

  it("solo quien la dicta ve la clase, su nómina y sus registros", async () => {
    const session = await startSession(ids.teacher1);
    const [a] = await enrollmentsOf(ids.courseX);
    await record(ids.teacher1, session.id, a.id, "C");
    const where = `id = '${session.id}'`;
    const ofSession = `session_id = '${session.id}'`;

    expect(await visible(db.pool, ids.teacher1, "class_sessions", where)).toBe(1);
    expect(await visible(db.pool, ids.teacher1, "session_students", ofSession)).toBe(4);
    expect(await visible(db.pool, ids.teacher1, "observations", ofSession)).toBe(1);
    for (const user of [ids.teacher2, ids.coordinator, ids.admin, ids.outsider]) {
      expect(await visible(db.pool, user, "class_sessions", where)).toBe(0);
      expect(await visible(db.pool, user, "session_students", ofSession)).toBe(0);
      expect(await visible(db.pool, user, "observations", ofSession)).toBe(0);
    }
  });
});

describe("registrar observaciones", () => {
  it("aplica las reglas I = 0, C = 100 y R entre 1 y 99", async () => {
    const session = await startSession(ids.teacher1);
    const [a, b, c, d] = await enrollmentsOf(ids.courseX);

    expect(await record(ids.teacher1, session.id, a.id, "I", { progress: 50 })).toMatchObject({ progress: 0 });
    expect(await record(ids.teacher1, session.id, b.id, "C", { progress: 25 })).toMatchObject({ progress: 100 });
    expect(await record(ids.teacher1, session.id, c.id, "R", { progress: 70 })).toMatchObject({ progress: 70 });
    expect(await record(ids.teacher1, session.id, d.id, "R", { progress: null, round: 9 })).toMatchObject({ progress: 50, round: 3 });
  });

  it("reintentar con el mismo id no duplica el registro", async () => {
    const session = await startSession(ids.teacher1);
    const [a, b] = await enrollmentsOf(ids.courseX);
    const id = randomUUID();

    const first = await record(ids.teacher1, session.id, a.id, "C", { id });
    const retry = await record(ids.teacher1, session.id, a.id, "C", { id });

    expect(retry).toEqual(first);
    expect((await db.pool.query("select count(*)::int as n from public.observations where session_id = $1", [session.id])).rows[0].n).toBe(1);
    await expect(record(ids.teacher1, session.id, b.id, "C", { id })).rejects.toThrow("ya está en uso");
  });

  it("rechaza a un estudiante fuera de la nómina de la clase", async () => {
    const session = await startSession(ids.teacher1);
    const [other] = await enrollmentsOf(ids.courseY);

    await expect(record(ids.teacher1, session.id, other.id, "C")).rejects.toThrow("no pertenece a la nómina");
  });

  it("solo quien dicta la clase registra en ella", async () => {
    const session = await startSession(ids.teacher1);
    const [a] = await enrollmentsOf(ids.courseX);

    for (const user of [ids.teacher2, ids.admin, ids.coordinator, ids.outsider]) {
      await expect(record(user, session.id, a.id, "C")).rejects.toThrow("No puedes modificar esta clase.");
    }
  });

  it("una clase cerrada no acepta registros hasta reabrirla", async () => {
    const session = await startSession(ids.teacher1);
    const [a] = await enrollmentsOf(ids.courseX);
    await rpc(db.pool, ids.teacher1, "set_session_status", [session.id, "closed"]);

    await expect(record(ids.teacher1, session.id, a.id, "C")).rejects.toThrow("La clase está cerrada");
    await rpc(db.pool, ids.teacher1, "set_session_status", [session.id, "active"]);
    await expect(record(ids.teacher1, session.id, a.id, "C")).resolves.toMatchObject({ code: "C" });
  });

  it("no acepta horas de registro en el futuro", async () => {
    const session = await startSession(ids.teacher1);
    const [a] = await enrollmentsOf(ids.courseX);

    const row = await record(ids.teacher1, session.id, a.id, "I", { observedAt: "2100-01-01T00:00:00Z" });

    expect(new Date(row.observed_at).getTime()).toBeLessThan(Date.now() + 3 * 60_000);
  });
});

describe("asistencia", () => {
  it("gana la marca más reciente aunque llegue después un reintento antiguo", async () => {
    const session = await startSession(ids.teacher1);
    const [a] = await enrollmentsOf(ids.courseX);

    await rpc(db.pool, ids.teacher1, "set_attendance", [session.id, a.id, false, minutesAgo(5)]);
    const stale = await one(rpc<{ present: boolean }>(db.pool, ids.teacher1, "set_attendance", [session.id, a.id, true, minutesAgo(10)]));

    expect(stale.present).toBe(false);
  });

  it("registrar marca presente solo si es posterior a la última marca", async () => {
    const session = await startSession(ids.teacher1);
    const [a, b] = await enrollmentsOf(ids.courseX);
    await rpc(db.pool, ids.teacher1, "set_attendance", [session.id, a.id, false, minutesAgo(10)]);
    await rpc(db.pool, ids.teacher1, "set_attendance", [session.id, b.id, false, minutesAgo(10)]);

    await record(ids.teacher1, session.id, a.id, "C", { observedAt: minutesAgo(15) });
    await record(ids.teacher1, session.id, b.id, "C", { observedAt: minutesAgo(5) });

    const rows = await db.pool.query(
      "select enrollment_id, present from public.session_students where session_id = $1 and enrollment_id = any($2)",
      [session.id, [a.id, b.id]],
    );
    expect(Object.fromEntries(rows.rows.map((row) => [row.enrollment_id, row.present]))).toEqual({ [a.id]: false, [b.id]: true });
  });

  it("no modifica la asistencia de una clase cerrada ni de otra persona", async () => {
    const session = await startSession(ids.teacher1);
    const [a] = await enrollmentsOf(ids.courseX);

    await expect(rpc(db.pool, ids.teacher2, "set_attendance", [session.id, a.id, false, null])).rejects.toThrow("No puedes modificar");
    await rpc(db.pool, ids.teacher1, "set_session_status", [session.id, "closed"]);
    await expect(rpc(db.pool, ids.teacher1, "set_attendance", [session.id, a.id, false, null])).rejects.toThrow("cerrada");
  });
});

describe("concurrencia", () => {
  it("dos dispositivos registrando a la vez no se pisan", async () => {
    const session = await startSession(ids.teacher1);
    const roster = await enrollmentsOf(ids.courseX);

    await Promise.all(roster.flatMap((enrollment) => [
      record(ids.teacher1, session.id, enrollment.id, "I"),
      record(ids.teacher1, session.id, enrollment.id, "C"),
    ]));

    const rows = await db.pool.query("select seq from public.observations where session_id = $1", [session.id]);
    expect(rows.rowCount).toBe(roster.length * 2);
    expect(new Set(rows.rows.map((row) => row.seq)).size).toBe(roster.length * 2);
  });

  it("el mismo registro enviado varias veces a la vez queda una sola vez", async () => {
    const session = await startSession(ids.teacher1);
    const [a] = await enrollmentsOf(ids.courseX);
    const id = randomUUID();

    const results = await Promise.allSettled(Array.from({ length: 6 }, () => record(ids.teacher1, session.id, a.id, "R", { id, progress: 70 })));

    expect(results.filter((result) => result.status === "fulfilled").length).toBeGreaterThan(0);
    expect((await db.pool.query("select count(*)::int as n from public.observations where id = $1", [id])).rows[0].n).toBe(1);
  });

  it("dos movimientos al mismo puesto a la vez dejan una sala coherente", async () => {
    const roster = await enrollmentsOf(ids.courseX);
    await db.pool.query("delete from public.seat_assignments where template_id = $1", [ids.templateX]);

    await Promise.all(roster.map((enrollment) => rpc(db.pool, ids.teacher1, "move_seat", [ids.templateX, enrollment.id, 3, 3])));

    const seats = await db.pool.query("select seat_row, seat_col from public.seat_assignments where template_id = $1", [ids.templateX]);
    expect(seats.rows).toEqual([{ seat_row: 3, seat_col: 3 }]);
  });
});

describe("puestos", () => {
  it("mueve, intercambia y deja sin puesto como la aplicación", async () => {
    const [a, b] = await enrollmentsOf(ids.courseX);
    await db.pool.query("delete from public.seat_assignments where template_id = $1", [ids.templateX]);
    const seatOf = async (enrollment: string) => (await db.pool.query(
      "select seat_row, seat_col from public.seat_assignments where template_id = $1 and enrollment_id = $2",
      [ids.templateX, enrollment],
    )).rows[0] ?? null;

    await rpc(db.pool, ids.teacher1, "move_seat", [ids.templateX, a.id, 0, 0]);
    await rpc(db.pool, ids.teacher1, "move_seat", [ids.templateX, b.id, 0, 1]);
    await rpc(db.pool, ids.teacher1, "move_seat", [ids.templateX, a.id, 0, 1]);
    expect([await seatOf(a.id), await seatOf(b.id)]).toEqual([{ seat_row: 0, seat_col: 1 }, { seat_row: 0, seat_col: 0 }]);

    await rpc(db.pool, ids.teacher1, "move_seat", [ids.templateX, a.id, null, null]);
    expect(await seatOf(a.id)).toBeNull();
  });

  it("no ubica en un puesto no disponible ni deja ordenar a otra cuenta", async () => {
    const [a] = await enrollmentsOf(ids.courseX);
    await db.pool.query("update public.room_slots set status = 'unavailable' where template_id = $1 and seat_row = 6 and seat_col = 5", [ids.templateX]);

    await expect(rpc(db.pool, ids.teacher1, "move_seat", [ids.templateX, a.id, 6, 5])).rejects.toThrow("no está disponible");
    for (const user of [ids.teacher2, ids.admin]) {
      await expect(rpc(db.pool, user, "move_seat", [ids.templateX, a.id, 1, 1])).rejects.toThrow("No puedes ordenar esta sala.");
    }
  });

  it("asigna por N° a quienes no tienen puesto, en orden de lectura de la sala", async () => {
    const roster = await enrollmentsOf(ids.courseX);
    await db.pool.query("delete from public.seat_assignments where template_id = $1", [ids.templateX]);
    await rpc(db.pool, ids.teacher1, "move_seat", [ids.templateX, roster[2].id, 0, 0]);

    const [{ assign_seats_by_number: count }] = await rpc<{ assign_seats_by_number: number }>(db.pool, ids.teacher1, "assign_seats_by_number", [ids.templateX]);
    const seats = await db.pool.query(
      `select e.list_number, a.seat_row, a.seat_col from public.seat_assignments a
       join public.enrollments e on e.id = a.enrollment_id where a.template_id = $1 order by e.list_number`,
      [ids.templateX],
    );

    expect(count).toBe(3);
    expect(seats.rows).toEqual([
      { list_number: 1, seat_row: 0, seat_col: 1 },
      { list_number: 2, seat_row: 0, seat_col: 2 },
      { list_number: 3, seat_row: 0, seat_col: 0 },
      { list_number: 4, seat_row: 0, seat_col: 3 },
    ]);
    expect((await one(rpc<{ assign_seats_by_number: number }>(db.pool, ids.teacher1, "assign_seats_by_number", [ids.templateX]))).assign_seats_by_number).toBe(0);
  });
});

describe("nómina e historia", () => {
  it("actualizar la nómina conserva identidades y no altera clases anteriores", async () => {
    const session = await startSession(ids.teacher1);
    const before = await db.pool.query(
      "select enrollment_id, list_number, full_name from public.session_students where session_id = $1 order by enrollment_id",
      [session.id],
    );
    const [a, b, , d] = await enrollmentsOf(ids.courseX);

    await rpc(db.pool, ids.teacher1, "update_roster", [ids.courseX, JSON.stringify({
      updates: [
        { enrollmentId: a.id, number: 2, fullName: a.full_name },
        { enrollmentId: b.id, number: 1, fullName: "Bruno Ficticio Dos Corregido" },
      ],
      adds: [{ number: 5, fullName: "Fernanda Ficticia Nueva" }],
      withdraws: [d.id],
    })]);

    const after = await db.pool.query(
      "select enrollment_id, list_number, full_name from public.session_students where session_id = $1 order by enrollment_id",
      [session.id],
    );
    expect(after.rows).toEqual(before.rows);
    const now = await enrollmentsOf(ids.courseX);
    expect(now.find((row) => row.id === a.id)?.list_number).toBe(2);
    expect(now.find((row) => row.id === b.id)).toMatchObject({ list_number: 1, full_name: "Bruno Ficticio Dos Corregido" });
    expect(now.find((row) => row.id === d.id)).toMatchObject({ active: false, list_number: null });
    expect(now.some((row) => row.full_name === "Fernanda Ficticia Nueva" && row.active)).toBe(true);

    // Quien sale conserva su lugar en la clase anterior y deja de entrar en las nuevas.
    const next = await startSession(ids.teacher1);
    const nextRoster = await db.pool.query("select enrollment_id from public.session_students where session_id = $1", [next.id]);
    expect(nextRoster.rows.map((row) => row.enrollment_id)).not.toContain(d.id);
    await expect(record(ids.teacher1, session.id, d.id, "C")).resolves.toMatchObject({ code: "C" });
  });

  it("solo la cuenta dueña actualiza la nómina, y sin N° repetidos", async () => {
    const [a, b] = await enrollmentsOf(ids.courseX);
    const plan = JSON.stringify({ updates: [{ enrollmentId: a.id, number: b.list_number, fullName: a.full_name }] });

    for (const user of [ids.teacher2, ids.admin, ids.coordinator]) {
      await expect(rpc(db.pool, user, "update_roster", [ids.courseX, plan])).rejects.toThrow("Solo administración puede actualizar la nómina.");
    }
    await expect(rpc(db.pool, ids.teacher1, "update_roster", [ids.courseX, plan])).rejects.toThrow("N° de lista repetidos");
  });

  it("no crea un curso con el mismo nombre en el mismo año", async () => {
    await expect(createCourse(db.pool, ids.teacher1, ids.personal1, "  iii°a ficticio ", ROSTER_X))
      .rejects.toThrow("Ya existe el curso");
  });

  it.each([
    ["N° repetidos", [{ number: 1, fullName: "A B" }, { number: 1, fullName: "C D" }], "N° de lista repetidos"],
    ["un N° que no es entero", [{ number: "uno", fullName: "A B" }], "N° de lista válido"],
    ["un nombre vacío", [{ number: 1, fullName: " " }], "N° de lista válido"],
    ["una lista vacía", [], "No se encontraron nombres"],
  ])("rechaza una nómina con %s", async (_case, entries, message) => {
    await expect(createCourse(db.pool, ids.teacher1, ids.personal1, `Curso ${randomUUID()}`, entries))
      .rejects.toThrow(message);
  });

  it.each([
    ["un docente, en su establecimiento", "teacher1", "school"],
    ["administración, en su establecimiento", "admin", "school"],
    ["otra cuenta, en un espacio personal ajeno", "teacher2", "personal1"],
  ] as const)("los cursos se crean solo en el espacio personal propio: rechaza a %s", async (_case, user, space) => {
    await expect(createCourse(db.pool, ids[user], ids[space], "Curso Nuevo Ficticio", ROSTER_X))
      .rejects.toThrow("Solo puedes crear cursos en tu espacio personal.");
  });

  it("asignar el curso a otro miembro no le da acceso: solo cuenta quien lo creó", async () => {
    // Un curso de establecimiento como los que deja import_legacy_state.
    const course = (await db.pool.query(
      "insert into public.courses (school_id, name, academic_year, created_by) values ($1, 'Curso Importado Ficticio', 2026, $2) returning id",
      [ids.school, ids.admin],
    )).rows[0].id as string;
    await rpc(db.pool, ids.admin, "assign_course_teacher", [course, ids.teacher1]);

    expect(await visible(db.pool, ids.admin, "courses", `id = '${course}'`)).toBe(1);
    expect(await visible(db.pool, ids.teacher1, "courses", `id = '${course}'`)).toBe(0);
    expect(await visible(db.pool, ids.coordinator, "courses", `id = '${course}'`)).toBe(0);
    await expect(startSession(ids.teacher1, course, randomUUID())).rejects.toThrow("Este curso no pertenece a tu cuenta.");
  });
});

describe("perfil", () => {
  it("cada quien edita solo su propio nombre", async () => {
    await rpc(db.pool, ids.teacher1, "update_my_profile", ["  Docente Uno Ficticio  "]);

    const names = await db.pool.query("select id, full_name from public.profiles where id = any($1)", [[ids.teacher1, ids.teacher2]]);
    expect(Object.fromEntries(names.rows.map((row) => [row.id, row.full_name]))).toEqual({
      [ids.teacher1]: "Docente Uno Ficticio",
      [ids.teacher2]: "",
    });
    await expect(rpc(db.pool, ids.teacher1, "update_my_profile", ["   "])).rejects.toThrow("Escribe tu nombre.");
    await expect(rpc(db.pool, null, "update_my_profile", ["Anónimo"])).rejects.toThrow(/permission denied/);
  });
});

describe("invitaciones", () => {
  it("al iniciar sesión con el correo invitado se activa la membresía", async () => {
    await rpc(db.pool, ids.admin, "invite_member", [ids.school, " Nueva.Docente@Ficticio.cl ", "teacher"]);
    const invited = await createUser(db.pool, "nueva.docente@ficticio.cl");

    const institutions = "kind = 'institution'";
    expect(await visible(db.pool, invited, "schools", institutions)).toBe(0);
    expect((await one(rpc<{ claim_invitations: number }>(db.pool, invited, "claim_invitations"))).claim_invitations).toBe(1);
    expect(await visible(db.pool, invited, "schools", institutions)).toBe(1);
    expect(await visible(db.pool, invited, "courses")).toBe(0);
    expect((await one(rpc<{ claim_invitations: number }>(db.pool, ids.nobody, "claim_invitations"))).claim_invitations).toBe(0);
  });

  it("un correo sin verificar no acepta invitaciones", async () => {
    await rpc(db.pool, ids.admin, "invite_member", [ids.school, "sin.verificar@ficticio.cl", "teacher"]);
    const unverified = (await db.pool.query("insert into auth.users (email) values ('sin.verificar@ficticio.cl') returning id")).rows[0].id;

    expect((await one(rpc<{ claim_invitations: number }>(db.pool, unverified, "claim_invitations"))).claim_invitations).toBe(0);
  });

  it("solo administración invita", async () => {
    await expect(rpc(db.pool, ids.teacher1, "invite_member", [ids.school, "x@ficticio.cl", "admin"])).rejects.toThrow("Solo administración");
  });
});
