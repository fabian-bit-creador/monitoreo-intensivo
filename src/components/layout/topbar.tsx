import {
  Activity,
  AlertTriangle,
  Database,
  Plus,
  RefreshCcw,
  Upload,
} from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/config/app";
import type { PersistenceStatus } from "@/features/monitoring/hooks/use-monitoring-store";

type TopbarProps = {
  onImport: () => void;
  onNewSession: () => void;
  onRefresh: () => void;
  courseReady: boolean;
  persistence: PersistenceStatus;
};

function savedTitle(savedAt: string | null) {
  if (!savedAt) return "Datos guardados en este navegador";
  const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(savedAt));
  return `Guardado en este navegador a las ${time}`;
}

export function Topbar({
  onImport,
  onNewSession,
  onRefresh,
  courseReady,
  persistence,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark"><Activity size={21} /></div>
        <div>
          <strong>{APP_NAME}</strong>
          <span>{APP_SUBTITLE}</span>
        </div>
      </div>
      <div className="topbar-actions">
        {persistence.state === "error" ? (
          <span
            className="connectivity error"
            role="status"
            title="El último cambio no se pudo guardar en este navegador"
          >
            <AlertTriangle size={14} /> Sin guardar
          </span>
        ) : (
          <span className="connectivity online" role="status" title={savedTitle(persistence.savedAt)}>
            <Database size={14} /> Guardado local
          </span>
        )}
        <button className="icon-button mobile-only" aria-label="Actualizar" onClick={onRefresh}>
          <RefreshCcw size={18} />
        </button>
        <button className="secondary-button desktop-only" onClick={onImport}>
          <Upload size={17} /> Importar curso
        </button>
        <button
          className="primary-button"
          onClick={onNewSession}
          disabled={!courseReady}
          title={courseReady ? "Iniciar una nueva clase" : "Pendiente de nómina y plantilla"}
        >
          <Plus size={18} />
          <span className="desktop-only">Nueva clase</span>
          <span className="mobile-only">Clase</span>
        </button>
      </div>
    </header>
  );
}
