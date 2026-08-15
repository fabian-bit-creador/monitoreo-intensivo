import type { MonitoringState } from "@/types/monitoring";

export interface MonitoringRepository {
  load(): Promise<MonitoringState>;
  save(state: MonitoringState): Promise<void>;
}
