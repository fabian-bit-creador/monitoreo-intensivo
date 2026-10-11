import { AlertTriangle, Download, FileCheck2, LoaderCircle, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type {
  BackupOrigin,
  BackupSummary,
  ParsedBackup,
} from "@/features/monitoring/lib/backup";
import type { MonitoringState } from "@/types/monitoring";

type RestoreBackupModalProps = {
  fileName: string;
  parsed: ParsedBackup;
  current: BackupSummary;
  busy: boolean;
  error: string;
  onDownloadCurrent: () => void;
  onConfirm: (state: MonitoringState) => void;
  onClose: () => void;
};

const ORIGIN_LABELS: Record<BackupOrigin, string> = {
  backup: "Respaldo de Monitoreo PI",
  storage: "Copia del almacenamiento del navegador",
  "legacy-site": "Datos exportados del Site anterior",
};

const dateFormat = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return dateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

function describe(summary: BackupSummary) {
  const period = summary.firstDate && summary.lastDate
    ? summary.firstDate === summary.lastDate
      ? `, el ${formatDate(summary.firstDate)}`
      : `, del ${formatDate(summary.firstDate)} al ${formatDate(summary.lastDate)}`
    : "";
  return [
    `${summary.courses} cursos y ${summary.students} estudiantes`,
    `${summary.sessions} clases (${summary.activeSessions} en curso)${period}`,
    `${summary.observations} observaciones`,
  ];
}

export function RestoreBackupModal(props: RestoreBackupModalProps) {
  const { fileName, parsed, current, busy, error, onDownloadCurrent, onConfirm, onClose } = props;

  return (
    <Modal title="Restaurar respaldo" onClose={onClose}>
      {!parsed.ok ? (
        <div className="form-stack">
          <div className="error-banner"><AlertTriangle size={17} /> {parsed.error}</div>
          <p className="restore-note">No se cambió ningún dato. Archivo: {fileName}</p>
          <button className="secondary-button wide" onClick={onClose}>Cerrar</button>
        </div>
      ) : (
        <div className="form-stack">
          <div className="restore-summary">
            <p className="eyebrow">{ORIGIN_LABELS[parsed.origin]}</p>
            <strong><FileCheck2 size={17} /> {fileName}</strong>
            <ul className="settings-list">
              {describe(parsed.summary).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          {parsed.warnings.length ? (
            <div className="form-help warning">
              <AlertTriangle size={17} />
              <p>
                Se restaurará tal como viene, con estos avisos: {parsed.warnings.join("; ")}.
              </p>
            </div>
          ) : null}
          <div className="form-help">
            <AlertTriangle size={17} />
            <p>
              Reemplazará los datos de este navegador ({describe(current).join(", ")}). Se
              guardará una copia aquí mismo; si quieres conservarlos fuera del navegador,
              descarga antes un respaldo.
            </p>
          </div>
          {error ? (
            <div className="error-banner" role="alert"><AlertTriangle size={17} /> {error}</div>
          ) : null}
          <div className="import-actions">
            <button className="secondary-button wide" onClick={onDownloadCurrent}>
              <Download size={18} /> Descargar respaldo actual
            </button>
            <button
              className="primary-button wide"
              onClick={() => onConfirm(parsed.state)}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
              Reemplazar datos
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
