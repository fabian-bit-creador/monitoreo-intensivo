import { useState } from "react";
import { AlertTriangle, Download, RefreshCcw, RotateCcw } from "lucide-react";
import type { BlockedStorage } from "../hooks/use-monitoring-store";

type StorageRecoveryScreenProps = {
  blocked: BlockedStorage;
  busy: boolean;
  error: string;
  onDownload: () => void;
  onReload: () => void;
  onStartFresh: () => void;
};

/**
 * Aparece cuando los datos guardados no se pueden abrir o los guardó una
 * versión más nueva. No escribe nada hasta que el docente decida (ADR 0002).
 */
export function StorageRecoveryScreen(props: StorageRecoveryScreenProps) {
  const { blocked, busy, error, onDownload, onReload, onStartFresh } = props;
  const [downloaded, setDownloaded] = useState(false);
  const newer = blocked.reason === "newer-version";

  return (
    <div className="loading-screen error-screen">
      <AlertTriangle size={30} />
      <h1>{newer ? "Hay datos de una versión más nueva" : "No pudimos abrir los datos guardados"}</h1>
      <p className="recovery-text">
        {newer
          ? "Otra pestaña o una actualización guardó estos datos con una versión más nueva de la aplicación. Esta página no hará cambios para no sobrescribirlos: recárgala para usar la versión actual."
          : "Los datos guardados en este navegador no tienen el formato esperado y no los modificamos. Descarga una copia antes de continuar. Después puedes empezar de nuevo con los datos de demostración y restaurar un respaldo desde Configuración."}
      </p>
      {error ? <p className="recovery-error">{error}</p> : null}
      <div className="recovery-actions">
        <button
          className="secondary-button"
          onClick={() => {
            onDownload();
            setDownloaded(true);
          }}
        >
          <Download size={17} /> Descargar copia de los datos
        </button>
        {newer ? (
          <button className="primary-button" onClick={onReload}>
            <RefreshCcw size={17} /> Recargar
          </button>
        ) : (
          <button className="primary-button" onClick={onStartFresh} disabled={!downloaded || busy}>
            <RotateCcw size={17} /> Empezar de nuevo
          </button>
        )}
      </div>
      {!newer && !downloaded ? (
        <p className="recovery-hint">Para empezar de nuevo, primero descarga la copia.</p>
      ) : null}
    </div>
  );
}
