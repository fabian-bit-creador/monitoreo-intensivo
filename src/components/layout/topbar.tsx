import {
  Activity,
  Database,
  Plus,
  RefreshCcw,
  Upload,
} from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/config/app";

type TopbarProps = {
  onImport: () => void;
  onNewSession: () => void;
  onRefresh: () => void;
  courseReady: boolean;
};

export function Topbar({
  onImport,
  onNewSession,
  onRefresh,
  courseReady,
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
        <span className="connectivity online" title="Datos guardados en este navegador">
          <Database size={14} /> Guardado local
        </span>
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
