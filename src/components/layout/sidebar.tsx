import {
  BarChart3,
  History,
  LayoutGrid,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { ContextSelectors } from "./context-selectors";
import type { AppView, MonitoringState } from "@/types/monitoring";

type SidebarProps = {
  data: MonitoringState;
  view: AppView;
  teacherId: string;
  courseId: string;
  readyCourseIds: Set<string>;
  onViewChange: (view: AppView) => void;
  onTeacherChange: (teacherId: string) => void;
  onCourseChange: (courseId: string) => void;
};

export function Sidebar(props: SidebarProps) {
  const {
    data,
    view,
    teacherId,
    courseId,
    readyCourseIds,
    onViewChange,
    onTeacherChange,
    onCourseChange,
  } = props;

  return (
    <aside className="sidebar">
      <ContextSelectors
        data={data}
        teacherId={teacherId}
        courseId={courseId}
        readyCourseIds={readyCourseIds}
        onTeacherChange={onTeacherChange}
        onCourseChange={onCourseChange}
      />
      <nav className="sidebar-nav" aria-label="Navegación principal">
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
          <Settings size={19} /><span>Configuración</span>
        </button>
      </nav>
      <div className="legend-card">
        <p>Estados</p>
        <span><i className="dot dot-i" /> I · Instrucciones</span>
        <span><i className="dot dot-r" /> R · Revisión</span>
        <span><i className="dot dot-c" /> C · Correcto</span>
        <span><i className="dot dot-empty" /> Sin registro</span>
      </div>
      <div className="privacy-note">
        <ShieldCheck size={17} />
        <p>Versión demostrativa: no registres diagnósticos, calificaciones ni antecedentes personales.</p>
      </div>
    </aside>
  );
}
