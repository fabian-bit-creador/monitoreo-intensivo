import { ContextSelectors } from "./context-selectors";
import type { MonitoringState } from "@/types/monitoring";

type MobileContextBarProps = {
  data: MonitoringState;
  teacherId: string;
  courseId: string;
  readyCourseIds: Set<string>;
  onTeacherChange: (teacherId: string) => void;
  onCourseChange: (courseId: string) => void;
};

export function MobileContextBar(props: MobileContextBarProps) {
  return (
    <div className="mobile-context-bar card">
      <ContextSelectors {...props} mobile />
    </div>
  );
}
