// UNIFIED-LESSON-ROW: Single source of truth for the per-student lesson entry row.
// Used by QuickLessonEntryPage, BatchEntryPage, Dashboard quick-edit, and AssistantDashboard.
// Keep this dumb/controlled — no fetching, no business logic. Just renders & emits onChange.
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookOpen } from 'lucide-react';
import { isAbsent as isAbsentStatus } from '@/lib/attendance';

export const HW_OPTIONS = [
  { v: 'completed', label: '완료', cls: 'bg-emerald-500 text-white border-emerald-500', dim: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-900' },
  { v: 'partial', label: '부분', cls: 'bg-amber-500 text-white border-amber-500', dim: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 border-amber-200/60 dark:border-amber-900' },
  { v: 'not_done', label: '미완', cls: 'bg-red-500 text-white border-red-500', dim: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200/60 dark:border-red-900' },
  { v: 'none_assigned', label: '없음', cls: 'bg-muted text-foreground border-muted', dim: 'text-muted-foreground hover:bg-muted border-border' },
] as const;

export const LESSON_TYPES = ['정규수업', '보충수업', '시험특강', '방학특강', '테스트', '휴강'] as const;
// Standardized to match LessonRecordForm ATTENDANCE_STATUS_OPTIONS
export const ATTENDANCE_STATUSES = ['정상등원', '지각', '조퇴', '인정결석', '무단결석', '보충불가'] as const;

export const UNDERSTANDING_COLORS: Record<number, { active: string; dim: string }> = {
  1: { active: 'bg-red-500 text-white border-red-500',     dim: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' },
  2: { active: 'bg-orange-500 text-white border-orange-500', dim: 'text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40' },
  3: { active: 'bg-amber-500 text-white border-amber-500',  dim: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40' },
  4: { active: 'bg-lime-500 text-white border-lime-500',    dim: 'text-lime-700 hover:bg-lime-50 dark:hover:bg-lime-950/40' },
  5: { active: 'bg-emerald-500 text-white border-emerald-500', dim: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40' },
};

export const ATTENDANCE_COLOR: Record<string, string> = {
  '정상등원': 'bg-emerald-500 text-white border-emerald-500',
  '지각': 'bg-amber-500 text-white border-amber-500',
  '조퇴': 'bg-orange-500 text-white border-orange-500',
  '인정결석': 'bg-slate-500 text-white border-slate-500',
  '무단결석': 'bg-red-500 text-white border-red-500',
  '보충불가': 'bg-rose-600 text-white border-rose-600',
};

export interface UnifiedLessonRowData {
  id: string;
  name: string;
  school: string | null;
  included: boolean;
  understanding: number;
  homework: string;
  note: string;
  prevAvg: number | null;
  prevHwContent: string | null;
  individualProgress: string;
  lessonTypes: string[];
  attendanceStatuses: string[];
  hasAttendanceLog: boolean;
  existingDraft: boolean;
}

export interface UnifiedLessonRowProps {
  student: UnifiedLessonRowData;
  /** alternating row bg index */
  idx?: number;
  /** student is in a common-progress group → show badge + skip individual progress input */
  inCommonGroup?: boolean;
  /** parent group mode — controls "(필수)" hint on individual progress field */
  groupMode?: 'individual' | 'group';
  /** hide the included checkbox (e.g. modals where every student is implicit) */
  hideIncludeToggle?: boolean;
  /** hide attendance row (e.g. when context already has attendance) */
  hideAttendance?: boolean;
  /** hide individual progress input entirely */
  hideIndividualProgress?: boolean;
  onChange: <K extends keyof UnifiedLessonRowData>(key: K, value: UnifiedLessonRowData[K]) => void;
}

export function UnifiedLessonRow({
  student: s,
  idx = 0,
  inCommonGroup = false,
  groupMode = 'individual',
  hideIncludeToggle = false,
  hideAttendance = false,
  hideIndividualProgress = false,
  onChange,
}: UnifiedLessonRowProps) {
  const needsIndividualProgress = !inCommonGroup && !hideIndividualProgress;
  // ABSENT-NO-UNDERSTANDING-V1: 결석 처리된 학생은 이해도 입력 불가
  const isAbsent = isAbsentStatus(s.attendanceStatuses);

  return (
    <div
      className={`rounded-lg border bg-card p-3 transition ${!s.included ? 'opacity-50' : 'hover:border-primary/40'} ${idx % 2 === 1 ? 'bg-muted/20' : ''} ${inCommonGroup ? 'border-l-4 border-l-primary/60' : ''}`}
    >
      {/* Row 1: name + meta */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
          {!hideIncludeToggle && (
            <input
              type="checkbox"
              checked={s.included}
              onChange={(e) => onChange('included', e.target.checked)}
              className="rounded w-4 h-4"
            />
          )}
          <div className="min-w-0">
            <div className="font-semibold text-base flex items-center gap-1.5 flex-wrap">
              <span className="truncate">{s.name}</span>
              {inCommonGroup && (
                <Badge className="text-[10px] h-5 px-1.5 bg-primary/15 text-primary border-0 hover:bg-primary/20">공통진도 적용</Badge>
              )}
              {s.existingDraft && (
                <Badge className="text-[10px] h-5 px-1.5 bg-blue-500/15 text-blue-600 dark:text-blue-400 border-0 hover:bg-blue-500/20">임시저장</Badge>
              )}
              {!s.hasAttendanceLog && (
                <Badge className="text-[10px] h-5 px-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 hover:bg-amber-500/20">출결없음</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {s.school || '—'}
              {s.prevAvg != null && <span className="ml-1">· 이전 평균 <b className="text-foreground">{s.prevAvg}</b></span>}
            </div>
          </div>
        </label>
      </div>

      {/* Row 2: understanding + homework */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground w-10 shrink-0">이해도</span>
          {isAbsent ? (
            <div className="flex-1 h-8 rounded-md border border-dashed border-border flex items-center justify-center text-[11px] text-muted-foreground">
              결석 — 이해도 입력 불가
            </div>
          ) : (
          <div className="flex gap-1 flex-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = s.understanding === n;
              const c = UNDERSTANDING_COLORS[n];
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!s.included}
                  onClick={() => onChange('understanding', n)}
                  className={`h-8 flex-1 rounded-md border text-sm font-bold transition ${active ? c.active : `${c.dim} border-border bg-background`}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground w-10 shrink-0">숙제</span>
          <div className="flex gap-1 flex-1">
            {HW_OPTIONS.map((o) => {
              const active = s.homework === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  disabled={!s.included}
                  onClick={() => onChange('homework', o.v)}
                  className={`h-8 flex-1 rounded-md border text-xs font-semibold transition ${active ? o.cls : `${o.dim} bg-background`}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: lesson types + attendance status */}
      {s.included && !hideAttendance && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-muted-foreground w-10 shrink-0">수업</span>
            <div className="flex gap-1 flex-wrap">
              {LESSON_TYPES.map((lt) => {
                const on = s.lessonTypes.includes(lt);
                return (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => onChange('lessonTypes', on ? s.lessonTypes.filter((x) => x !== lt) : [...s.lessonTypes, lt])}
                    className={`px-2 py-1 rounded-md border text-[11px] font-medium transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted bg-background'}`}
                  >
                    {lt}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap md:justify-end">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0">출결</span>
            <div className="flex gap-1 flex-wrap">
              {ATTENDANCE_STATUSES.map((at) => {
                const on = s.attendanceStatuses.includes(at);
                return (
                  <button
                    key={at}
                    type="button"
                    onClick={() => onChange('attendanceStatuses', on ? s.attendanceStatuses.filter((x) => x !== at) : [at])}
                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold transition ${on ? ATTENDANCE_COLOR[at] : 'border-border text-muted-foreground hover:bg-muted bg-background'}`}
                  >
                    {at}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Row 4: prev HW hint + note */}
      {s.prevHwContent && (
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1 mb-2">
          <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
          <span className="font-medium">이전 숙제:</span>
          <span className="truncate" title={s.prevHwContent}>{s.prevHwContent}</span>
        </div>
      )}
      <Input
        value={s.note}
        onChange={(e) => onChange('note', e.target.value)}
        disabled={!s.included}
        placeholder="이 학생만 코멘트 (선택)"
        className="h-8 text-sm"
      />

      {needsIndividualProgress && s.included && (
        <div className="mt-2">
          <Label className="text-[11px] font-medium text-muted-foreground">
            개별 진도 {groupMode === 'group' && <span className="text-red-500">(필수)</span>}
          </Label>
          <Input
            value={s.individualProgress}
            onChange={(e) => onChange('individualProgress', e.target.value)}
            placeholder={groupMode === 'group' ? '공통진도 비적용 학생 — 개별 진도 입력' : '예) 일차함수의 그래프'}
            className="h-9 text-sm border-primary/50 focus-visible:border-primary mt-1"
          />
        </div>
      )}
    </div>
  );
}
