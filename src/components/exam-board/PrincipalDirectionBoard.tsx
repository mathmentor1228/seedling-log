// EXAM-DIRECTION-V1: 원장 디렉션 보드 — 시험 사이클 단위 학교×학년×과목 준비 매트릭스
// + "이 선생님과 이 얘기 하세요" 자동 제시 (성적 하락 TOP / 분석지 미작성 / 채점 밀린 교사)
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingDown, AlertTriangle, FileWarning, UserCog, Undo2, RefreshCw } from 'lucide-react';
import { normalizeSchool, periodSortKey } from './cycleUtils';
import { STATUS_OPTIONS } from '@/components/exam-archive/ArchiveTab';

type StudentRow = { id: string; name: string; school: string | null; school_level: string | null; grade_year: number | null };
type ClassInfo = { student_id: string; subject: string; teacher_id: string | null };
type Teacher = { id: string; full_name: string };
type ExamResult = {
  id: string; student_id: string; subject: string; exam_type: string;
  exam_year: number | null; exam_period: string | null; actual_score: number | null; exam_date: string | null;
};
type ReviewRow = { result_id: string; reviewed_at: string | null };
type ArchiveRow = {
  school_name: string; school_level: string; grade_year: number; subject: string;
  exam_type: string; semester: string; academic_year: number;
  exam_date_start: string | null; exam_date_end: string | null; status: string;
};
type ReportRow = {
  school_name: string; grade: string; subject: string;
  exam_type: string; exam_year: number; exam_period: string;
};

const YEARS_BACK = 2;
const currentYearNow = Number(getTodayKST().slice(0, 4));
const YEARS = Array.from({ length: YEARS_BACK + 1 }, (_, i) => currentYearNow - i);
const SEMESTERS = ['1학기', '2학기'] as const;
const EXAM_TYPES = ['중간고사', '기말고사'] as const;

const baseSubject = (s: string) => (s || '').split('(')[0].trim();
const gradeLabel = (level: string, year: number) => `${level}${year}`;
const statusMeta = (status: string) => STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];

export function PrincipalDirectionBoard() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classInfos, setClassInfos] = useState<ClassInfo[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const nowKST = getTodayKST();
  const nowMonth = Number(nowKST.slice(5, 7));
  const [cycleYear, setCycleYear] = useState(currentYearNow);
  const [cycleSemester, setCycleSemester] = useState<typeof SEMESTERS[number]>(nowMonth >= 8 || nowMonth <= 1 ? '2학기' : '1학기');
  const [cycleType, setCycleType] = useState<typeof EXAM_TYPES[number]>([3, 4, 9, 10].includes(nowMonth) ? '중간고사' : '기말고사');

  async function load() {
    setLoading(true);
    try {
      const [stuRes, ciRes, tRes, resRes, arcRes, repRes] = await Promise.all([
        supabase.from('students').select('id, name, school, school_level, grade_year').in('enrollment_status', ['재학', '재등원']),
        supabase.from('class_students').select('student_id, classes(subject, teacher_id)'),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('student_exam_results')
          .select('id, student_id, subject, exam_type, exam_year, exam_period, actual_score, exam_date')
          .in('exam_type', ['midterm', 'final']),
        supabase.from('school_exam_archives')
          .select('school_name, school_level, grade_year, subject, exam_type, semester, academic_year, exam_date_start, exam_date_end, status'),
        supabase.from('exam_analysis_reports')
          .select('school_name, grade, subject, exam_type, exam_year, exam_period'),
      ]);
      setStudents((stuRes.data as StudentRow[]) || []);
      setClassInfos(((ciRes.data || []) as any[]).map(cs => ({
        student_id: cs.student_id, subject: cs.classes?.subject || '', teacher_id: cs.classes?.teacher_id || null,
      })));
      setTeachers((tRes.data as Teacher[]) || []);
      const resultRows = (resRes.data as ExamResult[]) || [];
      setResults(resultRows);
      setArchives(((arcRes.data || []) as any[]).map(a => ({ ...a, school_name: normalizeSchool(a.school_name) })));
      setReports(((repRes.data || []) as any[]).map(r => ({ ...r, school_name: normalizeSchool(r.school_name) })));

      const resultIds = resultRows.map(r => r.id);
      if (resultIds.length > 0) {
        const { data: rev } = await supabase.from('exam_reviews').select('result_id, reviewed_at').in('result_id', resultIds);
        setReviews((rev as ReviewRow[]) || []);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const teacherName = useMemo(() => new Map(teachers.map(t => [t.id, t.full_name])), [teachers]);

  // 학생 student_id+subject → teacher_id (base subject 매칭)
  const teacherFor = useMemo(() => {
    const m = new Map<string, string>(); // `${student_id}|${baseSubject}` -> teacher_id
    classInfos.forEach(ci => {
      if (!ci.teacher_id) return;
      m.set(`${ci.student_id}|${baseSubject(ci.subject)}`, ci.teacher_id);
    });
    return m;
  }, [classInfos]);

  // ── 매트릭스: 선택한 사이클의 학교×학년 행 / 과목 열 ──
  const cycleArchives = useMemo(
    () => archives.filter(a => a.academic_year === cycleYear && a.semester === cycleSemester && a.exam_type === cycleType),
    [archives, cycleYear, cycleSemester, cycleType]
  );
  const matrix = useMemo(() => {
    const rowKey = (a: ArchiveRow) => `${a.school_name}|${a.school_level}|${a.grade_year}`;
    const rows = new Map<string, { school: string; grade: string; cells: Map<string, ArchiveRow> }>();
    const subjectSet = new Set<string>();
    for (const a of cycleArchives) {
      const key = rowKey(a);
      if (!rows.has(key)) rows.set(key, { school: a.school_name, grade: gradeLabel(a.school_level, a.grade_year), cells: new Map() });
      rows.get(key)!.cells.set(a.subject, a);
      subjectSet.add(a.subject);
    }
    const subjects = Array.from(subjectSet).sort((a, b) => a.localeCompare(b, 'ko'));
    const rowList = Array.from(rows.values()).sort((a, b) =>
      a.school.localeCompare(b.school, 'ko') || a.grade.localeCompare(b.grade, 'ko'));
    return { subjects, rows: rowList };
  }, [cycleArchives]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    cycleArchives.forEach(a => m.set(a.status, (m.get(a.status) || 0) + 1));
    return m;
  }, [cycleArchives]);

  // ── 디렉션 카드 A: 성적 하락 TOP (사이클 무관, 전체 추세) ──
  const declineTop = useMemo(() => {
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const byStudentSubject = new Map<string, ExamResult[]>();
    results.forEach(r => {
      if (r.actual_score == null) return;
      const k = `${r.student_id}|${r.subject}`;
      (byStudentSubject.get(k) || byStudentSubject.set(k, []).get(k))!.push(r);
    });
    const studentName = new Map(students.map(s => [s.id, s.name || '']));
    const out: { student_id: string; subject: string; last: number; delta: number; doubleDrop: boolean }[] = [];
    byStudentSubject.forEach((rows, key) => {
      const sorted = [...rows].sort((a, b) => periodSortKey(a.exam_year, a.exam_period, a.exam_date) - periodSortKey(b.exam_year, b.exam_period, b.exam_date));
      const line = sorted.map(r => Number(r.actual_score));
      if (line.length < 2) return;
      const delta = round1(line[line.length - 1] - line[line.length - 2]);
      const delta2 = line.length >= 3 ? round1(line[line.length - 2] - line[line.length - 3]) : null;
      if (delta >= 0) return;
      const [studentId, subject] = key.split('|');
      out.push({ student_id: studentId, subject, last: line[line.length - 1], delta, doubleDrop: delta2 != null && delta2 < 0 });
    });
    out.sort((a, b) => (a.doubleDrop === b.doubleDrop ? a.delta - b.delta : a.doubleDrop ? -1 : 1));
    return out.slice(0, 8).map(d => ({
      ...d,
      studentName: studentName.get(d.student_id) || '?',
      teacherId: teacherFor.get(`${d.student_id}|${baseSubject(d.subject)}`) || null,
    }));
  }, [results, students, teacherFor]);

  // ── 디렉션 카드 B: 분석지 미작성 (선택 사이클, 시험 종료분만) ──
  const missingReports = useMemo(() => {
    const today = nowKST;
    return cycleArchives
      .filter(a => a.exam_date_end && a.exam_date_end < today)
      .filter(a => {
        const grade = gradeLabel(a.school_level, a.grade_year);
        const base = baseSubject(a.subject);
        return !reports.some(r =>
          r.school_name === a.school_name && r.grade === grade && r.exam_type === a.exam_type
          && r.exam_year === a.academic_year && r.exam_period === a.semester
          && baseSubject(r.subject) === base);
      })
      .map(a => {
        // 후보 담당 교사 — 이 학교·학년 학생 중 해당 과목 수업 담당자
        const base = baseSubject(a.subject);
        const teacherIds = new Set<string>();
        students
          .filter(s => normalizeSchool(s.school) === a.school_name && s.school_level === a.school_level && s.grade_year === a.grade_year)
          .forEach(s => { const t = teacherFor.get(`${s.id}|${base}`); if (t) teacherIds.add(t); });
        return { ...a, teacherIds: Array.from(teacherIds) };
      })
      .sort((a, b) => (a.exam_date_end || '').localeCompare(b.exam_date_end || ''));
  }, [cycleArchives, reports, students, teacherFor, nowKST]);

  // ── 디렉션 카드 C: 채점 밀린 교사 (선택 사이클) ──
  const gradingBehind = useMemo(() => {
    const typeMap: Record<string, string> = { '중간고사': 'midterm', '기말고사': 'final' };
    const period = `${cycleSemester.startsWith('1') ? '1' : '2'}-${cycleType === '중간고사' ? 'a' : 'b'}`;
    const reviewedSet = new Set(reviews.filter(r => r.reviewed_at).map(r => r.result_id));
    const pending = results.filter(r =>
      r.exam_type === typeMap[cycleType] && r.exam_year === cycleYear && r.exam_period === period
      && r.actual_score != null && !reviewedSet.has(r.id));
    const byTeacher = new Map<string, number>();
    pending.forEach(r => {
      const t = teacherFor.get(`${r.student_id}|${baseSubject(r.subject)}`);
      if (t) byTeacher.set(t, (byTeacher.get(t) || 0) + 1);
    });
    return Array.from(byTeacher.entries())
      .map(([teacherId, count]) => ({ teacherId, count, name: teacherName.get(teacherId) || '?' }))
      .sort((a, b) => b.count - a.count);
  }, [results, reviews, teacherFor, teacherName, cycleYear, cycleSemester, cycleType]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <UserCog className="w-5 h-5" />원장 디렉션 — 내신 사이클 진행상황
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/exam-board"><Undo2 className="w-4 h-4 mr-1" />내신 보드로</Link>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Select value={String(cycleYear)} onValueChange={v => setCycleYear(Number(v))}>
            <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}</SelectContent>
          </Select>
          <Select value={cycleSemester} onValueChange={v => setCycleSemester(v as any)}>
            <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{SEMESTERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={cycleType} onValueChange={v => setCycleType(v as any)}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />새로고침
          </Button>
        </div>
      </div>

      {/* ═══ 디렉션 카드 3종 — "이 선생님과 이 얘기 하세요" ═══ */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-red-300/60">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-bold flex items-center gap-1.5 text-red-700">
              <TrendingDown className="w-4 h-4" />성적 하락 TOP
            </p>
            {declineTop.length === 0 ? (
              <p className="text-xs text-muted-foreground">하락 추세인 학생 없음</p>
            ) : declineTop.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs border-b last:border-0 py-1">
                <b className="min-w-[52px]">{d.studentName}</b>
                <span className="text-muted-foreground">{d.subject}</span>
                <span className="ml-auto font-bold text-red-600">{d.delta}점{d.doubleDrop && ' (연속)'}</span>
                {d.teacherId && <span className="text-[10px] text-muted-foreground">{teacherName.get(d.teacherId)}</span>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-amber-300/60">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-bold flex items-center gap-1.5 text-amber-700">
              <FileWarning className="w-4 h-4" />분석지 미작성
            </p>
            {missingReports.length === 0 ? (
              <p className="text-xs text-muted-foreground">이번 사이클 분석지 전부 작성됨</p>
            ) : missingReports.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs border-b last:border-0 py-1 flex-wrap">
                <b>{a.school_name} {gradeLabel(a.school_level, a.grade_year)}</b>
                <span className="text-muted-foreground">{a.subject}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">종료 {a.exam_date_end}</span>
                {a.teacherIds.length > 0 && (
                  <span className="text-[10px] text-amber-700 font-semibold">
                    {a.teacherIds.map(t => teacherName.get(t)).filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-sky-300/60">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-bold flex items-center gap-1.5 text-sky-700">
              <AlertTriangle className="w-4 h-4" />채점 밀린 교사
            </p>
            {gradingBehind.length === 0 ? (
              <p className="text-xs text-muted-foreground">이번 사이클 채점 밀림 없음</p>
            ) : gradingBehind.map((g, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs border-b last:border-0 py-1">
                <b>{g.name}</b>
                <span className="ml-auto text-sky-700 font-bold">{g.count}건 대기</span>
              </div>
            ))}
            {gradingBehind.length > 0 && (
              <p className="text-[10px] text-muted-foreground pt-1">
                → {gradingBehind[0].name} 선생님과 채점 진행 상황 확인해보세요
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ 학교×학년×과목 준비 매트릭스 ═══ */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-bold">준비 상태 매트릭스 — {cycleYear}년 {cycleSemester} {cycleType}</h2>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_OPTIONS.map(o => {
              const n = statusCounts.get(o.value) || 0;
              if (n === 0) return null;
              return <Badge key={o.value} variant="outline" className={`text-[10px] ${o.color}`}>{o.label} {n}</Badge>;
            })}
          </div>
        </div>
        {matrix.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg px-4 py-6 text-center">
            이 사이클에 등록된 학교 자료가 없습니다 — 내신 자료실에서 등록해주세요.
          </p>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left px-3 py-2 font-bold whitespace-nowrap">학교 / 학년</th>
                  {matrix.subjects.map(s => (
                    <th key={s} className="text-center px-3 py-2 font-bold whitespace-nowrap">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{row.school} {row.grade}</td>
                    {matrix.subjects.map(s => {
                      const cell = row.cells.get(s);
                      if (!cell) return <td key={s} className="px-3 py-2 text-center text-muted-foreground/40">—</td>;
                      const meta = statusMeta(cell.status);
                      return (
                        <td key={s} className="px-3 py-2 text-center">
                          <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
