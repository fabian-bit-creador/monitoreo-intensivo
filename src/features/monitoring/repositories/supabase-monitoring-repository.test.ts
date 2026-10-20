import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { MonitoringCommand } from "../lib/commands";
import { StaleViewError, SyncError } from "./monitoring-repository";
import {
  SupabaseMonitoringRepository,
  toRepositoryError,
} from "./supabase-monitoring-repository";

const ME = "11111111-1111-1111-1111-111111111111";
const USER = { id: ME, email: "docente.ficticia@ejemplo.cl" };

type Failure = { message: string; code: string };
type Response = { data: unknown; error: Failure | null };

const NETWORK: Failure = { message: "TypeError: fetch failed", code: "" };

/** Filas por tabla, como las devuelve PostgREST. Solo datos ficticios. */
function tables(): Record<string, Array<Record<string, unknown>>> {
  return {
    schools: [{ id: "s1", name: "Mi espacio", kind: "personal" }],
    school_memberships: [{ school_id: "s1", user_id: ME, role: "admin", active: true }],
    profiles: [{ id: ME, full_name: "Docente Ficticia", created_at: "2026-10-01T00:00:00Z" }],
    courses: [{ id: "c1", school_id: "s1", name: "III°B Ficticio", archived_at: null, created_at: "2026-10-01T00:00:00Z" }],
    students: [{ id: "p1", full_name: "Ana Ficticia Uno", display_name: "Ana F." }],
    enrollments: [{ id: "e1", course_id: "c1", student_id: "p1", list_number: 1, active: true }],
    room_templates: [{
      id: "t1", course_id: "c1", name: "Sala habitual", description: "", row_count: 7,
      column_count: 6, active: true, created_at: "2026-10-01T00:00:00Z", layout: "classic",
    }],
    room_slots: [{ template_id: "t1", seat_row: 0, seat_col: 0, status: "available", group_label: null }],
    seat_assignments: [],
    class_sessions: [{
      id: "u-9", seq: 9, course_id: "c1", teacher_id: ME, room_template_id: "t1", date: "2026-10-11",
      module: "M", objective: "O", success_criteria: "C", status: "active",
      started_at: "2026-10-11T12:00:00Z", closed_at: null,
    }],
    session_students: [{
      session_id: "u-9", enrollment_id: "e1", list_number: 1, full_name: "Ana Ficticia Uno",
      display_name: "Ana F.", seat_row: 0, seat_col: 0, present: true,
    }],
    observations: [],
  };
}

/**
 * Cliente simulado: lecturas por tabla y operaciones con respuesta programable.
 * `readsFail` corta la red en las lecturas; `missingColumns` imita una base sin
 * la migración de ADR 0004.
 */
class FakeSupabase {
  data = tables();
  readsFail = false;
  missingColumns = new Set<string>();
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  selects: string[] = [];
  answer: (name: string, args: Record<string, unknown>) => Response = () => ({ data: null, error: null });

  from(table: string) {
    let columns = "";
    const query = {
      select: (value: string) => {
        columns = value;
        this.selects.push(`${table}: ${value}`);
        return query;
      },
      order: () => query,
      range: async (): Promise<Response> => {
        if (this.readsFail) return { data: null, error: NETWORK };
        const missing = columns.split(", ").find((column) => this.missingColumns.has(column));
        if (missing) return { data: null, error: { message: `column ${table}.${missing} does not exist`, code: "42703" } };
        return { data: this.data[table] ?? [], error: null };
      },
    };
    return query;
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<Response> {
    this.calls.push({ name, args });
    return this.answer(name, args);
  }

  idsOf(name: string) {
    return this.calls.filter((call) => call.name === name).map((call) => call.args.p_id);
  }
}

async function setup() {
  const fake = new FakeSupabase();
  const repository = new SupabaseMonitoringRepository(fake as unknown as SupabaseClient, USER, { retryDelayMs: 0 });
  await repository.load();
  return { fake, repository };
}

const newSession: MonitoringCommand = {
  type: "createSession",
  input: {
    courseId: "c1", teacherId: ME, roomTemplateId: "t1", date: "2026-10-12",
    module: "Módulo ficticio", objective: "Objetivo ficticio", successCriteria: "Criterio ficticio",
  },
};
const observation: MonitoringCommand = {
  type: "addObservation",
  input: { sessionId: 9, studentId: "e1", round: 1, code: "R", progress: 50 },
};
const newRoom: MonitoringCommand = {
  type: "createRoomTemplate",
  courseId: "c1",
  name: "Laboratorio ficticio",
  layout: { kind: "rows", rows: 1, cols: 2, slots: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
};

/** El servidor guarda la clase (seq 10) y la siguiente lectura la incluye. */
function startSessionAnswer(fake: FakeSupabase) {
  return (name: string, args: Record<string, unknown>): Response => {
    if (name !== "start_session") return { data: null, error: null };
    if (!fake.data.class_sessions.some((row) => row.id === args.p_id)) {
      fake.data.class_sessions.push({
        ...fake.data.class_sessions[0], id: args.p_id, seq: 10, date: args.p_date, status: "active",
      });
    }
    return { data: { id: args.p_id, seq: 10 }, error: null };
  };
}

describe("guardado y relectura por separado", () => {
  it("si el servidor confirma y falla la relectura, informa que se guardó (no un error de guardado)", async () => {
    const { fake, repository } = await setup();
    fake.answer = startSessionAnswer(fake);
    fake.readsFail = true;

    const attempt = repository.execute(newSession);
    await expect(attempt).rejects.toBeInstanceOf(StaleViewError);
    await expect(attempt).rejects.not.toBeInstanceOf(SyncError);
    await expect(attempt).rejects.toThrow(/Guardado en el servidor/);
  });

  it("repetir la acción después de esa falla reutiliza el mismo id: no duplica la clase", async () => {
    const { fake, repository } = await setup();
    fake.answer = startSessionAnswer(fake);
    fake.readsFail = true;
    await expect(repository.execute(newSession)).rejects.toBeInstanceOf(StaleViewError);

    fake.readsFail = false;
    const result = await repository.execute(newSession);

    const [first, second] = fake.idsOf("start_session");
    expect(second).toBe(first);
    expect(fake.data.class_sessions.filter((row) => row.seq === 10)).toHaveLength(1);
    expect(result.state.sessions.filter((session) => session.date === "2026-10-12")).toHaveLength(1);
  });

  it("sin respuesta del servidor, cada reintento conserva la identidad de la operación", async () => {
    const { fake, repository } = await setup();
    fake.answer = () => ({ data: null, error: NETWORK });

    for (const command of [newSession, observation, newRoom]) {
      await expect(repository.execute(command)).rejects.toBeInstanceOf(SyncError);
      await expect(repository.execute(command)).rejects.toBeInstanceOf(SyncError);
    }

    for (const name of ["start_session", "record_observation", "create_room_template"]) {
      // Dos acciones del docente, cada una con su reintento automático: un solo id.
      const ids = fake.idsOf(name);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(1);
    }
    // La observación conserva también la hora en que se registró.
    const times = fake.calls.filter((call) => call.name === "record_observation").map((call) => call.args.p_observed_at);
    expect(new Set(times).size).toBe(1);
  });

  it("una vez que la lectura muestra el cambio, repetir es una acción nueva", async () => {
    const { fake, repository } = await setup();
    fake.answer = (name, args) => {
      if (name === "record_observation") {
        fake.data.observations.push({
          id: args.p_id, seq: fake.data.observations.length + 1, session_id: "u-9", enrollment_id: "e1",
          round: 1, code: "R", progress: 50, note: null, observed_at: args.p_observed_at,
        });
      }
      return { data: {}, error: null };
    };

    await repository.execute(observation);
    await repository.execute(observation);

    const ids = fake.idsOf("record_observation");
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("si el servidor rechaza la regla, el siguiente intento usa otro id", async () => {
    const { fake, repository } = await setup();
    fake.answer = () => ({ data: null, error: { message: "La clase está cerrada. Reábrela para seguir registrando.", code: "P0001" } });
    await expect(repository.execute(observation)).rejects.toThrow("La clase está cerrada");

    fake.answer = () => ({ data: {}, error: null });
    await repository.execute(observation);

    const ids = fake.idsOf("record_observation");
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("una lectura que empezó antes de que termine la escritura no libera su identidad", async () => {
    const { fake, repository } = await setup();
    let release: (value: Response) => void = () => undefined;
    fake.answer = () => new Promise<Response>((resolve) => { release = resolve; }) as unknown as Response;

    const pending = repository.execute(newSession);
    await repository.load(); // lectura en paralelo (otra pestaña, foco, intervalo)
    fake.answer = () => ({ data: null, error: NETWORK });
    release({ data: null, error: NETWORK });
    await expect(pending).rejects.toBeDefined();

    await expect(repository.execute(newSession)).rejects.toBeInstanceOf(SyncError);
    expect(new Set(fake.idsOf("start_session")).size).toBe(1);
  });
});

describe("columnas todavía no migradas", () => {
  it("toRepositoryError conserva el código del servidor", () => {
    expect((toRepositoryError({ message: "column schools.kind does not exist", code: "42703" }) as { code?: string }).code).toBe("42703");
    expect((toRepositoryError({ message: "Solo administración", code: "42501" }) as { code?: string }).code).toBe("42501");
  });

  it("sin la migración de ADR 0004, lee las columnas anteriores en vez de fallar", async () => {
    const fake = new FakeSupabase();
    fake.missingColumns = new Set(["kind", "layout", "group_label"]);
    const repository = new SupabaseMonitoringRepository(fake as unknown as SupabaseClient, USER, { retryDelayMs: 0 });

    const loaded = await repository.load();

    expect(loaded.status).toBe("ready");
    expect(fake.selects).toContain("schools: id, name");
    expect(fake.selects).toContain("room_templates: id, course_id, name, description, row_count, column_count, active, created_at");
    expect(fake.selects).toContain("room_slots: template_id, seat_row, seat_col, status");
  });

  it("otros errores de lectura no se esconden con la consulta alternativa", async () => {
    const fake = new FakeSupabase();
    fake.readsFail = true;
    const repository = new SupabaseMonitoringRepository(fake as unknown as SupabaseClient, USER, { retryDelayMs: 0 });

    await expect(repository.load()).rejects.toBeInstanceOf(SyncError);
    expect(fake.selects).not.toContain("schools: id, name");
  });
});
