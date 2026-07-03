// EXAM-BOARD-V1: 강사용 내신 보드 — "내 학생" 기준 시험 사이클 상황판
// 담당학생 스코핑(class_students→classes.teacher_id) 기본 내장.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CalendarClock, ClipboardCheck, FileBarChart2, GraduationCap, School as SchoolIcon,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
} from 'lucide-react';

type StudentRow = {
  id: string; name: string; grade: string | null; school: string | null;
  school_level: string | null; grade_year: number | null;
};
type ClassInfo = { student_id: string; subject: string; teacher_id: string | null };
type Teacher = { id: string; full_name: string };
type ExamResult = {
  student_id: string; subject: string; exam_type: string;
  exam_year: number | null; exam_period: string | null;
  actual_score: number | null; exam_date: string | null;
};
type ArchiveRow = {
  school_name: string; grade_year: number | null; subject: string;
  exam_type: string | null; semester: string | null;
  exam_date_start: string | null; exam_date_end: string | null;
  exam_scope: string | null; status: string | null;
};
type ScheduleRow = {
  school_name: string; schedule_type: string; title: string;
  start_date: string | null; end_date: string | null;
  grade: string | null; subject: string | null;
};
type ReportRow = {
  school_name: string; grade: number | null; subject: string;
  exam_year: number | null; exam_period: string | null; is_published: boolean | null;
};

// 학교명 정규화 (useExamArchiveData와 동일 규칙 — 신길초등학교 ↔ 신길초)
function normalizeSchool(name: string | null): string {
  if (!name) return '';
  const compact = name.trim().replace(/\s+/g, '');
  for (const [suffix, rep] of [['초등학교', '초'], ['중학교', '중'], ['고등학교', '고']] as const) {
    if (compact.endsWith(suffix)) return compact.slice(0, -suffix.length) + rep;
  }
  return compact;
}

function periodLabel(year: number | null, period: string | null, examType: string) {
  if (!year && !period) return examType === 'performance' ? '수행' : examType;
  const sem = period?.startsWith('2') ? '2학기' : '1학기';
  const mf = period?.endsWith('a') ? '중간' : period?.endsWith('b') ? '기말' : '';
  const base = `${year ? String(year).slice(2) + '년 ' : ''}${sem} ${mf}`.trim();
  return examType === 'performance' ? `${base} 수행` : base;
}

function periodSortKey(year: number | null, period: string | null, examDate: string | null) {
  const m: Record<string, number> = { '1-a': 1, '1-b': 2, '2-a': 3, '2-b': 4 };
  const base = (year ?? 0) * 10 + (period ? m[period] ?? 0 : 0);
  // 같은 시기 내 정렬 안정화를 위해 시험일 보조 사용
  return base * 100000 + (examDate ? parseInt(examDate.replace(/-/g, '').slice(2), 10) % 100000 : 0);
}

// 과목별 라인 색 (내신 성적 추이 페이지와 동일 팔레트)
const SUBJECT_COLORS: Record<string, string> = {
  수학: 'hsl(217 91% 60%)',
  영어: 'hsl(142 71% 45%)',
  국어: 'hsl(271 76% 53%)',
  과학: 'hsl(25 95% 53%)',
  사회: 'hsl(0 84% 60%)',
};
const DEFAULT_LINE_COLOR = 'hsl(217 91% 60%)';

// ── 미니 스파크라인 (내신=선, 수행=점) ──────────────────────────
function ScoreSparkline({ line, perf, color }: { line: number[]; perf: number[]; color: string }) {
  const W = 110, H = 30, PAD = 3;
  const all = [...line, ...perf];
  if (all.length === 0) return <span className="text-xs text-muted-foreground">기록 없음</span>;
  const min = Math.min(...all, 60), max = Math.max(...all, 100);
  const y = (v: number) => H - PAD - ((v - min) / Math.max(max - min, 1)) * (H - PAD * 2);
  const x = (i: number, n: number) => (n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2));
  const pts = line.map((v, i) => `${x(i, line.length)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} className="shrink-0">
      {line.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />}
      {line.map((v, i) => (
        <circle key={`l${i}`} cx={x(i, line.length)} cy={y(v)} r="2.2" fill={color} />
      ))}
      {perf.map((v, i) => (
        <circle key={`p${i}`} cx={x(i, perf.length)} cy={y(v)} r="2.2" fill="hsl(38 92% 50%)" opacity="0.9" />
      ))}
    </svg>
  );
}

export function TeacherExamBoard() {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classInfos, setClassInfos] = useState<ClassInfo[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [enrolledStudentIds, setEnrolledStudentIds] = useState<Set<string>>(new Set());
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [detailStudent, setDetailStudent] = useState<StudentRow | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = getTodayKST();
      const [stuRes, ciRes, tRes, resRes, arcRes, schRes, repRes, courseRes] = await Promise.all([
        supabase.from('students')
          .select('id, name, grade, school, school_level, grade_year')
          .in('enrollment_status', ['재학', '재등원']).order('name'),
        supabase.from('class_students').select('student_id, classes(subject, teacher_id)'),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('student_exam_results')
          .select('student_id, subject, exam_type, exam_year, exam_period, actual_score, exam_date')
          .not('actual_score', 'is', null),
        supabase.from('school_exam_archives')
          .select('school_name, grade_year, subject, exam_type, semester, exam_date_start, exam_date_end, exam_scope, status'),
        supabase.from('school_schedules')
          .select('school_name, schedule_type, title, start_date, end_date, grade, subject')
          .in('schedule_type', ['exam', 'performance'])
          .gte('start_date', today),
        supabase.from('exam_analysis_reports')
          .select('school_name, grade, subject, exam_year, exam_period, is_published'),
        supabase.from('exam_prep_courses').select('id, subject').is('deleted_at', null),
      ]);

      setStudents((stuRes.data as StudentRow[]) || []);
      setClassInfos(((ciRes.data || []) as any[]).map(cs => ({
        student_id: cs.student_id,
        subject: cs.classes?.subject || '',
        teacher_id: cs.classes?.teacher_id || null,
      })));
      setTeachers((tRes.data as Teacher[]) || []);
      setResults((resRes.data as ExamResult[]) || []);
      setArchives(((arcRes.data || []) as any[]).map(a => ({ ...a, school_name: normalizeSchool(a.school_name) })));
      setSchedules(((schRes.data || []) as any[]).map(s => ({ ...s, school_name: normalizeSchool(s.school_name) })));
      setReports(((repRes.data || []) as any[]).map(r => ({ ...r, school_name: normalizeSchool(r.school_name) })));

      const courseIds = ((courseRes.data || []) as any[]).map(c => c.id);
      if (courseIds.length > 0) {
        const { data: enr } = await supabase.from('exam_prep_enrollments')
          .select('student_id, course_id').in('course_id', courseIds);
        setEnrolledStudentIds(new Set(((enr || []) as any[]).map(e => e.student_id)));
      }
      setLoading(false);
    })();
  }, []);

  const isTeacherRole = role === 'teacher';
  const effectiveTeacherId = isTeacherRole ? (user?.id ?? '') : teacherFilter;

  // 담당학생 스코핑: 학생 → 담당 과목 집합
  const scopedSubjectsByStudent = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const ci of classInfos) {
      if (effectiveTeacherId && ci.teacher_id !== effectiveTeacherId) continue;
      if (!ci.subject) continue;
      if (!m.has(ci.student_id)) m.set(ci.student_id, new Set());
      m.get(ci.student_id)!.add(ci.subject);
    }
    return m;
  }, [classInfos, effectiveTeacherId]);

  const mySubjects = useMemo(() => {
    const s = new Set<string>();
    scopedSubjectsByStudent.forEach(subj => subj.forEach(v => s.add(v)));
    return Array.from(s).sort();
  }, [scopedSubjectsByStudent]);

  const scopedStudents = useMemo(
    () => students.filter(s => {
      const subj = scopedSubjectsByStudent.get(s.id);
      if (!subj || subj.size === 0) return false;
      if (subjectFilter !== 'all' && !subj.has(subjectFilter)) return false;
      return true;
    }),
    [students, scopedSubjectsByStudent, subjectFilter]
  );

  const resultsByStudent = useMemo(() => {
    const m = new Map<string, ExamResult[]>();
    for (const r of results) {
      if (!m.has(r.student_id)) m.set(r.student_id, []);
      m.get(r.student_id)!.push(r);
    }
    m.forEach(arr => arr.sort((a, b) =>
      periodSortKey(a.exam_year, a.exam_period, a.exam_date) - periodSortKey(b.exam_year, b.exam_period, b.exam_date)));
    return m;
  }, [results]);

  const today = useMemo(() => parseISO(getTodayKST()), []);

  // 학교별 그룹 + 다가오는 시험/수행 정보
  const schoolGroups = useMemo(() => {
    const groups = new Map<string, StudentRow[]>();
    for (const s of scopedStudents) {
      const key = normalizeSchool(s.school) || '학교 미지정';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const list = Array.from(groups.entries()).map(([school, studs]) => {
      const examScheds = schedules
        .filter(s => s.school_name === school && s.schedule_type === 'exam' && s.start_date)
        .map(s => ({ title: s.title, date: s.start_date!, dday: differenceInDays(parseISO(s.start_date!), today) }))
        .filter(e => e.dday >= 0)
        .sort((a, b) => a.dday - b.dday);
      const archiveExams = archives
        .filter(a => a.school_name === school && a.exam_date_start && a.exam_date_start >= getTodayKST())
        .map(a => ({
          title: `${a.semester || ''} ${a.exam_type || '시험'}`.trim(),
          date: a.exam_date_start!,
          dday: differenceInDays(parseISO(a.exam_date_start!), today),
        }))
        .sort((a, b) => a.dday - b.dday);
      const nextExam = examScheds[0] || archiveExams[0] || null;
      const perfs = schedules
        .filter(s => s.school_name === school && s.schedule_type === 'performance' && s.start_date)
        .map(s => ({ title: s.title, subject: s.subject, date: s.start_date!, dday: differenceInDays(parseISO(s.start_date!), today) }))
        .filter(p => p.dday >= 0 && p.dday <= 45)
        .sort((a, b) => a.dday - b.dday);
      studs.sort((a, b) => (a.grade_year ?? 9) - (b.grade_year ?? 9) || a.name.localeCompare(b.name, 'ko'));
      return { school, students: studs, nextExam, perfs };
    });
    // 시험 임박한 학교부터
    list.sort((a, b) => (a.nextExam?.dday ?? 9999) - (b.nextExam?.dday ?? 9999) || a.school.localeCompare(b.school, 'ko'));
    return list;
  }, [scopedStudents, schedules, archives, today]);

  // 학생별 "이번 시험 범위" (담당 과목 + 학년 매칭, 가장 가까운 미래 시험 우선)
  function scopeFor(student: StudentRow): { subject: string; scope: string }[] {
    const school = normalizeSchool(student.school);
    const subj = scopedSubjectsByStudent.get(student.id);
    if (!school || !subj) return [];
    const out: { subject: string; scope: string }[] = [];
    for (const sub of subj) {
      if (subjectFilter !== 'all' && sub !== subjectFilter) continue;
      const rows = archives
        .filter(a => a.school_name === school && a.subject?.startsWith(sub)
          && (a.grade_year == null || a.grade_year === student.grade_year) && a.exam_scope)
        .sort((a, b) => (a.exam_date_start || '9999').localeCompare(b.exam_date_start || '9999'));
      const upcoming = rows.find(r => (r.exam_date_start || '') >= getTodayKST()) || rows[rows.length - 1];
      if (upcoming?.exam_scope) out.push({ subject: sub, scope: upcoming.exam_scope });
    }
    return out;
  }

  function reportBadge(student: StudentRow) {
    const school = normalizeSchool(student.school);
    const subj = scopedSubjectsByStudent.get(student.id);
    if (!school || !subj) return null;
    const matched = reports.filter(r => r.school_name === school
      && (r.grade == null || r.grade === student.grade_year)
      && Array.from(subj).some(s => r.subject?.startsWith(s)));
    if (matched.length === 0) return null;
    const published = matched.some(r => r.is_published);
    return published ? { label: '분석지', variant: 'default' as const } : { label: '분석지 초안', variant: 'secondary' as const };
  }

  // 과목별 성적 추이 (과목당 그래프 1개)
  function sparkDataBySubject(student: StudentRow) {
    const subj = scopedSubjectsByStudent.get(student.id) || new Set<string>();
    const targets = subjectFilter !== 'all'
      ? [subjectFilter]
      : Array.from(subj).sort();
    const all = resultsByStudent.get(student.id) || [];
    return targets.map(subject => {
      const rows = all.filter(r => r.subject === subject);
      const line = rows.filter(r => r.exam_type === 'midterm' || r.exam_type === 'final').map(r => Number(r.actual_score));
      const perf = rows.filter(r => r.exam_type === 'performance').map(r => Number(r.actual_score));
      const last = line[line.length - 1] ?? null;
      const prev = line[line.length - 2] ?? null;
      const delta = last != null && prev != null ? last - prev : null;
      return { subject, line: line.slice(-6), perf: perf.slice(-6), last, delta };
    }).filter(d => d.line.length > 0 || d.perf.length > 0);
  }

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-9 w-64" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-44 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 + 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" /> 내신 보드
        </h1>
        <span className="text-sm text-muted-foreground">
          {isTeacherRole ? '내 담당 학생 기준' : '선생님별 담당 학생 기준'} · {scopedStudents.length}명
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!isTeacherRole && (
            <Select value={teacherFilter || 'all'} onValueChange={v => setTeacherFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="선생님 전체" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">선생님 전체</SelectItem>
                {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전 과목</SelectItem>
              {mySubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {scopedStudents.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          담당 학생이 없습니다. 반 관리에서 담당 반·학생이 등록되어 있는지 확인해주세요.
        </CardContent></Card>
      )}

      {/* 학교별 카드 */}
      {schoolGroups.map(g => (
        <Card key={g.school}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <SchoolIcon className="w-4 h-4 text-muted-foreground" />
              {g.school}
              <span className="text-xs font-normal text-muted-foreground">{g.students.length}명</span>
              {g.nextExam ? (
                <Badge variant={g.nextExam.dday <= 7 ? 'destructive' : g.nextExam.dday <= 21 ? 'default' : 'secondary'} className="gap-1">
                  <CalendarClock className="w-3 h-3" />
                  {g.nextExam.title} D-{g.nextExam.dday === 0 ? 'Day' : g.nextExam.dday}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">예정 시험 미등록</Badge>
              )}
              {g.perfs.map((p, i) => (
                <Badge key={i} variant="outline" className="gap-1 border-amber-400 text-amber-700">
                  <AlertTriangle className="w-3 h-3" />
                  수행 {p.subject ? `(${p.subject}) ` : ''}D-{p.dday === 0 ? 'Day' : p.dday}
                </Badge>
              ))}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">학생</TableHead>
                  <TableHead className="w-64">성적 추이 (과목별)</TableHead>
                  <TableHead>이번 시험 범위</TableHead>
                  <TableHead className="w-28 text-right">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.students.map(s => {
                  const sparks = sparkDataBySubject(s);
                  const scopes = scopeFor(s);
                  const rep = reportBadge(s);
                  return (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setDetailStudent(s)}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {s.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {s.grade || (s.grade_year ? `${s.school_level || ''}${s.grade_year}` : '')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {sparks.length === 0 ? (
                          <span className="text-xs text-muted-foreground">기록 없음</span>
                        ) : (
                          <div className="space-y-0.5">
                            {sparks.map(sp => (
                              <div key={sp.subject} className="flex items-center gap-2">
                                <span
                                  className="text-xs font-medium w-8 shrink-0"
                                  style={{ color: SUBJECT_COLORS[sp.subject] || DEFAULT_LINE_COLOR }}
                                >
                                  {sp.subject}
                                </span>
                                <ScoreSparkline
                                  line={sp.line}
                                  perf={sp.perf}
                                  color={SUBJECT_COLORS[sp.subject] || DEFAULT_LINE_COLOR}
                                />
                                {sp.last != null ? (
                                  <span className="flex items-center gap-1 text-sm whitespace-nowrap">
                                    {sp.last}점
                                    {sp.delta != null && (sp.delta > 0
                                      ? <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                                      : sp.delta < 0
                                        ? <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                                        : <Minus className="w-3.5 h-3.5 text-muted-foreground" />)}
                                    {sp.delta != null && sp.delta !== 0 && (
                                      <span className={`text-xs ${sp.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {sp.delta > 0 ? '+' : ''}{sp.delta}
                                      </span>
                                    )}
                                  </span>
                                ) : <span className="text-xs text-muted-foreground">수행만</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        {scopes.length > 0 ? scopes.map((sc, i) => (
                          <div key={i} className="text-xs truncate" title={`${sc.subject}: ${sc.scope}`}>
                            <span className="font-medium">{sc.subject}</span> {sc.scope}
                          </div>
                        )) : <span className="text-xs text-muted-foreground">범위 미등록</span>}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap space-x-1">
                        {enrolledStudentIds.has(s.id) && (
                          <Badge variant="secondary" className="gap-1"><GraduationCap className="w-3 h-3" />특강</Badge>
                        )}
                        {rep && <Badge variant={rep.variant}>{rep.label}</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* 하단 바로가기 */}
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/exam-archive?tab=analysis"><FileBarChart2 className="w-4 h-4 mr-1" />분석보고서 바로가기</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/exam-archive?tab=prep"><GraduationCap className="w-4 h-4 mr-1" />내신특강 관리</Link>
        </Button>
      </div>

      {/* 학생 상세: 전체 성적 이력 */}
      <Dialog open={!!detailStudent} onOpenChange={o => !o && setDetailStudent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailStudent?.name} — 성적 이력</DialogTitle>
          </DialogHeader>
          {detailStudent && (
            <div className="max-h-[60vh] overflow-y-auto">
              {(resultsByStudent.get(detailStudent.id) || []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">등록된 성적이 없습니다.</p>
              ) : (
                Array.from(
                  (resultsByStudent.get(detailStudent.id) || []).reduce((m, r) => {
                    if (!m.has(r.subject)) m.set(r.subject, []);
                    m.get(r.subject)!.push(r);
                    return m;
                  }, new Map<string, ExamResult[]>())
                ).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([subject, rows]) => (
                  <div key={subject} className="mb-4">
                    <h4
                      className="text-sm font-semibold mb-1"
                      style={{ color: SUBJECT_COLORS[subject] || DEFAULT_LINE_COLOR }}
                    >
                      {subject}
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>시기</TableHead>
                          <TableHead>유형</TableHead>
                          <TableHead className="text-right">점수</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice().reverse().map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{periodLabel(r.exam_year, r.exam_period, r.exam_type)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.exam_type === 'midterm' ? '중간' : r.exam_type === 'final' ? '기말' : r.exam_type === 'performance' ? '수행' : '기타'}
                            </TableCell>
                            <TableCell className="text-right font-medium">{r.actual_score}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
