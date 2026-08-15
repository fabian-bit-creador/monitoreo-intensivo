"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMonitoringRepository } from "@/features/monitoring/repositories";
import type { MonitoringState } from "@/types/monitoring";

type MutationResult = { state: MonitoringState } & Record<string, unknown>;

export function useMonitoringStore() {
  const repositoryRef = useRef(createMonitoringRepository());
  const stateRef = useRef<MonitoringState | null>(null);
  const [data, setData] = useState<MonitoringState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const state = await repositoryRef.current.load();
      stateRef.current = state;
      setData(state);
      setError("");
    } catch {
      setError("No fue posible cargar los datos del monitoreo.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const apply = useCallback(async <T extends MutationResult>(
    operation: (state: MonitoringState) => T,
  ): Promise<T | null> => {
    if (!stateRef.current) return null;
    setBusy(true);
    try {
      const result = operation(stateRef.current);
      await repositoryRef.current.save(result.state);
      stateRef.current = result.state;
      setData(result.state);
      setError("");
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible guardar el cambio.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    data,
    error,
    busy,
    reload,
    apply,
    setError,
  };
}
