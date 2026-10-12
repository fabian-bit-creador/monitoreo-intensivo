import { ChangeEvent, useRef, useState } from "react";
import { AlertTriangle, CloudUpload, FileCheck2, LoaderCircle, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { APP_NAME, DEFAULT_TEACHER_ID } from "@/config/app";
import { parseBackupText, type ParsedBackup } from "@/features/monitoring/lib/backup";
import type { RemoteAccount } from "@/features/monitoring/repositories";
import type { MonitoringState } from "@/types/monitoring";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

type ImportResult = Record<string, number>;

type ServerImportCardProps = {
  account: RemoteAccount;
  busy: boolean;
  error: string;
  onImport: (schoolId: string, state: MonitoringState, teacherMap: Record<string, string>) => Promise<ImportResult | null>;
};

/**
 * Las clases sin docente pertenecían al docente por defecto del Site; aquí
 * todas quedan a nombre de la cuenta que importa, que es quien las dictó.
 */
function withTeachers(state: MonitoringState, userId: string) {
  const normalized: MonitoringState = {
    ...state,
    sessions: state.sessions.map((session) => ({ ...session, teacherId: session.teacherId ?? DEFAULT_TEACHER_ID })),
  };
  const legacyTeachers = [...new Set(normalized.sessions.map((session) => session.teacherId as string))];
  const teacherMap = Object.fromEntries(legacyTeachers.map((teacherId) => [teacherId, userId]));
  const names = legacyTeachers.map((teacherId) => state.teachers.find((teacher) => teacher.id === teacherId)?.fullName ?? teacherId);
  return { normalized, teacherMap, names };
}

export function ServerImportCard({ account, busy, error, onImport }: ServerImportCardProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const adminSchools = account.schools.filter((school) => school.role === "admin");
  const [schoolId, setSchoolId] = useState(adminSchools[0]?.id ?? "");
  const [preview, setPreview] = useState<{ fileName: string; parsed: ParsedBackup } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [attempted, setAttempted] = useState(false);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setResult(null);
    setAttempted(false);
    setPreview({
      fileName: file.name,
      parsed: file.size > MAX_FILE_BYTES
        ? { ok: false, error: "El archivo es demasiado grande para ser un respaldo." }
        : parseBackupText(await file.text()),
    });
  }

  async function confirm(state: MonitoringState) {
    const { normalized, teacherMap } = withTeachers(state, account.userId);
    setAttempted(true);
    const imported = await onImport(schoolId, normalized, teacherMap);
    if (imported) setResult(imported);
  }

  const parsed = preview?.parsed;
  const teachers = parsed?.ok ? withTeachers(parsed.state, account.userId).names : [];

  return (
    <>
      <article className="card settings-card">
        <div className="card-heading">
          <div><p className="eyebrow">Administración</p><h2>Subir datos al servidor</h2></div>
          <CloudUpload size={20} />
        </div>
        <ul className="settings-list">
          <li>Copia al establecimiento los cursos, estudiantes, clases y observaciones de un respaldo de esta aplicación o de los datos exportados del Site anterior.</li>
          <li>Se puede repetir: no duplica lo que ya se subió.</li>
        </ul>
        <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={(event) => void chooseFile(event)} />
        <div className="backup-actions">
          <button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={busy || !adminSchools.length}>
            <Upload size={17} /> Elegir archivo
          </button>
        </div>
      </article>
      {preview && parsed ? (
        <Modal title="Subir datos al servidor" onClose={() => setPreview(null)}>
          {!parsed.ok ? (
            <div className="form-stack">
              <div className="error-banner" role="alert"><AlertTriangle size={17} /> {parsed.error}</div>
              <button className="secondary-button wide" onClick={() => setPreview(null)}>Cerrar</button>
            </div>
          ) : result ? (
            <div className="form-stack">
              <div className="restore-summary">
                <p className="eyebrow">Listo</p>
                <strong><FileCheck2 size={17} /> {preview.fileName}</strong>
                <ul className="settings-list">
                  <li>{result.courses} cursos y {result.students} estudiantes nuevos</li>
                  <li>{result.sessions} clases y {result.observations} observaciones nuevas</li>
                  {result.skippedObservations ? (
                    <li>{result.skippedObservations} observaciones no se subieron porque el estudiante no estaba en la nómina de su clase.</li>
                  ) : null}
                </ul>
              </div>
              <button className="primary-button wide" onClick={() => setPreview(null)}>Cerrar</button>
            </div>
          ) : (
            <div className="form-stack">
              <div className="restore-summary">
                <p className="eyebrow">{parsed.origin === "legacy-site" ? "Datos exportados del Site anterior" : `Respaldo de ${APP_NAME}`}</p>
                <strong><FileCheck2 size={17} /> {preview.fileName}</strong>
                <ul className="settings-list">
                  <li>{parsed.summary.courses} cursos y {parsed.summary.students} estudiantes</li>
                  <li>{parsed.summary.sessions} clases y {parsed.summary.observations} observaciones</li>
                </ul>
              </div>
              {adminSchools.length > 1 ? (
                <label>
                  <span>Establecimiento</span>
                  <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
                    {adminSchools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="form-help">
                <AlertTriangle size={17} />
                <p>
                  Se subirán a «{adminSchools.find((school) => school.id === schoolId)?.name}». Las clases de{" "}
                  {teachers.join(", ") || "este respaldo"} quedarán a nombre de tu cuenta.
                  {parsed.warnings.length ? ` Avisos: ${parsed.warnings.join("; ")}.` : ""}
                </p>
              </div>
              {attempted && error ? (
                <div className="error-banner" role="alert"><AlertTriangle size={17} /> {error}</div>
              ) : null}
              <button className="primary-button wide" disabled={busy || !schoolId} onClick={() => void confirm(parsed.state)}>
                {busy ? <LoaderCircle className="spin" size={18} /> : <CloudUpload size={18} />}
                Subir al servidor
              </button>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
