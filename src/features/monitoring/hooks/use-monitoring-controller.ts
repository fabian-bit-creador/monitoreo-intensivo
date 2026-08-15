"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ROOM_TEMPLATE_ID,
  DEFAULT_TEACHER_ID,
  DEMO_COURSE_ID,
} from "@/config/app";
import {
  exportSessionExcel,
  exportSessionPdf,
} from "@/features/reports/lib/export-report";
import type {
  AppView,
  MonitoringCode,
  Observation,
  Student,
} from "@/types/monitoring";
import { useMonitoringStore } from "./use-monitoring-store";
import {
  addObservation,
  createSession,
  importStudents,
  moveStudent,
  setPresence as updatePresence,
  setSessionStatus,
  type CreateSessionInput,
} from "../lib/monitoring-service";
import {
  preferredSession,
  sessionMetrics,
  sessionRoomTemplateId,
  sessionTeacherId,
} from "../lib/metrics";

export function useMonitoringController() {
  const { data, error, busy, reload, apply, setError } = useMonitoringStore();
  const [view, setView] = useState<AppView>("monitor");
  const [courseId, setCourseId] = useState(DEMO_COURSE_ID);
  const [selectedTeacherId, setSelectedTeacherId] = useState(DEFAULT_TEACHER_ID);
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_ROOM_TEMPLATE_ID);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [layoutMode, setLayoutMode] = useState<"map" | "list">("map");
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [note, setNote] = useState("");
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [reorganizing, setReorganizing] = useState(false);
  const [movingStudent, setMovingStudent] = useState<Student | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedTeacher = data?.teachers.find(
    (teacher) => teacher.id === selectedTeacherId,
  ) ?? data?.teachers[0] ?? null;
  const activeSession = data?.sessions.find(
    (session) =>
      session.id === activeSessionId
      && session.courseId === courseId
      && sessionTeacherId(session) === selectedTeacherId,
  ) ?? (data
    ? preferredSession(data.sessions, courseId, selectedTeacherId) ?? null
    : null);
  const activeRoomTemplateId = activeSession
    ? sessionRoomTemplateId(activeSession)
    : selectedTemplateId;
  const activeRoomTemplate = data?.roomTemplates.find(
    (template) => template.id === activeRoomTemplateId,
  ) ?? null;
  const activeRoomSlots = useMemo(
    () => data?.roomSlots.filter((slot) => slot.templateId === activeRoomTemplateId) ?? [],
    [activeRoomTemplateId, data],
  );
  const activeSeatAssignments = useMemo(
    () => data?.seatAssignments.filter(
      (assignment) => assignment.templateId === activeRoomTemplateId,
    ) ?? [],
    [activeRoomTemplateId, data],
  );
  const course = data?.courses.find((item) => item.id === courseId)
    ?? data?.courses[0]
    ?? null;
  const courseRoomTemplates = data?.roomTemplates.filter(
    (template) => template.courseId === courseId,
  ) ?? [];
  const courseStudents = useMemo(
    () => data?.students.filter((student) => student.courseId === courseId) ?? [],
    [courseId, data],
  );
  const readyCourseIds = useMemo(() => {
    if (!data) return new Set<string>();
    const withStudents = new Set(data.students.map((student) => student.courseId));
    const withTemplates = new Set(data.roomTemplates.map((template) => template.courseId));
    return new Set(
      data.courses
        .filter((item) => withStudents.has(item.id) && withTemplates.has(item.id))
        .map((item) => item.id),
    );
  }, [data]);
  const courseReady = course ? readyCourseIds.has(course.id) : false;
  const metrics = useMemo(() => {
    if (!data || !activeSession) return null;
    return sessionMetrics(
      activeSession,
      data.students,
      data.sessionStudents,
      data.observations,
    );
  }, [activeSession, data]);
  const filteredStudents = courseStudents.filter((student) =>
    student.fullName.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
  );
  const activeLatest = metrics?.latest ?? new Map<string, Observation>();

  function chooseTeacher(nextTeacherId: string) {
    if (!data) return;
    const nextSession = preferredSession(data.sessions, courseId, nextTeacherId);
    setSelectedTeacherId(nextTeacherId);
    setActiveSessionId(nextSession?.id ?? null);
    if (nextSession) setSelectedTemplateId(sessionRoomTemplateId(nextSession));
    setSelectedStudent(null);
    setView("monitor");
  }

  function chooseCourse(nextCourseId: string) {
    if (!data) return;
    const nextSession = preferredSession(data.sessions, nextCourseId, selectedTeacherId);
    const fallbackTemplate = data.roomTemplates.find(
      (template) => template.courseId === nextCourseId,
    );
    setCourseId(nextCourseId);
    setActiveSessionId(nextSession?.id ?? null);
    setSelectedTemplateId(
      nextSession
        ? sessionRoomTemplateId(nextSession)
        : fallbackTemplate?.id ?? DEFAULT_ROOM_TEMPLATE_ID,
    );
    setSelectedStudent(null);
  }

  function openSessionForm() {
    if (!courseReady) {
      setError("Este curso está pendiente de nómina y plantilla.");
      return;
    }
    setShowSessionForm(true);
  }

  async function createNewSession(input: CreateSessionInput) {
    const result = await apply((state) => createSession(state, input));
    if (!result) return;
    setActiveSessionId(result.sessionId as number);
    setSelectedTemplateId(input.roomTemplateId);
    setRound(1);
    setView("monitor");
    setShowSessionForm(false);
    setToast("Sesión iniciada");
  }

  async function record(code: MonitoringCode, progress?: number) {
    if (!activeSession || !selectedStudent) return;
    const student = selectedStudent;
    const result = await apply((state) => addObservation(state, {
      sessionId: activeSession.id,
      studentId: student.id,
      round,
      code,
      progress,
      note,
    }));
    if (!result) return;
    setSelectedStudent(null);
    setNote("");
    setToast(`${student.displayName}: ${code}${code === "R" ? ` ${progress}%` : ""}`);
  }

  async function setStudentPresence(student: Student, present: boolean) {
    if (!activeSession) return;
    const result = await apply((state) => updatePresence(
      state,
      activeSession.id,
      student.id,
      present,
    ));
    if (!result) return;
    setSelectedStudent(null);
    setToast(present
      ? `${student.displayName} marcado presente`
      : `${student.displayName} marcado ausente`);
  }

  async function moveTo(row: number | null, col: number | null) {
    if (!movingStudent) return;
    const result = await apply((state) => moveStudent(
      state,
      movingStudent.id,
      activeRoomTemplateId,
      row,
      col,
    ));
    if (!result) return;
    setMovingStudent(null);
    setToast("Distribución actualizada");
  }

  function selectSeat(student: Student) {
    if (!activeSession && !reorganizing) {
      setShowSessionForm(true);
      return;
    }
    if (reorganizing) {
      if (!movingStudent) {
        setMovingStudent(student);
        return;
      }
      if (movingStudent.id === student.id) {
        setMovingStudent(null);
        return;
      }
      const target = activeSeatAssignments.find(
        (assignment) => assignment.studentId === student.id,
      );
      if (!target) {
        setError("El estudiante de destino no tiene un puesto asignado en esta plantilla.");
        return;
      }
      void moveTo(target.seatRow, target.seatCol);
      return;
    }
    if (activeSession?.status === "closed") {
      setToast("Reabre la sesión para seguir registrando");
      return;
    }
    const existing = metrics?.latest.get(student.id);
    setNote(existing?.note ?? "");
    setSelectedStudent(student);
  }

  async function closeSession() {
    if (!activeSession) return;
    const result = await apply((state) => setSessionStatus(state, activeSession.id, "closed"));
    if (!result) return;
    setView("report");
    setToast("Sesión cerrada e informe actualizado");
  }

  async function reopenSession() {
    if (!activeSession) return;
    const result = await apply((state) => setSessionStatus(state, activeSession.id, "active"));
    if (result) setToast("Sesión reabierta");
  }

  async function importCourse(courseName: string, names: string[]) {
    const result = await apply((state) => importStudents(state, courseName, names));
    if (!result) return false;
    setCourseId(result.courseId as string);
    setSelectedTemplateId(result.roomTemplateId as string);
    setActiveSessionId(null);
    setToast(`${names.length} estudiantes importados`);
    return true;
  }

  async function exportExcel() {
    if (!data || !activeSession || !metrics) return;
    try {
      await exportSessionExcel({
        data,
        session: activeSession,
        course,
        teacher: selectedTeacher,
        roomTemplate: activeRoomTemplate,
        metrics,
      });
    } catch {
      setError("No fue posible generar el archivo Excel.");
    }
  }

  async function exportPdf() {
    if (!data || !activeSession || !metrics) return;
    try {
      await exportSessionPdf({
        data,
        session: activeSession,
        course,
        teacher: selectedTeacher,
        roomTemplate: activeRoomTemplate,
        metrics,
      });
    } catch {
      setError("No fue posible generar el archivo PDF.");
    }
  }

  function openHistorySession(id: number) {
    if (!data) return;
    const session = data.sessions.find((item) => item.id === id);
    if (session) setSelectedTemplateId(sessionRoomTemplateId(session));
    setActiveSessionId(id);
    setView("report");
  }

  function closeStudentSheet() {
    setSelectedStudent(null);
    setNote("");
  }

  function toggleReorganizing(value: boolean) {
    setReorganizing(value);
    setMovingStudent(null);
  }

  return {
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
    activeRoomTemplateId,
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
  };
}
