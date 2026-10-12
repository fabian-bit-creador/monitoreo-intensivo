import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { APP_NAME, APP_SHORT_NAME } from "./app";
import { ISOTYPE_PATHS } from "./brand";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const WITH_FULL_SYMBOL = [
  "public/brand/isotipo.svg",
  "public/brand/isotipo-oscuro.svg",
  "public/brand/isotipo-marino.svg",
  "public/brand/isotipo-blanco.svg",
  "public/brand/horizontal.svg",
  "public/brand/horizontal-oscuro.svg",
  "public/brand/apilada.svg",
  "public/brand/apilada-oscura.svg",
  "public/brand/icono-app.svg",
];

describe("marca", () => {
  it("el nombre oficial es exacto", () => {
    expect(APP_NAME).toBe("Monitoreo Intensivo");
    expect(APP_SHORT_NAME).toBe("Monitoreo");
  });

  it.each(WITH_FULL_SYMBOL)("%s usa la misma geometría que la app", (file) => {
    const svg = read(file);
    for (const d of Object.values(ISOTYPE_PATHS)) expect(svg).toContain(`d="${d}"`);
    expect(svg).toContain("<title>Monitoreo Intensivo</title>");
    expect(svg).not.toMatch(/<script|on\w+=|href=/i);
  });

  it("el favicon pequeño conserva el avance y el check", () => {
    const svg = read("src/app/icon.svg");
    expect(svg).toContain(`d="${ISOTYPE_PATHS.progress}"`);
    expect(svg).toContain(`d="${ISOTYPE_PATHS.check}"`);
  });

  it("el manifest usa el nombre oficial y sus íconos existen", () => {
    const app = manifest();
    expect(app.name).toBe(APP_NAME);
    expect(app.short_name).toBe(APP_SHORT_NAME);
    expect(app.icons?.length).toBeGreaterThan(0);
    for (const icon of app.icons ?? []) expect(existsSync(path.join(root, "public", icon.src))).toBe(true);
    expect(app.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
