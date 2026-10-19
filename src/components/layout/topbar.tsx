import {
  AlertTriangle,
  Cloud,
  CloudOff,
  Database,
  FolderPlus,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCcw,
} from "lucide-react";
import type { PersistenceStatus } from "@/features/monitoring/hooks/use-monitoring-store";
import { BrandLockup } from "./brand";

type TopbarProps = {
  onImport: () => void;
  onNewSession: () => void;
  onRefresh: () => void;
  courseReady: boolean;
  canImport: boolean;
  persistence: PersistenceStatus;
  onSignOut?: () => void;
};

function savedTitle(persistence: PersistenceStatus) {
  const place = persistence.mode === "remote" ? "Confirmado por el servidor" : "Guardado en este navegador";
  if (!persistence.savedAt) return place;
  const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(persistence.savedAt));
  return `${place} a las ${time}`;
}

/** Nunca dice «Sincronizado» antes de la confirmación del servidor (ADR 0002). */
function PersistenceBadge({ persistence }: { persistence: PersistenceStatus }) {
  const remote = persistence.mode === "remote";
  if (persistence.state === "saving") {
    return (
      <span className="connectivity offline" role="status" title="Esperando la confirmación del servidor">
        <LoaderCircle className="spin" size={14} /> Guardando…
      </span>
    );
  }
  if (persistence.state === "error") {
    return (
      <span
        className="connectivity error"
        role="status"
        title={remote ? "El último cambio no llegó al servidor" : "El último cambio no se pudo guardar en este navegador"}
      >
        {remote ? <CloudOff size={14} /> : <AlertTriangle size={14} />}
        {remote ? " Sin sincronizar" : " Sin guardar"}
      </span>
    );
  }
  return (
    <span className="connectivity online" role="status" title={savedTitle(persistence)}>
      {remote ? <Cloud size={14} /> : <Database size={14} />}
      {remote ? " Sincronizado" : " Guardado local"}
    </span>
  );
}

export function Topbar({
  onImport,
  onNewSession,
  onRefresh,
  courseReady,
  canImport,
  persistence,
  onSignOut,
}: TopbarProps) {
  return (
    <header className="topbar">
      <BrandLockup />
      <div className="topbar-actions">
        <PersistenceBadge persistence={persistence} />
        <button className="icon-button mobile-only" aria-label="Actualizar" onClick={onRefresh}>
          <RefreshCcw size={18} />
        </button>
        {canImport ? (
          <>
            <button className="secondary-button desktop-only" onClick={onImport}>
              <FolderPlus size={17} /> Nuevo curso
            </button>
            <button className="icon-button mobile-only" aria-label="Nuevo curso" onClick={onImport}>
              <FolderPlus size={18} />
            </button>
          </>
        ) : null}
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
        {onSignOut ? (
          <>
            <button className="secondary-button desktop-only" onClick={onSignOut}>
              <LogOut size={17} /> Cerrar sesión
            </button>
            <button className="icon-button mobile-only" aria-label="Cerrar sesión" onClick={onSignOut}>
              <LogOut size={18} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}

