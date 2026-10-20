import { Download, HardDrive } from "lucide-react";
import { summarizeState } from "@/features/monitoring/lib/backup";
import {
  downloadBrowserCopy,
  downloadBrowserData,
} from "@/features/monitoring/hooks/use-browser-local-data";
import type { LocalDataSnapshot } from "@/features/monitoring/repositories";

const savedDate = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" });

const COPY_LABELS = {
  restore: "Copia anterior a una restauración",
  recovery: "Copia de datos que no se pudieron abrir",
} as const;

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function describe(data: LocalDataSnapshot) {
  if (!data.state) return "Hay datos de otra versión de la aplicación o que no se pueden leer.";
  const summary = summarizeState(data.state);
  const counts = `${plural(summary.courses, "curso", "cursos")}, ${plural(summary.sessions, "clase", "clases")} y `
    + `${plural(summary.observations, "observación", "observaciones")}`;
  return data.savedAt
    ? `Hay ${counts}, guardados por última vez el ${savedDate.format(new Date(data.savedAt))}.`
    : `Hay ${counts}.`;
}

type LocalDataNoticeProps = {
  data: LocalDataSnapshot;
  /** En el ingreso, bajo el formulario. */
  compact?: boolean;
};

/**
 * Datos del modo sin cuenta cuando la aplicación usa cuentas: se informan y
 * se ofrecen para descargar. No se borran ni se suben.
 */
export function LocalDataNotice({ data, compact = false }: LocalDataNoticeProps) {
  return (
    <article className={`card settings-card local-data-notice${compact ? " compact" : ""}`}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Este navegador</p>
          <h2>Datos guardados sin cuenta</h2>
        </div>
        <HardDrive size={20} />
      </div>
      <p>{describe(data)}</p>
      <p>
        Siguen en este navegador: no se borran ni se suben a tu cuenta. Descárgalos para
        conservarlos.
      </p>
      <div className="local-data-actions">
        <button type="button" className="secondary-button" onClick={() => downloadBrowserData(data)}>
          <Download size={17} /> Descargar datos de este navegador
        </button>
        {data.copies.map((copy) => (
          <button key={copy.kind} type="button" className="secondary-button" onClick={() => downloadBrowserCopy(copy)}>
            <Download size={17} /> {COPY_LABELS[copy.kind]}
          </button>
        ))}
      </div>
    </article>
  );
}
