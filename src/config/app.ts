import type { MonitoringCode } from "@/types/monitoring";

export const APP_NAME = "Monitoreo PI";
export const APP_SUBTITLE = "Práctica independiente";
export const DEMO_COURSE_ID = "iiia-2026";
export const DEFAULT_TEACHER_ID = "fabian-herrera";
export const DEFAULT_ROOM_TEMPLATE_ID = "sala-habitual-iiia-2026";
export const WORKSHOP_ROOM_TEMPLATE_ID = "taller-empresarial-iiia-2026";
export const LOCAL_STORAGE_KEY = "monitoreo-intensivo:v1";
export const STORAGE_SCHEMA_VERSION = 1;

export const CODE_META: Record<MonitoringCode, { label: string; detail: string }> = {
  I: {
    label: "En instrucciones",
    detail: "Aún no inicia o requiere reorientación",
  },
  R: {
    label: "En revisión",
    detail: "Producto en avance",
  },
  C: {
    label: "Correcto",
    detail: "Criterios de éxito comprobados",
  },
};
