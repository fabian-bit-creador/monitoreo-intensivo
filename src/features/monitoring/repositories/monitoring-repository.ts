import type { CommandResult, MonitoringCommand } from "../lib/commands";
import type { MonitoringState } from "@/types/monitoring";
import type { RemoteAccount } from "./supabase-mapping";

/**
 * - `newer-version`: los datos los guardó una versión más nueva de la aplicación.
 * - `unreadable`: los datos guardados no se pueden leer.
 * En ambos casos no se escribe nada hasta que el docente decida.
 */
export type BlockedReason = "newer-version" | "unreadable";

export type LoadResult =
  | { status: "ready"; state: MonitoringState; savedAt: string | null }
  | { status: "blocked"; reason: BlockedReason; raw: string };

export interface MonitoringRepository {
  /** `local`: este navegador. `remote`: servidor compartido (Supabase). */
  readonly kind: "local" | "remote";
  load(): Promise<LoadResult>;
  /** Aplica una operación del docente sobre los datos más recientes y la guarda. */
  execute<C extends MonitoringCommand>(command: C): Promise<CommandResult<C>>;
  /** Avisa cuando otra pestaña o dispositivo cambia los datos. */
  subscribe(listener: (result: LoadResult) => void): () => void;
  /** Cuenta autenticada, solo en modo servidor. */
  getAccount?(): RemoteAccount | null;
}

/**
 * - `restore`: datos reemplazados al restaurar un respaldo.
 * - `recovery`: datos ilegibles conservados al empezar de nuevo.
 */
export type SavedCopyKind = "restore" | "recovery";

export type SavedCopy = { kind: SavedCopyKind; savedAt: string; raw: string };

/** Capacidades propias del modo local: respaldo y recuperación en el navegador. */
export interface LocalBackupStore {
  /** Reemplaza todos los datos y conserva una copia de los anteriores si hay espacio. */
  replaceState(state: MonitoringState): Promise<{ copyKept: boolean }>;
  /** Solo desde datos ilegibles: conserva una copia y vuelve a la demostración. */
  resetToDemo(): Promise<MonitoringState>;
  listSavedCopies(): Promise<SavedCopy[]>;
  deleteSavedCopy(kind: SavedCopyKind): Promise<void>;
}

/** Fallo al escribir en el almacenamiento, distinto de una regla del dominio. */
export class StorageWriteError extends Error {}

/** Sin conexión o sin sesión: el cambio no llegó al servidor. */
export class SyncError extends Error {}
