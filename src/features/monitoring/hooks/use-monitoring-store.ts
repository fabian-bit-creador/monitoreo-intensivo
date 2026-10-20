"use client";

import { useCallback, useEffect, useState } from "react";
import {
  StaleViewError,
  StorageWriteError,
  SyncError,
  type BlockedReason,
  type LoadResult,
  type LocalBackupStore,
  type MonitoringRepository,
  type RemoteAccount,
  type SavedCopyKind,
} from "@/features/monitoring/repositories";
import type { CommandResult, MonitoringCommand } from "@/features/monitoring/lib/commands";
import type { MonitoringState } from "@/types/monitoring";

/**
 * Estado de guardado que se muestra en la barra superior (ADR 0002).
 * - local: «Guardado local» o «Sin guardar».
 * - remote: «Guardando…» mientras espera, «Sincronizado» solo con la
 *   confirmación del servidor, o «Sin sincronizar» si falló.
 */
export type PersistenceStatus = {
  mode: "local" | "remote";
  state: "saved" | "saving" | "error";
  savedAt: string | null;
};

export type BlockedStorage = { reason: BlockedReason; raw: string };

export type StoreRepository = MonitoringRepository & Partial<LocalBackupStore>;

export function useMonitoringStore(createRepository: () => StoreRepository) {
  const [repository] = useState(createRepository);
  const [data, setData] = useState<MonitoringState | null>(null);
  const [account, setAccount] = useState<RemoteAccount | null>(null);
  const [blocked, setBlocked] = useState<BlockedStorage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [persistence, setPersistence] = useState<PersistenceStatus>({
    mode: repository.kind,
    state: "saved",
    savedAt: null,
  });
  // Aviso informativo, distinto de un error: «guardado, falta actualizar la
  // pantalla». Se retira solo cuando llegan los datos releídos.
  const [notice, setNotice] = useState("");

  const showLoaded = useCallback((result: LoadResult) => {
    if (result.status === "blocked") {
      setBlocked({ reason: result.reason, raw: result.raw });
      return;
    }
    setBlocked(null);
    setNotice("");
    setData(result.state);
    setAccount(repository.getAccount?.() ?? null);
    setPersistence({ mode: repository.kind, state: result.savedAt ? "saved" : "error", savedAt: result.savedAt });
    setError("");
  }, [repository]);

  const showLoadError = useCallback((caught: unknown) => {
    setError(caught instanceof Error ? caught.message : "No fue posible cargar los datos del monitoreo.");
  }, []);

  const reload = useCallback(
    () => repository.load().then(showLoaded, showLoadError),
    [repository, showLoadError, showLoaded],
  );

  useEffect(() => {
    let active = true;
    repository.load().then(
      (result) => active && showLoaded(result),
      (caught) => active && showLoadError(caught),
    );
    return () => {
      active = false;
    };
  }, [repository, showLoadError, showLoaded]);

  // Cambios guardados por otra pestaña u otro dispositivo.
  useEffect(() => repository.subscribe((result) => {
    if (result.status === "blocked") {
      setBlocked({ reason: result.reason, raw: result.raw });
      return;
    }
    setData(result.state);
    setAccount(repository.getAccount?.() ?? null);
    setPersistence((current) => (
      current.state === "saving" ? current : { ...current, state: "saved", savedAt: result.savedAt }
    ));
    setNotice("");
  }), [repository]);

  const fail = useCallback((caught: unknown, fallback: string) => {
    // El servidor confirmó: no es un error, solo falta mostrar el cambio.
    if (caught instanceof StaleViewError) {
      setNotice(caught.message);
      setPersistence((current) => ({ ...current, state: "saved", savedAt: new Date().toISOString() }));
      return;
    }
    setError(caught instanceof Error ? caught.message : fallback);
    // Una regla rechazada no es una falla de guardado: lo confirmado sigue igual.
    const failedToPersist = caught instanceof StorageWriteError || caught instanceof SyncError;
    setPersistence((current) => ({
      ...current,
      state: failedToPersist ? "error" : current.state === "saving" ? "saved" : current.state,
    }));
  }, []);

  /**
   * `onStaleSave`: el servidor confirmó, pero la pantalla todavía no muestra el
   * cambio. Sirve para cerrar lo que se cierra al guardar (por ejemplo, la
   * hoja de registro); el resultado sigue siendo null.
   */
  const execute = useCallback(async <C extends MonitoringCommand>(
    command: C,
    options: { onStaleSave?: () => void } = {},
  ): Promise<CommandResult<C> | null> => {
    setBusy(true);
    if (repository.kind === "remote") setPersistence((current) => ({ ...current, state: "saving" }));
    try {
      const result = await repository.execute(command);
      setData(result.state);
      setAccount(repository.getAccount?.() ?? null);
      setPersistence({ mode: repository.kind, state: "saved", savedAt: new Date().toISOString() });
      setError("");
      setNotice("");
      return result;
    } catch (caught) {
      fail(caught, "No fue posible guardar el cambio.");
      if (caught instanceof StaleViewError) options.onStaleSave?.();
      return null;
    } finally {
      setBusy(false);
    }
  }, [fail, repository]);

  /** Para operaciones propias de un repositorio, como importar al servidor. */
  const run = useCallback(async <T>(task: () => Promise<T>, fallback: string): Promise<T | null> => {
    setBusy(true);
    try {
      const value = await task();
      showLoaded(await repository.load());
      return value;
    } catch (caught) {
      fail(caught, fallback);
      return null;
    } finally {
      setBusy(false);
    }
  }, [fail, repository, showLoaded]);

  const restore = useCallback(async (state: MonitoringState) => {
    if (!repository.replaceState) return null;
    setBusy(true);
    try {
      const result = await repository.replaceState(state);
      setData(state);
      setPersistence({ mode: repository.kind, state: "saved", savedAt: new Date().toISOString() });
      setError("");
      return result;
    } catch (caught) {
      fail(caught, "No fue posible restaurar el respaldo.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [fail, repository]);

  const resetToDemo = useCallback(async () => {
    if (!repository.resetToDemo) return null;
    setBusy(true);
    try {
      const state = await repository.resetToDemo();
      setBlocked(null);
      setData(state);
      setPersistence({ mode: repository.kind, state: "saved", savedAt: new Date().toISOString() });
      setError("");
      return state;
    } catch (caught) {
      fail(caught, "No fue posible empezar de nuevo.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [fail, repository]);

  const listSavedCopies = useCallback(
    () => repository.listSavedCopies?.() ?? Promise.resolve([]),
    [repository],
  );
  const deleteSavedCopy = useCallback(
    (kind: SavedCopyKind) => repository.deleteSavedCopy?.(kind) ?? Promise.resolve(),
    [repository],
  );

  return {
    repository,
    data,
    account,
    blocked,
    error,
    busy,
    persistence,
    localBackup: Boolean(repository.replaceState),
    reload,
    execute,
    run,
    restore,
    resetToDemo,
    listSavedCopies,
    deleteSavedCopy,
    setError,
    notice,
    setNotice,
  };
}
