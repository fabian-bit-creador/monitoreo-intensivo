import { describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_KEY, STORAGE_SCHEMA_VERSION } from "@/config/app";
import type { MonitoringState } from "@/types/monitoring";
import {
  buildSession,
  buildState,
  presenceRows,
} from "../lib/test-fixtures";
import {
  LocalStorageMonitoringRepository,
  SAVED_COPY_KEYS,
  type LockRunner,
  type StorageLike,
} from "./local-storage-monitoring-repository";
import { StorageWriteError, type LoadResult } from "./monitoring-repository";

const NOW = new Date("2026-10-11T12:00:00.000Z");

/** Estado con una clase activa del curso de prueba y su nómina completa. */
function stateWithSession(): MonitoringState {
  const state = buildState();
  state.sessions = [buildSession({ id: 1 })];
  state.sessionStudents = presenceRows(1, ["a", "b", "c", "d"]);
  return state;
}

function envelope(state: MonitoringState, revision = 1, version = STORAGE_SCHEMA_VERSION) {
  return JSON.stringify({ version, revision, savedAt: NOW.toISOString(), state });
}

/** Almacenamiento compartido por varias pestañas simuladas del mismo navegador. */
class FakeBrowser {
  readonly items = new Map<string, string>();
  readonly failingKeys = new Set<string>();
  readonly lockNames: string[] = [];
  private readonly tabs: Array<Set<(key: string | null) => void>> = [];
  private queue: Promise<unknown> = Promise.resolve();

  private readonly runExclusive: LockRunner = <T>(name: string, task: () => T) => {
    this.lockNames.push(name);
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  };

  get stored() {
    return this.items.get(LOCAL_STORAGE_KEY) ?? null;
  }

  storedState(): MonitoringState {
    return JSON.parse(this.stored ?? "null").state;
  }

  /** Escritura hecha por otra pestaña: avisa a todas las que escuchan. */
  writeFromElsewhere(key: string, value: string | null) {
    if (value === null) this.items.delete(key);
    else this.items.set(key, value);
    this.tabs.forEach((handlers) => handlers.forEach((handler) => handler(key)));
  }

  openTab() {
    const handlers = new Set<(key: string | null) => void>();
    this.tabs.push(handlers);
    const notifyOthers = (key: string) => this.tabs
      .filter((tab) => tab !== handlers)
      .forEach((tab) => tab.forEach((handler) => handler(key)));
    const storage: StorageLike = {
      getItem: (key) => this.items.get(key) ?? null,
      setItem: (key, value) => {
        if (this.failingKeys.has(key)) throw new DOMException("Quota", "QuotaExceededError");
        this.items.set(key, value);
        notifyOthers(key);
      },
      removeItem: (key) => {
        this.items.delete(key);
        notifyOthers(key);
      },
    };
    return new LocalStorageMonitoringRepository({
      storage,
      runExclusive: this.runExclusive,
      listen: (handler) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      now: () => NOW,
    });
  }
}

function readyState(result: LoadResult) {
  if (result.status !== "ready") throw new Error(`Se esperaba ready y llegó ${result.status}`);
  return result.state;
}

describe("carga", () => {
  it("sin datos guardados, carga la demostración y la guarda", async () => {
    const browser = new FakeBrowser();
    const result = await browser.openTab().load();

    expect(result.status).toBe("ready");
    expect(readyState(result).students.length).toBeGreaterThan(0);
    const saved = JSON.parse(browser.stored ?? "null");
    expect(saved).toMatchObject({ version: STORAGE_SCHEMA_VERSION, revision: 1, savedAt: NOW.toISOString() });
    expect(saved.state).toEqual(readyState(result));
  });

  it("abre datos válidos sin reescribirlos", async () => {
    const browser = new FakeBrowser();
    const raw = envelope(stateWithSession(), 7);
    browser.items.set(LOCAL_STORAGE_KEY, raw);

    const result = await browser.openTab().load();

    expect(readyState(result)).toEqual(stateWithSession());
    expect(result).toMatchObject({ savedAt: NOW.toISOString() });
    expect(browser.stored).toBe(raw);
  });

  it.each([
    ["JSON ilegible", "{no es json"],
    ["sin versión", JSON.stringify({ state: buildState() })],
    ["estado con un código inválido", (() => {
      const state = stateWithSession();
      state.observations = [{
        id: 1, sessionId: 1, studentId: "a", round: 1, code: "X" as "I", progress: 0,
        note: null, createdAt: NOW.toISOString(),
      }];
      return envelope(state);
    })()],
    ["versión anterior sin migración conocida", envelope(buildState(), 1, 0)],
  ])("%s: queda bloqueado y no reemplaza los datos", async (_case, raw) => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, raw);
    const tab = browser.openTab();

    const result = await tab.load();

    expect(result).toEqual({ status: "blocked", reason: "unreadable", raw });
    await expect(tab.execute({ type: "setSessionStatus", sessionId: 1, status: "closed" }))
      .rejects.toThrow("no se pueden leer");
    await expect(tab.replaceState(buildState())).rejects.toThrow();
    expect(browser.stored).toBe(raw);
  });

  it("datos de una versión más nueva: queda bloqueado y no los toca", async () => {
    const browser = new FakeBrowser();
    const raw = envelope(stateWithSession(), 3, STORAGE_SCHEMA_VERSION + 1);
    browser.items.set(LOCAL_STORAGE_KEY, raw);
    const tab = browser.openTab();

    expect(await tab.load()).toEqual({ status: "blocked", reason: "newer-version", raw });
    await expect(tab.execute({ type: "setSessionStatus", sessionId: 1, status: "closed" }))
      .rejects.toThrow("versión más nueva");
    await expect(tab.resetToDemo()).rejects.toThrow();
    expect(browser.stored).toBe(raw);
  });

  it("si el navegador bloquea el almacenamiento, trabaja en memoria y no informa guardado", async () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => undefined,
    };
    const tab = new LocalStorageMonitoringRepository({ storage: blocked });

    const result = await tab.load();

    expect(result).toMatchObject({ status: "ready", savedAt: null });
    await expect(tab.execute({ type: "setSessionStatus", sessionId: 1, status: "closed" }))
      .rejects.toBeInstanceOf(StorageWriteError);
  });

  it("fuera del navegador usa la demostración en memoria", async () => {
    const result = await new LocalStorageMonitoringRepository({ storage: null }).load();
    expect(result).toMatchObject({ status: "ready", savedAt: null });
  });
});

describe("comandos", () => {
  it("aplica el comando, guarda con la revisión siguiente y devuelve su resultado", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, envelope(stateWithSession(), 4));
    const tab = browser.openTab();
    await tab.load();

    const result = await tab.execute({
      type: "createSession",
      input: {
        courseId: "curso-prueba",
        teacherId: "docente-activo",
        roomTemplateId: "sala-habitual-iiia-2026",
        date: "2026-10-11",
        module: "Módulo",
        objective: "Objetivo",
        successCriteria: "Criterios",
      },
    });

    expect(result.sessionId).toBe(2);
    expect(JSON.parse(browser.stored ?? "null").revision).toBe(5);
    expect(browser.storedState()).toEqual(result.state);
    expect(browser.lockNames).toEqual([`${LOCAL_STORAGE_KEY}:escritura`]);
  });

  it("dos pestañas no se borran el trabajo: cada comando parte de lo último guardado", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, envelope(stateWithSession()));
    const first = browser.openTab();
    const second = browser.openTab();
    await first.load();
    await second.load();

    await first.execute({
      type: "addObservation",
      input: { sessionId: 1, studentId: "a", round: 1, code: "C" },
    });
    // La segunda pestaña no ha recargado: su copia en memoria no tiene el registro.
    const result = await second.execute({
      type: "setPresence",
      sessionId: 1,
      studentId: "c",
      present: false,
    });

    const saved = browser.storedState();
    expect(saved.observations).toHaveLength(1);
    expect(saved.observations[0]).toMatchObject({ studentId: "a", code: "C" });
    expect(saved.sessionStudents.find((row) => row.studentId === "c")?.present).toBe(false);
    expect(result.state).toEqual(saved);
    expect(JSON.parse(browser.stored ?? "null").revision).toBe(3);
  });

  it("dos comandos simultáneos de pestañas distintas se aplican uno después del otro", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, envelope(stateWithSession()));
    const first = browser.openTab();
    const second = browser.openTab();
    await Promise.all([first.load(), second.load()]);

    await Promise.all([
      first.execute({ type: "addObservation", input: { sessionId: 1, studentId: "a", round: 1, code: "I" } }),
      second.execute({ type: "addObservation", input: { sessionId: 1, studentId: "b", round: 1, code: "R", progress: 70 } }),
    ]);

    const saved = browser.storedState();
    expect(saved.observations.map((row) => [row.id, row.studentId])).toEqual([[1, "a"], [2, "b"]]);
  });

  it("avisa a las otras pestañas cuando cambian los datos", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, envelope(stateWithSession()));
    const first = browser.openTab();
    const second = browser.openTab();
    await first.load();
    await second.load();
    const listener = vi.fn();
    second.subscribe(listener);

    await first.execute({ type: "setSessionStatus", sessionId: 1, status: "closed" });

    expect(listener).toHaveBeenCalledTimes(1);
    const [notice] = listener.mock.calls[0] as [LoadResult];
    expect(readyState(notice).sessions[0].status).toBe("closed");
  });

  it("si otra pestaña guarda con una versión más nueva, deja de escribir", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, envelope(stateWithSession()));
    const tab = browser.openTab();
    await tab.load();
    const listener = vi.fn();
    tab.subscribe(listener);
    const newer = envelope(stateWithSession(), 9, STORAGE_SCHEMA_VERSION + 1);

    browser.writeFromElsewhere(LOCAL_STORAGE_KEY, newer);

    expect(listener).toHaveBeenCalledWith({ status: "blocked", reason: "newer-version", raw: newer });
    await expect(tab.execute({ type: "setSessionStatus", sessionId: 1, status: "closed" }))
      .rejects.toThrow("versión más nueva");
    expect(browser.stored).toBe(newer);
  });

  it("si otra pestaña borró los datos, repone la última versión conocida", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, envelope(stateWithSession()));
    const tab = browser.openTab();
    await tab.load();
    browser.writeFromElsewhere(LOCAL_STORAGE_KEY, null);

    await tab.execute({ type: "setSessionStatus", sessionId: 1, status: "closed" });

    const saved = browser.storedState();
    expect(saved.students).toEqual(stateWithSession().students);
    expect(saved.sessions[0].status).toBe("closed");
  });

  it("si no se puede escribir, falla sin cambiar lo guardado", async () => {
    const browser = new FakeBrowser();
    const raw = envelope(stateWithSession());
    browser.items.set(LOCAL_STORAGE_KEY, raw);
    const tab = browser.openTab();
    await tab.load();
    browser.failingKeys.add(LOCAL_STORAGE_KEY);

    await expect(tab.execute({ type: "setSessionStatus", sessionId: 1, status: "closed" }))
      .rejects.toBeInstanceOf(StorageWriteError);
    expect(browser.stored).toBe(raw);

    browser.failingKeys.clear();
    await tab.execute({ type: "setPresence", sessionId: 1, studentId: "a", present: false });
    // La clase sigue activa: el cierre fallido no quedó aplicado en ninguna parte.
    expect(browser.storedState().sessions[0].status).toBe("active");
  });

  it("una regla del dominio rechazada no es una falla de almacenamiento", async () => {
    const browser = new FakeBrowser();
    const raw = envelope(stateWithSession());
    browser.items.set(LOCAL_STORAGE_KEY, raw);
    const tab = browser.openTab();
    await tab.load();

    const attempt = tab.execute({
      type: "addObservation",
      input: { sessionId: 1, studentId: "otro", round: 1, code: "C" },
    });

    await expect(attempt).rejects.toThrow("no pertenece a la nómina");
    await expect(attempt).rejects.not.toBeInstanceOf(StorageWriteError);
    expect(browser.stored).toBe(raw);
  });
});

describe("respaldo y recuperación", () => {
  it("restaurar reemplaza los datos y conserva una copia de los anteriores", async () => {
    const browser = new FakeBrowser();
    const previous = envelope(stateWithSession(), 5);
    browser.items.set(LOCAL_STORAGE_KEY, previous);
    const tab = browser.openTab();
    await tab.load();
    const restored = buildState();
    restored.courses[0].name = "Curso restaurado";

    const result = await tab.replaceState(restored);

    expect(result).toEqual({ copyKept: true });
    expect(browser.storedState()).toEqual(restored);
    expect(JSON.parse(browser.stored ?? "null").revision).toBe(6);
    expect(await tab.listSavedCopies()).toEqual([
      { kind: "restore", savedAt: NOW.toISOString(), raw: previous },
    ]);

    await tab.deleteSavedCopy("restore");
    expect(await tab.listSavedCopies()).toEqual([]);
  });

  it("si no hay espacio para la copia, restaura igual e informa que no la guardó", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, envelope(stateWithSession()));
    browser.failingKeys.add(SAVED_COPY_KEYS.restore);
    const tab = browser.openTab();
    await tab.load();

    expect(await tab.replaceState(buildState())).toEqual({ copyKept: false });
    expect(browser.storedState()).toEqual(buildState());
  });

  it("empezar de nuevo desde datos ilegibles conserva una copia y vuelve a la demostración", async () => {
    const browser = new FakeBrowser();
    browser.items.set(LOCAL_STORAGE_KEY, "{dañado");
    const tab = browser.openTab();
    await tab.load();

    const demo = await tab.resetToDemo();

    expect(browser.storedState()).toEqual(demo);
    expect(await tab.listSavedCopies()).toEqual([
      { kind: "recovery", savedAt: NOW.toISOString(), raw: "{dañado" },
    ]);
    await tab.execute({ type: "setSessionStatus", sessionId: demo.sessions[0].id, status: "closed" });
  });

  it("no permite empezar de nuevo si los datos se pueden leer", async () => {
    const browser = new FakeBrowser();
    const raw = envelope(stateWithSession());
    browser.items.set(LOCAL_STORAGE_KEY, raw);
    const tab = browser.openTab();
    await tab.load();

    await expect(tab.resetToDemo()).rejects.toThrow("Solo se puede empezar de nuevo");
    expect(browser.stored).toBe(raw);
  });

  it("ignora copias guardadas con un formato desconocido", async () => {
    const browser = new FakeBrowser();
    browser.items.set(SAVED_COPY_KEYS.restore, "{dañado");
    browser.items.set(SAVED_COPY_KEYS.recovery, JSON.stringify({ raw: 1 }));

    expect(await browser.openTab().listSavedCopies()).toEqual([]);
  });
});
