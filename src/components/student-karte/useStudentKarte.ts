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
  /** source: 'mapping' = student_subject_teachers, 'fallback' = 반 담당/최근 수업일지 */
  teachers: { subject: string; name: string; source: 'mapping' | 'fallback' }[];
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
  const [teachers, setTeachers] = useState<{ subject: string; name: string; source: 'mapping' | 'fallback' }[]>([]);
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
        supabase.from('class_students').select('class_id, classes(id, name, teacher_id)').eq('student_id', studentId),
        supabase.from('student_subject_teachers').select('subject, teacher_id').eq('student_id', studentId),
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

      // 담당 강사: 매핑 → 실패/공백이면 반 담당·최근 수업일지로 fallback (읽기 전용)
      if (stRes.error) errs.push('담당 강사');
      const mappingRows = (stRes.data || []) as any[];
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
          (lrRes.data || []).forEach((l: any) => {
            const name = (l.teacher_display_name || '').trim();
            if (!name || fbSeen.has(name)) return;
            fbSeen.add(name);
            resolved.push({ subject: l.subject || '최근 수업', name, source: 'fallback' });
          });
        }
      }
      setTeachers(resolved);

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
