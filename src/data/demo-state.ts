import {
  DEFAULT_ROOM_TEMPLATE_ID,
  DEFAULT_TEACHER_ID,
  DEMO_COURSE_ID,
  WORKSHOP_ROOM_TEMPLATE_ID,
} from "@/config/app";
import type {
  ClassSession,
  MonitoringCode,
  MonitoringState,
  Observation,
  RoomSlot,
  SeatAssignment,
  SessionStudent,
  Student,
} from "@/types/monitoring";

const CREATED_AT = "2026-07-01T12:00:00.000Z";

const teachers = [
  { id: DEFAULT_TEACHER_ID, fullName: "Fabián Herrera", role: "admin" as const },
  { id: "daniela-ortega", fullName: "Daniela Ortega", role: "teacher" as const },
  { id: "diego-quintana", fullName: "Diego Quintana", role: "teacher" as const },
  { id: "vanessa-moncada", fullName: "Vanessa Moncada", role: "teacher" as const },
  { id: "wendy-sepulveda", fullName: "Wendy Sepúlveda", role: "teacher" as const },
].map((teacher) => ({ ...teacher, active: true, createdAt: CREATED_AT }));

const courses = [
  { id: DEMO_COURSE_ID, name: "III°A 2026" },
  { id: "iiic-2026", name: "III°C 2026" },
  { id: "iva-2026", name: "IV°A 2026" },
  { id: "ivb-2026", name: "IV°B 2026" },
  { id: "ivc-2026", name: "IV°C 2026" },
].map((course) => ({ ...course, createdAt: CREATED_AT }));

const roomTemplates = [
  {
    id: DEFAULT_ROOM_TEMPLATE_ID,
    courseId: DEMO_COURSE_ID,
    name: "Sala habitual",
    description: "Distribución de demostración de III°A",
    rowCount: 7,
    columnCount: 6,
  },
  {
    id: WORKSHOP_ROOM_TEMPLATE_ID,
    courseId: DEMO_COURSE_ID,
    name: "Taller empresarial",
    description: "Distribución de demostración del taller con pasillo central",
    rowCount: 8,
    columnCount: 6,
  },
].map((template) => ({ ...template, active: true, createdAt: CREATED_AT }));

const habitualSlots: RoomSlot[] = Array.from({ length: 42 }, (_, index) => ({
  templateId: DEFAULT_ROOM_TEMPLATE_ID,
  seatRow: Math.floor(index / 6),
  seatCol: index % 6,
  status: "available",
}));

const workshopSlots: RoomSlot[] = [
  ...Array.from({ length: 36 }, (_, index) => ({
    templateId: WORKSHOP_ROOM_TEMPLATE_ID,
    seatRow: Math.floor(index / 6),
    seatCol: index % 6,
    status: index === 11 ? "unavailable" as const : "available" as const,
  })),
  ...[0, 1, 4].flatMap((seatCol) =>
    [6, 7].map((seatRow) => ({
      templateId: WORKSHOP_ROOM_TEMPLATE_ID,
      seatRow,
      seatCol,
      status: "available" as const,
    })),
  ),
];

const habitualPositions = habitualSlots
  .filter((slot) => !(
    slot.seatRow === 0
    && [0, 1, 4, 5].includes(slot.seatCol)
  ));

const students: Student[] = Array.from({ length: 40 }, (_, index) => {
  const number = index + 1;
  const position = habitualPositions[index];
  return {
    id: `student-demo-${String(number).padStart(2, "0")}`,
    courseId: DEMO_COURSE_ID,
    number,
    fullName: `Estudiante ficticio ${String(number).padStart(2, "0")}`,
    displayName: `Estudiante ${String(number).padStart(2, "0")}`,
    seatRow: position?.seatRow ?? null,
    seatCol: position?.seatCol ?? null,
    active: true,
  };
});

const habitualAssignments: SeatAssignment[] = students.flatMap((student) =>
  student.seatRow === null || student.seatCol === null
    ? []
    : [{
        templateId: DEFAULT_ROOM_TEMPLATE_ID,
        studentId: student.id,
        seatRow: student.seatRow,
        seatCol: student.seatCol,
      }],
);

const workshopPositions = workshopSlots.filter((slot) => slot.status === "available");
const workshopAssignments: SeatAssignment[] = students.slice(0, 38).map((student, index) => ({
  templateId: WORKSHOP_ROOM_TEMPLATE_ID,
  studentId: student.id,
  seatRow: workshopPositions[index].seatRow,
  seatCol: workshopPositions[index].seatCol,
}));

const sessions: ClassSession[] = [
  {
    id: 3,
    courseId: DEMO_COURSE_ID,
    teacherId: DEFAULT_TEACHER_ID,
    roomTemplateId: DEFAULT_ROOM_TEMPLATE_ID,
    date: "2026-08-05",
    module: "UIC",
    objective: "Analizar estados financieros mediante una actividad de práctica independiente.",
    successCriteria: "Clasifica las cuentas y comprueba la estructura de los estados financieros.",
    status: "active",
    startedAt: "2026-08-05T13:30:00.000Z",
    closedAt: null,
  },
  {
    id: 2,
    courseId: DEMO_COURSE_ID,
    teacherId: DEFAULT_TEACHER_ID,
    roomTemplateId: WORKSHOP_ROOM_TEMPLATE_ID,
    date: "2026-07-29",
    module: "AIGA",
    objective: "Aplicar herramientas de planilla de cálculo en un caso administrativo.",
    successCriteria: "Completa los cálculos y presenta resultados verificables.",
    status: "closed",
    startedAt: "2026-07-29T13:30:00.000Z",
    closedAt: "2026-07-29T14:50:00.000Z",
  },
  {
    id: 1,
    courseId: DEMO_COURSE_ID,
    teacherId: DEFAULT_TEACHER_ID,
    roomTemplateId: DEFAULT_ROOM_TEMPLATE_ID,
    date: "2026-07-20",
    module: "Atención de clientes",
    objective: "Identificar tipos de clientes mediante un caso práctico.",
    successCriteria: "Reconoce el tipo de cliente y propone una respuesta pertinente.",
    status: "closed",
    startedAt: "2026-07-20T13:30:00.000Z",
    closedAt: "2026-07-20T14:50:00.000Z",
  },
];

const absenceBySession: Record<number, Set<number>> = {
  1: new Set([4, 14, 19, 31, 35, 40]),
  2: new Set([8, 18, 29, 39]),
  3: new Set([6, 20, 31, 39, 40]),
};

const sessionStudents: SessionStudent[] = sessions.flatMap((session) =>
  students.map((student) => ({
    sessionId: session.id,
    studentId: student.id,
    present: !absenceBySession[session.id].has(student.number ?? 0),
  })),
);

let observationId = 1;

function makeObservation(
  sessionId: number,
  student: Student,
  code: MonitoringCode,
  progress: number,
  round: number,
  order: number,
): Observation {
  return {
    id: observationId++,
    sessionId,
    studentId: student.id,
    round,
    code,
    progress,
    note: null,
    createdAt: new Date(Date.UTC(2026, 6, 20 + sessionId, 13, order)).toISOString(),
  };
}

function sessionObservations(
  sessionId: number,
  correctCount: number,
  reviewProgress: number[],
  transitionCount = 0,
) {
  const present = students.filter(
    (student) => !absenceBySession[sessionId].has(student.number ?? 0),
  );
  const observations: Observation[] = [];

  present.slice(0, transitionCount).forEach((student, index) => {
    observations.push(makeObservation(sessionId, student, "I", 0, 1, index));
  });

  present.forEach((student, index) => {
    const isCorrect = index < correctCount;
    const code: MonitoringCode = isCorrect ? "C" : "R";
    const reviewIndex = Math.max(0, index - correctCount);
    const progress = isCorrect
      ? 100
      : reviewProgress[reviewIndex % reviewProgress.length];
    const round = index % 17 === 0 ? 3 : index % 7 === 0 ? 2 : 1;
    observations.push(makeObservation(sessionId, student, code, progress, round, index + 50));
  });

  return observations;
}

const activeProgress = [
  25, 25, 25,
  50, 50, 50, 50, 50, 50, 50, 50,
  70, 70, 70, 70, 70, 70, 70, 70, 70, 70,
  90, 90, 90, 90, 90,
];

const observations = [
  ...sessionObservations(1, 24, [50, 70, 90], 5),
  ...sessionObservations(2, 23, [25, 50, 70, 90], 7),
  ...sessionObservations(3, 9, activeProgress, 8),
];

const demoState: MonitoringState = {
  teachers,
  courses,
  roomTemplates,
  roomSlots: [...habitualSlots, ...workshopSlots],
  seatAssignments: [...habitualAssignments, ...workshopAssignments],
  students,
  sessions,
  sessionStudents,
  observations,
  source: {
    title: "III°A 2026 · datos ficticios",
    tabs: ["Nómina demo", "Puestos", "Puestos Taller", "Monitoreo PI"],
    importedAt: "2026-08-15T00:00:00.000Z",
    mode: "demo",
  },
};

export function createDemoState(): MonitoringState {
  return structuredClone(demoState);
}
