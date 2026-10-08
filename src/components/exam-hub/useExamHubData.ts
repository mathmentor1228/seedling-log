// EXAM-HUB-A: 내신대비 통합 화면 데이터 — 전부 읽기 전용 (점수 원본은 구글시트, 웹은 복제본)
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeSchool } from '@/components/exam-board/cycleUtils';
import type {
  ArchiveRow, ClassInfo, Cycle, CycleSubject, DeepReportRow, ExamResult, ReportItemCount, ReportRow,
  StudentRow, SubjectTeacherLink, Teacher, TextbookRow,
} from './examHubUtils';

const db = supabase as any;

export type ExamHubData = {
  loading: boolean;
  error: string | null;
  cycles: Cycle[];
  subjectsByCycle: Map<string, CycleSubject[]>;
  students: StudentRow[];
  classInfos: ClassInfo[];
  links: SubjectTeacherLink[];
  teachers: Teacher[];
  results: ExamResult[];
  reports: ReportRow[];
  deepByReport: Map<string, DeepReportRow>;
  itemCountByReport: Map<string, number>;
  textbooks: TextbookRow[];
  archives: ArchiveRow[];
  reload: () => Promise<void>;
};

export function useExamHubData(): ExamHubData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [subjectsByCycle, setSubjectsByCycle] = useState<Map<string, CycleSubject[]>>(new Map());
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classInfos, setClassInfos] = useState<ClassInfo[]>([]);
  const [links, setLinks] = useState<SubjectTeacherLink[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [deepByReport, setDeepByReport] = useState<Map<string, DeepReportRow>>(new Map());
  const [itemCountByReport, setItemCountByReport] = useState<Map<string, number>>(new Map());
  const [textbooks, setTextbooks] = useState<TextbookRow[]>([]);
  const [archives, setArchives] = useState<ArchiveRow[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cy, su, st, ci, ln, tc, rs, rp, dp, it, tb, ar] = await Promise.all([
        db.from('exam_cycles').select('*').neq('status', 'cancelled').order('start_date', { ascending: true, nullsFirst: false }),
        db.from('exam_cycle_subjects').select('*').order('subject'),
        db.from('students').select('id, name, grade, school, school_level, grade_year, enrollment_status')
          .in('enrollment_status', ['재학', '재등원']).order('name'),
        db.from('class_students').select('student_id, classes(subject, teacher_id)'),
        db.from('student_subject_teachers').select('student_id, subject, teacher_id'),
        db.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
        db.from('student_exam_results')
          .select('id, student_id, subject, exam_type, exam_year, exam_period, actual_score, expected_score, exam_date, submitted_at, note, review_status'),
        db.from('exam_analysis_reports')
          .select('id, school_name, grade, subject, exam_year, exam_period, exam_type, is_published, published_at, original_pdf_path, answer_pdf_path, exam_difficulty, avg_score, card_image_paths, updated_at, created_by_name'),
        db.from('exam_deep_analysis_reports').select('id, analysis_report_id, status, teacher_notes, published_at'),
        db.from('exam_analysis_items').select('report_id'),
        db.from('school_textbooks').select('school_name, grade, subject, publisher, textbook_name, year'),
        db.from('school_exam_archives')
          .select('school_name, grade_year, academic_year, semester, exam_type, subject, performance_assessment_info, textbook_publisher, exam_scope, status'),
      ]);
      if (cy.error) throw new Error(cy.error.message.includes('exam_cycles') ? '시험 사이클 테이블이 없습니다. Lovable에서 2026-09-15 마이그레이션을 먼저 적용해 주세요.' : cy.error.message);

      const subs = new Map<string, CycleSubject[]>();
      for (const s of (su.data || []) as CycleSubject[]) (subs.get(s.cycle_id) || subs.set(s.cycle_id, []).get(s.cycle_id))!.push(s);
      setCycles((cy.data || []) as Cycle[]);
      setSubjectsByCycle(subs);
      setStudents((st.data || []) as StudentRow[]);
      setClassInfos(((ci.data || []) as any[]).map(cs => ({ student_id: cs.student_id, subject: cs.classes?.subject || '', teacher_id: cs.classes?.teacher_id || null })));
      setLinks((ln.data || []) as SubjectTeacherLink[]);
      setTeachers((tc.data || []) as Teacher[]);
      setResults((rs.data || []) as ExamResult[]);
      setReports(((rp.data || []) as any[]).map(r => ({ ...r, school_name: normalizeSchool(r.school_name) })) as ReportRow[]);
      const deep = new Map<string, DeepReportRow>();
      for (const d of (dp.data || []) as DeepReportRow[]) deep.set(d.analysis_report_id, d);
      setDeepByReport(deep);
      const counts = new Map<string, number>();
      for (const row of (it.data || []) as ReportItemCount[] & { report_id: string }[]) counts.set(row.report_id, (counts.get(row.report_id) || 0) + 1);
      setItemCountByReport(counts);
      setTextbooks(((tb.data || []) as any[]).map(t => ({ ...t, school_name: normalizeSchool(t.school_name) })) as TextbookRow[]);
      setArchives(((ar.data || []) as any[]).map(a => ({ ...a, school_name: normalizeSchool(a.school_name) })) as ArchiveRow[]);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { loading, error, cycles, subjectsByCycle, students, classInfos, links, teachers, results, reports, deepByReport, itemCountByReport, textbooks, archives, reload };
}
