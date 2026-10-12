import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_TEACHER_ID } from "@/config/app";
import { createDemoState } from "@/data/demo-state";
import { metricsForSession } from "@/features/monitoring/lib/metrics";
import { mapRowsToState, type DbRows } from "@/features/monitoring/repositories/supabase-mapping";
import type { MonitoringState } from "@/types/monitoring";
import { asUser, createTestDatabase, createUser, rpc, type TestDatabase } from "./db";

let db: TestDatabase;
let admin: string;
let teacher: string;
let school: string;

/** Exportación con la forma del Site anterior: sin envoltorio y estudiantes con createdAt. */
function legacySiteExport(): MonitoringState & Record<string, unknown> {
  const demo = createDemoState();
  return {
    ...demo,
    students: demo.students.map((student) => ({ ...student, createdAt: "2026-07-01T12:00:00.000Z" })),
  };
}

/** Lo mismo que lee la aplicación: las tablas filtradas por RLS para el usuario. */
async function readRows(userId: string): Promise<DbRows> {
  return asUser(db.pool, userId, async (client) => {
    const query = async (sql: string) => JSON.parse(JSON.stringify((await client.query(sql)).rows));
    return {
      userId,
      userEmail: "admin@ficticio.cl",
      schools: await query("select id, name from public.schools"),
      memberships: await query("select school_id, user_id, role, active from public.school_memberships"),
      profiles: await query("select id, full_name, created_at from public.profiles"),
      courses: await query("select id, school_id, name, archived_at, created_at from public.courses"),
      students: await query("select id, full_name, display_name from public.students"),
      enrollments: await query("select id, course_id, student_id, list_number, active from public.enrollments"),
      roomTemplates: await query("select id, course_id, name, description, row_count, column_count, active, created_at from public.room_templates"),
      roomSlots: await query("select template_id, seat_row, seat_col, status from public.room_slots"),
      seatAssignments: await query("select template_id, enrollment_id, seat_row, seat_col from public.seat_assignments"),
      sessions: await query("select id, seq, course_id, teacher_id, room_template_id, date, module, objective, success_criteria, status, started_at, closed_at from public.class_sessions"),
      sessionStudents: await query("select session_id, enrollment_id, list_number, full_name, display_name, seat_row, seat_col, present from public.session_students"),
      observations: await query("select id, seq, session_id, enrollment_id, round, code, progress, note, observed_at from public.observations"),
    } as DbRows;
  });
}

async function importState(userId: string, state: unknown, teacherMap: Record<string, string>) {
  const [row] = await rpc<{ import_legacy_state: Record<string, number> }>(
    db.pool, userId, "import_legacy_state", [school, JSON.stringify(state), JSON.stringify(teacherMap)],
  );
  return row.import_legacy_state;
}

beforeAll(async () => {
  db = await createTestDatabase();
  admin = await createUser(db.pool, "admin@ficticio.cl");
  teacher = await createUser(db.pool, "docente@ficticio.cl");
  school = (await db.pool.query("select public.bootstrap_school('Colegio Ficticio', $1) as id", [admin])).rows[0].id;
  await db.pool.query("insert into public.school_memberships (school_id, user_id, role) values ($1, $2, 'teacher')", [school, teacher]);
});

afterAll(async () => {
  await db?.drop();
});

describe("importar los datos del Site", () => {
  it("solo administración importa y cada docente con clases debe quedar asignado", async () => {
    await expect(importState(teacher, legacySiteExport(), { [DEFAULT_TEACHER_ID]: teacher })).rejects.toThrow("Solo administración");
    await expect(importState(admin, legacySiteExport(), {})).rejects.toThrow(`Falta asignar a un miembro del establecimiento estos docentes: ${DEFAULT_TEACHER_ID}.`);
    await expect(importState(admin, legacySiteExport(), { [DEFAULT_TEACHER_ID]: "00000000-0000-0000-0000-000000000000" }))
      .rejects.toThrow("Falta asignar");
  });

  it("importa todo una sola vez y conserva los indicadores de cada clase", async () => {
    const original = legacySiteExport();

    const first = await importState(admin, original, { [DEFAULT_TEACHER_ID]: admin });
    const second = await importState(admin, original, { [DEFAULT_TEACHER_ID]: admin });

    expect(first).toEqual({
      courses: original.courses.length,
      students: original.students.length,
      sessions: original.sessions.length,
      observations: original.observations.length,
      skippedObservations: 0,
    });
    expect(second).toEqual({ courses: 0, students: 0, sessions: 0, observations: 0, skippedObservations: 0 });

    const { state } = mapRowsToState(await readRows(admin));
    const seqByLegacy = new Map(
      (await db.pool.query("select legacy_id, seq from public.class_sessions")).rows.map((row) => [row.legacy_id, Number(row.seq)]),
    );
    for (const session of original.sessions) {
      const before = metricsForSession(original, session);
      const imported = state.sessions.find((item) => item.id === seqByLegacy.get(String(session.id)));
      expect(imported, `clase ${session.id}`).toBeDefined();
      const after = metricsForSession(state, imported!);
      const summary = (metrics: typeof before) => ({
        roster: metrics.roster.map((student) => [student.number, student.fullName]),
        present: metrics.present.length,
        counts: metrics.counts,
        coverage: metrics.coverage,
        cRate: metrics.cRate,
        avgProgress: metrics.avgProgress,
        progressed: metrics.progressed,
        absent: metrics.absent,
        latest: metrics.roster.map((student) => metrics.latest.get(student.id)?.code ?? null),
      });
      expect(summary(after), `clase ${session.id}`).toEqual(summary(before));
      expect(imported).toMatchObject({
        date: session.date,
        module: session.module,
        status: session.status,
        teacherId: admin,
      });
    }
  });

  it("conserva la distribución de puestos y las plantillas", async () => {
    const original = legacySiteExport();
    const { state } = mapRowsToState(await readRows(admin));
    // Los cursos pendientes, sin plantilla, reciben la sala habitual de 7 × 6.
    const pending = original.courses.filter(
      (course) => !original.roomTemplates.some((template) => template.courseId === course.id),
    ).length;

    expect(state.roomTemplates.map((template) => template.name).sort()).toEqual(
      [...original.roomTemplates.map((template) => template.name), ...Array(pending).fill("Sala habitual")].sort(),
    );
    expect(state.seatAssignments).toHaveLength(original.seatAssignments.length);
    expect(state.roomSlots).toHaveLength(original.roomSlots.length + 42 * pending);
  });

  it("después de importar, la cuenta puede seguir dictando clases en el curso", async () => {
    const { state } = mapRowsToState(await readRows(admin));
    const course = state.courses.find((item) => state.students.some((student) => student.courseId === item.id))!;
    const template = state.roomTemplates.find((item) => item.courseId === course.id)!;

    await expect(rpc(db.pool, admin, "start_session", [
      crypto.randomUUID(), course.id, template.id, "2026-10-11", "Módulo", "Objetivo", "Criterio",
    ])).resolves.toHaveLength(1);
  });
});
