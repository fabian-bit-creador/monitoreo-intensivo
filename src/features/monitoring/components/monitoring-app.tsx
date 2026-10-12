"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  RefreshCcw,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/layout/brand";
import { MobileContextBar } from "@/components/layout/mobile-context-bar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PendingCourseState } from "@/components/ui/empty-state";
import { APP_NAME } from "@/config/app";
import { NoAccessScreen } from "@/features/auth/components/no-access-screen";
import { SupabaseGate, type AuthSession } from "@/features/auth/components/supabase-gate";
import { ImportCourseModal } from "@/features/courses/components/import-course-modal";
import { RoomModal } from "@/features/courses/components/room-modal";
import { labLayout, layoutFromTemplate, suggestedLab } from "@/features/courses/lib/room-layouts";
import { HistoryView } from "@/features/history/components/history-view";
import { useBrowserLocalData } from "@/features/monitoring/hooks/use-browser-local-data";
import { useMonitoringController } from "@/features/monitoring/hooks/use-monitoring-controller";
import type { StoreRepository } from "@/features/monitoring/hooks/use-monitoring-store";
import {
  createMonitoringRepository,
  SupabaseMonitoringRepository,
  type LocalDataSnapshot,
} from "@/features/monitoring/repositories";
import { ReportView } from "@/features/reports/components/report-view";
import { LocalDataNotice } from "@/features/settings/components/local-data-notice";
import { SettingsView } from "@/features/settings/components/settings-view";
import { StudentSheet } from "@/features/students/components/student-sheet";
import { MonitorView } from "./monitor-view";
import { SessionFormModal } from "./session-form-modal";
import { StorageRecoveryScreen } from "./storage-recovery-screen";
import { getSupabaseClient, supabaseConfig } from "@/lib/supabase";

/**
 * Con Supabase configurado, pide iniciar sesión y trabaja contra el servidor;
 * sin configuración, funciona como siempre en este navegador.
 */
export function MonitoringApp() {
  if (supabaseConfig()) return <RemoteMonitoringApp />;
  return <MonitoringWorkspace session={null} createRepository={createMonitoringRepository} />;
}

/**
 * Con cuentas, los datos que el modo sin cuenta dejó en este navegador no se
 * borran ni se suben: se avisan en el ingreso y en Configuración para
 * descargarlos.
 */
function RemoteMonitoringApp() {
  const localData = useBrowserLocalData();
  return (
    <SupabaseGate loginNotice={localData ? <LocalDataNotice data={localData} compact /> : null}>
      {(session) => (
        <MonitoringWorkspace
          key={session.userId}
          session={session}
          localData={localData}
          createRepository={() => new SupabaseMonitoringRepository(
            getSupabaseClient(),
            { id: session.userId, email: session.email },
          )}
        />
      )}
    </SupabaseGate>
  );
}

type MonitoringWorkspaceProps = {
  session: AuthSession | null;
  createRepository: () => StoreRepository;
  localData?: LocalDataSnapshot | null;
};

function MonitoringWorkspace({ session, createRepository, localData = null }: MonitoringWorkspaceProps) {
  const controller = useMonitoringController(createRepository);
  const {
    data,
    account,
    localBackup,
    blocked,
    error,
    busy,
    persistence,
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
    visibleStudents,
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
    updateCourseRoster,
    exportExcel,
    exportPdf,
    openHistorySession,
    closeStudentSheet,
    toggleReorganizing,
    downloadBackup,
    downloadRawData,
    restoreBackup,
    startFresh,
    listSavedCopies,
    deleteSavedCopy,
    assignSeats,
    createRoom,
    updateRoom,
    selectRoomTemplate,
    importToServer,
    updateProfileName,
  } = controller;
  const [roomModal, setRoomModal] = useState<"create" | "edit" | null>(null);
  // Espacios donde la cuenta puede crear cursos; el personal va primero.
  const adminSpaces = account?.schools
    .filter((school) => school.role === "admin")
    .map((school) => ({ id: school.id, name: school.name })) ?? [];
  const spaces = account?.schools.map((school) => ({ id: school.id, name: school.name })) ?? [];

  if (blocked) {
    return (
      <StorageRecoveryScreen
        blocked={blocked}
        busy={busy}
        error={error}
        onDownload={() => downloadRawData(blocked.raw, "monitoreo-datos-guardados")}
        onReload={() => window.location.reload()}
        onStartFresh={() => void startFresh()}
      />
    );
  }

  if (!data && !error) {
    return (
      <div className="loading-screen">
        <BrandMark label={APP_NAME} />
        <LoaderCircle className="spin" size={24} />
        <p>Preparando el monitoreo…</p>
      </div>
    );
  }

  if (session && account && !account.schools.length) {
    return <NoAccessScreen email={session.email} onSignOut={() => void session.signOut()} />;
  }

  if (!data) {
    return (
      <div className="loading-screen error-screen">
        <AlertTriangle size={30} />
        <h1>No pudimos abrir {APP_NAME}</h1>
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
        canImport={!account || account.adminSchoolIds.length > 0}
        persistence={persistence}
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
          spaces={spaces}
        />
        <main className="main-content">
          <MobileContextBar
            data={data}
            teacherId={selectedTeacherId}
            courseId={courseId}
            readyCourseIds={readyCourseIds}
            onTeacherChange={chooseTeacher}
            onCourseChange={chooseCourse}
            spaces={spaces}
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
              allStudents={visibleStudents}
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
              onAssignSeats={() => void assignSeats()}
              roomTemplates={courseRoomTemplates}
              onSelectRoom={selectRoomTemplate}
              onNewRoom={() => setRoomModal("create")}
              onEditRoom={() => setRoomModal("edit")}
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
              storageLabel={persistence.mode === "remote" ? "Sincronizado" : "Guardado local"}
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
              backup={{
                busy,
                error,
                allowRestore: localBackup,
                onDownload: downloadBackup,
                onRestore: restoreBackup,
                onDownloadCopy: downloadRawData,
                listSavedCopies,
                deleteSavedCopy,
              }}
              localData={localData}
              remote={session && account ? {
                account,
                onSignOut: () => void session.signOut(),
                onUpdateName: updateProfileName,
                onImportToServer: importToServer,
              } : null}
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
          error={error}
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
          data={data}
          currentCourseId={courseId}
          suggestedCourseName={courseReady ? "Nuevo curso" : course?.name ?? "Nuevo curso"}
          spaces={adminSpaces}
          busy={busy}
          error={error}
          onImport={importCourse}
          onUpdate={updateCourseRoster}
          onClose={() => setShowImport(false)}
        />
      ) : null}

      {roomModal ? (
        <RoomModal
          mode={roomModal}
          studentCount={visibleStudents.length}
          initial={roomModal === "edit" && activeRoomTemplate
            ? { name: activeRoomTemplate.name, layout: layoutFromTemplate(activeRoomTemplate, activeRoomSlots) }
            : { name: "Laboratorio", layout: labLayout(suggestedLab(visibleStudents.length)) }}
          busy={busy}
          error={error}
          onSave={(draft) => (roomModal === "edit" ? updateRoom(draft) : createRoom(draft))}
          onClose={() => setRoomModal(null)}
        />
      ) : null}

      {toast ? <div className="toast"><Check size={17} /> {toast}</div> : null}
    </div>
  );
}
