import {
  LocalStorageMonitoringRepository,
  type LocalRepositoryOptions,
  type StorageLike,
} from "./local-storage-monitoring-repository";

const blockedStorage: StorageLike = {
  getItem: () => {
    throw new Error("Almacenamiento bloqueado.");
  },
  setItem: () => {
    throw new Error("Almacenamiento bloqueado.");
  },
  removeItem: () => undefined,
};

function browserOptions(): LocalRepositoryOptions {
  if (typeof window === "undefined") return { storage: null };

  let storage: StorageLike;
  try {
    storage = window.localStorage;
  } catch {
    // Algunos navegadores lanzan un error si el almacenamiento está bloqueado:
    // cada lectura o escritura fallará y la barra superior lo mostrará.
    storage = blockedStorage;
  }
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;

  return {
    storage,
    runExclusive: locks
      ? <T>(name: string, task: () => T) => locks.request(name, () => task()) as Promise<T>
      : null,
    listen: (handler) => {
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea === storage) handler(event.key);
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}

export function createMonitoringRepository() {
  return new LocalStorageMonitoringRepository(browserOptions());
}

export type {
  BlockedReason,
  LoadResult,
  LocalBackupStore,
  MonitoringRepository,
  SavedCopy,
  SavedCopyKind,
} from "./monitoring-repository";
export { RejectedError, StaleViewError, StorageWriteError, SyncError } from "./monitoring-repository";
export { SupabaseMonitoringRepository } from "./supabase-monitoring-repository";
export type { RemoteAccount } from "./supabase-mapping";
