"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createMonitoringRepository,
  StorageWriteError,
  type BlockedReason,
  type LoadResult,
  type SavedCopyKind,
} from "@/features/monitoring/repositories";
import type { CommandResult, MonitoringCommand } from "@/features/monitoring/lib/commands";
import type { MonitoringState } from "@/types/monitoring";

/** Estado de guardado que se muestra en la barra superior (ADR 0002). */
export type PersistenceStatus = {
  state: "saved" | "error";
  savedAt: string | null;
};

export type BlockedStorage = { reason: BlockedReason; raw: string };

export function useMonitoringStore() {
  const [repository] = useState(createMonitoringRepository);
  const [data, setData] = useState<MonitoringState | null>(null);
  const [blocked, setBlocked] = useState<BlockedStorage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [persistence, setPersistence] = useState<PersistenceStatus>({
    state: "saved",
    savedAt: null,
  });

  const showLoaded = useCallback((result: LoadResult) => {
    if (result.status === "blocked") {
      setBlocked({ reason: result.reason, raw: result.raw });
      return;
    }
    setBlocked(null);
    setData(result.state);
    setPersistence({ state: result.savedAt ? "saved" : "error", savedAt: result.savedAt });
    setError("");
  }, []);

  const showLoadError = useCallback(() => {
    setError("No fue posible cargar los datos del monitoreo.");
  }, []);

  const reload = useCallback(
    () => repository.load().then(showLoaded, showLoadError),
    [repository, showLoadError, showLoaded],
  );

  useEffect(() => {
    let active = true;
    repository.load().then(
      (result) => active && showLoaded(result),
      () => active && showLoadError(),
    );
    return () => {
      active = false;
    };
  }, [repository, showLoadError, showLoaded]);

  // Cambios guardados por otra pestaña.
  useEffect(() => repository.subscribe((result) => {
    if (result.status === "blocked") {
      setBlocked({ reason: result.reason, raw: result.raw });
      return;
    }
    setData(result.state);
    setPersistence({ state: "saved", savedAt: result.savedAt });
  }), [repository]);

  const fail = useCallback((caught: unknown, fallback: string) => {
    setError(caught instanceof Error ? caught.message : fallback);
    if (caught instanceof StorageWriteError) {
      setPersistence((current) => ({ ...current, state: "error" }));
    }
  }, []);

  const execute = useCallback(async <C extends MonitoringCommand>(
    command: C,
  ): Promise<CommandResult<C> | null> => {
    setBusy(true);
    try {
      const result = await repository.execute(command);
      setData(result.state);
      setPersistence({ state: "saved", savedAt: new Date().toISOString() });
      setError("");
      return result;
    } catch (caught) {
      fail(caught, "No fue posible guardar el cambio.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [fail, repository]);

  const restore = useCallback(async (state: MonitoringState) => {
    setBusy(true);
    try {
      const result = await repository.replaceState(state);
      setData(state);
      setPersistence({ state: "saved", savedAt: new Date().toISOString() });
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
    setBusy(true);
    try {
      const state = await repository.resetToDemo();
      setBlocked(null);
      setData(state);
      setPersistence({ state: "saved", savedAt: new Date().toISOString() });
      setError("");
      return state;
    } catch (caught) {
      fail(caught, "No fue posible empezar de nuevo.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [fail, repository]);

  const listSavedCopies = useCallback(() => repository.listSavedCopies(), [repository]);
  const deleteSavedCopy = useCallback(
    (kind: SavedCopyKind) => repository.deleteSavedCopy(kind),
    [repository],
  );

  return {
    data,
    blocked,
    error,
    busy,
    persistence,
    reload,
    execute,
    restore,
    resetToDemo,
    listSavedCopies,
    deleteSavedCopy,
    setError,
  };
}
