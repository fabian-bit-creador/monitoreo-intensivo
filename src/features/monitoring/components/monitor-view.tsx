import {
  Check,
  ClipboardCheck,
  LayoutGrid,
  List,
  Move,
  Search,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassroomMap } from "./classroom-map";
import { StudentList } from "@/features/students/components/student-list";
import { shortDate } from "@/lib/date";
import type {
  ClassSession,
  Course,
  Observation,
  RoomSlot,
  RoomTemplate,
  SeatAssignment,
  SessionMetrics,
  Student,
  Teacher,
} from "@/types/monitoring";

export type MonitorViewProps = {
  course: Course | null;
  teacher: Teacher | null;
  roomTemplate: RoomTemplate | null;
  roomSlots: RoomSlot[];
  seatAssignments: SeatAssignment[];
  session: ClassSession | null;
  students: Student[];
  allStudents: Student[];
  metrics: SessionMetrics | null;
  latest: Map<string, Observation>;
  round: number;
  setRound: (round: number) => void;
  layoutMode: "map" | "list";
  setLayoutMode: (mode: "map" | "list") => void;
  search: string;
  setSearch: (value: string) => void;
  selectSeat: (student: Student) => void;
  reorganizing: boolean;
  setReorganizing: (value: boolean) => void;
  movingStudent: Student | null;
  moveTo: (row: number | null, col: number | null) => void;
  onStart: () => void;
  onClose: () => void;
  busy: boolean;
};

export function MonitorView(props: MonitorViewProps) {
  const {
    course,
    teacher,
    roomTemplate,
    roomSlots,
    seatAssignments,
    session,
    students,
    allStudents,
    metrics,
    latest,
    round,
    setRound,
    layoutMode,
    setLayoutMode,
    search,
    setSearch,
    selectSeat,
    reorganizing,
    setReorganizing,
    movingStudent,
    moveTo,
    onStart,
    onClose,
    busy,
  } = props;

  if (!session) {
    return (
      <>
        <div className="page-heading">
          <p className="eyebrow">Monitoreo intensivo</p>
          <h1>{course?.name ?? "Curso"}</h1>
          <p>La distribución de la sala ya está preparada.</p>
        </div>
        <EmptyState onStart={onStart} courseName={course?.name} />
      </>
    );
  }

  return (
    <>
      <div className="monitor-heading">
        <div>
          <p className="eyebrow">
            {session.status === "active" ? "Sesión en curso" : "Sesión cerrada"}
            {` · ${shortDate(session.date)} · ${teacher?.fullName} · ${roomTemplate?.name}`}
          </p>
          <h1>{session.module}</h1>
          <p>{session.objective}</p>
        </div>
        <div className="heading-actions">
          {session.status === "active" ? (
            <button className="finish-button" onClick={onClose} disabled={busy}>
              <ClipboardCheck size={18} /> Finalizar clase
            </button>
          ) : (
            <span className="closed-pill"><Check size={16} /> Informe generado</span>
          )}
        </div>
      </div>

      <section className="live-kpis" aria-label="Resumen de la sesión">
        <div className="live-kpi coverage">
          <span>Cobertura</span><strong>{metrics?.coverage ?? 0}%</strong>
          <small>{metrics?.observed ?? 0} de {metrics?.present.length ?? 0}</small>
        </div>
        <div className="live-kpi i">
          <span>Instrucciones</span><strong>{metrics?.counts.I ?? 0}</strong>
          <small>requieren inicio</small>
        </div>
        <div className="live-kpi r">
          <span>En revisión</span><strong>{metrics?.counts.R ?? 0}</strong>
          <small>{metrics?.avgProgress ?? 0}% avance prom.</small>
        </div>
        <div className="live-kpi c">
          <span>Correctos</span><strong>{metrics?.counts.C ?? 0}</strong>
          <small>criterios comprobados</small>
        </div>
        <div className="live-kpi empty">
          <span>Sin registro</span><strong>{metrics?.unobserved ?? 0}</strong>
          <small>{metrics?.absent ?? 0} ausentes</small>
        </div>
      </section>

      <section className="monitor-toolbar card">
        <div className="round-control" aria-label="Recorrido actual">
          <span>Recorrido</span>
          {[1, 2, 3].map((item) => (
            <button
              key={item}
              className={round === item ? "active" : ""}
              onClick={() => setRound(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="toolbar-divider" />
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar estudiante"
          />
        </div>
        <div className="view-toggle">
          <button
            className={layoutMode === "map" ? "active" : ""}
            onClick={() => setLayoutMode("map")}
            aria-label="Vista mapa"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            className={layoutMode === "list" ? "active" : ""}
            onClick={() => setLayoutMode("list")}
            aria-label="Vista lista"
          >
            <List size={18} />
          </button>
        </div>
        <button
          className={`move-button ${reorganizing ? "active" : ""}`}
          onClick={() => setReorganizing(!reorganizing)}
        >
          <Move size={17} /> {reorganizing ? "Terminar" : "Mover puestos"}
        </button>
      </section>

      {reorganizing ? (
        <div className="move-banner">
          <Move size={18} />
          <p>
            {movingStudent
              ? `Ahora toca el puesto de destino para ${movingStudent.displayName}`
              : "Toca un estudiante y luego su puesto de destino. Si está ocupado, intercambiarán lugares."}
          </p>
          {movingStudent ? <button onClick={() => moveTo(null, null)}>Dejar sin puesto</button> : null}
        </div>
      ) : null}

      {layoutMode === "map" && !search ? (
        <ClassroomMap
          students={allStudents}
          roomTemplate={roomTemplate}
          roomSlots={roomSlots}
          seatAssignments={seatAssignments}
          latest={latest}
          presenceMap={metrics?.presenceMap ?? new Map()}
          onSelect={selectSeat}
          movingStudent={movingStudent}
          onEmpty={moveTo}
          reorganizing={reorganizing}
        />
      ) : (
        <StudentList
          students={students}
          latest={latest}
          presenceMap={metrics?.presenceMap ?? new Map()}
          onSelect={selectSeat}
          movingStudent={movingStudent}
        />
      )}
    </>
  );
}
