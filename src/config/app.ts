import type { MonitoringCode } from "@/types/monitoring";

export const APP_NAME = "Monitoreo Intensivo";
/** Bajo el ícono en la pantalla de inicio del celular, donde el nombre completo se corta. */
export const APP_SHORT_NAME = "Monitoreo";
export const DEMO_COURSE_ID = "iiia-2026";
export const DEFAULT_TEACHER_ID = "fabian-herrera";
export const DEFAULT_ROOM_TEMPLATE_ID = "sala-habitual-iiia-2026";
export const WORKSHOP_ROOM_TEMPLATE_ID = "taller-empresarial-iiia-2026";
export const LOCAL_STORAGE_KEY = "monitoreo-intensivo:v1";
export const STORAGE_SCHEMA_VERSION = 1;

export const CODE_META: Record<MonitoringCode, { label: string; detail: string }> = {
  I: {
    label: "Requiere apoyo",
    detail: "La evidencia muestra que necesita orientación para avanzar",
  },
  R: {
    label: "En desarrollo",
    detail: "Hay evidencia parcial; requiere retroalimentación y nueva comprobación",
  },
  C: {
    label: "Indicador demostrado",
    detail: "La evidencia observada satisface el criterio definido",
  },
};
