import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM_TEMPLATE_ID, DEFAULT_TEACHER_ID } from "@/config/app";
import { createDemoState } from "@/data/demo-state";
import type { Observation, SessionStudent, Student } from "@/types/monitoring";
import {
  latestObservations,
  metricsForSession,
  preferredSession,
  sessionMetrics,
  sessionRoomTemplateId,
  sessionTeacherId,
} from "./metrics";
import {
  COURSE_ID,
  OTHER_COURSE_ID,
  TEACHER_ID,
  buildSession,
  buildStudent,
  observationRows,
  presenceRows,
} from "./test-fixtures";

const ROSTER: Student[] = [
  buildStudent("a", 1),
  buildStudent("b", 2),
  buildStudent("c", 3),
  buildStudent("d", 4),
  buildStudent("otro", 1, { courseId: OTHER_COURSE_ID }),
];
const SNAPSHOT = ["a", "b", "c", "d"];

function metricsFor(
  observations: Observation[],
  options: { absent?: string[]; students?: Student[]; presence?: SessionStudent[] } = {},
) {
  return sessionMetrics(
    buildSession(),
    options.students ?? ROSTER,
    options.presence ?? presenceRows(1, SNAPSHOT, options.absent),
    observations,
  );
}

describe("latestObservations", () => {
  it("la última observación registrada es el estado vigente de cada estudiante", () => {
    const latest = latestObservations(observationRows([
      { studentId: "a", code: "I" },
      { studentId: "b", code: "C" },
      { studentId: "a", code: "R", progress: 70 },
    ]));

    expect(latest.size).toBe(2);
    expect(latest.get("a")).toMatchObject({ code: "R", progress: 70 });
  });
});

describe("sessionTeacherId y sessionRoomTemplateId", () => {
  it("usan el docente y la plantilla de la sesión", () => {
    const session = buildSession({ teacherId: TEACHER_ID, roomTemplateId: "taller" });

    expect(sessionTeacherId(session)).toBe(TEACHER_ID);
    expect(sessionRoomTemplateId(session)).toBe("taller");
  });

  it("caen en los valores por defecto para sesiones antiguas sin esos datos", () => {
    const session = buildSession({ teacherId: null, roomTemplateId: null });

    expect(sessionTeacherId(session)).toBe(DEFAULT_TEACHER_ID);
    expect(sessionRoomTemplateId(session)).toBe(DEFAULT_ROOM_TEMPLATE_ID);
  });
});

describe("preferredSession", () => {
  it("prefiere la sesión activa del curso y docente aunque haya otras antes", () => {
    const sessions = [
      buildSession({ id: 3, status: "closed" }),
      buildSession({ id: 2, status: "active" }),
      buildSession({ id: 1, status: "active", teacherId: "otro-docente" }),
    ];

    expect(preferredSession(sessions, COURSE_ID, TEACHER_ID)?.id).toBe(2);
  });

  it("sin sesión activa, devuelve la primera de la lista, que es la más reciente", () => {
    const sessions = [buildSession({ id: 5, status: "closed" }), buildSession({ id: 4, status: "closed" })];

    expect(preferredSession(sessions, COURSE_ID, TEACHER_ID)?.id).toBe(5);
  });

  it("no mezcla cursos ni docentes", () => {
    const sessions = [
      buildSession({ id: 1, courseId: OTHER_COURSE_ID }),
      buildSession({ id: 2, teacherId: "otro-docente" }),
    ];

    expect(preferredSession(sessions, COURSE_ID, TEACHER_ID)).toBeUndefined();
  });

  it("una sesión sin docente cuenta como del docente por defecto", () => {
    const sessions = [buildSession({ id: 9, teacherId: null })];

    expect(preferredSession(sessions, COURSE_ID, DEFAULT_TEACHER_ID)?.id).toBe(9);
  });
});

describe("sessionMetrics", () => {
  it("calcula cobertura, I/R/C, avance, progresión y ausencias", () => {
    const metrics = metricsFor(
      observationRows([
        { studentId: "a", code: "I", round: 1 },
        { studentId: "b", code: "C", round: 1 },
        { studentId: "d", code: "R", progress: 25, round: 1 },
        { studentId: "a", code: "R", progress: 70, round: 2 },
      ]),
      { absent: ["d"] },
    );

    expect({
      roster: metrics.roster.length,
      present: metrics.present.length,
      absent: metrics.absent,
      counts: metrics.counts,
      observed: metrics.observed,
      unobserved: metrics.unobserved,
      coverage: metrics.coverage,
      cRate: metrics.cRate,
      avgProgress: metrics.avgProgress,
      progressed: metrics.progressed,
    }).toEqual({
      roster: 4,
      present: 3,
      absent: 1,
      counts: { I: 0, R: 1, C: 1 },
      observed: 2,
      unobserved: 1,
      coverage: 67,
      cRate: 33,
      avgProgress: 70,
      progressed: 1,
    });
  });

  it("cuenta solo la última observación de cada estudiante", () => {
    const metrics = metricsFor(observationRows([
      { studentId: "a", code: "R", progress: 50 },
      { studentId: "a", code: "C" },
    ]));

    expect(metrics.counts).toEqual({ I: 0, R: 0, C: 1 });
  });

  it("promedia el avance solo entre quienes siguen en R", () => {
    const metrics = metricsFor(observationRows([
      { studentId: "a", code: "R", progress: 25 },
      { studentId: "b", code: "R", progress: 90 },
      { studentId: "c", code: "C" },
      { studentId: "d", code: "I" },
    ]));

    expect(metrics.avgProgress).toBe(58);
  });

  it("un R guardado sin porcentaje entra al promedio como 0", () => {
    // Solo ocurre con datos antiguos: addObservation siempre guarda un porcentaje.
    const metrics = metricsFor(observationRows([
      { studentId: "a", code: "R" },
      { studentId: "b", code: "R", progress: 90 },
    ]));

    expect(metrics.avgProgress).toBe(45);
  });

  it("sin estudiantes en R el avance promedio es 0", () => {
    expect(metricsFor(observationRows([{ studentId: "a", code: "C" }])).avgProgress).toBe(0);
  });

  it("progresa quien pasa de I a R o C más adelante en la sesión", () => {
    const metrics = metricsFor(observationRows([
      { studentId: "a", code: "I" },
      { studentId: "a", code: "R", progress: 50 },
      { studentId: "b", code: "I" },
      { studentId: "b", code: "C" },
      { studentId: "c", code: "I" },
      { studentId: "d", code: "C" },
      { studentId: "d", code: "I" },
    ]));

    expect(metrics.progressed).toBe(2);
  });

  it("un I intermedio también cuenta si después hay avance", () => {
    const metrics = metricsFor(observationRows([
      { studentId: "a", code: "R", progress: 25 },
      { studentId: "a", code: "I" },
      { studentId: "a", code: "R", progress: 70 },
    ]));

    expect(metrics.progressed).toBe(1);
  });

  it("un ausente con registro no entra en I/R/C, cobertura ni avance", () => {
    const metrics = metricsFor(
      observationRows([
        { studentId: "a", code: "C" },
        { studentId: "d", code: "R", progress: 25 },
      ]),
      { absent: ["d"] },
    );

    expect(metrics.counts).toEqual({ I: 0, R: 0, C: 1 });
    expect(metrics.coverage).toBe(33);
    expect(metrics.avgProgress).toBe(0);
  });

  it("sin presentes no divide por cero", () => {
    const metrics = metricsFor([], { absent: SNAPSHOT });

    expect({ coverage: metrics.coverage, cRate: metrics.cRate, unobserved: metrics.unobserved, absent: metrics.absent })
      .toEqual({ coverage: 0, cRate: 0, unobserved: 0, absent: 4 });
  });

  it("ignora observaciones y asistencia de otras sesiones", () => {
    const metrics = metricsFor(
      observationRows([{ studentId: "a", code: "C", sessionId: 2 }]),
      { presence: [...presenceRows(1, SNAPSHOT), ...presenceRows(2, SNAPSHOT, ["a"])] },
    );

    expect(metrics.present.map((student) => student.id)).toContain("a");
    expect(metrics.observed).toBe(0);
  });

  it("ignora estudiantes de otros cursos", () => {
    expect(metricsFor([]).roster.map((student) => student.id)).not.toContain("otro");
  });

  describe("nómina de una sesión pasada", () => {
    // La nómina de una sesión es la fotografía guardada en sessionStudents al
    // crearla. Estas pruebas fijan esa regla para la rama que corrige las métricas.

    it("no saca a un estudiante desactivado después de la sesión", () => {
      // Protege contra la corrección ingenua de filtrar por student.active:
      // una baja posterior no debe cambiar un informe ya realizado.
      const students = ROSTER.map((student) =>
        student.id === "d" ? { ...student, active: false } : student,
      );
      const metrics = metricsFor(observationRows([{ studentId: "d", code: "C" }]), { students });

      expect(metrics.present.map((student) => student.id)).toContain("d");
      expect(metrics.counts.C).toBe(1);
    });

    // Defecto conocido: hoy la nómina se arma desde los estudiantes actuales del
    // curso. Se corrige en la rama de métricas basadas en sessionStudents; cuando
    // eso ocurra, estas pruebas empezarán a fallar y deben pasar a it().
    it.fails("no cuenta a un estudiante agregado al curso después de la sesión", () => {
      const students = [...ROSTER, buildStudent("nuevo", 5)];
      const metrics = metricsFor([], { students });

      expect(metrics.roster.map((student) => student.id)).not.toContain("nuevo");
    });

    it.fails("no cuenta a un estudiante que ya estaba inactivo al crear la sesión", () => {
      const students = [...ROSTER, buildStudent("baja", 5, { active: false })];
      const metrics = metricsFor([], { students });

      expect(metrics.present.map((student) => student.id)).not.toContain("baja");
    });
  });
});

describe("metricsForSession", () => {
  const demo = createDemoState();

  it("equivale a sessionMetrics con las colecciones del estado", () => {
    for (const session of demo.sessions) {
      expect(metricsForSession(demo, session)).toEqual(
        sessionMetrics(session, demo.students, demo.sessionStudents, demo.observations),
      );
    }
  });

  it("produce métricas coherentes para todas las sesiones demostrativas", () => {
    expect(demo.sessions.length).toBeGreaterThan(0);
    for (const session of demo.sessions) {
      const metrics = metricsForSession(demo, session);
      const total = metrics.counts.I + metrics.counts.R + metrics.counts.C;

      expect(total).toBe(metrics.observed);
      expect(metrics.observed + metrics.unobserved).toBe(metrics.present.length);
      expect(metrics.present.length + metrics.absent).toBe(metrics.roster.length);
      expect(metrics.coverage).toBeGreaterThanOrEqual(0);
      expect(metrics.coverage).toBeLessThanOrEqual(100);
      expect(metrics.cRate).toBeLessThanOrEqual(metrics.coverage);
    }
  });
});
