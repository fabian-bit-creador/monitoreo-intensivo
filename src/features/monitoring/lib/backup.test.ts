import { describe, expect, it } from "vitest";
import { STORAGE_SCHEMA_VERSION } from "@/config/app";
import { createDemoState } from "@/data/demo-state";
import type { MonitoringState } from "@/types/monitoring";
import {
  BACKUP_FORMAT,
  backupFileName,
  createBackup,
  parseBackupText,
  referenceWarnings,
  summarizeState,
} from "./backup";
import { buildSession, buildState, observationRows, presenceRows } from "./test-fixtures";

function sampleState(): MonitoringState {
  const state = buildState();
  state.sessions = [
    buildSession({ id: 2, date: "2026-09-02", status: "active" }),
    buildSession({ id: 1, date: "2026-08-20", status: "closed", closedAt: "2026-08-20T15:00:00.000Z" }),
  ];
  state.sessionStudents = [...presenceRows(1, ["a", "b"]), ...presenceRows(2, ["a", "b"])];
  state.observations = observationRows([
    { studentId: "a", code: "I", sessionId: 1 },
    { studentId: "a", code: "C", sessionId: 2 },
  ]);
  return state;
}

/** Misma forma que entrega el Site anterior: sin envoltorio, estudiantes con createdAt y fuente sin modo. */
function legacySiteExport(state: MonitoringState) {
  const { mode: _mode, ...source } = state.source;
  void _mode;
  return {
    ...state,
    students: state.students.map((student) => ({ ...student, createdAt: "2026-08-15T10:00:00.000Z" })),
    source,
  };
}

describe("createBackup y parseBackupText", () => {
  it("un respaldo descargado se restaura idéntico", () => {
    const backup = createBackup(sampleState(), new Date("2026-10-11T12:00:00.000Z"));

    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      exportedAt: "2026-10-11T12:00:00.000Z",
    });
    expect(parseBackupText(JSON.stringify(backup))).toEqual({
      ok: true,
      origin: "backup",
      state: sampleState(),
      summary: summarizeState(sampleState()),
      warnings: [],
    });
  });

  it("reconoce una copia cruda del almacenamiento del navegador", () => {
    const raw = JSON.stringify({ version: STORAGE_SCHEMA_VERSION, revision: 3, state: sampleState() });
    expect(parseBackupText(raw)).toMatchObject({ ok: true, origin: "storage", state: sampleState() });
  });

  it("reconoce los datos exportados del Site anterior y los normaliza", () => {
    const demo = createDemoState();
    const result = parseBackupText(JSON.stringify(legacySiteExport(demo)));

    expect(result).toMatchObject({ ok: true, origin: "legacy-site", warnings: [] });
    if (!result.ok) throw new Error(result.error);
    expect(result.state).toEqual({ ...demo, source: { ...demo.source, mode: "imported" } });
    expect(result.state.students[0]).not.toHaveProperty("createdAt");
  });

  it.each([
    ["no es JSON", "{", "El archivo no es un JSON válido."],
    ["es una lista", "[]", "El archivo no parece un respaldo de Monitoreo Intensivo."],
    ["es otro tipo de archivo", JSON.stringify({ nombre: "otro" }), "El archivo no parece un respaldo de Monitoreo Intensivo."],
    [
      "respaldo de una versión más nueva",
      JSON.stringify({ ...createBackup(sampleState()), schemaVersion: STORAGE_SCHEMA_VERSION + 1 }),
      "Este respaldo es de una versión más nueva de la aplicación. Recarga la página e inténtalo de nuevo.",
    ],
    [
      "copia del almacenamiento de una versión más nueva",
      JSON.stringify({ version: STORAGE_SCHEMA_VERSION + 1, state: sampleState() }),
      "Este respaldo es de una versión más nueva de la aplicación. Recarga la página e inténtalo de nuevo.",
    ],
    [
      "contenido con un código inválido",
      JSON.stringify(createBackup({ ...sampleState(), observations: [{ ...sampleState().observations[0], code: "X" as "I" }] })),
      "El archivo no tiene el formato esperado (observations[0].code: se esperaba I, R, C.)",
    ],
  ])("rechaza: %s", (_case, text, error) => {
    expect(parseBackupText(text)).toEqual({ ok: false, error });
  });
});

describe("summarizeState", () => {
  it("cuenta datos, clases en curso y el período de clases", () => {
    expect(summarizeState(sampleState())).toEqual({
      teachers: 2,
      courses: 2,
      students: 6,
      sessions: 2,
      activeSessions: 1,
      observations: 2,
      firstDate: "2026-08-20",
      lastDate: "2026-09-02",
    });
  });

  it("sin clases no informa período", () => {
    expect(summarizeState(buildState())).toMatchObject({ sessions: 0, firstDate: null, lastDate: null });
  });
});

describe("referenceWarnings", () => {
  it("un estado coherente no tiene avisos", () => {
    expect(referenceWarnings(sampleState())).toEqual([]);
    expect(referenceWarnings(createDemoState())).toEqual([]);
  });

  it("cuenta referencias rotas sin nombrar estudiantes", () => {
    const state = sampleState();
    state.students.push({ ...state.students[0], id: "huerfano-ana-rivas", courseId: "no-existe" });
    state.sessions.push(buildSession({ id: 3, courseId: "no-existe" }));
    state.sessionStudents.push({ sessionId: 99, studentId: "a", present: true });
    state.observations.push(
      { ...state.observations[0], id: 10, studentId: "c" },
      { ...state.observations[0], id: 11, studentId: "d" },
    );
    state.seatAssignments.push({ templateId: "no-existe", studentId: "a", seatRow: 0, seatCol: 0 });

    const warnings = referenceWarnings(state);

    expect(warnings).toEqual([
      "1 estudiante sin curso existente",
      "1 clase sin curso existente",
      "1 fila de asistencia sin clase o estudiante",
      "2 observaciones fuera de la nómina de su clase; no se contarán en los informes",
      "1 puesto asignado sin plantilla o estudiante",
    ]);
    expect(warnings.join(" ")).not.toContain("ana-rivas");
  });
});

describe("backupFileName", () => {
  it("usa la fecha local y el prefijo indicado", () => {
    const date = new Date(2026, 9, 5, 23, 30);
    expect(backupFileName(undefined, date)).toBe("monitoreo-respaldo-2026-10-05.json");
    expect(backupFileName("monitoreo-copia", date)).toBe("monitoreo-copia-2026-10-05.json");
  });
});
