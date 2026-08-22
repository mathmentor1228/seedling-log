// DATA-QUALITY-V1 — 읽기 전용 조회 훅. SELECT만 사용하며 DB write 없음.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buildFindings, type DataQualityInput, type DQFinding } from './dataQuality';

const LESSON_WINDOW_DAYS = 30;
const REPORT_WINDOW_DAYS = 60;
const PAGE = 1000;

function kstDateMinus(days: number) {
  const now = new Date(Date.now() + 9 * 3600_000);
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString().slice(0, 10);
}

/** 1000행 제한을 피하기 위한 페이지 조회 (필요 컬럼만). */
async function pagedSelect<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

export interface DataQualityState {
  loading: boolean;
  findings: DQFinding[];
  failedSources: string[];
  lessonFrom: string;
  reportFrom: string;
  reload: () => void;
}

export function useDataQuality(): DataQualityState {
  const [loading, setLoading] = useState(true);
  const [findings, setFindings] = useState<DQFinding[]>([]);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const lessonFrom = kstDateMinus(LESSON_WINDOW_DAYS);
  const reportFrom = kstDateMinus(REPORT_WINDOW_DAYS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const failed: string[] = [];
      const safe = async <T,>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
        try {
          return await fn();
        } catch {
          failed.push(label);
          return [];
        }
      };

      const [
        students, classes, schedules, classStudents, lessons,
        profiles, roles, subjectTeachers, homework, reports,
      ] = await Promise.all([
        safe('학생', () => pagedSelect((f, t) => supabase.from('students').select('id, enrollment_status').range(f, t))),
        safe('반', () => pagedSelect((f, t) => supabase.from('classes').select('id, name, subject, teacher_id').range(f, t))),
        safe('시간표', () => pagedSelect((f, t) => supabase.from('class_schedules').select('id, class_id, teacher_id, day_of_week, start_time, end_time, is_active').range(f, t))),
        safe('반 명단', () => pagedSelect((f, t) => supabase.from('class_students').select('class_id, student_id').range(f, t))),
        safe('수업일지', () => pagedSelect((f, t) => supabase.from('lesson_records').select('id, lesson_date, class_id, teacher_id, student_id, submitted').gte('lesson_date', lessonFrom).range(f, t))),
        safe('사용자 프로필', () => pagedSelect((f, t) => supabase.from('profiles').select('id, full_name, is_active').range(f, t))),
        safe('역할', () => pagedSelect((f, t) => supabase.from('user_roles').select('user_id, role').range(f, t))),
        safe('과목 담당', () => pagedSelect((f, t) => supabase.from('student_subject_teachers').select('student_id, subject, teacher_id').range(f, t))),
        safe('숙제', () => pagedSelect((f, t) => supabase.from('homework_assignments').select('id, student_id, assigned_date, lesson_record_id').gte('assigned_date', lessonFrom).range(f, t))),
        safe('주간리포트', () => pagedSelect((f, t) => supabase.from('weekly_reports').select('id, student_id, week_start, total_lessons').gte('week_start', reportFrom).range(f, t))),
      ]);

      if (cancelled) return;
      const input: DataQualityInput = {
        students, classes, schedules, classStudents, lessons,
        profiles, roles, subjectTeachers, homework, reports,
        lessonWindowDays: LESSON_WINDOW_DAYS,
        reportWindowDays: REPORT_WINDOW_DAYS,
      } as DataQualityInput;
      setFindings(buildFindings(input));
      setFailedSources(failed);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { loading, findings, failedSources, lessonFrom, reportFrom, reload };
}
