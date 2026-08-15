export type MonitoringCode = "I" | "R" | "C";
export type AppView = "monitor" | "report" | "history" | "settings";
export type SessionStatus = "active" | "closed";

export type Teacher = {
  id: string;
  fullName: string;
  role: "admin" | "teacher";
  active: boolean;
  createdAt: string;
};

export type Course = {
  id: string;
  name: string;
  createdAt: string;
};

export type RoomTemplate = {
  id: string;
  courseId: string;
  name: string;
  description: string;
  rowCount: number;
  columnCount: number;
  active: boolean;
  createdAt: string;
};

export type RoomSlot = {
  templateId: string;
  seatRow: number;
  seatCol: number;
  status: "available" | "unavailable";
};

export type SeatAssignment = {
  templateId: string;
  studentId: string;
  seatRow: number;
  seatCol: number;
};

export type Student = {
  id: string;
  courseId: string;
  number: number | null;
  fullName: string;
  displayName: string;
  seatRow: number | null;
  seatCol: number | null;
  active: boolean;
};

export type ClassSession = {
  id: number;
  courseId: string;
  teacherId: string | null;
  roomTemplateId: string | null;
  date: string;
  module: string;
  objective: string;
  successCriteria: string;
  status: SessionStatus;
  startedAt: string;
  closedAt: string | null;
};

export type SessionStudent = {
  sessionId: number;
  studentId: string;
  present: boolean;
};

export type Observation = {
  id: number;
  sessionId: number;
  studentId: string;
  round: number;
  code: MonitoringCode;
  progress: number | null;
  note: string | null;
  createdAt: string;
};

export type SourceMetadata = {
  title: string;
  tabs: string[];
  importedAt: string;
  mode: "demo" | "imported";
};

export type MonitoringState = {
  teachers: Teacher[];
  courses: Course[];
  roomTemplates: RoomTemplate[];
  roomSlots: RoomSlot[];
  seatAssignments: SeatAssignment[];
  students: Student[];
  sessions: ClassSession[];
  sessionStudents: SessionStudent[];
  observations: Observation[];
  source: SourceMetadata;
};

export type SessionMetrics = {
  roster: Student[];
  present: Student[];
  presenceMap: Map<string, boolean>;
  sessionObs: Observation[];
  latest: Map<string, Observation>;
  counts: Record<MonitoringCode, number>;
  observed: number;
  unobserved: number;
  absent: number;
  coverage: number;
  cRate: number;
  avgProgress: number;
  progressed: number;
};
