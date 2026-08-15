import type {
  ClassSession,
  Course,
  MonitoringState,
  RoomTemplate,
  SessionMetrics,
  Teacher,
} from "@/types/monitoring";

type ExportContext = {
  data: MonitoringState;
  session: ClassSession;
  course: Course | null;
  teacher: Teacher | null;
  roomTemplate: RoomTemplate | null;
  metrics: SessionMetrics;
};

export async function exportSessionExcel(context: ExportContext) {
  const { data, session, course, teacher, roomTemplate, metrics } = context;
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const summary = [
    ["MONITOREO PI · INFORME DE SESIÓN"],
    ["Docente", teacher?.fullName ?? ""],
    ["Curso", course?.name ?? ""],
    ["Plantilla", roomTemplate?.name ?? ""],
    ["Fecha", session.date],
    ["Módulo", session.module],
    ["Objetivo", session.objective],
    ["Cobertura", `${metrics.coverage}%`],
    ["I", metrics.counts.I],
    ["R", metrics.counts.R],
    ["C", metrics.counts.C],
    ["Sin registro", metrics.unobserved],
    ["Ausentes", metrics.absent],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(summary),
    "Resumen",
  );

  const detail = metrics.roster.map((student) => {
    const observation = metrics.latest.get(student.id);
    const present = metrics.presenceMap.get(student.id) !== false;
    return {
      "N°": student.number,
      Estudiante: student.fullName,
      Presente: present ? "Sí" : "No",
      Estado: present ? observation?.code ?? "Sin registro" : "Ausente",
      "Avance %": observation?.progress ?? "",
      Recorrido: observation?.round ?? "",
      Observación: observation?.note ?? "",
    };
  });
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(detail),
    "Detalle",
  );
  XLSX.writeFile(workbook, `monitoreo-pi-${session.date}.xlsx`);

  void data;
}

export async function exportSessionPdf(context: ExportContext) {
  const { session, course, teacher, roomTemplate, metrics } = context;
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF();
  const autoTable = autoTableModule.default;
  document.setTextColor(23, 55, 94);
  document.setFontSize(18);
  document.text("Monitoreo PI · Informe de sesión", 14, 18);
  document.setTextColor(60, 70, 85);
  document.setFontSize(10);
  document.text(`${teacher?.fullName ?? "Docente"} · ${course?.name ?? "Curso"}`, 14, 26);
  document.text(`${roomTemplate?.name ?? "Sala"} · ${session.date}`, 14, 31);
  document.text(
    `${session.module} · Cobertura ${metrics.coverage}% · I ${metrics.counts.I} · R ${metrics.counts.R} · C ${metrics.counts.C}`,
    14,
    36,
  );
  autoTable(document, {
    startY: 43,
    head: [["Estudiante", "Estado", "Avance", "Recorrido", "Observación"]],
    body: metrics.roster.map((student) => {
      const observation = metrics.latest.get(student.id);
      const present = metrics.presenceMap.get(student.id) !== false;
      return [
        student.displayName,
        present ? observation?.code ?? "Sin registro" : "Ausente",
        observation?.code === "R" ? `${observation.progress ?? 0}%` : "—",
        observation?.round ?? "—",
        observation?.note ?? "",
      ];
    }),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [23, 55, 94] },
  });
  document.save(`monitoreo-pi-${session.date}.pdf`);
}
