// CLOSEOUT-FLOW-V1
// 강사 핵심 흐름(① 출결 확인 → ② 수업·숙제 기록 → ③ 마감)의 '완료 조건'만 계산하는 순수 함수.
// 저장 로직과 무관하며 DB write를 하지 않는다.

export type CloseoutStepId = 'attendance' | 'record' | 'finalize';

export interface CloseoutStudentSnapshot {
  /** 수업출결이 하나라도 선택되어 있는가 */
  hasAttendance: boolean;
  /** 결석/휴강 등으로 진도·이해도 기록이 불필요한 학생인가 */
  recordExempt: boolean;
  /** 개별 또는 공통 진도값이 채워졌는가 */
  hasProgress: boolean;
  /** 이미 마감(제출)된 기록인가 */
  submitted: boolean;
}

export interface CloseoutProgress {
  currentStep: CloseoutStepId;
  total: number;
  attendanceMarked: number;
  attendanceRemaining: number;
  progressRemaining: number;
  /** 마감 전 반드시 채워야 하는 남은 항목 수 */
  requiredRemaining: number;
  submittedCount: number;
  canFinalize: boolean;
  allFinalized: boolean;
  blockReason: string | null;
}

export function computeCloseoutProgress(students: CloseoutStudentSnapshot[]): CloseoutProgress {
  const total = students.length;
  const attendanceMarked = students.filter((s) => s.hasAttendance).length;
  const attendanceRemaining = total - attendanceMarked;
  const progressRemaining = students.filter(
    (s) => s.hasAttendance && !s.recordExempt && !s.hasProgress
  ).length;
  const submittedCount = students.filter((s) => s.submitted).length;
  const allFinalized = total > 0 && submittedCount === total;

  const canFinalize = total > 0 && attendanceRemaining === 0;
  const blockReason =
    total === 0
      ? '이 반에 재원 학생이 없습니다.'
      : attendanceRemaining > 0
        ? `수업출결 미선택 ${attendanceRemaining}명`
        : null;

  const currentStep: CloseoutStepId =
    attendanceRemaining > 0 ? 'attendance' : allFinalized ? 'finalize' : progressRemaining > 0 ? 'record' : 'finalize';

  return {
    currentStep,
    total,
    attendanceMarked,
    attendanceRemaining,
    progressRemaining,
    // 진도는 권장 항목이므로 '필수 남음'은 출결 기준으로만 센다.
    requiredRemaining: attendanceRemaining,
    submittedCount,
    canFinalize,
    allFinalized,
    blockReason,
  };
}

export const CLOSEOUT_STEPS: { id: CloseoutStepId; label: string }[] = [
  { id: 'attendance', label: '① 출결 확인' },
  { id: 'record', label: '② 수업·숙제 기록' },
  { id: 'finalize', label: '③ 마감 및 다음 행동' },
];
