import {
  Check,
  CircleHelp,
  FileSpreadsheet,
  Plus,
  Presentation,
  Upload,
} from "lucide-react";
import { PageHeading } from "./page-heading";
import type { Course } from "@/types/monitoring";

type EmptyStateProps = {
  onStart: () => void;
  courseName?: string;
};

export function EmptyState({ onStart, courseName = "el curso" }: EmptyStateProps) {
  return (
    <div className="empty-state card">
      <div className="empty-icon"><Presentation size={30} /></div>
      <p className="eyebrow">Todo preparado</p>
      <h2>Inicia tu primera sesión de monitoreo</h2>
      <p>
        La nómina y los puestos de {courseName} ya están cargados. Define la actividad y
        comienza el recorrido por la sala.
      </p>
      <button className="primary-button" onClick={onStart}>
        <Plus size={18} /> Iniciar clase
      </button>
    </div>
  );
}

type PendingCourseStateProps = {
  course: Course | null;
  onImport: () => void;
};

export function PendingCourseState({ course, onImport }: PendingCourseStateProps) {
  return (
    <>
      <PageHeading
        eyebrow="Curso incorporado"
        title={course?.name ?? "Curso pendiente"}
        subtitle="Este curso ya forma parte de la beta y quedará habilitado cuando tenga nómina y plantilla."
      />
      <div className="pending-course-card card">
        <div className="empty-icon"><FileSpreadsheet size={30} /></div>
        <span className="pending-badge">Pendiente de nómina y plantilla</span>
        <h2>Preparado para configurar más adelante</h2>
        <p>
          Aún no se puede iniciar una clase para evitar sesiones vacías. Cuando agreguemos la
          nómina y la distribución de puestos, el monitoreo quedará habilitado automáticamente.
        </p>
        <div className="pending-checklist">
          <span><Check size={16} /> Curso agregado al selector</span>
          <span><CircleHelp size={16} /> Nómina por incorporar</span>
          <span><CircleHelp size={16} /> Plantilla de sala por incorporar</span>
        </div>
        <button className="secondary-button" onClick={onImport}>
          <Upload size={17} /> Importar nómina cuando esté disponible
        </button>
      </div>
    </>
  );
}
