import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Observation, Student } from "@/types/monitoring";

type StudentListProps = {
  students: Student[];
  latest: Map<string, Observation>;
  presenceMap: Map<string, boolean>;
  onSelect: (student: Student) => void;
  movingStudent: Student | null;
};

export function StudentList({
  students,
  latest,
  presenceMap,
  onSelect,
  movingStudent,
}: StudentListProps) {
  return (
    <div className="student-list card">
      {students.map((student) => {
        const observation = latest.get(student.id);
        const absent = presenceMap.get(student.id) === false;
        return (
          <button
            key={student.id}
            className={movingStudent?.id === student.id ? "selected" : ""}
            onClick={() => onSelect(student)}
          >
            <span className="list-number">{student.number ?? "—"}</span>
            <span className="list-name">
              <strong>{student.displayName}</strong>
              <small>{student.fullName}</small>
            </span>
            <StatusBadge observation={observation} absent={absent} />
            <ArrowRight size={17} />
          </button>
        );
      })}
    </div>
  );
}
