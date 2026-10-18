import type { MonitoringCode, MonitoringState, RoomLayoutName, Student } from "@/types/monitoring";

/** Filas tal como las devuelve Supabase, ya filtradas por RLS. */
export type DbRows = {
  userId: string;
  userEmail: string;
  /** `kind` existe desde ADR 0004; sin él, el espacio es un establecimiento. */
  schools: Array<{ id: string; name: string; kind?: "institution" | "personal" }>;
  memberships: Array<{ school_id: string; user_id: string; role: "admin" | "coordinator" | "teacher"; active: boolean }>;
  profiles: Array<{ id: string; full_name: string; created_at: string }>;
  courses: Array<{
    id: string;
    school_id: string;
    name: string;
    academic_year?: number;
    focus_student_count?: number;
    archived_at: string | null;
    created_at: string;
  }>;
  students: Array<{ id: string; full_name: string; display_name: string }>;
  enrollments: Array<{
    id: string;
    course_id: string;
    student_id: string;
    list_number: number | null;
    active: boolean;
    is_focus?: boolean;
  }>;
  roomTemplates: Array<{
    id: string;
    course_id: string;
    name: string;
    description: string;
    row_count: number;
    column_count: number;
    active: boolean;
    created_at: string;
    layout?: RoomLayoutName;
  }>;
  roomSlots: Array<{
    template_id: string;
    seat_row: number;
    seat_col: number;
    status: "available" | "unavailable";
    group_label?: string | null;
  }>;
  seatAssignments: Array<{ template_id: string; enrollment_id: string; seat_row: number; seat_col: number }>;
  sessions: Array<{
    id: string;
    seq: number | string;
    course_id: string;
    teacher_id: string;
    room_template_id: string;
    date: string;
    module: string;
    objective: string;
    success_criteria: string;
    status: "active" | "closed";
    started_at: string;
    closed_at: string | null;
  }>;
  sessionStudents: Array<{
    session_id: string;
    enrollment_id: string;
    list_number: number | null;
    full_name: string;
    display_name: string;
    seat_row: number | null;
    seat_col: number | null;
    present: boolean;
    is_focus?: boolean;
  }>;
  observations: Array<{
    id: string;
    seq: number | string;
    session_id: string;
    enrollment_id: string;
    round: number;
    code: MonitoringCode;
    progress: number;
    note: string | null;
    observed_at: string;
  }>;
};

export type RemoteAccount = {
  userId: string;
  email: string;
  fullName: string;
  /** Espacios donde la cuenta administra: puede crear cursos y nóminas. */
  adminSchoolIds: string[];
  /** Espacio personal de la cuenta (ADR 0004), si existe. */
  personalSpaceId: string | null;
  schools: Array<{
    id: string;
    name: string;
    role: "admin" | "coordinator" | "teacher";
    kind: "institution" | "personal";
  }>;
};

/** Traducción entre los números que usa la aplicación y los UUID del servidor. */
export type RemoteIndex = {
  sessionUuid: Map<number, string>;
  sessionSeq: Map<string, number>;
};

function byText<T>(key: (item: T) => string) {
  return (first: T, second: T) => key(first).localeCompare(key(second));
}

/**
 * Convierte las filas del servidor en el mismo modelo que usa la aplicación
 * local. La matrícula es el «estudiante del curso»; las clases y las
 * observaciones usan su número creciente (seq) como id.
 */
export function mapRowsToState(rows: DbRows): { state: MonitoringState; index: RemoteIndex; account: RemoteAccount } {
  const profile = rows.profiles.find((item) => item.id === rows.userId);
  const ownMemberships = rows.memberships.filter((item) => item.user_id === rows.userId && item.active);
  const fullName = profile?.full_name.trim() || rows.userEmail.split("@")[0] || "Docente";
  const isAdmin = ownMemberships.some((item) => item.role === "admin");

  const sessionSeq = new Map(rows.sessions.map((session) => [session.id, Number(session.seq)]));
  const sessionUuid = new Map([...sessionSeq].map(([uuid, seq]) => [seq, uuid]));
  const people = new Map(rows.students.map((student) => [student.id, student]));
  const firstTemplateByCourse = new Map<string, string>();
  [...rows.roomTemplates].sort(byText((item) => item.created_at)).forEach((template) => {
    if (!firstTemplateByCourse.has(template.course_id)) firstTemplateByCourse.set(template.course_id, template.id);
  });
  const seatOf = new Map(rows.seatAssignments.map((seat) => [`${seat.template_id}:${seat.enrollment_id}`, seat]));

  const students: Student[] = rows.enrollments
    .filter((enrollment) => people.has(enrollment.student_id))
    .map((enrollment) => {
      const person = people.get(enrollment.student_id)!;
      const seat = seatOf.get(`${firstTemplateByCourse.get(enrollment.course_id)}:${enrollment.id}`);
      return {
        id: enrollment.id,
        courseId: enrollment.course_id,
        number: enrollment.list_number,
        fullName: person.full_name,
        displayName: person.display_name,
        seatRow: seat?.seat_row ?? null,
        seatCol: seat?.seat_col ?? null,
        active: enrollment.active,
        ...(enrollment.is_focus === undefined ? {} : { isFocus: enrollment.is_focus }),
      };
    })
    .sort((first, second) =>
      first.courseId.localeCompare(second.courseId)
      || (first.number ?? Infinity) - (second.number ?? Infinity)
      || first.fullName.localeCompare(second.fullName, "es"));

  const state: MonitoringState = {
    teachers: [{
      id: rows.userId,
      fullName,
      role: isAdmin ? "admin" : "teacher",
      active: true,
      createdAt: profile?.created_at ?? "",
    }],
    courses: rows.courses
      .sort(byText((course) => course.name))
      .map((course) => ({
        id: course.id,
        name: course.name,
        academicYear: course.academic_year ?? new Date().getFullYear(),
        archivedAt: course.archived_at,
        focusStudentCount: course.focus_student_count ?? 0,
        createdAt: course.created_at,
        spaceId: course.school_id,
      })),
    roomTemplates: [...rows.roomTemplates].sort(byText((item) => item.created_at)).map((template) => ({
      id: template.id,
      courseId: template.course_id,
      name: template.name,
      description: template.description,
      rowCount: template.row_count,
      columnCount: template.column_count,
      active: template.active,
      createdAt: template.created_at,
      layout: template.layout ?? "classic",
    })),
    roomSlots: rows.roomSlots.map((slot) => ({
      templateId: slot.template_id,
      seatRow: slot.seat_row,
      seatCol: slot.seat_col,
      status: slot.status,
      ...(slot.group_label ? { groupLabel: slot.group_label } : {}),
    })),
    seatAssignments: rows.seatAssignments.map((seat) => ({
      templateId: seat.template_id,
      studentId: seat.enrollment_id,
      seatRow: seat.seat_row,
      seatCol: seat.seat_col,
    })),
    students,
    // Más reciente primero, como la aplicación local.
    sessions: [...rows.sessions]
      .sort((first, second) => Number(second.seq) - Number(first.seq))
      .map((session) => ({
        id: Number(session.seq),
        courseId: session.course_id,
        teacherId: session.teacher_id,
        roomTemplateId: session.room_template_id,
        date: session.date,
        module: session.module,
        objective: session.objective,
        successCriteria: session.success_criteria,
        status: session.status,
        startedAt: session.started_at,
        closedAt: session.closed_at,
      })),
    sessionStudents: rows.sessionStudents
      .filter((row) => sessionSeq.has(row.session_id))
      .map((row) => ({
        sessionId: sessionSeq.get(row.session_id)!,
        studentId: row.enrollment_id,
        present: row.present,
        number: row.list_number,
        fullName: row.full_name,
        displayName: row.display_name,
        seatRow: row.seat_row,
        seatCol: row.seat_col,
        ...(row.is_focus === undefined ? {} : { isFocus: row.is_focus }),
      })),
    observations: rows.observations
      .filter((row) => sessionSeq.has(row.session_id))
      .sort((first, second) => Number(first.seq) - Number(second.seq))
      .map((row) => ({
        id: Number(row.seq),
        sessionId: sessionSeq.get(row.session_id)!,
        studentId: row.enrollment_id,
        round: row.round,
        code: row.code,
        progress: row.progress,
        note: row.note,
        createdAt: row.observed_at,
      })),
    source: {
      title: rows.schools.map((school) => school.name).join(" · ") || "Establecimiento",
      tabs: [],
      importedAt: "",
      mode: "imported",
    },
  };

  const roleBySchool = new Map(ownMemberships.map((item) => [item.school_id, item.role]));
  const schools = rows.schools
    .filter((school) => roleBySchool.has(school.id))
    .map((school) => ({
      id: school.id,
      name: school.name,
      role: roleBySchool.get(school.id)!,
      kind: school.kind ?? "institution",
    }))
    // Primero el espacio personal; luego los establecimientos por nombre.
    .sort((first, second) =>
      Number(second.kind === "personal") - Number(first.kind === "personal") || first.name.localeCompare(second.name, "es"));
  return {
    state,
    index: { sessionUuid, sessionSeq },
    account: {
      userId: rows.userId,
      email: rows.userEmail,
      fullName,
      adminSchoolIds: schools.filter((school) => school.role === "admin").map((school) => school.id),
      personalSpaceId: schools.find((school) => school.kind === "personal")?.id ?? null,
      schools,
    },
  };
}
