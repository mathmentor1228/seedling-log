// STUDENT-KARTE-V1 — 원장/관리자 전용 학생 카르테 데이터 로더 (SELECT 전용, write 없음)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';
import {
  buildTimeline, summarizeKarte,
  type KarteHomework, type KarteLesson, type KarteNote, type KarteReport,
  type KarteSummary, type TimelineItem,
} from './karteSummary';

export const KARTE_TIMELINE_DAYS = 90;
export const KARTE_SUMMARY_DAYS = 30;

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
  /** 학생 자체를 못 찾은 경우 (삭제/잘못된 id) */
  notFound: boolean;
  /** 학생은 찾았지만 일부 하위 쿼리가 실패한 경우 */
  partialErrors: string[];
  fatalError: string | null;
  reload: () => void;
  student: KarteStudent | null;
  classNames: string[];
  teachers: { subject: string; name: string }[];
  lastNoteDate: string | null;
  summary: KarteSummary | null;
  timeline: TimelineItem[];
  lessons: KarteLesson[];
  homework: KarteHomework[];
  reports: KarteReport[];
  notes: KarteNote[];
  attendanceDates: { date: string; checkedIn: boolean; checkedOut: boolean }[];
  from90: string;
  from30: string;
  today: string;
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useStudentKarte(studentId: string | undefined): KarteState {
  const today = getTodayKST();
  const from90 = useMemo(() => shiftDays(today, -(KARTE_TIMELINE_DAYS - 1)), [today]);
  const from30 = useMemo(() => shiftDays(today, -(KARTE_SUMMARY_DAYS - 1)), [today]);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [student, setStudent] = useState<KarteStudent | null>(null);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<{ subject: string; name: string }[]>([]);
  const [lessons, setLessons] = useState<KarteLesson[]>([]);
  const [homework, setHomework] = useState<KarteHomework[]>([]);
  const [reports, setReports] = useState<KarteReport[]>([]);
  const [notes, setNotes] = useState<KarteNote[]>([]);
  const [attendanceDates, setAttendanceDates] = useState<{ date: string; checkedIn: boolean; checkedOut: boolean }[]>([]);

  const load = useCallback(async () => {
    if (!studentId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setFatalError(null);
    setNotFound(false);
    const errs: string[] = [];
    try {
      const { data: s, error: sErr } = await supabase
        .from('students')
        .select('id, name, school, school_level, grade, grade_year, enrollment_status, status, withdrawn_at')
        .eq('id', studentId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!s) { setNotFound(true); setLoading(false); return; }
      setStudent(s as KarteStudent);

      const [csRes, stRes, lrRes, hwRes, wrRes, tnRes, alRes] = await Promise.all([
        supabase.from('class_students').select('class_id, classes(name)').eq('student_id', studentId),
        supabase.from('student_subject_teachers').select('subject, teacher_id, profiles(full_name)').eq('student_id', studentId),
        supabase.from('lesson_records')
          .select('id, lesson_date, subject, submitted, attendance_status, lesson_range, understanding_score, teacher_display_name, homework_status')
          .eq('student_id', studentId).gte('lesson_date', from90).lte('lesson_date', today)
          .order('lesson_date', { ascending: false }),
        supabase.from('homework_assignments')
          .select('id, assigned_date, subject, content, result, check_status, submitted_at, homework_type')
          .eq('student_id', studentId).gte('assigned_date', from90).lte('assigned_date', today)
          .order('assigned_date', { ascending: false }),
        supabase.from('weekly_reports')
          .select('id, week_start, week_end, parent_visible, report_quality_tag')
          .eq('student_id', studentId).gte('week_start', from90)
          .order('week_start', { ascending: false }),
        supabase.from('team_notes')
          .select('id, created_at, title, scope, status, target_role')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('attendance_logs')
          .select('date, checked_in_at, checked_out_at')
          .eq('student_id', studentId).gte('date', from90).lte('date', today),
      ]);

      if (csRes.error) errs.push('담당 반');
      else setClassNames((csRes.data || []).map((r: any) => r.classes?.name).filter(Boolean));

      if (stRes.error) errs.push('담당 강사');
      else setTeachers((stRes.data || []).map((r: any) => ({
        subject: r.subject, name: r.profiles?.full_name || '미지정',
      })));

      if (lrRes.error) errs.push('수업일지'); else setLessons((lrRes.data || []) as any);
      if (hwRes.error) errs.push('숙제'); else setHomework((hwRes.data || []) as any);
      if (wrRes.error) errs.push('주간 리포트'); else setReports((wrRes.data || []) as any);
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
      setPartialErrors(errs);
    } catch (e: any) {
      console.error('[useStudentKarte]', e);
      setFatalError(e?.message || '학생 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [studentId, from90, today]);

  useEffect(() => { load(); }, [load]);

  const checkedInDates = useMemo(
    () => new Set(attendanceDates.filter((a) => a.checkedIn).map((a) => a.date)),
    [attendanceDates]
  );

  const summary = useMemo(
    () => (student ? summarizeKarte({ lessons, homework, reports, checkedInDates, since: from30 }) : null),
    [student, lessons, homework, reports, checkedInDates, from30]
  );

  const timeline = useMemo(
    () => buildTimeline({ lessons, homework, reports, notes, attendanceDates }),
    [lessons, homework, reports, notes, attendanceDates]
  );

  const lastNoteDate = notes.length ? notes[0].created_at.slice(0, 10) : null;

  return {
    loading, notFound, partialErrors, fatalError, reload: load,
    student, classNames, teachers, lastNoteDate,
    summary, timeline, lessons, homework, reports, notes, attendanceDates,
    from90, from30, today,
  };
}
