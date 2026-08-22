// STUDENT-KARTE-V2 — 원장/담당 강사용 학생 카르테 데이터 로더 (SELECT 전용, write 없음)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { DeliveryEvent } from '@/lib/reportDelivery';
import {
  buildTimeline, buildTrend, matchesSubject, PERIOD_DAYS, shiftIsoDate, summarizeKarte,
  type KarteHomework, type KarteLesson, type KarteNote, type KartePeriod, type KarteReport,
  type KarteSummary, type TimelineItem, type TrendWeek,
} from './karteSummary';

export const KARTE_TIMELINE_DAYS = 90;
export const KARTE_SUMMARY_DAYS = 30;
export const KARTE_TREND_WEEKS = 12;
export const KARTE_REPORT_WEEKS = 8;

export interface KarteStudent {
  id: string;
  name: string;
  school: string | null;
  school_level: string | null;
  grade: string | null;
  grade_year: number | null;
  enrollment_status: string | null;
  status: string | null;
  withdrawn_at: string | null;
}

export interface KarteState {
  loading: boolean;
  notFound: boolean;
  /** 담당이 아닌 강사가 접근한 경우 */
  forbidden: boolean;
  partialErrors: string[];
  fatalError: string | null;
  reload: () => void;
  student: KarteStudent | null;
  classNames: string[];
  teachers: { subject: string; name: string; source: 'mapping' | 'fallback' }[];
  lastNoteDate: string | null;
  lastLessonDate: string | null;
  lastReportDate: string | null;
  summary: KarteSummary | null;
  timeline: TimelineItem[];
  trend: TrendWeek[];
  lessons: KarteLesson[];
  homework: KarteHomework[];
  reports: KarteReport[];
  notes: KarteNote[];
  deliveryEvents: Record<string, DeliveryEvent[]>;
  /** 상담·메모 기능 자체 조회 실패 여부(기능 없음 vs 기록 없음 구분) */
  notesUnavailable: boolean;
  subjects: string[];
  attendanceDates: { date: string; checkedIn: boolean; checkedOut: boolean }[];
  fromPeriod: string;
  from90: string;
  from30: string;
  today: string;
}

export function useStudentKarte(
  studentId: string | undefined,
  options?: { period?: KartePeriod; subject?: string }
): KarteState {
  const period: KartePeriod = options?.period ?? '12w';
  const subject = options?.subject ?? 'all';
  const { user, role } = useAuth();

  const today = getTodayKST();
  const fetchDays = Math.max(PERIOD_DAYS[period], KARTE_TREND_WEEKS * 7);
  const fromFetch = useMemo(() => shiftIsoDate(today, -(fetchDays - 1)), [today, fetchDays]);
  const fromPeriod = useMemo(() => shiftIsoDate(today, -(PERIOD_DAYS[period] - 1)), [today, period]);
  const from90 = useMemo(() => shiftIsoDate(today, -(KARTE_TIMELINE_DAYS - 1)), [today]);
  const from30 = useMemo(() => shiftIsoDate(today, -(KARTE_SUMMARY_DAYS - 1)), [today]);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [student, setStudent] = useState<KarteStudent | null>(null);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<{ subject: string; name: string; source: 'mapping' | 'fallback' }[]>([]);
  const [allLessons, setAllLessons] = useState<KarteLesson[]>([]);
  const [allHomework, setAllHomework] = useState<KarteHomework[]>([]);
  const [allReports, setAllReports] = useState<KarteReport[]>([]);
  const [notes, setNotes] = useState<KarteNote[]>([]);
  const [notesUnavailable, setNotesUnavailable] = useState(false);
  const [deliveryEvents, setDeliveryEvents] = useState<Record<string, DeliveryEvent[]>>({});
  const [attendanceDates, setAttendanceDates] = useState<{ date: string; checkedIn: boolean; checkedOut: boolean }[]>([]);

  const load = useCallback(async () => {
    if (!studentId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setFatalError(null);
    setNotFound(false);
    setForbidden(false);
    const errs: string[] = [];
    try {
      const { data: s, error: sErr } = await supabase
        .from('students')
        .select('id, name, school, school_level, grade, grade_year, enrollment_status, status, withdrawn_at')
        .eq('id', studentId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!s) { setNotFound(true); setLoading(false); return; }

      const [csRes, stRes, lrRes, hwRes, wrRes, tnRes, alRes] = await Promise.all([
        supabase.from('class_students').select('class_id, classes(id, name, teacher_id)').eq('student_id', studentId),
        supabase.from('student_subject_teachers').select('subject, teacher_id').eq('student_id', studentId),
        supabase.from('lesson_records')
          .select('id, lesson_date, subject, submitted, attendance_status, lesson_range, understanding_score, teacher_display_name, homework_status')
          .eq('student_id', studentId).gte('lesson_date', fromFetch).lte('lesson_date', today)
          .order('lesson_date', { ascending: false }),
        supabase.from('homework_assignments')
          .select('id, assigned_date, subject, content, result, check_status, submitted_at, homework_type')
          .eq('student_id', studentId).gte('assigned_date', fromFetch).lte('assigned_date', today)
          .order('assigned_date', { ascending: false }),
        supabase.from('weekly_reports')
          .select('id, week_start, week_end, parent_visible, report_quality_tag')
          .eq('student_id', studentId).gte('week_start', fromFetch)
          .order('week_start', { ascending: false }),
        supabase.from('team_notes')
          .select('*')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('attendance_logs')
          .select('date, checked_in_at, checked_out_at')
          .eq('student_id', studentId).gte('date', fromFetch).lte('date', today),
      ]);

      // 담당 반: class_id 기준 dedupe
      const classRows: { id: string; name: string; teacherId: string | null }[] = [];
      if (csRes.error) errs.push('담당 반');
      else {
        const seen = new Set<string>();
        (csRes.data || []).forEach((r: any) => {
          const c = r.classes;
          const id = c?.id || r.class_id;
          if (!c?.name || !id || seen.has(id)) return;
          seen.add(id);
          classRows.push({ id, name: c.name, teacherId: c.teacher_id || null });
        });
        setClassNames([...new Set(classRows.map((c) => c.name))]);
      }

      const mappingRows = (stRes.data || []) as any[];
      const lessonRows = (lrRes.data || []) as any[];

      // 강사 권한: 담당 반/과목 매핑/본인 수업 기록이 하나라도 있어야 열람 가능
      if (role === 'teacher') {
        const owns =
          classRows.some((c) => c.teacherId && c.teacherId === user?.id) ||
          mappingRows.some((r) => r.teacher_id === user?.id) ||
          lessonRows.length > 0;
        if (!owns) { setForbidden(true); setLoading(false); return; }
      }

      setStudent(s as KarteStudent);

      if (stRes.error) errs.push('담당 강사');
      const teacherIds = [...new Set([
        ...mappingRows.map((r) => r.teacher_id).filter(Boolean),
        ...classRows.map((c) => c.teacherId).filter(Boolean),
      ])] as string[];
      const nameById = new Map<string, string>();
      if (teacherIds.length) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles').select('id, full_name').in('id', teacherIds);
        if (pErr) errs.push('강사 이름');
        else (profs || []).forEach((p: any) => nameById.set(p.id, p.full_name || ''));
      }

      const resolved: { subject: string; name: string; source: 'mapping' | 'fallback' }[] = [];
      const seenTeacher = new Set<string>();
      mappingRows.forEach((r) => {
        const name = (r.teacher_id && nameById.get(r.teacher_id)) || '';
        if (!name) return;
        const k = `${r.subject}|${r.teacher_id}`;
        if (seenTeacher.has(k)) return;
        seenTeacher.add(k);
        resolved.push({ subject: r.subject, name, source: 'mapping' });
      });
      if (resolved.length === 0) {
        const fbSeen = new Set<string>();
        classRows.forEach((c) => {
          const name = c.teacherId ? nameById.get(c.teacherId) : '';
          if (!name || fbSeen.has(name)) return;
          fbSeen.add(name);
          resolved.push({ subject: c.name, name, source: 'fallback' });
        });
        if (resolved.length === 0 && !lrRes.error) {
          lessonRows.forEach((l: any) => {
            const name = (l.teacher_display_name || '').trim();
            if (!name || fbSeen.has(name)) return;
            fbSeen.add(name);
            resolved.push({ subject: l.subject || '최근 수업', name, source: 'fallback' });
          });
        }
      }
      setTeachers(resolved);

      if (lrRes.error) errs.push('수업일지'); else setAllLessons(lessonRows as any);
      if (hwRes.error) errs.push('숙제'); else setAllHomework((hwRes.data || []) as any);

      const reportRows = (wrRes.data || []) as any[];
      if (wrRes.error) errs.push('주간 리포트'); else setAllReports(reportRows as any);

      setNotesUnavailable(!!tnRes.error);
      if (tnRes.error) errs.push('상담·메모'); else setNotes((tnRes.data || []) as any);

      if (alRes.error) errs.push('출입 기록');
      else {
        const map = new Map<string, { date: string; checkedIn: boolean; checkedOut: boolean }>();
        (alRes.data || []).forEach((l: any) => {
          const cur = map.get(l.date) || { date: l.date, checkedIn: false, checkedOut: false };
          if (l.checked_in_at) cur.checkedIn = true;
          if (l.checked_out_at) cur.checkedOut = true;
          map.set(l.date, cur);
        });
        setAttendanceDates([...map.values()].sort((a, b) => b.date.localeCompare(a.date)));
      }

      // 발송 확인 이력 (읽기 전용, 실제 전송 아님) — 리포트 id 묶음 1회 조회로 N+1 방지
      const reportIds = reportRows.map((r) => r.id);
      if (reportIds.length) {
        const { data: evs, error: evErr } = await supabase
          .from('report_delivery_events')
          .select('id, report_id, status, channel, note, actor_id, created_at')
          .in('report_id', reportIds)
          .order('created_at', { ascending: false });
        if (evErr) errs.push('발송 확인 이력');
        else {
          const byReport: Record<string, DeliveryEvent[]> = {};
          (evs || []).forEach((e: any) => {
            (byReport[e.report_id] ||= []).push(e as DeliveryEvent);
          });
          setDeliveryEvents(byReport);
        }
      } else setDeliveryEvents({});

      setPartialErrors(errs);
    } catch (e: any) {
      console.error('[useStudentKarte]', e);
      setFatalError(e?.message || '학생 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [studentId, fromFetch, today, role, user?.id]);

  useEffect(() => { load(); }, [load]);

  const subjects = useMemo(
    () => [...new Set(allLessons.map((l) => l.subject).filter(Boolean) as string[])].sort(),
    [allLessons]
  );

  const lessons = useMemo(
    () => allLessons.filter((l) => l.lesson_date >= fromPeriod && matchesSubject(l.subject, subject)),
    [allLessons, fromPeriod, subject]
  );
  const homework = useMemo(
    () => allHomework.filter((h) => h.assigned_date >= fromPeriod && matchesSubject(h.subject, subject)),
    [allHomework, fromPeriod, subject]
  );
  const reports = useMemo(
    () => allReports.filter((r) => r.week_start >= fromPeriod),
    [allReports, fromPeriod]
  );

  const checkedInDates = useMemo(
    () => new Set(attendanceDates.filter((a) => a.checkedIn).map((a) => a.date)),
    [attendanceDates]
  );

  const summary = useMemo(
    () => (student ? summarizeKarte({
      lessons: allLessons.filter((l) => matchesSubject(l.subject, subject)),
      homework: allHomework.filter((h) => matchesSubject(h.subject, subject)),
      reports: allReports,
      checkedInDates,
      since: from30,
    }) : null),
    [student, allLessons, allHomework, allReports, checkedInDates, from30, subject]
  );

  const trend = useMemo(
    () => buildTrend({
      lessons: allLessons.filter((l) => matchesSubject(l.subject, subject)),
      homework: allHomework.filter((h) => matchesSubject(h.subject, subject)),
      today,
      weeks: KARTE_TREND_WEEKS,
    }),
    [allLessons, allHomework, subject, today]
  );

  const timeline = useMemo(
    () => buildTimeline({
      lessons: allLessons.filter((l) => l.lesson_date >= from90 && matchesSubject(l.subject, subject)),
      homework: allHomework.filter((h) => h.assigned_date >= from90 && matchesSubject(h.subject, subject)),
      reports: allReports.filter((r) => r.week_start >= from90),
      notes,
      attendanceDates: attendanceDates.filter((a) => a.date >= from90),
    }),
    [allLessons, allHomework, allReports, notes, attendanceDates, from90, subject]
  );

  const lastNoteDate = notes.length ? notes[0].created_at.slice(0, 10) : null;
  const lastLessonDate = allLessons.length ? allLessons[0].lesson_date : null;
  const lastReportDate = allReports.length ? allReports[0].week_start : null;

  return {
    loading, notFound, forbidden, partialErrors, fatalError, reload: load,
    student, classNames, teachers, lastNoteDate, lastLessonDate, lastReportDate,
    summary, timeline, trend, lessons, homework, reports, notes,
    deliveryEvents, notesUnavailable, subjects, attendanceDates,
    fromPeriod, from90, from30, today,
  };
}
