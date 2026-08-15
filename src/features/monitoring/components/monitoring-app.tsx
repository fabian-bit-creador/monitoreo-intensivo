"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  LoaderCircle,
  RefreshCcw,
  X,
} from "lucide-react";
import { MobileContextBar } from "@/components/layout/mobile-context-bar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PendingCourseState } from "@/components/ui/empty-state";
import { ImportCourseModal } from "@/features/courses/components/import-course-modal";
import { HistoryView } from "@/features/history/components/history-view";
import { useMonitoringController } from "@/features/monitoring/hooks/use-monitoring-controller";
import { ReportView } from "@/features/reports/components/report-view";
import { SettingsView } from "@/features/settings/components/settings-view";
import { StudentSheet } from "@/features/students/components/student-sheet";
import { MonitorView } from "./monitor-view";
import { SessionFormModal } from "./session-form-modal";

export function MonitoringApp() {
  const controller = useMonitoringController();
  const {
    data,
    error,
    busy,
    reload,
    setError,
    view,
    setView,
    courseId,
    selectedTeacherId,
    selectedTemplateId,
    activeSession,
    selectedTeacher,
    activeRoomTemplate,
    activeRoomSlots,
    activeSeatAssignments,
    course,
    courseRoomTemplates,
    courseStudents,
    readyCourseIds,
    courseReady,
    metrics,
    filteredStudents,
    activeLatest,
    round,
    setRound,
    layoutMode,
    setLayoutMode,
    search,
    setSearch,
    selectedStudent,
    note,
    setNote,
    showSessionForm,
    setShowSessionForm,
    showImport,
    setShowImport,
    reorganizing,
    movingStudent,
    toast,
    chooseTeacher,
    chooseCourse,
    openSessionForm,
    createNewSession,
    record,
    setStudentPresence,
    moveTo,
    selectSeat,
    closeSession,
    reopenSession,
    importCourse,
    exportExcel,
    exportPdf,
    openHistorySession,
    closeStudentSheet,
    toggleReorganizing,
  } = controller;

  if (!data && !error) {
    return (
      <div className="loading-screen">
        <div className="brand-mark"><Activity size={26} /></div>
        <LoaderCircle className="spin" size={24} />
        <p>Preparando el monitoreo…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen error-screen">
        <AlertTriangle size={30} />
        <h1>No pudimos abrir Monitoreo PI</h1>
        <p>{error}</p>
        <button className="primary-button" onClick={() => void reload()}>
          <RefreshCcw size={18} /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Topbar
        onImport={() => setShowImport(true)}
        onNewSession={openSessionForm}
        onRefresh={() => void reload()}
        courseReady={courseReady}
      />

      <div className="workspace">
        <Sidebar
          data={data}
          view={view}
          teacherId={selectedTeacherId}
          courseId={courseId}
          readyCourseIds={readyCourseIds}
          onViewChange={setView}
          onTeacherChange={chooseTeacher}
          onCourseChange={chooseCourse}
        />
        <main className="main-content">
          <MobileContextBar
            data={data}
            teacherId={selectedTeacherId}
            courseId={courseId}
            readyCourseIds={readyCourseIds}
            onTeacherChange={chooseTeacher}
            onCourseChange={chooseCourse}
          />
          {error ? (
            <div className="error-banner">
              <AlertTriangle size={17} /> {error}
              <button onClick={() => setError("")}><X size={16} /></button>
            </div>
          ) : null}

          {view === "monitor" && !courseReady ? (
            <PendingCourseState course={course} onImport={() => setShowImport(true)} />
          ) : null}
          {view === "monitor" && courseReady ? (
            <MonitorView
              course={course}
              teacher={selectedTeacher}
              roomTemplate={activeRoomTemplate}
              roomSlots={activeRoomSlots}
              seatAssignments={activeSeatAssignments}
              session={activeSession}
              students={filteredStudents}
              allStudents={courseStudents}
              metrics={metrics}
              latest={activeLatest}
              round={round}
              setRound={setRound}
              layoutMode={layoutMode}
              setLayoutMode={setLayoutMode}
              search={search}
              setSearch={setSearch}
              selectSeat={selectSeat}
              reorganizing={reorganizing}
              setReorganizing={toggleReorganizing}
              movingStudent={movingStudent}
              moveTo={moveTo}
              onStart={openSessionForm}
              onClose={() => void closeSession()}
              busy={busy}
            />
          ) : null}

          {view === "report" && !courseReady ? (
            <PendingCourseState course={course} onImport={() => setShowImport(true)} />
          ) : null}
          {view === "report" && courseReady ? (
            <ReportView
              data={data}
              course={course}
              teacher={selectedTeacher}
              roomTemplate={activeRoomTemplate}
              session={activeSession}
              metrics={metrics}
              onStart={openSessionForm}
              onExcel={() => void exportExcel()}
              onPdf={() => void exportPdf()}
              onReopen={() => void reopenSession()}
            />
          ) : null}

          {view === "history" && !courseReady ? (
            <PendingCourseState course={course} onImport={() => setShowImport(true)} />
          ) : null}
          {view === "history" && courseReady ? (
            <HistoryView
              data={data}
              courseId={courseId}
              teacher={selectedTeacher}
              teacherId={selectedTeacherId}
              activeSessionId={activeSession?.id ?? null}
              onOpen={openHistorySession}
              onStart={openSessionForm}
            />
          ) : null}

          {view === "settings" ? (
            <SettingsView
              data={data}
              selectedTeacherId={selectedTeacherId}
              onSelectTeacher={chooseTeacher}
            />
          ) : null}
        </main>
      </div>

      <MobileNav view={view} onViewChange={setView} />

      {selectedStudent && activeSession && metrics ? (
        <StudentSheet
          student={selectedStudent}
          observation={metrics.latest.get(selectedStudent.id)}
          present={metrics.presenceMap.get(selectedStudent.id) !== false}
          round={round}
          note={note}
          setNote={setNote}
          onRecord={(code, progress) => void record(code, progress)}
          onPresence={(student, present) => void setStudentPresence(student, present)}
          onClose={closeStudentSheet}
          busy={busy}
        />
      ) : null}

      {showSessionForm && courseReady ? (
        <SessionFormModal
          teacher={selectedTeacher}
          course={course}
          courseId={courseId}
          teacherId={selectedTeacherId}
          selectedTemplateId={selectedTemplateId}
          roomTemplates={courseRoomTemplates}
          busy={busy}
          onSubmit={(input) => void createNewSession(input)}
          onClose={() => setShowSessionForm(false)}
        />
      ) : null}

      {showImport ? (
        <ImportCourseModal
          suggestedCourseName={courseReady ? "Nuevo curso" : course?.name ?? "Nuevo curso"}
          busy={busy}
          onImport={importCourse}
          onError={setError}
          onClose={() => setShowImport(false)}
        />
      ) : null}

      {toast ? <div className="toast"><Check size={17} /> {toast}</div> : null}
    </div>
  );
}
