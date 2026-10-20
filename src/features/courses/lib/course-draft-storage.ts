export type CourseSetupDraft = {
  courseName: string;
  academicYear: number;
  expectedCount: number;
  focusCount: number;
};

const KEY = "monitoreo-intensivo/course-setup-draft";

export function loadCourseSetupDraft(): CourseSetupDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<CourseSetupDraft> | null;
    if (!value || typeof value.courseName !== "string") return null;
    if (!Number.isInteger(value.academicYear) || !Number.isInteger(value.expectedCount) || !Number.isInteger(value.focusCount)) return null;
    return value as CourseSetupDraft;
  } catch {
    return null;
  }
}

export function saveCourseSetupDraft(value: CourseSetupDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(value));
}

export function clearCourseSetupDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
