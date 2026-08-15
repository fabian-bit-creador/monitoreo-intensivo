import type { MonitoringState } from "@/types/monitoring";

type CourseStatusListProps = {
  data: MonitoringState;
};

export function CourseStatusList({ data }: CourseStatusListProps) {
  return (
    <div className="course-status-list">
      {data.courses.map((course) => {
        const studentCount = data.students.filter(
          (student) => student.courseId === course.id,
        ).length;
        const templateCount = data.roomTemplates.filter(
          (template) => template.courseId === course.id,
        ).length;
        const ready = studentCount > 0 && templateCount > 0;
        return (
          <div className="course-status-row" key={course.id}>
            <span>
              <strong>{course.name}</strong>
              <small>
                {ready
                  ? `${studentCount} estudiantes · ${templateCount} ${templateCount === 1 ? "plantilla" : "plantillas"}`
                  : "Pendiente de nómina y plantilla"}
              </small>
            </span>
            <span className={`course-status-badge ${ready ? "ready" : "pending"}`}>
              {ready ? "Operativo" : "Pendiente"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
