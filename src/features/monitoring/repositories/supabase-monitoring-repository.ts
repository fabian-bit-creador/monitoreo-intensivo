import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { MonitoringState } from "@/types/monitoring";
import {
  applyCommand,
  type CommandResult,
  type MonitoringCommand,
} from "../lib/commands";
import {
  RejectedError,
  StaleViewError,
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
/** Tras guardar sin poder releer, se vuelve a intentar pronto. */
const STALE_RETRY_MS = 5_000;

// Sin respuesta no se sabe si el cambio alcanzó a guardarse. Repetirlo es
// seguro: la operación conserva su id y el servidor no la duplica.
const NETWORK_WRITE =
  "No hay conexión con el servidor. Vuelve a intentarlo: si el cambio ya se había guardado, no se duplicará.";
const NETWORK_READ = "No hay conexión con el servidor. Revisa la conexión y vuelve a intentarlo.";
const SAVED_NOT_SHOWN =
  "El cambio se guardó en el servidor, pero no pudimos actualizar la pantalla. Se actualizará al "
  + "volver la conexión; si repites la acción, no se duplicará.";

/**
 * Los mensajes de las reglas vienen del servidor en español (raise exception).
 * La falta de red o de sesión es una falla de sincronización. El error
 * conserva el código del servidor (por ejemplo, 42703).
 */
export function toRepositoryError(
  error: Pick<PostgrestError, "message" | "code">,
  operation: "write" | "read" = "write",
) {
  const message = error.message ?? "";
  const code = error.code ?? "";
  if (!code || /fetch|network|load failed/i.test(message)) {
    return new SyncError(operation === "write" ? NETWORK_WRITE : NETWORK_READ, code);
  }
  if (code === "28000" || code === "PGRST301" || code === "PGRST303") {
    return new SyncError("Tu sesión expiró. Vuelve a iniciar sesión.", code);
  }
  if (["P0001", "42501"].includes(code)) return new RejectedError(message, code);
  if (code === "23505") return new RejectedError("El cambio choca con otro registro. Actualiza e inténtalo de nuevo.", code);
  return new SyncError(`El servidor no aceptó la operación (${code}). Actualiza e inténtalo de nuevo.`, code);
}

type Query = PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>;

async function all<T>(build: (from: number, to: number) => Query): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw toRepositoryError(error, "read");
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Columna inexistente: la base todavía no tiene la migración que la agrega. */
const UNDEFINED_COLUMN = "42703";

async function fetchRows(client: SupabaseClient, user: { id: string; email: string }): Promise<DbRows> {
  const select = (name: string, columns: string, order: string[]) => all((from, to) => {
    let query = client.from(name).select(columns);
    for (const column of order) query = query.order(column);
    return query.range(from, to);
  });
  // Las columnas de ADR 0004 son opcionales: sin la migración, se leen las anteriores.
  const table = async (name: string, columns: string, order: string[], newer: string[] = []) => {
    if (!newer.length) return select(name, columns, order);
    try {
      return await select(name, [columns, ...newer].join(", "), order);
    } catch (error) {
      if (!(error instanceof SyncError) || error.code !== UNDEFINED_COLUMN) throw error;
      return select(name, columns, order);
    }
  };
  const [
    schools, memberships, profiles, courses, students, enrollments, roomTemplates,
    roomSlots, seatAssignments, sessions, sessionStudents, observations,
  ] = await Promise.all([
    table("schools", "id, name", ["id"], ["kind"]),
    table("school_memberships", "school_id, user_id, role, active", ["school_id", "user_id"]),
    table("profiles", "id, full_name, created_at", ["id"]),
    table("courses", "id, school_id, name, archived_at, created_at", ["id"]),
    table("students", "id, full_name, display_name", ["id"]),
    table("enrollments", "id, course_id, student_id, list_number, active", ["id"]),
    table("room_templates", "id, course_id, name, description, row_count, column_count, active, created_at", ["id"], ["layout"]),
    table("room_slots", "template_id, seat_row, seat_col, status", ["template_id", "seat_row", "seat_col"], ["group_label"]),
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

/** Tablas donde aparece cada operación que lleva su propio id. */
type OperationTable = "sessions" | "observations" | "roomTemplates";

/**
 * Operación con id propio cuyo resultado todavía no se ve en una lectura. Se
 * reutiliza si el docente la repite, para que el servidor no la duplique.
 */
type PendingOperation = { id: string; at: string; table: OperationTable };

/**
 * Persistencia en Supabase (ADR 0002 y 0003). Cada comando se valida con las
 * mismas reglas del modo local y luego se envía como una operación
 * transaccional. Solo se informa «Sincronizado» tras la respuesta del
 * servidor, y el estado mostrado es siempre el que el servidor confirmó.
 *
 * Guardar y releer son pasos distintos: si el servidor confirma y la relectura
 * falla, el cambio sigue guardado (StaleViewError). Si no hay respuesta, la
 * operación conserva su id hasta verse en el servidor, así que repetirla no
 * la duplica.
 */
export class SupabaseMonitoringRepository implements MonitoringRepository {
  readonly kind = "remote" as const;
  private state: MonitoringState | null = null;
  private index: RemoteIndex = { sessionUuid: new Map(), sessionSeq: new Map() };
  private account: RemoteAccount | null = null;
  private requested = 0;
  private applied = 0;
  private pending = new Map<string, PendingOperation>();
  private refreshSoon: (() => void) | null = null;

  constructor(
    private readonly client: SupabaseClient,
    private readonly user: { id: string; email: string },
    private readonly options: { retryDelayMs?: number } = {},
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
    const state = await this.refreshAfterWrite();
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
    let soon = 0;
    this.refreshSoon = () => {
      window.clearTimeout(soon);
      soon = window.setTimeout(update, STALE_RETRY_MS);
    };
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.clearInterval(timer);
      window.clearTimeout(soon);
      this.refreshSoon = null;
    };
  }

  /** Relee todo; si llegan dos lecturas, gana la más reciente. */
  private async refresh() {
    const request = ++this.requested;
    const rows = await fetchRows(this.client, this.user);
    // Lo que ya se ve en el servidor deja de estar pendiente: repetirlo es una
    // acción nueva.
    for (const [key, operation] of this.pending) {
      if (rows[operation.table].some((row) => row.id === operation.id)) this.pending.delete(key);
    }
    const mapped = mapRowsToState(rows);
    if (request > this.applied) {
      this.applied = request;
      this.state = mapped.state;
      this.index = mapped.index;
      this.account = mapped.account;
    }
    return this.state as MonitoringState;
  }

  /** El servidor ya confirmó: si releer falla, el cambio no se perdió. */
  private async refreshAfterWrite() {
    try {
      return await this.refresh();
    } catch {
      this.refreshSoon?.();
      throw new StaleViewError(SAVED_NOT_SHOWN);
    }
  }

  /**
   * Id de una operación: el mismo mientras no se vea en el servidor, para que
   * repetirla tras un corte no la duplique. `key` describe la acción.
   */
  private operation(table: OperationTable, key: unknown[]) {
    const name = JSON.stringify([table, ...key]);
    let operation = this.pending.get(name);
    if (!operation) {
      operation = { id: crypto.randomUUID(), at: new Date().toISOString(), table };
      this.pending.set(name, operation);
    }
    return { name, ...operation };
  }

  /** Una regla rechazó la operación: no se guardó y el próximo intento es nuevo. */
  private async tracked<T>(operation: { name: string }, write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      if (error instanceof RejectedError) this.pending.delete(operation.name);
      throw error;
    }
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
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 800));
        continue;
      }
      throw failure;
    }
  }

  private async send(command: MonitoringCommand, local: CommandResult): Promise<Record<string, unknown>> {
    switch (command.type) {
      case "createSession": {
        const { input } = command;
        const operation = this.operation("sessions", [
          input.courseId, input.roomTemplateId, input.date, input.module, input.objective, input.successCriteria,
        ]);
        const session = await this.tracked(operation, () => this.rpc<{ seq: number | string }>("start_session", {
          p_id: operation.id,
          p_course_id: input.courseId,
          p_room_template_id: input.roomTemplateId,
          p_date: input.date,
          p_module: input.module,
          p_objective: input.objective,
          p_success_criteria: input.successCriteria,
        }, true));
        return { sessionId: Number(session.seq) };
      }
      case "addObservation": {
        const { input } = command;
        const sessionId = this.sessionUuid(input.sessionId);
        const operation = this.operation("observations", [
          sessionId, input.studentId, input.round, input.code, input.progress ?? null, input.note ?? null,
        ]);
        await this.tracked(operation, () => this.rpc("record_observation", {
          p_id: operation.id,
          p_session_id: sessionId,
          p_enrollment_id: input.studentId,
          p_round: input.round,
          p_code: input.code,
          p_progress: input.progress ?? null,
          p_note: input.note ?? null,
          // La hora en que se observó, aunque se reintente después.
          p_observed_at: operation.at,
        }, true));
        return {};
      }
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
        const schoolId = command.spaceId
          ?? this.account?.personalSpaceId
          ?? this.account?.adminSchoolIds[0];
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
      case "createRoomTemplate": {
        const operation = this.operation("roomTemplates", [command.courseId, command.name, command.layout]);
        const roomTemplateId = await this.tracked(operation, () => this.rpc<string>("create_room_template", {
          p_id: operation.id,
          p_course_id: command.courseId,
          p_name: command.name,
          p_layout: command.layout.kind,
          p_rows: command.layout.rows,
          p_cols: command.layout.cols,
          p_slots: command.layout.slots,
        }, true));
        return { roomTemplateId };
      }
      case "updateRoomLayout": {
        const released = await this.rpc<number>("update_room_layout", {
          p_template_id: command.roomTemplateId,
          p_name: command.name,
          p_layout: command.layout.kind,
          p_rows: command.layout.rows,
          p_cols: command.layout.cols,
          p_slots: command.layout.slots,
        });
        return { released };
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
    await this.refreshAfterWrite();
    return result;
  }

  async updateProfileName(fullName: string) {
    await this.rpc("update_my_profile", { p_full_name: fullName });
    await this.refreshAfterWrite();
  }
}
