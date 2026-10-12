import { BookOpen, DoorOpen, Move, Plus, X } from "lucide-react";
import { WORKSHOP_ROOM_TEMPLATE_ID } from "@/config/app";
import { StudentCard } from "@/features/students/components/student-card";
import type {
  Observation,
  RoomSlot,
  RoomTemplate,
  SeatAssignment,
  Student,
} from "@/types/monitoring";

type ClassroomMapProps = {
  students: Student[];
  roomTemplate: RoomTemplate | null;
  roomSlots: RoomSlot[];
  seatAssignments: SeatAssignment[];
  latest: Map<string, Observation>;
  presenceMap: Map<string, boolean>;
  onSelect: (student: Student) => void;
  movingStudent: Student | null;
  onEmpty: (row: number | null, col: number | null) => void;
  reorganizing: boolean;
};

export function ClassroomMap(props: ClassroomMapProps) {
  const {
    students,
    roomTemplate,
    roomSlots,
    seatAssignments,
    latest,
    presenceMap,
    onSelect,
    movingStudent,
    onEmpty,
    reorganizing,
  } = props;
  const studentById = new Map(students.map((student) => [student.id, student]));
  const assigned = new Map(
    seatAssignments.flatMap((assignment) => {
      const student = studentById.get(assignment.studentId);
      return student
        ? [[`${assignment.seatRow}-${assignment.seatCol}`, student] as const]
        : [];
    }),
  );
  const assignedStudentIds = new Set(seatAssignments.map((assignment) => assignment.studentId));
  const unassigned = students.filter((student) => !assignedStudentIds.has(student.id));
  const slotMap = new Map(roomSlots.map((slot) => [`${slot.seatRow}-${slot.seatCol}`, slot]));
  const rowCount = roomTemplate?.rowCount ?? 7;
  const columnCount = roomTemplate?.columnCount ?? 6;
  const isWorkshop = roomTemplate?.id === WORKSHOP_ROOM_TEMPLATE_ID;
  // Salas con forma (ADR 0004): los pasillos son columnas y filas angostas, y
  // cada grupo o mesón muestra su nombre en su primer puesto.
  const designed = Boolean(roomTemplate?.layout && roomTemplate.layout !== "classic");
  const usedRows = new Set(roomSlots.map((slot) => slot.seatRow));
  const usedCols = new Set(roomSlots.map((slot) => slot.seatCol));
  const groupStarts = new Set<string>();
  const seenGroups = new Set<string>();
  [...roomSlots]
    .sort((first, second) => first.seatRow - second.seatRow || first.seatCol - second.seatCol)
    .forEach((slot) => {
      if (slot.groupLabel && !seenGroups.has(slot.groupLabel)) {
        seenGroups.add(slot.groupLabel);
        groupStarts.add(`${slot.seatRow}-${slot.seatCol}`);
      }
    });
  const gridStyle = designed
    ? {
      gridTemplateColumns: Array.from({ length: columnCount }, (_, col) => (usedCols.has(col) ? "minmax(112px, 1fr)" : "22px")).join(" "),
      gridTemplateRows: Array.from({ length: rowCount }, (_, row) => (usedRows.has(row) ? "auto" : "14px")).join(" "),
    }
    : { gridTemplateColumns: `repeat(${columnCount}, minmax(112px, 1fr))` };

  return (
    <section className="classroom card">
      <div className="room-topline">
        <span>
          {isWorkshop
            ? <><Move size={16} /> Pasillo central</>
            : <><DoorOpen size={16} /> Puerta</>}
        </span>
        <span className="room-label">
          {roomTemplate?.name ?? "Sala"} · Vista desde el puesto del profesor
        </span>
      </div>
      <div className="seat-scroll">
        <div
          className={`seat-grid ${isWorkshop ? "workshop-grid" : ""} ${designed ? "designed-grid" : ""}`}
          style={gridStyle}
        >
          {Array.from({ length: rowCount * columnCount }, (_, index) => {
            const row = Math.floor(index / columnCount);
            const col = index % columnCount;
            const student = assigned.get(`${row}-${col}`);
            const slot = slotMap.get(`${row}-${col}`);
            if (!slot) {
              return (
                <div
                  key={`${row}-${col}`}
                  className={`seat-cell col-${col} hidden-seat ${designed ? "gap-cell" : ""}`}
                  aria-hidden="true"
                />
              );
            }

            return (
              <div key={`${row}-${col}`} className={`seat-cell col-${col}`}>
                {designed && slot.groupLabel && groupStarts.has(`${row}-${col}`) ? (
                  <span className="seat-group-label">{slot.groupLabel}</span>
                ) : null}
                {student ? (
                  <StudentCard
                    student={student}
                    observation={latest.get(student.id)}
                    absent={presenceMap.get(student.id) === false}
                    selected={movingStudent?.id === student.id}
                    onClick={() => onSelect(student)}
                  />
                ) : slot.status === "unavailable" ? (
                  <div
                    className="unavailable-seat"
                    aria-label={`Puesto no disponible fila ${row + 1}, columna ${col + 1}`}
                  >
                    <X size={17} /><span>No disponible</span>
                  </div>
                ) : (
                  <button
                    className={`empty-seat ${reorganizing && movingStudent ? "available" : ""}`}
                    onClick={() => reorganizing && movingStudent && onEmpty(row, col)}
                    disabled={!reorganizing || !movingStudent}
                    aria-label={`Puesto vacío fila ${row + 1}, columna ${col + 1}`}
                  >
                    {reorganizing && movingStudent ? <Plus size={18} /> : <span>Disponible</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className={`board-area ${isWorkshop ? "workshop-board" : ""}`}>
        <span>PIZARRA</span>
        {isWorkshop ? <span><DoorOpen size={16} /> Puerta</span> : null}
        <span><BookOpen size={16} /> Puesto del profesor</span>
      </div>
      {unassigned.length ? (
        <div className="unassigned-area">
          <p>Sin puesto asignado</p>
          <div>
            {unassigned.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                observation={latest.get(student.id)}
                absent={presenceMap.get(student.id) === false}
                selected={movingStudent?.id === student.id}
                onClick={() => onSelect(student)}
                compact
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
