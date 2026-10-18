import { useState } from "react";
import { Archive, Check, Pencil, Plus, RotateCcw, Star, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { MonitoringState } from "@/types/monitoring";

type CoursesViewProps = {
  data: MonitoringState;
  selectedCourseId: string;
  busy: boolean;
  onSelect: (courseId: string) => void;
  onCreate: () => void;
  onUpdateDetails: (courseId: string, name: string, academicYear: number) => Promise<boolean>;
  onUpdateFocus: (courseId: string, studentIds: string[]) => Promise<boolean>;
  onArchive: (courseId: string, archived: boolean) => Promise<boolean>;
};

export function CoursesView(props: CoursesViewProps) {
  const { data, selectedCourseId, busy, onSelect, onCreate, onUpdateDetails, onUpdateFocus, onArchive } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const course = data.courses.find((item) => item.id === editingId);
  const focusCourse = data.courses.find((item) => item.id === focusId);
  const archiveCourse = data.courses.find((item) => item.id === archiveId);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);

  function openEdit(id: string) {
    const item = data.courses.find((candidate) => candidate.id === id);
    if (!item) return;
    setName(item.name);
    setYear(item.academicYear ?? new Date().getFullYear());
    setEditingId(id);
  }

  function openFocus(id: string) {
    setSelectedFocus(data.students.filter((student) => student.courseId === id && student.active && student.isFocus).map((student) => student.id));
    setFocusId(id);
  }

  const active = data.courses.filter((item) => !item.archivedAt);
  const archived = data.courses.filter((item) => item.archivedAt);

  const list = (courses: typeof data.courses) => (
    <div className="course-card-grid">
      {courses.map((item) => {
        const students = data.students.filter((student) => student.courseId === item.id && student.active);
        const focus = students.filter((student) => student.isFocus).length;
        return (
          <article className={`card course-card ${selectedCourseId === item.id ? "selected" : ""}`} key={item.id}>
            <div>
              <p className="eyebrow">{item.academicYear ?? "Año sin definir"}</p>
              <h2>{item.name}</h2>
              <p className="course-card-stats"><Users size={16} /> {students.length} estudiantes <Star size={16} /> {focus} foco</p>
            </div>
            <div className="course-card-actions">
              {!item.archivedAt ? <button className="primary-button" onClick={() => onSelect(item.id)}><Check size={16} /> Usar curso</button> : null}
              <button className="secondary-button" onClick={() => openEdit(item.id)}><Pencil size={16} /> Editar</button>
              {!item.archivedAt ? <button className="secondary-button" onClick={() => openFocus(item.id)}><Star size={16} /> Foco</button> : null}
              <button className="secondary-button" onClick={() => item.archivedAt ? void onArchive(item.id, false) : setArchiveId(item.id)} disabled={busy}>
                {item.archivedAt ? <RotateCcw size={16} /> : <Archive size={16} />} {item.archivedAt ? "Restaurar" : "Archivar"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="page-heading courses-heading">
        <div><p className="eyebrow">Cuenta personal</p><h1>Mis cursos</h1><p>Cada curso, estudiante y clase de esta sección pertenece a tu cuenta.</p></div>
        <button className="primary-button" onClick={onCreate}><Plus size={18} /> Añadir curso</button>
      </div>
      {active.length ? list(active) : (
        <section className="card empty-courses"><Star size={28} /><h2>Crea tu primer curso</h2><p>Define la cantidad de estudiantes, descarga la plantilla y elige a tus estudiantes foco.</p><button className="primary-button" onClick={onCreate}><Plus size={18} /> Configurar primer curso</button></section>
      )}
      {archived.length ? <section className="archived-courses"><h2>Cursos archivados</h2>{list(archived)}</section> : null}

      {course ? (
        <Modal title="Editar curso" onClose={() => setEditingId(null)}>
          <div className="form-stack">
            <label><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label><span>Año académico</span><input type="number" min="2000" max="2200" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
            <button className="primary-button wide" disabled={busy || !name.trim()} onClick={() => void onUpdateDetails(course.id, name, year).then((ok) => ok && setEditingId(null))}>Guardar cambios</button>
          </div>
        </Modal>
      ) : null}

      {focusCourse ? (
        <Modal title={`Estudiantes foco · ${focusCourse.name}`} onClose={() => setFocusId(null)}>
          <div className="focus-picker-grid">
            {data.students.filter((student) => student.courseId === focusCourse.id && student.active).map((student) => (
              <label key={student.id} className={selectedFocus.includes(student.id) ? "selected" : ""}>
                <input type="checkbox" checked={selectedFocus.includes(student.id)} onChange={() => setSelectedFocus((current) => current.includes(student.id) ? current.filter((id) => id !== student.id) : [...current, student.id])} />
                <span><b>{student.number}</b> {student.fullName}</span>
              </label>
            ))}
          </div>
          <button className="primary-button wide" disabled={busy} onClick={() => void onUpdateFocus(focusCourse.id, selectedFocus).then((ok) => ok && setFocusId(null))}><Star size={17} /> Guardar {selectedFocus.length} foco</button>
        </Modal>
      ) : null}

      {archiveCourse ? (
        <Modal title="Archivar curso" onClose={() => setArchiveId(null)}>
          <div className="form-stack"><p>¿Archivar «{archiveCourse.name}»? Dejará de aparecer en el selector, pero sus clases e informes se conservarán.</p><div className="import-actions"><button className="secondary-button wide" onClick={() => setArchiveId(null)}>Cancelar</button><button className="primary-button wide" disabled={busy} onClick={() => void onArchive(archiveCourse.id, true).then((ok) => ok && setArchiveId(null))}><Archive size={17} /> Sí, archivar</button></div></div>
        </Modal>
      ) : null}
    </>
  );
}
