import { BarChart3, History, LayoutGrid, Settings } from "lucide-react";
import type { AppView } from "@/types/monitoring";

type MobileNavProps = {
  view: AppView;
  onViewChange: (view: AppView) => void;
};

export function MobileNav({ view, onViewChange }: MobileNavProps) {
  return (
    <nav className="mobile-nav" aria-label="Navegación móvil">
      <button className={view === "monitor" ? "active" : ""} onClick={() => onViewChange("monitor")}>
        <LayoutGrid size={19} /><span>Monitorear</span>
      </button>
      <button className={view === "report" ? "active" : ""} onClick={() => onViewChange("report")}>
        <BarChart3 size={19} /><span>Informe</span>
      </button>
      <button className={view === "history" ? "active" : ""} onClick={() => onViewChange("history")}>
        <History size={19} /><span>Historial</span>
      </button>
      <button className={view === "settings" ? "active" : ""} onClick={() => onViewChange("settings")}>
        <Settings size={19} /><span>Configurar</span>
      </button>
    </nav>
  );
}
