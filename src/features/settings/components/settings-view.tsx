import {
  Check,
  CircleHelp,
  LayoutGrid,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DEMO_COURSE_ID } from "@/config/app";
import { CourseStatusList } from "@/features/courses/components/course-status-list";
import { TeacherList } from "@/features/teachers/components/teacher-list";
import type { MonitoringState } from "@/types/monitoring";

type SettingsViewProps = {
  data: MonitoringState;
  selectedTeacherId: string;
  onSelectTeacher: (teacherId: string) => void;
};

export function SettingsView({
  data,
  selectedTeacherId,
  onSelectTeacher,
}: SettingsViewProps) {
  const operationalTemplates = data.roomTemplates.filter(
    (template) => template.courseId === DEMO_COURSE_ID,
  ).length;

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Beta compartida</p>
        <h1>Configuración</h1>
        <p>Equipo piloto, cursos disponibles y estado de preparación de cada plantilla.</p>
      </div>

      <section className="settings-grid">
        <article className="card settings-card teacher-settings">
          <div className="card-heading">
            <div><p className="eyebrow">Equipo piloto</p><h2>Docentes de prueba</h2></div>
            <Users size={20} />
          </div>
          <TeacherList
            teachers={data.teachers}
            selectedTeacherId={selectedTeacherId}
            onSelect={onSelectTeacher}
          />
        </article>

        <div className="settings-stack">
          <article className="card settings-card">
            <div className="card-heading">
              <div><p className="eyebrow">Catálogo 2026</p><h2>Cursos piloto</h2></div>
              <LayoutGrid size={20} />
            </div>
            <CourseStatusList data={data} />
          </article>

          <article className="card settings-card">
            <div className="card-heading">
              <div><p className="eyebrow">Alcance actual</p><h2>III°A operativo</h2></div>
              <ShieldCheck size={20} />
            </div>
            <ul className="settings-list">
              <li><Check size={16} /> Los {data.teachers.length} docentes comparten la nómina de demostración de III°A.</li>
              <li><Check size={16} /> III°A tiene {operationalTemplates} plantillas disponibles.</li>
              <li><Check size={16} /> Cada clase queda identificada con el docente que la inició.</li>
              <li><Check size={16} /> El historial y las tendencias se separan por profesor.</li>
            </ul>
          </article>

          <article className="card settings-card beta-warning">
            <div className="card-heading">
              <div><p className="eyebrow">Importante</p><h2>Identificación, no contraseña</h2></div>
              <CircleHelp size={20} />
            </div>
            <p>
              Seleccionar un nombre no verifica la identidad. En esta etapa los cambios quedan
              en este navegador; usa nombres abreviados y no registres diagnósticos,
              calificaciones ni antecedentes personales.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
