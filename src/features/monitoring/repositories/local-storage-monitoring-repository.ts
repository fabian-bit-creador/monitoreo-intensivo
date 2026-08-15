import {
  LOCAL_STORAGE_KEY,
  STORAGE_SCHEMA_VERSION,
} from "@/config/app";
import { createDemoState } from "@/data/demo-state";
import type { MonitoringState } from "@/types/monitoring";
import type { MonitoringRepository } from "./monitoring-repository";

type StorageEnvelope = {
  version: number;
  state: MonitoringState;
};

function isState(value: unknown): value is MonitoringState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MonitoringState>;
  return Array.isArray(candidate.students)
    && Array.isArray(candidate.sessions)
    && Array.isArray(candidate.observations)
    && Array.isArray(candidate.courses)
    && Array.isArray(candidate.teachers);
}

export class LocalStorageMonitoringRepository implements MonitoringRepository {
  private memoryState = createDemoState();

  async load() {
    if (typeof window === "undefined") return createDemoState();

    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        await this.save(this.memoryState);
        return structuredClone(this.memoryState);
      }

      const envelope = JSON.parse(raw) as StorageEnvelope;
      if (envelope.version !== STORAGE_SCHEMA_VERSION || !isState(envelope.state)) {
        await this.save(this.memoryState);
        return structuredClone(this.memoryState);
      }

      this.memoryState = envelope.state;
      return structuredClone(envelope.state);
    } catch {
      return structuredClone(this.memoryState);
    }
  }

  async save(state: MonitoringState) {
    this.memoryState = structuredClone(state);
    if (typeof window === "undefined") return;

    const envelope: StorageEnvelope = {
      version: STORAGE_SCHEMA_VERSION,
      state,
    };
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(envelope));
  }
}
