/**
 * Identidad de Monitoreo Intensivo (ADR 0005, docs/marca.md). La geometría del
 * isotipo debe coincidir con scripts/generar-marca.mjs y public/brand;
 * brand.test.ts lo comprueba.
 */
export const BRAND_COLORS = { navy: "#17375E", teal: "#1E8E89" } as const;

/** Cuadrícula 128, radio 44, trazo 12: anillo, avance y check. */
export const ISOTYPE_PATHS = {
  ring: "M 75.39 106.50 A 44 44 0 1 1 92.28 30.29",
  progress: "M 105.35 79.05 A 44 44 0 0 1 75.39 106.50",
  check: "M 38 65 L 56 83 L 96 40",
} as const;
