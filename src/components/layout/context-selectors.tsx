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
  /** Espacios de la cuenta (ADR 0004): con más de uno, los cursos se agrupan. */
  spaces?: Array<{ id: string; name: string }>;
};

export function ContextSelectors({
  data,
  teacherId,
  courseId,
  readyCourseIds,
  onTeacherChange,
  onCourseChange,
  mobile = false,
  spaces = [],
}: ContextSelectorsProps) {
  const courseOption = (course: MonitoringState["courses"][number]) => (
    <option key={course.id} value={course.id}>
      {course.name}{readyCourseIds.has(course.id) ? "" : " · Pendiente"}
    </option>
  );
  const grouped = spaces.length > 1
    ? spaces
      .map((space) => ({ ...space, courses: data.courses.filter((course) => course.spaceId === space.id) }))
      .filter((space) => space.courses.length)
    : [];
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
        {grouped.length
          ? grouped.map((space) => (
            <optgroup key={space.id} label={space.name}>{space.courses.map(courseOption)}</optgroup>
          ))
          : data.courses.map(courseOption)}
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
