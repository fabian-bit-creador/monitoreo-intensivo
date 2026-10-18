import { ChevronDown } from "lucide-react";
import type { MonitoringState } from "@/types/monitoring";

type ContextSelectorsProps = {
  data: MonitoringState;
  teacherId: string;
  courseId: string;
  readyCourseIds: Set<string>;
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
      .map((space) => ({ ...space, courses: data.courses.filter((course) => course.spaceId === space.id && !course.archivedAt) }))
      .filter((space) => space.courses.length)
    : [];
  const teacher = data.teachers.find((item) => item.id === teacherId) ?? data.teachers[0];
  const courseSelect = (
    <div className="select-wrap">
      <select value={courseId} onChange={(event) => onCourseChange(event.target.value)}>
        {grouped.length
          ? grouped.map((space) => (
            <optgroup key={space.id} label={space.name}>{space.courses.map(courseOption)}</optgroup>
          ))
          : data.courses.filter((course) => !course.archivedAt).map(courseOption)}
      </select>
      <ChevronDown size={16} />
    </div>
  );

  if (mobile) {
    return (
      <>
        <label><span>Mi cuenta</span><strong className="account-name">{teacher?.fullName ?? "Docente"}</strong></label>
        <label><span>Curso</span>{courseSelect}</label>
      </>
    );
  }

  return (
    <div className="context-controls">
      <div className="course-control"><label>Mi cuenta</label><strong className="account-name">{teacher?.fullName ?? "Docente"}</strong></div>
      <div className="course-control"><label>Curso</label>{courseSelect}</div>
    </div>
  );
}
