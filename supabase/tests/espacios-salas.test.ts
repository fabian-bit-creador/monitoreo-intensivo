import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { groupsLayout, labLayout, rowsLayout } from "@/features/courses/lib/room-layouts";
import { asUser, createTestDatabase, createUser, rpc, visible, type TestDatabase } from "./db";

let db: TestDatabase;
let docente: string;
let otra: string;
let personal: string;
let course: string;
let template: string;

const ROSTER = [
  { number: 1, fullName: "Ana Ficticia Uno" },
  { number: 2, fullName: "Bruno Ficticio Dos" },
  { number: 3, fullName: "Camila Ficticia Tres" },
  { number: 4, fullName: "Diego Ficticio Cuatro" },
];

/** Islas de 2 × 2: grupo 1 en (0,0), grupo 2 en (0,3). */
const GROUPS = [
  { row: 0, col: 0, group: "Grupo 1" }, { row: 0, col: 1, group: "Grupo 1" },
  { row: 1, col: 0, group: "Grupo 1" }, { row: 1, col: 1, group: "Grupo 1" },
  { row: 0, col: 3, group: "Grupo 2" }, { row: 0, col: 4, group: "Grupo 2" },
  { row: 1, col: 3, group: "Grupo 2" }, { row: 1, col: 4, group: "Grupo 2" },
];

async function seats(templateId: string) {
  const result = await db.pool.query(
    `select a.seat_row, a.seat_col, s.full_name from public.seat_assignments a
     join public.enrollments e on e.id = a.enrollment_id join public.students s on s.id = e.student_id
     where a.template_id = $1 order by a.seat_row, a.seat_col`,
    [templateId],
  );
  return result.rows.map((row) => `${row.seat_row}-${row.seat_col} ${row.full_name}`);
}

beforeAll(async () => {
  db = await createTestDatabase();
  docente = await createUser(db.pool, "docente.independiente@ficticio.cl");
  otra = await createUser(db.pool, "otra.docente@ficticio.cl");
  personal = (await db.pool.query(
    "select id from public.schools where kind = 'personal' and owner_id = $1",
    [docente],
  )).rows[0].id;
  const [created] = await rpc<{ create_course: { courseId: string; roomTemplateId: string } }>(
    db.pool, docente, "create_course", [personal, "Química ficticia", JSON.stringify(ROSTER)],
  );
  course = created.create_course.courseId;
  template = created.create_course.roomTemplateId;
});

afterAll(async () => {
  await db?.drop();
});

describe("espacio personal", () => {
  it("cada cuenta nueva recibe su espacio y es su administración", async () => {
    const rows = (await db.pool.query(
      `select s.name, s.kind, m.role from public.schools s
       join public.school_memberships m on m.school_id = s.id and m.user_id = s.owner_id
       where s.owner_id = $1`,
      [docente],
    )).rows;
    expect(rows).toEqual([{ name: "Mi espacio", kind: "personal", role: "admin" }]);
  });

  it("puede crear cursos sin que un establecimiento la habilite, y queda como docente", async () => {
    expect(await visible(db.pool, docente, "courses", `id = '${course}'`)).toBe(1);
    expect(await visible(db.pool, docente, "course_teachers", `course_id = '${course}'`)).toBe(1);
  });

  it("nadie más ve el espacio ni sus cursos", async () => {
    expect(await visible(db.pool, otra, "schools", `id = '${personal}'`)).toBe(0);
    expect(await visible(db.pool, otra, "courses")).toBe(0);
    expect(await visible(db.pool, otra, "students")).toBe(0);
    await expect(rpc(db.pool, otra, "create_course", [personal, "Intruso", JSON.stringify(ROSTER)]))
      .rejects.toThrow("Solo administración");
  });

  it("es una sola por persona aunque se pida de nuevo", async () => {
    await db.pool.query("select app.ensure_personal_space($1)", [docente]);
    expect((await db.pool.query(
      "select count(*)::int as n from public.schools where owner_id = $1", [docente],
    )).rows[0].n).toBe(1);
  });

  it("si un colegio la invita, ve ambos espacios", async () => {
    const colegio = (await db.pool.query("select public.bootstrap_school('Colegio ficticio', $1) as id", [otra])).rows[0].id;
    await db.pool.query(
      "insert into public.school_invitations (school_id, email, role) values ($1, 'docente.independiente@ficticio.cl', 'teacher')",
      [colegio],
    );
    await rpc(db.pool, docente, "claim_invitations");
    expect(await visible(db.pool, docente, "schools")).toBe(2);
    await expect(rpc(db.pool, docente, "create_course", [colegio, "Sin permiso", JSON.stringify(ROSTER)]))
      .rejects.toThrow("Solo administración");
  });
});

describe("salas configurables", () => {
  it("agrega una sala de trabajo grupal con sus grupos", async () => {
    const id = randomUUID();
    const args = [id, course, "Trabajo grupal", "groups", 2, 5, JSON.stringify(GROUPS)];
    expect((await rpc<{ create_room_template: string }>(db.pool, docente, "create_room_template", args))[0].create_room_template).toBe(id);
    // Reintentar con el mismo id no la duplica.
    await rpc(db.pool, docente, "create_room_template", args);

    const room = (await db.pool.query("select layout, row_count, column_count from public.room_templates where id = $1", [id])).rows[0];
    expect(room).toEqual({ layout: "groups", row_count: 2, column_count: 5 });
    const labels = (await db.pool.query(
      "select group_label, count(*)::int as n from public.room_slots where template_id = $1 group by 1 order by 1", [id],
    )).rows;
    expect(labels).toEqual([{ group_label: "Grupo 1", n: 4 }, { group_label: "Grupo 2", n: 4 }]);

    const [assigned] = await rpc<{ assign_seats_by_number: number }>(db.pool, docente, "assign_seats_by_number", [id]);
    expect(assigned.assign_seats_by_number).toBe(4);
    expect(await seats(id)).toEqual([
      "0-0 Ana Ficticia Uno", "0-1 Bruno Ficticio Dos", "0-3 Camila Ficticia Tres", "0-4 Diego Ficticio Cuatro",
    ]);
  });

  it("acepta las formas que genera la aplicación, con sus grupos", async () => {
    for (const layout of [
      rowsLayout({ rows: 20, seatsPerRow: 20, aisleEvery: 2 }),
      labLayout({ benchesPerRow: 3, benchRows: 7, seatsPerSide: 4 }),
      groupsLayout({ groups: 21, groupSize: 6, groupsPerRow: 5 }),
    ]) {
      const id = randomUUID();
      await rpc(db.pool, docente, "create_room_template", [
        id, course, `Sala ${layout.kind}`, layout.kind, layout.rows, layout.cols, JSON.stringify(layout.slots),
      ]);
      const saved = (await db.pool.query(
        "select count(*)::int as seats, count(distinct group_label)::int as groups from public.room_slots where template_id = $1", [id],
      )).rows[0];
      expect(saved).toEqual({ seats: layout.slots.length, groups: new Set(layout.slots.map((slot) => slot.group).filter(Boolean)).size });
    }
  });

  it("rechaza formas inválidas", async () => {
    const create = (rows: number, cols: number, slots: unknown, layout = "rows") =>
      rpc(db.pool, docente, "create_room_template", [randomUUID(), course, "Sala", layout, rows, cols, JSON.stringify(slots)]);
    await expect(create(2, 2, [{ row: 2, col: 0 }])).rejects.toThrow("fuera de la sala");
    await expect(create(2, 2, [{ row: 0, col: 0 }, { row: 0, col: 0 }])).rejects.toThrow("repetidos");
    await expect(create(2, 2, [])).rejects.toThrow("al menos un puesto");
    await expect(create(21, 2, [{ row: 0, col: 0 }])).rejects.toThrow("entre 1 y 20");
    await expect(create(2, 2, [{ row: 0, col: 0 }], "escenario")).rejects.toThrow("Tipo de sala");
    await expect(create(2, 2, [{ row: "0", col: 0 }])).rejects.toThrow("fuera de la sala");
    await expect(create(2, 2, [{ row: 0, col: 0, group: " " }])).rejects.toThrow("nombre de un grupo");
  });

  it("solo quien enseña el curso o administra el espacio puede crear o cambiar salas", async () => {
    await expect(rpc(db.pool, otra, "create_room_template", [
      randomUUID(), course, "Ajena", "rows", 1, 1, JSON.stringify([{ row: 0, col: 0 }]),
    ])).rejects.toThrow("No puedes crear salas");
    await expect(rpc(db.pool, otra, "update_room_layout", [
      template, "Ajena", "rows", 1, 1, JSON.stringify([{ row: 0, col: 0 }]),
    ])).rejects.toThrow("No puedes ordenar esta sala");
    await expect(asUser(db.pool, docente, (client) => client.query(
      "insert into public.room_slots (template_id, seat_row, seat_col) values ($1, 9, 9)", [template],
    ))).rejects.toThrow("permission denied");
  });

  it("cambiar la forma conserva los puestos que siguen existiendo y libera los demás", async () => {
    await rpc(db.pool, docente, "assign_seats_by_number", [template]);
    // Sala habitual 7 × 6: N° 1 a 4 en la fila 0, columnas 0 a 3.
    const lab = [
      { row: 0, col: 0, group: "Mesón 1" }, { row: 0, col: 1, group: "Mesón 1" },
      { row: 1, col: 0, group: "Mesón 1" }, { row: 1, col: 1, group: "Mesón 1" },
      { row: 0, col: 3, group: "Mesón 2" }, { row: 1, col: 3, group: "Mesón 2" },
    ];
    const [result] = await rpc<{ update_room_layout: number }>(db.pool, docente, "update_room_layout", [
      template, "Laboratorio", "lab", 2, 4, JSON.stringify(lab),
    ]);
    expect(result.update_room_layout).toBe(1);
    expect(await seats(template)).toEqual(["0-0 Ana Ficticia Uno", "0-1 Bruno Ficticio Dos", "0-3 Diego Ficticio Cuatro"]);

    const room = (await db.pool.query("select name, layout, row_count, column_count from public.room_templates where id = $1", [template])).rows[0];
    expect(room).toEqual({ name: "Laboratorio", layout: "lab", row_count: 2, column_count: 4 });
    expect((await db.pool.query("select count(*)::int as n from public.room_slots where template_id = $1", [template])).rows[0].n).toBe(6);

    // Quien quedó sin puesto se ubica en el puesto libre.
    const [assigned] = await rpc<{ assign_seats_by_number: number }>(db.pool, docente, "assign_seats_by_number", [template]);
    expect(assigned.assign_seats_by_number).toBe(1);
  });

  it("las clases ya iniciadas conservan la fotografía de su sala", async () => {
    const [session] = await rpc<{ id: string }>(db.pool, docente, "start_session", [
      randomUUID(), course, template, "2026-10-12", "Módulo", "Objetivo", "Criterio",
    ]);
    await rpc(db.pool, docente, "update_room_layout", [
      template, "Sala en filas", "rows", 1, 4, JSON.stringify([0, 1, 2, 3].map((col) => ({ row: 0, col }))),
    ]);
    const snapshot = (await db.pool.query(
      "select list_number, seat_row, seat_col from public.session_students where session_id = $1 order by list_number",
      [session.id],
    )).rows;
    expect(snapshot.map((row) => `${row.list_number}:${row.seat_row}-${row.seat_col}`))
      .toEqual(["1:0-0", "2:0-1", "3:1-0", "4:0-3"]);
  });
});
