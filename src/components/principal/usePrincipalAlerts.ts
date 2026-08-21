// PRINCIPAL-ACTION-V1
// 원장 홈 '지금 처리할 것' 전용 읽기 전용 로더.
// 어떤 write도 하지 않으며, 기존 테이블만 최소 SELECT로 조회한다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';
import { getCardDisplay, type CardDisplayState } from '@/components/teacher/cardStatus';
import { isAbsent, isPresent } from '@/lib/attendance';

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
  /** 수업출결은 출석인데 출입 태그(입실 로그)가 없는 반·날짜 */
  checkInGap: ClassDayGroup[];
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
  const [checkInGap, setCheckInGap] = useState<ClassDayGroup[]>([]);
  const [jobFailures, setJobFailures] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, logRes, classRes, jobRes] = await Promise.all([
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

      (recRes.data || []).forEach((r: any) => {
        if (!r.class_id) return;
        const key = `${r.class_id}|${r.lesson_date}`;
        const acc =
          map.get(key) ||
          { classId: r.class_id, date: r.lesson_date, total: 0, recorded: 0, submitted: 0, unsetAttendance: 0, gap: 0 };
        const statuses: string[] = Array.isArray(r.attendance_status) ? r.attendance_status : [];
        const hasAttendance = statuses.length > 0;
        const hasContent = hasAttendance || !!(r.lesson_range && String(r.lesson_range).trim());
        acc.total += 1;
        if (hasContent) acc.recorded += 1;
        if (r.submitted) acc.submitted += 1;
        if (!r.submitted && !hasAttendance) acc.unsetAttendance += 1;
        const presentish = statuses.some((s) => isPresent(s) && !isAbsent(s));
        if (presentish && r.student_id && !checkedIn.has(`${r.student_id}:${r.lesson_date}`)) acc.gap += 1;
        map.set(key, acc);
      });

      const mk = (a: Acc, issueCount: number): ClassDayGroup => ({
        key: `${a.classId}|${a.date}`,
        classId: a.classId,
        className: classNames.get(a.classId) || '이름 없는 반',
        date: a.date,
        studentCount: a.total,
        issueCount,
      });

      const ns: ClassDayGroup[] = [];
      const ip: ClassDayGroup[] = [];
      const au: ClassDayGroup[] = [];
      const gap: ClassDayGroup[] = [];

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
        if (a.gap > 0) gap.push(mk(a, a.gap));
      }

      const byDateDesc = (x: ClassDayGroup, y: ClassDayGroup) =>
        y.date.localeCompare(x.date) || x.className.localeCompare(y.className, 'ko');
      ns.sort(byDateDesc);
      ip.sort(byDateDesc);
      au.sort(byDateDesc);
      gap.sort(byDateDesc);

      setNotStarted(ns);
      setInProgress(ip);
      setAttendanceUnset(au);
      setCheckInGap(gap);
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
    sum(notStarted) + sum(inProgress) + sum(attendanceUnset) + sum(checkInGap) + jobFailures;

  return {
    from,
    to,
    loading,
    error,
    reload: load,
    notStarted,
    inProgress,
    attendanceUnset,
    checkInGap,
    jobFailures,
    totalIssues,
  };
}

export function sumIssues(groups: ClassDayGroup[]): number {
  return groups.reduce((n, g) => n + g.issueCount, 0);
}
