import {
  Check,
  CircleHelp,
  LayoutGrid,
  ShieldCheck,
} from "lucide-react";
import { DEMO_COURSE_ID } from "@/config/app";
import { CourseStatusList } from "@/features/courses/components/course-status-list";
import type { LocalDataSnapshot, RemoteAccount } from "@/features/monitoring/repositories";
import type { MonitoringState } from "@/types/monitoring";
import { AccountCard } from "./account-card";
import { BackupCard, type BackupCardProps } from "./backup-card";
import { LocalDataNotice } from "./local-data-notice";

/**
 * Solo en modo servidor: cuenta autenticada. Subir datos al servidor (el
 * historial del Site o un respaldo) quedó fuera del alcance actual.
 */
export type RemoteSettings = {
  account: RemoteAccount;
  onSignOut: () => void;
  onUpdateName: (fullName: string) => Promise<boolean>;
};

type SettingsViewProps = {
  data: MonitoringState;
  backup: Omit<BackupCardProps, "data">;
  remote: RemoteSettings | null;
  /** Con cuentas: datos que el modo sin cuenta dejó en este navegador. */
  localData?: LocalDataSnapshot | null;
};

export function SettingsView({
  data,
  backup,
  remote,
  localData = null,
}: SettingsViewProps) {
  const operationalTemplates = data.roomTemplates.filter(
    (template) => template.courseId === DEMO_COURSE_ID,
  ).length;

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Beta compartida</p>
        <h1>Configuración</h1>
        <p>Tu cuenta, tus cursos y las opciones de respaldo.</p>
      </div>

      <section className="settings-grid">
        <div className="settings-stack">
          <article className="card settings-card">
            <div className="card-heading">
              <div><p className="eyebrow">Cuenta personal</p><h2>Mis cursos</h2></div>
              <LayoutGrid size={20} />
            </div>
            <CourseStatusList data={data} />
          </article>

          {remote ? (
            <AccountCard
              account={remote.account}
              busy={backup.busy}
              onUpdateName={remote.onUpdateName}
              onSignOut={remote.onSignOut}
            />
          ) : null}

          {remote ? null : (
          <article className="card settings-card">
            <div className="card-heading">
              <div><p className="eyebrow">Alcance actual</p><h2>III°A operativo</h2></div>
              <ShieldCheck size={20} />
            </div>
            <ul className="settings-list">
              <li><Check size={16} /> Esta demostración funciona con una cuenta local.</li>
              <li><Check size={16} /> III°A tiene {operationalTemplates} plantillas disponibles.</li>
              <li><Check size={16} /> Cada clase queda identificada con el docente que la inició.</li>
              <li><Check size={16} /> Los cursos y estudiantes pertenecen a la cuenta activa.</li>
            </ul>
          </article>
          )}

          {remote && localData ? <LocalDataNotice data={localData} /> : null}

          <BackupCard data={data} {...backup} />

          <article className="card settings-card beta-warning">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Importante</p>
                <h2>{remote ? "Datos del establecimiento" : "Identificación, no contraseña"}</h2>
              </div>
              <CircleHelp size={20} />
            </div>
            <p>
              {remote
                ? "Los registros se guardan en el servidor y pertenecen a tu cuenta. No registres diagnósticos, calificaciones ni antecedentes personales."
                : "En esta demostración los cambios quedan en este navegador; usa nombres abreviados y no registres diagnósticos, calificaciones ni antecedentes personales."}
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
