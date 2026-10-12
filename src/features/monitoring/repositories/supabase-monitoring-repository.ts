import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { MonitoringState } from "@/types/monitoring";
import {
  applyCommand,
  type CommandResult,
  type MonitoringCommand,
} from "../lib/commands";
import {
  SyncError,
  type LoadResult,
  type MonitoringRepository,
} from "./monitoring-repository";
import {
  mapRowsToState,
  type DbRows,
  type RemoteAccount,
  type RemoteIndex,
} from "./supabase-mapping";

const PAGE = 1000;
const REFRESH_MS = 45_000;

const NETWORK_ERROR =
  "No hay conexión con el servidor. El cambio no se guardó: vuelve a intentarlo.";

/**
 * Los mensajes de las reglas vienen del servidor en español (raise exception).
 * La falta de red o de sesión es una falla de sincronización.
 */
export function toRepositoryError(error: Pick<PostgrestError, "message" | "code">) {
  const message = error.message ?? "";
  if (!error.code || /fetch|network|load failed/i.test(message)) return new SyncError(NETWORK_ERROR);
  if (error.code === "28000" || error.code === "PGRST301" || error.code === "PGRST303") {
    return new SyncError("Tu sesión expiró. Vuelve a iniciar sesión.");
  }
  if (["P0001", "42501"].includes(error.code)) return new Error(message);
  if (error.code === "23505") return new Error("El cambio choca con otro registro. Actualiza e inténtalo de nuevo.");
  return new SyncError(`El servidor no aceptó el cambio (${error.code}). Actualiza e inténtalo de nuevo.`);
}

type Query = PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>;

async function all<T>(build: (from: number, to: number) => Query): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw toRepositoryError(error);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function fetchRows(client: SupabaseClient, user: { id: string; email: string }): Promise<DbRows> {
  const table = (name: string, columns: string, order: string[]) => all((from, to) => {
    let query = client.from(name).select(columns);
    for (const column of order) query = query.order(column);
    return query.range(from, to);
  });
  const [
    schools, memberships, profiles, courses, students, enrollments, roomTemplates,
    roomSlots, seatAssignments, sessions, sessionStudents, observations,
  ] = await Promise.all([
    table("schools", "id, name", ["id"]),
    table("school_memberships", "school_id, user_id, role, active", ["school_id", "user_id"]),
    table("profiles", "id, full_name, created_at", ["id"]),
    table("courses", "id, school_id, name, archived_at, created_at", ["id"]),
    table("students", "id, full_name, display_name", ["id"]),
    table("enrollments", "id, course_id, student_id, list_number, active", ["id"]),
    table("room_templates", "id, course_id, name, description, row_count, column_count, active, created_at", ["id"]),
    table("room_slots", "template_id, seat_row, seat_col, status", ["template_id", "seat_row", "seat_col"]),
    table("seat_assignments", "template_id, enrollment_id, seat_row, seat_col", ["template_id", "enrollment_id"]),
    table(
      "class_sessions",
      "id, seq, course_id, teacher_id, room_template_id, date, module, objective, success_criteria, status, started_at, closed_at",
      ["seq"],
    ),
    table(
      "session_students",
      "session_id, enrollment_id, list_number, full_name, display_name, seat_row, seat_col, present",
      ["session_id", "enrollment_id"],
    ),
    table("observations", "id, seq, session_id, enrollment_id, round, code, progress, note, observed_at", ["seq"]),
  ]);
  return {
    userId: user.id,
    userEmail: user.email,
    schools, memberships, profiles, courses, students, enrollments, roomTemplates,
    roomSlots, seatAssignments, sessions, sessionStudents, observations,
  } as DbRows;
}

/**
 * Persistencia en Supabase (ADR 0002 y 0003). Cada comando se valida con las
 * mismas reglas del modo local y luego se envía como una operación
 * transaccional. Solo se informa «Sincronizado» tras la respuesta del
 * servidor, y el estado mostrado es siempre el que el servidor confirmó.
 */
export class SupabaseMonitoringRepository implements MonitoringRepository {
  readonly kind = "remote" as const;
  private state: MonitoringState | null = null;
  private index: RemoteIndex = { sessionUuid: new Map(), sessionSeq: new Map() };
  private account: RemoteAccount | null = null;
  private requested = 0;
  private applied = 0;

  constructor(
    private readonly client: SupabaseClient,
    private readonly user: { id: string; email: string },
  ) {}

  getAccount() {
    return this.account;
  }

  async load(): Promise<LoadResult> {
    if (!this.state) {
      // Si alguien invitó este correo, la membresía se activa al entrar.
      await this.client.rpc("claim_invitations").then(() => undefined, () => undefined);
    }
    const state = await this.refresh();
    return { status: "ready", state, savedAt: new Date().toISOString() };
  }

  async execute<C extends MonitoringCommand>(command: C): Promise<CommandResult<C>> {
    if (!this.state) throw new Error("Los datos todavía no se cargan.");
    // Mismas reglas que el modo local: los errores llegan sin ir al servidor.
    const local = applyCommand(this.state, command);
    const outputs = await this.send(command, local);
    const state = await this.refresh();
    return { ...local, ...outputs, state } as CommandResult<C>;
  }

  subscribe(listener: (result: LoadResult) => void) {
    if (typeof window === "undefined") return () => undefined;
    const update = () => {
      if (document.visibilityState !== "visible" || !this.state) return;
      void this.refresh().then(
        (state) => listener({ status: "ready", state, savedAt: new Date().toISOString() }),
        () => undefined,
      );
    };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const timer = window.setInterval(update, REFRESH_MS);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.clearInterval(timer);
    };
  }

  /** Relee todo; si llegan dos lecturas, gana la más reciente. */
  private async refresh() {
    const request = ++this.requested;
    const mapped = mapRowsToState(await fetchRows(this.client, this.user));
    if (request > this.applied) {
      this.applied = request;
      this.state = mapped.state;
      this.index = mapped.index;
      this.account = mapped.account;
    }
    return this.state as MonitoringState;
  }

  private sessionUuid(sessionId: number) {
    const uuid = this.index.sessionUuid.get(sessionId);
    if (!uuid) throw new Error("No se encontró la clase en el servidor. Actualiza la página.");
    return uuid;
  }

  private async rpc<T>(name: string, args: Record<string, unknown>, retryOnNetwork = false): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const { data, error } = await this.client.rpc(name, args);
      if (!error) return data as T;
      const failure = toRepositoryError(error);
      // Reintento seguro: estas operaciones llevan su propio id y no se duplican.
      if (retryOnNetwork && attempt === 0 && failure instanceof SyncError) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      throw failure;
    }
  }

  private async send(command: MonitoringCommand, local: CommandResult): Promise<Record<string, unknown>> {
    switch (command.type) {
      case "createSession": {
        const session = await this.rpc<{ seq: number | string }>("start_session", {
          p_id: crypto.randomUUID(),
          p_course_id: command.input.courseId,
          p_room_template_id: command.input.roomTemplateId,
          p_date: command.input.date,
          p_module: command.input.module,
          p_objective: command.input.objective,
          p_success_criteria: command.input.successCriteria,
        }, true);
        return { sessionId: Number(session.seq) };
      }
      case "addObservation":
        await this.rpc("record_observation", {
          p_id: crypto.randomUUID(),
          p_session_id: this.sessionUuid(command.input.sessionId),
          p_enrollment_id: command.input.studentId,
          p_round: command.input.round,
          p_code: command.input.code,
          p_progress: command.input.progress ?? null,
          p_note: command.input.note ?? null,
          p_observed_at: new Date().toISOString(),
        }, true);
        return {};
      case "setPresence":
        await this.rpc("set_attendance", {
          p_session_id: this.sessionUuid(command.sessionId),
          p_enrollment_id: command.studentId,
          p_present: command.present,
          p_changed_at: new Date().toISOString(),
        }, true);
        return {};
      case "setSessionStatus":
        await this.rpc("set_session_status", {
          p_session_id: this.sessionUuid(command.sessionId),
          p_status: command.status,
        }, true);
        return {};
      case "moveStudent":
        await this.rpc("move_seat", {
          p_template_id: command.roomTemplateId,
          p_enrollment_id: command.studentId,
          p_row: command.row,
          p_col: command.col,
        });
        return {};
      case "assignSeatsByNumber": {
        const assigned = await this.rpc<number>("assign_seats_by_number", { p_template_id: command.roomTemplateId });
        return { assigned };
      }
      case "importStudents": {
        const schoolId = this.account?.adminSchoolIds[0];
        if (!schoolId) throw new Error("Solo administración puede crear cursos.");
        const created = await this.rpc<{ courseId: string; roomTemplateId: string }>("create_course", {
          p_school_id: schoolId,
          p_name: command.courseName,
          p_entries: command.entries,
        });
        return created;
      }
      case "updateRoster": {
        const { plan } = local as CommandResult<Extract<MonitoringCommand, { type: "updateRoster" }>>;
        await this.rpc("update_roster", {
          p_course_id: command.courseId,
          p_plan: {
            updates: plan.updated.map((item) => ({
              enrollmentId: item.student.id,
              number: item.entry.number,
              fullName: item.entry.fullName,
            })),
            adds: plan.added,
            withdraws: plan.withdrawn.map((student) => student.id),
          },
        });
        return { plan };
      }
    }
  }

  /** Importa un respaldo o los datos del Site a un establecimiento (administración). */
  async importLegacyState(schoolId: string, state: MonitoringState, teacherMap: Record<string, string>) {
    const result = await this.rpc<Record<string, number>>("import_legacy_state", {
      p_school_id: schoolId,
      p_state: state,
      p_teacher_map: teacherMap,
    });
    await this.refresh();
    return result;
  }

  async updateProfileName(fullName: string) {
    await this.rpc("update_my_profile", { p_full_name: fullName });
    await this.refresh();
  }
}
