import { addDefaultRoomTemplate } from "@/features/monitoring/lib/monitoring-service";
import { displayName, normalizeName, slugify } from "@/lib/text";
import type { MonitoringState, RosterEntry, Student } from "@/types/monitoring";
import { MAX_ROSTER_SIZE } from "./roster-import";

export type RosterMatch = {
  student: Student;
  entry: RosterEntry;
  numberChanged: boolean;
  nameChanged: boolean;
  reactivated: boolean;
};

/**
 * Comparación entre la nómina actual de un curso y una planilla nueva.
 * - `kept`: mismo estudiante, sin cambios.
 * - `updated`: mismo estudiante con otro N°, el nombre corregido o que vuelve.
 * - `added`: estudiantes nuevos, sin puesto.
 * - `withdrawn`: dejan el curso; se archivan sin borrar su historia.
 */
export type RosterUpdatePlan = {
  courseId: string;
  kept: RosterMatch[];
  updated: RosterMatch[];
  added: RosterEntry[];
  withdrawn: Student[];
};

// Similitud mínima para tomar un nombre distinto con el mismo N° como una
// corrección del mismo estudiante. Es alta a propósito: un error de tipeo sí,
// otro estudiante con un apellido parecido no.
const CORRECTION_SIMILARITY = 0.9;

function similarity(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= second.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (first[i - 1] === second[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[second.length] / Math.max(first.length, second.length, 1);
}

function match(student: Student, entry: RosterEntry): RosterMatch {
  return {
    student,
    entry,
    numberChanged: student.number !== entry.number,
    nameChanged: student.fullName !== entry.fullName,
    reactivated: !student.active,
  };
}

/**
 * Empareja la planilla con los estudiantes del curso sin perder identidades:
 * primero por nombre (sin tildes ni mayúsculas; entre homónimos, por N°) y
 * luego, para correcciones de tipeo, por el mismo N° con un nombre casi igual.
 */
export function planRosterUpdate(
  state: MonitoringState,
  courseId: string,
  entries: RosterEntry[],
): RosterUpdatePlan {
  const pending = state.students.filter((student) => student.courseId === courseId);
  const take = (student: Student) => pending.splice(pending.indexOf(student), 1);
  const matches: RosterMatch[] = [];
  const unmatched: RosterEntry[] = [];

  const ordered = [...entries].sort((a, b) => a.number - b.number);
  for (const entry of ordered) {
    const key = normalizeName(entry.fullName);
    const sameName = pending.filter((student) => normalizeName(student.fullName) === key);
    const student = sameName.find((candidate) => candidate.number === entry.number)
      ?? sameName.find((candidate) => candidate.active)
      ?? sameName[0];
    if (student) {
      take(student);
      matches.push(match(student, entry));
    } else {
      unmatched.push(entry);
    }
  }

  const added: RosterEntry[] = [];
  for (const entry of unmatched) {
    const student = pending.find((candidate) =>
      candidate.number === entry.number
      && similarity(normalizeName(candidate.fullName), normalizeName(entry.fullName)) >= CORRECTION_SIMILARITY);
    if (student) {
      take(student);
      matches.push(match(student, entry));
    } else {
      added.push(entry);
    }
  }

  const changed = (item: RosterMatch) => item.numberChanged || item.nameChanged || item.reactivated;
  return {
    courseId,
    kept: matches.filter((item) => !changed(item)),
    updated: matches.filter(changed),
    added,
    withdrawn: pending.filter((student) => student.active),
  };
}

/** Cuántos estudiantes de la planilla coinciden por nombre con el curso. */
export function rosterOverlap(state: MonitoringState, courseId: string, entries: RosterEntry[]) {
  const names = new Set(
    state.students
      .filter((student) => student.courseId === courseId)
      .map((student) => normalizeName(student.fullName)),
  );
  return entries.filter((entry) => names.has(normalizeName(entry.fullName))).length;
}

function uniqueStudentId(state: MonitoringState, courseId: string, fullName: string, number: number) {
  const taken = new Set(state.students.map((student) => student.id));
  const base = `${courseId}-${slugify(fullName) || "estudiante"}-${number}`;
  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;
  return candidate;
}

/**
 * Antes de cambiar N° o nombres, fija en cada clase anterior del curso el
 * N° y el nombre que tenían sus estudiantes, para que sus informes no cambien.
 */
function freezeSessionSnapshots(state: MonitoringState, courseId: string) {
  const sessions = new Set(
    state.sessions.filter((session) => session.courseId === courseId).map((session) => session.id),
  );
  const students = new Map(state.students.map((student) => [student.id, student]));
  state.sessionStudents.forEach((row) => {
    const student = students.get(row.studentId);
    if (!sessions.has(row.sessionId) || !student) return;
    if (row.number === undefined) row.number = student.number;
    if (row.fullName === undefined) row.fullName = student.fullName;
    if (row.displayName === undefined) row.displayName = student.displayName;
  });
}

/**
 * Actualiza la nómina de un curso existente. Conserva la identidad de cada
 * estudiante, sus registros y su puesto; los nuevos quedan sin puesto y
 * quienes dejan el curso se archivan y liberan su puesto. Las clases ya
 * iniciadas conservan su nómina (fotografía).
 */
export function updateRoster(
  current: MonitoringState,
  courseId: string,
  entries: RosterEntry[],
): { state: MonitoringState; plan: RosterUpdatePlan } {
  const course = current.courses.find((item) => item.id === courseId);
  if (!course) throw new Error("No se encontró el curso a actualizar.");
  const cleaned = entries
    .map((entry) => ({ number: entry.number, fullName: entry.fullName.trim() }))
    .filter((entry) => entry.fullName);
  if (!cleaned.length) throw new Error("No se encontraron nombres para importar.");
  if (cleaned.length > MAX_ROSTER_SIZE) {
    throw new Error(`Una nómina puede tener hasta ${MAX_ROSTER_SIZE} estudiantes.`);
  }

  const state = structuredClone(current);
  const plan = planRosterUpdate(state, courseId, cleaned);
  freezeSessionSnapshots(state, courseId);

  for (const { student, entry } of plan.updated) {
    const target = state.students.find((item) => item.id === student.id);
    if (!target) continue;
    target.number = entry.number;
    target.fullName = entry.fullName;
    target.displayName = displayName(entry.fullName);
    target.active = true;
  }

  const withdrawn = new Set(plan.withdrawn.map((student) => student.id));
  state.students.forEach((student) => {
    if (!withdrawn.has(student.id)) return;
    student.active = false;
    student.seatRow = null;
    student.seatCol = null;
  });
  state.seatAssignments = state.seatAssignments.filter(
    (assignment) => !withdrawn.has(assignment.studentId),
  );

  for (const entry of plan.added) {
    state.students.push({
      id: uniqueStudentId(state, courseId, entry.fullName, entry.number),
      courseId,
      number: entry.number,
      fullName: entry.fullName,
      displayName: displayName(entry.fullName),
      seatRow: null,
      seatCol: null,
      active: true,
    });
  }

  // Un curso pendiente, sin plantilla, queda operativo con la sala habitual.
  if (!state.roomTemplates.some((template) => template.courseId === courseId)) {
    addDefaultRoomTemplate(state, courseId, course.name);
  }

  return { state, plan };
}
