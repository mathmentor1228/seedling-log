// PRINCIPAL-ACTION-V1
// 원장 홈 '지금 처리할 것' 전용 읽기 전용 로더.
// 어떤 write도 하지 않으며, 기존 테이블만 최소 SELECT로 조회한다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';
import { getCardDisplay, type CardDisplayState } from '@/components/teacher/cardStatus';
import { isPresent } from '@/lib/attendance';
import { filterFinishedRecords, getNowMinutesKST, type ClassScheduleRow } from './unclosedScope';
import { classifyCheckInGaps, type CheckInGapGroup } from './checkInGap';

export const ALERT_WINDOW_DAYS = 14;

export interface ClassDayGroup {
  key: string;
  classId: string;
  className: string;
  date: string;
  studentCount: number;
  /** 이 그룹에서 문제로 잡힌 건수 (미마감 인원 / 미선택 인원 / 차이 인원) */
  issueCount: number;
}

export interface PrincipalAlerts {
  from: string;
  to: string;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** 미작성(기록 0) 반·날짜 */
  notStarted: ClassDayGroup[];
  /** 작성 중(일부 기록) 반·날짜 */
  inProgress: ClassDayGroup[];
  /** 수업출결 미선택 인원이 있는 반·날짜 */
  attendanceUnset: ClassDayGroup[];
  /** 입실 태그 부분 누락(같은 반에서 일부만 태그됨) 반·날짜 */
  checkInPartial: ClassDayGroup[];
  /** 반 전체가 태그를 쓰지 않은 수업(정보성) */
  checkInUntagged: ClassDayGroup[];
  /** 태그 미사용 수업에 포함된 학생 수(참고용) */
  checkInUntaggedStudents: number;
  /** 주간 리포트 자동 작업 실패 건수 */
  jobFailures: number;
  totalIssues: number;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function usePrincipalAlerts(): PrincipalAlerts {
  const to = getTodayKST();
  const from = useMemo(() => addDays(to, -(ALERT_WINDOW_DAYS - 1)), [to]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notStarted, setNotStarted] = useState<ClassDayGroup[]>([]);
  const [inProgress, setInProgress] = useState<ClassDayGroup[]>([]);
  const [attendanceUnset, setAttendanceUnset] = useState<ClassDayGroup[]>([]);
  const [checkInPartial, setCheckInPartial] = useState<ClassDayGroup[]>([]);
  const [checkInUntagged, setCheckInUntagged] = useState<ClassDayGroup[]>([]);
  const [checkInUntaggedStudents, setCheckInUntaggedStudents] = useState(0);
  const [jobFailures, setJobFailures] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, logRes, classRes, schedRes, jobRes] = await Promise.all([
        supabase
          .from('lesson_records')
          .select('id, class_id, student_id, lesson_date, submitted, attendance_status, lesson_range')
          .gte('lesson_date', from)
          .lte('lesson_date', to),
        supabase
          .from('attendance_logs')
          .select('student_id, date, checked_in_at')
          .gte('date', from)
          .lte('date', to),
        supabase.from('classes').select('id, name'),
        supabase.from('class_schedules').select('class_id, day_of_week, end_time, is_active, inactive_until'),
        supabase
          .from('weekly_jobs_log')
          .select('status, run_at')
          .gte('run_at', `${from}T00:00:00+09:00`),
      ]);

      if (recRes.error) throw recRes.error;
      if (logRes.error) throw logRes.error;

      const classNames = new Map<string, string>();
      (classRes.data || []).forEach((c: any) => classNames.set(c.id, c.name || '-'));

      const checkedIn = new Set<string>();
      (logRes.data || []).forEach((l: any) => {
        if (l.checked_in_at && l.student_id) checkedIn.add(`${l.student_id}:${l.date}`);
      });

      type Acc = {
        classId: string;
        date: string;
        total: number;
        recorded: number;
        submitted: number;
        unsetAttendance: number;
        gap: number;
      };
      const map = new Map<string, Acc>();

      const scopeCtx = {
        today: to,
        nowMinutes: getNowMinutesKST(),
        schedules: (schedRes.data || []) as ClassScheduleRow[],
      };
      const scopedRecords = filterFinishedRecords((recRes.data || []) as any[], scopeCtx);

      scopedRecords.forEach((r: any) => {
        const classId: string = r.class_id || '';
        const key = `${classId || 'noclass'}|${r.lesson_date}`;
        const acc =
          map.get(key) ||
          { classId, date: r.lesson_date, total: 0, recorded: 0, submitted: 0, unsetAttendance: 0, gap: 0 };
        const statuses: string[] = Array.isArray(r.attendance_status) ? r.attendance_status : [];
        const hasAttendance = statuses.length > 0;
        const hasContent = hasAttendance || !!(r.lesson_range && String(r.lesson_range).trim());
        acc.total += 1;
        if (hasContent) acc.recorded += 1;
        if (r.submitted) acc.submitted += 1;
        if (!r.submitted && !hasAttendance) acc.unsetAttendance += 1;
        map.set(key, acc);
      });

      const mk = (a: Acc, issueCount: number): ClassDayGroup => ({
        key: `${a.classId || 'noclass'}|${a.date}`,
        classId: a.classId,
        className: a.classId ? classNames.get(a.classId) || '이름 없는 반' : '(반 미지정)',
        date: a.date,
        studentCount: a.total,
        issueCount,
      });


      const toGroup = (g: CheckInGapGroup): ClassDayGroup => ({
        key: g.key,
        classId: g.classId,
        className: g.classId ? classNames.get(g.classId) || '이름 없는 반' : '(반 미지정)',
        date: g.date,
        studentCount: g.target,
        issueCount: g.missing,
      });
      const gaps = classifyCheckInGaps(scopedRecords as any[], checkedIn);

      const ns: ClassDayGroup[] = [];
      const ip: ClassDayGroup[] = [];
      const au: ClassDayGroup[] = [];

      for (const a of map.values()) {
        const state: CardDisplayState = getCardDisplay({
          studentCount: a.total,
          recordedCount: a.recorded,
          submittedCount: a.submitted,
        }).state;
        const openCount = a.total - a.submitted;
        if (state === 'not_started' && openCount > 0) ns.push(mk(a, openCount));
        else if (state === 'in_progress' && openCount > 0) ip.push(mk(a, openCount));
        if (a.unsetAttendance > 0) au.push(mk(a, a.unsetAttendance));
      }

      const byDateDesc = (x: ClassDayGroup, y: ClassDayGroup) =>
        y.date.localeCompare(x.date) || x.className.localeCompare(y.className, 'ko');
      ns.sort(byDateDesc);
      ip.sort(byDateDesc);
      au.sort(byDateDesc);

      setNotStarted(ns);
      setInProgress(ip);
      setAttendanceUnset(au);
      setCheckInPartial(gaps.partial.map(toGroup));
      setCheckInUntagged(gaps.untagged.map(toGroup));
      setCheckInUntaggedStudents(gaps.untaggedStudents);
      setJobFailures(
        (jobRes.data || []).filter((j: any) => j.status && j.status !== 'completed').length
      );
    } catch (e: any) {
      console.error('[usePrincipalAlerts] load error:', e);
      setError(e?.message || '점검 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const sum = (g: ClassDayGroup[]) => g.reduce((n, x) => n + x.issueCount, 0);
  const totalIssues =
    sum(notStarted) + sum(inProgress) + sum(attendanceUnset) + sum(checkInPartial) + jobFailures;

  return {
    from,
    to,
    loading,
    error,
    reload: load,
    notStarted,
    inProgress,
    attendanceUnset,
    checkInPartial,
    checkInUntagged,
    checkInUntaggedStudents,
    jobFailures,
    totalIssues,
  };
}

export function sumIssues(groups: ClassDayGroup[]): number {
  return groups.reduce((n, g) => n + g.issueCount, 0);
}
