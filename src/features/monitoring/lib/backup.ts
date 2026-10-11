import { STORAGE_SCHEMA_VERSION } from "@/config/app";
import type { MonitoringState } from "@/types/monitoring";
import { isRecord, parseMonitoringState } from "./state-validation";

export const BACKUP_FORMAT = "monitoreo-intensivo/respaldo";

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  state: MonitoringState;
};

/**
 * - `backup`: respaldo descargado desde Configuración.
 * - `storage`: copia cruda del almacenamiento del navegador.
 * - `legacy-site`: datos exportados del Site anterior, con la misma forma.
 */
export type BackupOrigin = "backup" | "storage" | "legacy-site";

export type BackupSummary = {
  teachers: number;
  courses: number;
  students: number;
  sessions: number;
  activeSessions: number;
  observations: number;
  firstDate: string | null;
  lastDate: string | null;
};

export type ParsedBackup =
  | {
      ok: true;
      origin: BackupOrigin;
      state: MonitoringState;
      summary: BackupSummary;
      warnings: string[];
    }
  | { ok: false; error: string };

export function createBackup(state: MonitoringState, exportedAt = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    state,
  };
}

function localDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function backupFileName(prefix = "monitoreo-respaldo", date = new Date()) {
  return `${prefix}-${localDate(date)}.json`;
}

export function summarizeState(state: MonitoringState): BackupSummary {
  const dates = state.sessions.map((session) => session.date).sort();
  return {
    teachers: state.teachers.length,
    courses: state.courses.length,
    students: state.students.length,
    sessions: state.sessions.length,
    activeSessions: state.sessions.filter((session) => session.status === "active").length,
    observations: state.observations.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Referencias rotas, contadas sin nombrar estudiantes: los ids pueden
 * contener nombres. Los datos se conservan tal como vienen.
 */
export function referenceWarnings(state: MonitoringState): string[] {
  const courseIds = new Set(state.courses.map((course) => course.id));
  const studentIds = new Set(state.students.map((student) => student.id));
  const sessionIds = new Set(state.sessions.map((session) => session.id));
  const templateIds = new Set(state.roomTemplates.map((template) => template.id));
  const roster = new Set(
    state.sessionStudents.map((row) => `${row.sessionId}:${row.studentId}`),
  );
  const checks: Array<[number, string, string]> = [
    [
      state.students.filter((student) => !courseIds.has(student.courseId)).length,
      "estudiante sin curso existente",
      "estudiantes sin curso existente",
    ],
    [
      state.sessions.filter((session) => !courseIds.has(session.courseId)).length,
      "clase sin curso existente",
      "clases sin curso existente",
    ],
    [
      state.sessionStudents.filter(
        (row) => !sessionIds.has(row.sessionId) || !studentIds.has(row.studentId),
      ).length,
      "fila de asistencia sin clase o estudiante",
      "filas de asistencia sin clase o estudiante",
    ],
    [
      state.observations.filter(
        (row) => !roster.has(`${row.sessionId}:${row.studentId}`),
      ).length,
      "observación fuera de la nómina de su clase; no se contará en los informes",
      "observaciones fuera de la nómina de su clase; no se contarán en los informes",
    ],
    [
      state.seatAssignments.filter(
        (row) => !templateIds.has(row.templateId) || !studentIds.has(row.studentId),
      ).length,
      "puesto asignado sin plantilla o estudiante",
      "puestos asignados sin plantilla o estudiante",
    ],
  ];
  return checks
    .filter(([count]) => count > 0)
    .map(([count, singular, pluralForm]) => plural(count, singular, pluralForm));
}

function versionError(version: number) {
  return version > STORAGE_SCHEMA_VERSION
    ? "Este respaldo es de una versión más nueva de la aplicación. Recarga la página e inténtalo de nuevo."
    : "Este respaldo es de una versión anterior que esta aplicación no sabe convertir.";
}

/** Reconoce un respaldo, una copia del almacenamiento o la exportación del Site anterior. */
export function parseBackupText(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "El archivo no parece un respaldo de Monitoreo PI." };
  }

  let origin: BackupOrigin;
  let rawState: unknown;
  if (parsed.format === BACKUP_FORMAT) {
    const version = Number(parsed.schemaVersion);
    if (version !== STORAGE_SCHEMA_VERSION) return { ok: false, error: versionError(version) };
    origin = "backup";
    rawState = parsed.state;
  } else if (typeof parsed.version === "number" && isRecord(parsed.state)) {
    if (parsed.version !== STORAGE_SCHEMA_VERSION) {
      return { ok: false, error: versionError(parsed.version) };
    }
    origin = "storage";
    rawState = parsed.state;
  } else if (Array.isArray(parsed.students) && Array.isArray(parsed.sessions)) {
    origin = "legacy-site";
    rawState = parsed;
  } else {
    return { ok: false, error: "El archivo no parece un respaldo de Monitoreo PI." };
  }

  const result = parseMonitoringState(rawState);
  if (!result.ok) {
    return { ok: false, error: `El archivo no tiene el formato esperado (${result.error})` };
  }
  return {
    ok: true,
    origin,
    state: result.state,
    summary: summarizeState(result.state),
    warnings: referenceWarnings(result.state),
  };
}
