import {
  LOCAL_STORAGE_KEY,
  STORAGE_SCHEMA_VERSION,
} from "@/config/app";
import { createDemoState } from "@/data/demo-state";
import type { MonitoringState } from "@/types/monitoring";
import {
  applyCommand,
  type CommandResult,
  type MonitoringCommand,
} from "../lib/commands";
import { isRecord, parseMonitoringState } from "../lib/state-validation";
import {
  StorageWriteError,
  type BlockedReason,
  type LoadResult,
  type LocalBackupStore,
  type MonitoringRepository,
  type SavedCopy,
  type SavedCopyKind,
} from "./monitoring-repository";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LockRunner = <T>(name: string, task: () => T) => Promise<T>;

export type LocalRepositoryOptions = {
  /** `null` fuera del navegador: los datos viven solo en memoria. */
  storage: StorageLike | null;
  /** Exclusión entre pestañas (Web Locks API) cuando el navegador la ofrece. */
  runExclusive?: LockRunner | null;
  /** Suscripción al evento `storage`, que avisa cambios de otras pestañas. */
  listen?: ((handler: (key: string | null) => void) => () => void) | null;
  now?: () => Date;
};

type StorageEnvelope = {
  version: number;
  revision: number;
  savedAt: string;
  state: MonitoringState;
};

type StoredRead =
  | { kind: "empty" }
  | { kind: "ok"; revision: number; savedAt: string | null; state: MonitoringState }
  | { kind: "newer"; raw: string }
  | { kind: "unreadable"; raw: string };

const LOCK_NAME = `${LOCAL_STORAGE_KEY}:escritura`;

export const SAVED_COPY_KEYS: Record<SavedCopyKind, string> = {
  restore: `${LOCAL_STORAGE_KEY}:copia-restauracion`,
  recovery: `${LOCAL_STORAGE_KEY}:copia-recuperacion`,
};

const BLOCKED_MESSAGES: Record<BlockedReason, string> = {
  "newer-version":
    "Estos datos los guardó una versión más nueva de la aplicación. Recarga la página para no sobrescribirlos.",
  unreadable:
    "Los datos guardados no se pueden leer. Recarga la página para revisarlos antes de seguir.",
};

const WRITE_FAILED =
  "No se pudo guardar en este navegador: el almacenamiento está lleno o bloqueado. "
  + "Descarga un respaldo desde Configuración.";

const READ_FAILED =
  "No se pudo leer el almacenamiento de este navegador. Revisa si está bloqueado o en "
  + "navegación privada y descarga un respaldo desde Configuración.";

/**
 * Persistencia en `localStorage` (ADR 0002). Cada comando se aplica sobre lo
 * último guardado, no sobre la copia en memoria, para que dos pestañas no se
 * borren el trabajo. Nunca reemplaza datos que no puede leer.
 */
export class LocalStorageMonitoringRepository
implements MonitoringRepository, LocalBackupStore {
  private state: MonitoringState | null = null;
  private revision = 0;
  private blocked: BlockedReason | null = null;

  constructor(private readonly options: LocalRepositoryOptions) {}

  async load(): Promise<LoadResult> {
    const { storage } = this.options;
    if (!storage) {
      this.state = createDemoState();
      return { status: "ready", state: this.state, savedAt: null };
    }

    let read: StoredRead;
    try {
      read = this.read();
    } catch {
      // El navegador bloquea el almacenamiento: se trabaja en memoria y cada
      // intento de guardar mostrará el error.
      this.state = createDemoState();
      return { status: "ready", state: this.state, savedAt: null };
    }

    switch (read.kind) {
      case "empty": {
        const state = createDemoState();
        this.state = state;
        try {
          return { status: "ready", state, savedAt: this.write(state, 1) };
        } catch {
          return { status: "ready", state, savedAt: null };
        }
      }
      case "ok":
        this.blocked = null;
        this.state = read.state;
        this.revision = read.revision;
        return { status: "ready", state: read.state, savedAt: read.savedAt };
      case "newer":
        this.blocked = "newer-version";
        return { status: "blocked", reason: "newer-version", raw: read.raw };
      case "unreadable":
        this.blocked = "unreadable";
        return { status: "blocked", reason: "unreadable", raw: read.raw };
    }
  }

  execute<C extends MonitoringCommand>(command: C): Promise<CommandResult<C>> {
    return this.exclusive(() => {
      const result = applyCommand(this.latestForWrite(), command);
      this.write(result.state, this.revision + 1);
      return result;
    });
  }

  subscribe(listener: (result: LoadResult) => void) {
    if (!this.options.listen) return () => undefined;
    return this.options.listen((key) => {
      if (key !== LOCAL_STORAGE_KEY || this.blocked === "newer-version") return;
      let read: StoredRead;
      try {
        read = this.read();
      } catch {
        return;
      }
      if (read.kind === "ok" && read.revision !== this.revision) {
        this.state = read.state;
        this.revision = read.revision;
        listener({ status: "ready", state: read.state, savedAt: read.savedAt });
      } else if (read.kind === "newer") {
        this.blocked = "newer-version";
        listener({ status: "blocked", reason: "newer-version", raw: read.raw });
      }
      // Si otra pestaña borró los datos, la próxima escritura los repone.
    });
  }

  replaceState(state: MonitoringState) {
    return this.exclusive(() => {
      if (this.blocked) throw new Error(BLOCKED_MESSAGES[this.blocked]);
      const storage = this.requireStorage();
      const current = this.read();
      let copyKept = false;
      if (current.kind !== "empty") {
        copyKept = this.keepCopy("restore", storage.getItem(LOCAL_STORAGE_KEY) ?? "");
      }
      const revision = current.kind === "ok" ? Math.max(current.revision, this.revision) : this.revision;
      this.write(state, revision + 1);
      return { copyKept };
    });
  }

  resetToDemo() {
    return this.exclusive(() => {
      if (this.blocked !== "unreadable") {
        throw new Error("Solo se puede empezar de nuevo cuando los datos guardados no se pueden leer.");
      }
      const raw = this.requireStorage().getItem(LOCAL_STORAGE_KEY);
      // El docente ya descargó la copia; además se intenta conservar otra aquí.
      if (raw !== null) this.keepCopy("recovery", raw);
      const state = createDemoState();
      this.blocked = null;
      this.write(state, 1);
      return state;
    });
  }

  async listSavedCopies(): Promise<SavedCopy[]> {
    const storage = this.options.storage;
    if (!storage) return [];
    return (Object.keys(SAVED_COPY_KEYS) as SavedCopyKind[]).flatMap((kind) => {
      try {
        const parsed: unknown = JSON.parse(storage.getItem(SAVED_COPY_KEYS[kind]) ?? "null");
        return isRecord(parsed) && typeof parsed.raw === "string" && typeof parsed.savedAt === "string"
          ? [{ kind, savedAt: parsed.savedAt, raw: parsed.raw }]
          : [];
      } catch {
        return [];
      }
    });
  }

  async deleteSavedCopy(kind: SavedCopyKind) {
    try {
      this.options.storage?.removeItem(SAVED_COPY_KEYS[kind]);
    } catch {
      // Si el almacenamiento está bloqueado no hay copia que borrar.
    }
  }

  private read(): StoredRead {
    const raw = this.requireStorage().getItem(LOCAL_STORAGE_KEY);
    if (raw === null) return { kind: "empty" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: "unreadable", raw };
    }
    if (!isRecord(parsed) || typeof parsed.version !== "number") return { kind: "unreadable", raw };
    if (parsed.version > STORAGE_SCHEMA_VERSION) return { kind: "newer", raw };
    if (parsed.version !== STORAGE_SCHEMA_VERSION) return { kind: "unreadable", raw };
    const result = parseMonitoringState(parsed.state);
    if (!result.ok) return { kind: "unreadable", raw };
    return {
      kind: "ok",
      revision: Number.isInteger(parsed.revision) ? (parsed.revision as number) : 0,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
      state: result.state,
    };
  }

  /** El estado sobre el que se aplica un comando: siempre lo último guardado. */
  private latestForWrite(): MonitoringState {
    if (this.blocked) throw new Error(BLOCKED_MESSAGES[this.blocked]);
    if (!this.options.storage) {
      if (!this.state) throw new Error("Los datos todavía no se cargan.");
      return this.state;
    }
    let read: StoredRead;
    try {
      read = this.read();
    } catch {
      throw new StorageWriteError(READ_FAILED);
    }
    switch (read.kind) {
      case "ok":
        this.state = read.state;
        this.revision = read.revision;
        return read.state;
      case "empty":
        // Otra pestaña borró los datos: se repone la última versión conocida.
        if (!this.state) throw new Error("Los datos todavía no se cargan.");
        return this.state;
      case "newer":
        this.blocked = "newer-version";
        throw new Error(BLOCKED_MESSAGES["newer-version"]);
      case "unreadable":
        throw new Error(BLOCKED_MESSAGES.unreadable);
    }
  }

  /** Devuelve la hora de guardado. Si falla, no cambia nada en memoria. */
  private write(state: MonitoringState, revision: number) {
    const savedAt = (this.options.now?.() ?? new Date()).toISOString();
    const storage = this.options.storage;
    if (storage) {
      const envelope: StorageEnvelope = { version: STORAGE_SCHEMA_VERSION, revision, savedAt, state };
      try {
        storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(envelope));
      } catch {
        throw new StorageWriteError(WRITE_FAILED);
      }
    }
    this.state = state;
    this.revision = revision;
    return savedAt;
  }

  private keepCopy(kind: SavedCopyKind, raw: string) {
    const savedAt = (this.options.now?.() ?? new Date()).toISOString();
    try {
      this.requireStorage().setItem(SAVED_COPY_KEYS[kind], JSON.stringify({ savedAt, raw }));
      return true;
    } catch {
      return false;
    }
  }

  private requireStorage() {
    const { storage } = this.options;
    if (!storage) throw new Error("No hay almacenamiento disponible.");
    return storage;
  }

  private exclusive<T>(task: () => T): Promise<T> {
    const run = this.options.runExclusive;
    return run ? run(LOCK_NAME, task) : Promise.resolve().then(task);
  }
}
