import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { DatabaseBackup, Download, Trash2, Upload } from "lucide-react";
import {
  parseBackupText,
  summarizeState,
  type ParsedBackup,
} from "@/features/monitoring/lib/backup";
import type { SavedCopy, SavedCopyKind } from "@/features/monitoring/repositories";
import type { MonitoringState } from "@/types/monitoring";
import { RestoreBackupModal } from "./restore-backup-modal";

export type BackupCardProps = {
  data: MonitoringState;
  busy: boolean;
  error: string;
  /** Solo en modo local: restaurar reemplaza los datos de este navegador. */
  allowRestore: boolean;
  onDownload: () => void;
  onRestore: (state: MonitoringState) => Promise<boolean>;
  onDownloadCopy: (raw: string, prefix: string) => void;
  listSavedCopies: () => Promise<SavedCopy[]>;
  deleteSavedCopy: (kind: SavedCopyKind) => Promise<void>;
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const COPY_LABELS: Record<SavedCopyKind, { title: string; prefix: string }> = {
  restore: { title: "Datos reemplazados al restaurar", prefix: "monitoreo-copia-restauracion" },
  recovery: { title: "Datos que no se pudieron abrir", prefix: "monitoreo-copia-recuperacion" },
};

const copyDate = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function BackupCard(props: BackupCardProps) {
  const {
    data,
    busy,
    error,
    allowRestore,
    onDownload,
    onRestore,
    onDownloadCopy,
    listSavedCopies,
    deleteSavedCopy,
  } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ fileName: string; parsed: ParsedBackup } | null>(null);
  const [copies, setCopies] = useState<SavedCopy[]>([]);
  // El error del store solo se muestra en el modal si surge al confirmar.
  const [attempted, setAttempted] = useState(false);
  const summary = summarizeState(data);

  const refreshCopies = useCallback(() => {
    void listSavedCopies().then(setCopies);
  }, [listSavedCopies]);

  useEffect(refreshCopies, [refreshCopies]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed: ParsedBackup = file.size > MAX_FILE_BYTES
      ? { ok: false, error: "El archivo es demasiado grande para ser un respaldo." }
      : parseBackupText(await file.text());
    setAttempted(false);
    setPreview({ fileName: file.name, parsed });
  }

  async function confirmRestore(state: MonitoringState) {
    setAttempted(true);
    if (!(await onRestore(state))) return;
    setPreview(null);
    refreshCopies();
  }

  async function removeCopy(kind: SavedCopyKind) {
    await deleteSavedCopy(kind);
    refreshCopies();
  }

  return (
    <>
      <article className="card settings-card">
        <div className="card-heading">
          <div><p className="eyebrow">Respaldo</p><h2>{allowRestore ? "Datos de este navegador" : "Copia de tus datos"}</h2></div>
          <DatabaseBackup size={20} />
        </div>
        <ul className="settings-list">
          <li>
            {summary.courses} cursos, {summary.students} estudiantes, {summary.sessions} clases y{" "}
            {summary.observations} observaciones.
          </li>
          <li>
            {allowRestore
              ? "Descarga un respaldo antes de cambiar de navegador o de equipo. Restaurar acepta también los datos exportados del Site anterior."
              : "Descarga una copia de lo que ves en el servidor, por ejemplo antes de una revisión. Guárdala en un lugar privado."}
          </li>
        </ul>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".json,application/json"
          onChange={(event) => void chooseFile(event)}
        />
        <div className="backup-actions">
          <button className="secondary-button" onClick={onDownload}>
            <Download size={17} /> Descargar respaldo
          </button>
          {allowRestore ? (
            <button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload size={17} /> Restaurar respaldo
            </button>
          ) : null}
        </div>
        {copies.length ? (
          <div className="saved-copies">
            <p>Copias guardadas en este navegador</p>
            {copies.map((copy) => (
              <div className="saved-copy" key={copy.kind}>
                <span>
                  {COPY_LABELS[copy.kind].title} · {copyDate.format(new Date(copy.savedAt))}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Descargar: ${COPY_LABELS[copy.kind].title}`}
                  onClick={() => onDownloadCopy(copy.raw, COPY_LABELS[copy.kind].prefix)}
                >
                  <Download size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Eliminar: ${COPY_LABELS[copy.kind].title}`}
                  onClick={() => void removeCopy(copy.kind)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </article>
      {preview ? (
        <RestoreBackupModal
          fileName={preview.fileName}
          parsed={preview.parsed}
          current={summary}
          busy={busy}
          error={attempted ? error : ""}
          onDownloadCurrent={onDownload}
          onConfirm={(state) => void confirmRestore(state)}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
