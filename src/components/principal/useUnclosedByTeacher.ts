// UNCLOSED-BY-TEACHER-V1 — 원장/관리자 전용 미마감 집계 로더 (SELECT 전용, write 없음)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';
import {
  addDaysKST, buildUnclosedGroups, groupByTeacher,
  type TeacherUnclosed, type UnclosedGroup, type UnclosedRecordRow,
} from './unclosedSummary';

export type WindowDays = 7 | 14 | 30;
export type StatusFilter = 'all' | 'not_started' | 'in_progress';

export interface UnclosedFilters {
  days: WindowDays;
  teacher: string | null;
  classId: string | null;
  status: StatusFilter;
}

export interface UnclosedResult {
  loading: boolean;
  error: string | null;
  partialErrors: string[];
  reload: () => void;
  from: string;
  to: string;
  recentFrom: string;
  /** 필터 적용 후 강사별 집계 */
  teachers: TeacherUnclosed[];
  /** 필터 적용 전 전체(강사·반 선택지 계산용) */
  allGroups: UnclosedGroup[];
  totalUnclosed: number;
  teacherOptions: string[];
  classOptions: { id: string; name: string }[];
}

export function useUnclosedByTeacher(filters: UnclosedFilters): UnclosedResult {
  const to = getTodayKST();
  const from = useMemo(() => addDaysKST(to, -(filters.days - 1)), [to, filters.days]);
  const recentFrom = useMemo(() => addDaysKST(to, -6), [to]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<UnclosedRecordRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const errs: string[] = [];
    try {
      const [recRes, classRes] = await Promise.all([
        supabase
          .from('lesson_records')
          .select('id, class_id, lesson_date, submitted, attendance_status, lesson_range, teacher_display_name')
          .gte('lesson_date', from)
          .lte('lesson_date', to)
          .order('lesson_date', { ascending: true }),
        supabase.from('classes').select('id, name'),
      ]);
      if (recRes.error) throw recRes.error;
      const names = new Map<string, string>();
      if (classRes.error) errs.push('반 이름');
      else (classRes.data || []).forEach((c: any) => names.set(c.id, c.name || ''));

      setRows(
        (recRes.data || []).map((r: any) => ({
          id: r.id,
          class_id: r.class_id,
          class_name: r.class_id ? names.get(r.class_id) || null : null,
          lesson_date: r.lesson_date,
          submitted: r.submitted,
          attendance_status: r.attendance_status,
          lesson_range: r.lesson_range,
          teacher_display_name: r.teacher_display_name,
        }))
      );
      setPartialErrors(errs);
    } catch (e: any) {
      console.error('[useUnclosedByTeacher]', e);
      setError(e?.message || '미마감 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const allGroups = useMemo(() => buildUnclosedGroups(rows, recentFrom), [rows, recentFrom]);

  const filtered = useMemo(
    () =>
      allGroups.filter((g) => {
        if (filters.teacher && g.teacher !== filters.teacher) return false;
        if (filters.classId && g.classId !== filters.classId) return false;
        if (filters.status !== 'all' && g.state !== filters.status) return false;
        return true;
      }),
    [allGroups, filters.teacher, filters.classId, filters.status]
  );

  const teachers = useMemo(() => groupByTeacher(filtered), [filtered]);

  const teacherOptions = useMemo(
    () => [...new Set(allGroups.map((g) => g.teacher))].sort((a, b) => a.localeCompare(b, 'ko')),
    [allGroups]
  );

  const classOptions = useMemo(() => {
    const m = new Map<string, string>();
    allGroups.forEach((g) => { if (g.classId) m.set(g.classId, g.className); });
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [allGroups]);

  return {
    loading, error, partialErrors, reload: load,
    from, to, recentFrom,
    teachers, allGroups,
    totalUnclosed: teachers.reduce((s, t) => s + t.unclosedCount, 0),
    teacherOptions, classOptions,
  };
}
