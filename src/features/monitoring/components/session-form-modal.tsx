import { FormEvent } from "react";
import { Activity, LoaderCircle, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { todayIso } from "@/lib/date";
import type { CreateSessionInput } from "@/features/monitoring/lib/monitoring-service";
import type { Course, RoomTemplate, Teacher } from "@/types/monitoring";

type SessionFormModalProps = {
  teacher: Teacher | null;
  course: Course | null;
  courseId: string;
  teacherId: string;
  selectedTemplateId: string;
  roomTemplates: RoomTemplate[];
  busy: boolean;
  onSubmit: (input: CreateSessionInput) => void;
  onClose: () => void;
};

export function SessionFormModal(props: SessionFormModalProps) {
  const {
    teacher,
    course,
    courseId,
    teacherId,
    selectedTemplateId,
    roomTemplates,
    busy,
    onSubmit,
    onClose,
  } = props;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      courseId,
      teacherId,
      roomTemplateId: String(form.get("roomTemplateId") || selectedTemplateId),
      date: String(form.get("date") || ""),
      module: String(form.get("module") || ""),
      objective: String(form.get("objective") || ""),
      successCriteria: String(form.get("successCriteria") || ""),
    });
  }

  const defaultTemplateId = roomTemplates.some((template) => template.id === selectedTemplateId)
    ? selectedTemplateId
    : roomTemplates[0]?.id;

  return (
    <Modal title="Nueva sesión de práctica independiente" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-row">
          <label><span>Docente</span><input value={teacher?.fullName ?? ""} disabled /></label>
          <label><span>Curso</span><input value={course?.name ?? ""} disabled /></label>
        </div>
        <label>
          <span>Plantilla de sala o taller</span>
          <select name="roomTemplateId" defaultValue={defaultTemplateId} required>
            {roomTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Fecha</span>
          <input name="date" type="date" defaultValue={todayIso()} required />
        </label>
        <label>
          <span>Módulo o asignatura</span>
          <input name="module" placeholder="Ej.: Atención de clientes" required />
        </label>
        <label>
          <span>Objetivo o entregable</span>
          <textarea
            name="objective"
            rows={3}
            placeholder="¿Qué deben producir o demostrar los estudiantes?"
            required
          />
        </label>
        <label>
          <span>Criterios de éxito</span>
          <textarea
            name="successCriteria"
            rows={3}
            placeholder="¿Qué comprobarás antes de marcar C?"
            required
          />
        </label>
        <div className="form-help">
          <Sparkles size={17} />
          <p>Estos datos aparecerán en el informe y ayudarán a interpretar I, R y C.</p>
        </div>
        <button className="primary-button wide" disabled={busy}>
          {busy
            ? <LoaderCircle className="spin" size={18} />
            : <Activity size={18} />}
          Iniciar recorrido 1
        </button>
      </form>
    </Modal>
  );
}
