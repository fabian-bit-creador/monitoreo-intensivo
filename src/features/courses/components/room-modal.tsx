import { useState } from "react";
import { AlertTriangle, LoaderCircle, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { layoutError } from "@/features/courses/lib/room-layouts";
import { RoomDesigner, type RoomDraft } from "./room-designer";

type RoomModalProps = {
  mode: "create" | "edit";
  title?: string;
  submitLabel?: string;
  studentCount: number;
  initial: RoomDraft;
  busy: boolean;
  error: string;
  onSave: (draft: RoomDraft) => Promise<boolean>;
  onClose: () => void;
};

/** Agregar una sala al curso o cambiar la forma de la actual. */
export function RoomModal({ mode, title, submitLabel, studentCount, initial, busy, error, onSave, onClose }: RoomModalProps) {
  const [draft, setDraft] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const problem = draft.name.trim() ? layoutError(draft.layout) : "Escribe el nombre de la sala.";

  async function save() {
    setAttempted(true);
    if (problem) return;
    if (await onSave({ name: draft.name.trim(), layout: draft.layout })) onClose();
  }

  return (
    <Modal title={title ?? (mode === "create" ? "Nueva sala para el curso" : "Cambiar la forma de la sala")} onClose={onClose}>
      <RoomDesigner studentCount={studentCount} value={draft} onChange={setDraft} />
      {mode === "edit" ? (
        <p className="room-note">
          Quienes estén en un puesto que desaparece quedan «Sin puesto asignado». Las clases ya
          realizadas conservan su registro.
        </p>
      ) : null}
      {(attempted && (problem || error)) ? (
        <div className="error-banner" role="alert"><AlertTriangle size={17} /> {problem || error}</div>
      ) : null}
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="primary-button" onClick={() => void save()} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
          {submitLabel ?? (mode === "create" ? "Crear sala" : "Guardar forma")}
        </button>
      </div>
    </Modal>
  );
}

