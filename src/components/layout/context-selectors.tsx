import { ChevronDown } from "lucide-react";
import type { MonitoringState } from "@/types/monitoring";

type ContextSelectorsProps = {
  data: MonitoringState;
  teacherId: string;
  courseId: string;
  readyCourseIds: Set<string>;
  onTeacherChange: (teacherId: string) => void;
  onCourseChange: (courseId: string) => void;
  mobile?: boolean;
};

export function ContextSelectors({
  data,
  teacherId,
  courseId,
  readyCourseIds,
  onTeacherChange,
  onCourseChange,
  mobile = false,
}: ContextSelectorsProps) {
  const teacherSelect = (
    <div className="select-wrap">
      <select value={teacherId} onChange={(event) => onTeacherChange(event.target.value)}>
        {data.teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
        ))}
      </select>
      <ChevronDown size={16} />
    </div>
  );
  const courseSelect = (
    <div className="select-wrap">
      <select value={courseId} onChange={(event) => onCourseChange(event.target.value)}>
        {data.courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}{readyCourseIds.has(course.id) ? "" : " · Pendiente"}
          </option>
        ))}
      </select>
      <ChevronDown size={16} />
    </div>
  );

  if (mobile) {
    return (
      <>
        <label><span>Docente</span>{teacherSelect}</label>
        <label><span>Curso</span>{courseSelect}</label>
      </>
    );
  }

  return (
    <div className="context-controls">
      <div className="course-control"><label>Docente activo</label>{teacherSelect}</div>
      <div className="course-control"><label>Curso</label>{courseSelect}</div>
    </div>
  );
}
