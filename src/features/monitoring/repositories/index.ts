import { LocalStorageMonitoringRepository } from "./local-storage-monitoring-repository";
import type { MonitoringRepository } from "./monitoring-repository";

export function createMonitoringRepository(): MonitoringRepository {
  return new LocalStorageMonitoringRepository();
}

export type { MonitoringRepository } from "./monitoring-repository";
