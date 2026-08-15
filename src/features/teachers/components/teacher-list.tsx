import { ArrowRight, Check } from "lucide-react";
import type { Teacher } from "@/types/monitoring";

type TeacherListProps = {
  teachers: Teacher[];
  selectedTeacherId: string;
  onSelect: (teacherId: string) => void;
};

export function TeacherList({
  teachers,
  selectedTeacherId,
  onSelect,
}: TeacherListProps) {
  return (
    <div className="teacher-list">
      {teachers.map((teacher) => (
        <button
          key={teacher.id}
          className={`teacher-row ${teacher.id === selectedTeacherId ? "active" : ""}`}
          onClick={() => onSelect(teacher.id)}
        >
          <span className="teacher-avatar">
            {teacher.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}
          </span>
          <span className="teacher-name">
            <strong>{teacher.fullName}</strong>
            <small>{teacher.role === "admin" ? "Administrador de la beta" : "Docente de prueba"}</small>
          </span>
          <span className={`role-badge ${teacher.role}`}>
            {teacher.role === "admin" ? "Admin" : "Docente"}
          </span>
          {teacher.id === selectedTeacherId
            ? <Check size={17} />
            : <ArrowRight size={17} />}
        </button>
      ))}
    </div>
  );
}
