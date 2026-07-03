// EXAM-BOARD-V2: 강사용 내신 보드 — 학생 카드형
// 카드 3요소: ①성적 추세·하락 경보 ②시험 준비 체크(범위·분석지·특강) ③시험 후 팔로업(성적 입력→리뷰)
// 담당학생 스코핑(class_students→classes.teacher_id) 기본 내장.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils';
import { differenceInDays, parseISO, subDays, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CalendarClock, ClipboardCheck, FileBarChart2, GraduationCap, School as SchoolIcon,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, CircleDashed,
  LayoutGrid, Table2, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';

type StudentRow = {
  id: string; name: string; grade: string | null; school: string | null;
  school_level: string | null; grade_year: number | null;
};
type ClassInfo = { student_id: string; subject: string; teacher_id: string | null };
type Teacher = { id: string; full_name: string };
type ExamResult = {
  id: string; student_id: string; subject: string; exam_type: string;
  exam_year: number | null; exam_period: string | null;
  actual_score: number | null; exam_date: string | null; submitted_at: string | null;
};
type ReviewRow = { result_id: string; reviewed_at: string | null; is_published: boolean };
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

const FOLLOWUP_WINDOW_DAYS = 30; // 시험 종료 후 팔로업을 추적하는 기간

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
  const W = 88, H = 26, PAD = 3;
  const all = [...line, ...perf];
  if (all.length === 0) return null;
  const min = Math.min(...all, 60), max = Math.max(...all, 100);
  const y = (v: number) => H - PAD - ((v - min) / Math.max(max - min, 1)) * (H - PAD * 2);
  const x = (i: number, n: number) => (n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2));
  const pts = line.map((v, i) => `${x(i, line.length)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} className="shrink-0">
      {line.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />}
      {line.map((v, i) => (
        <circle key={`l${i}`} cx={x(i, line.length)} cy={y(v)} r="2" fill={color} />
      ))}
      {perf.map((v, i) => (
        <circle key={`p${i}`} cx={x(i, perf.length)} cy={y(v)} r="2" fill="hsl(38 92% 50%)" opacity="0.9" />
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
  const [reviews, setReviews] = useState<Map<string, ReviewRow>>(new Map());
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [enrolledStudentIds, setEnrolledStudentIds] = useState<Set<string>>(new Set());
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [detailStudent, setDetailStudent] = useState<StudentRow | null>(null);
  // VIEW-MODE-V1: 카드 ↔ 표 보기 전환 (localStorage에 기억)
  const [viewMode, setViewMode] = useState<'card' | 'table'>(
    () => (localStorage.getItem('examBoard.viewMode') === 'table' ? 'table' : 'card')
  );
  const [tableSort, setTableSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'dday', dir: 1 });

  function switchView(mode: 'card' | 'table') {
    setViewMode(mode);
    localStorage.setItem('examBoard.viewMode', mode);
  }

  function toggleSort(key: string) {
    setTableSort(prev => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = getTodayKST();
      const windowStart = format(subDays(parseISO(today), FOLLOWUP_WINDOW_DAYS), 'yyyy-MM-dd');
      const [stuRes, ciRes, tRes, resRes, arcRes, schRes, repRes, courseRes] = await Promise.all([
        supabase.from('students')
          .select('id, name, grade, school, school_level, grade_year')
          .in('enrollment_status', ['재학', '재등원']).order('name'),
        supabase.from('class_students').select('student_id, classes(subject, teacher_id)'),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('student_exam_results')
          .select('id, student_id, subject, exam_type, exam_year, exam_period, actual_score, exam_date, submitted_at'),
        supabase.from('school_exam_archives')
          .select('school_name, grade_year, subject, exam_type, semester, exam_date_start, exam_date_end, exam_scope, status'),
        supabase.from('school_schedules')
          .select('school_name, schedule_type, title, start_date, end_date, grade, subject')
          .in('schedule_type', ['exam', 'performance'])
          .gte('start_date', windowStart), // 지난 30일 시험(팔로업용) + 미래 일정
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
      const resultRows = (resRes.data as ExamResult[]) || [];
      setResults(resultRows);
      setArchives(((arcRes.data || []) as any[]).map(a => ({ ...a, school_name: normalizeSchool(a.school_name) })));
      setSchedules(((schRes.data || []) as any[]).map(s => ({ ...s, school_name: normalizeSchool(s.school_name) })));
      setReports(((repRes.data || []) as any[]).map(r => ({ ...r, school_name: normalizeSchool(r.school_name) })));

      // 최근 결과에 대한 채점/리뷰 상태 (팔로업용)
      const recentIds = resultRows
        .filter(r => (r.submitted_at || '').slice(0, 10) >= windowStart || (r.exam_date || '') >= windowStart)
        .map(r => r.id);
      if (recentIds.length > 0) {
        const { data: rev } = await supabase.from('exam_reviews')
          .select('result_id, reviewed_at, is_published').in('result_id', recentIds);
        const m = new Map<string, ReviewRow>();
        ((rev || []) as ReviewRow[]).forEach(r => m.set(r.result_id, r));
        setReviews(m);
      }

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

  // 학생×과목 → 담당 선생님 이름 (표 모드 '담당' 열, 선생님별 정렬용)
  const teacherNameByStudentSubject = useMemo(() => {
    const nameById = new Map(teachers.map(t => [t.id, t.full_name]));
    const m = new Map<string, string>();
    for (const ci of classInfos) {
      if (!ci.subject || !ci.teacher_id) continue;
      const key = `${ci.student_id}|${ci.subject}`;
      const name = nameById.get(ci.teacher_id);
      if (!name) continue;
      const prev = m.get(key);
      m.set(key, prev && !prev.includes(name) ? `${prev}, ${name}` : name);
    }
    return m;
  }, [classInfos, teachers]);

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
  const todayStr = getTodayKST();

  // ── 학교별 그룹: 다가오는/최근 지난 시험 + 수행 ──
  const schoolGroups = useMemo(() => {
    const groups = new Map<string, StudentRow[]>();
    for (const s of scopedStudents) {
      const key = normalizeSchool(s.school) || '학교 미지정';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const list = Array.from(groups.entries()).map(([school, studs]) => {
      const examEntries = [
        ...schedules
          .filter(s => s.school_name === school && s.schedule_type === 'exam' && s.start_date)
          .map(s => ({ title: s.title, date: s.start_date!, dday: differenceInDays(parseISO(s.start_date!), today) })),
        ...archives
          .filter(a => a.school_name === school && a.exam_date_start)
          .map(a => ({
            title: `${a.semester || ''} ${a.exam_type || '시험'}`.trim(),
            date: a.exam_date_start!,
            dday: differenceInDays(parseISO(a.exam_date_start!), today),
          })),
      ];
      const upcoming = examEntries.filter(e => e.dday >= 0).sort((a, b) => a.dday - b.dday)[0] || null;
      const recentPast = examEntries
        .filter(e => e.dday < 0 && e.dday >= -FOLLOWUP_WINDOW_DAYS)
        .sort((a, b) => b.dday - a.dday)[0] || null;
      const perfs = schedules
        .filter(s => s.school_name === school && s.schedule_type === 'performance' && s.start_date)
        .map(s => ({ title: s.title, subject: s.subject, dday: differenceInDays(parseISO(s.start_date!), today) }))
        .filter(p => p.dday >= 0 && p.dday <= 45)
        .sort((a, b) => a.dday - b.dday);
      return { school, students: studs, upcoming, recentPast, perfs };
    });
    list.sort((a, b) => (a.upcoming?.dday ?? 9999) - (b.upcoming?.dday ?? 9999) || a.school.localeCompare(b.school, 'ko'));
    return list;
  }, [scopedStudents, schedules, archives, today]);

  // ── 학생 카드 데이터 ──
  function cardData(student: StudentRow, group: { upcoming: any; recentPast: any }) {
    const school = normalizeSchool(student.school);
    const subjSet = scopedSubjectsByStudent.get(student.id) || new Set<string>();
    const targets = subjectFilter !== 'all' ? [subjectFilter] : Array.from(subjSet).sort();
    const all = resultsByStudent.get(student.id) || [];

    // 과목별 추세 + 하락 경보
    const subjects = targets.map(subject => {
      const rows = all.filter(r => r.subject === subject);
      const lineRows = rows.filter(r => r.exam_type === 'midterm' || r.exam_type === 'final');
      const line = lineRows.map(r => Number(r.actual_score));
      const perf = rows.filter(r => r.exam_type === 'performance').map(r => Number(r.actual_score));
      const last = line[line.length - 1] ?? null;
      const delta = line.length >= 2 ? line[line.length - 1] - line[line.length - 2] : null;
      const delta2 = line.length >= 3 ? line[line.length - 2] - line[line.length - 3] : null;
      const doubleDrop = delta != null && delta < 0 && delta2 != null && delta2 < 0;
      // 이번 시험 범위
      const scopeRows = archives
        .filter(a => a.school_name === school && a.subject?.startsWith(subject)
          && (a.grade_year == null || a.grade_year === student.grade_year) && a.exam_scope)
        .sort((a, b) => (a.exam_date_start || '9999').localeCompare(b.exam_date_start || '9999'));
      const scopeRow = scopeRows.find(r => (r.exam_date_start || '') >= todayStr) || scopeRows[scopeRows.length - 1];
      return {
        subject, line: line.slice(-6), perf: perf.slice(-6), last, delta, doubleDrop,
        scope: scopeRow?.exam_scope || null,
      };
    });

    const anyDrop = subjects.some(s => s.delta != null && s.delta < 0);
    const anyDoubleDrop = subjects.some(s => s.doubleDrop);

    // 준비 체크 (다가오는 시험이 있을 때)
    let prep: { scopeOk: boolean; reportOk: boolean; prepEnrolled: boolean } | null = null;
    if (group.upcoming) {
      const scopeOk = subjects.some(s => !!s.scope);
      const reportOk = reports.some(r => r.school_name === school
        && (r.grade == null || r.grade === student.grade_year)
        && targets.some(t => r.subject?.startsWith(t)));
      prep = { scopeOk, reportOk, prepEnrolled: enrolledStudentIds.has(student.id) };
    }

    // 시험 후 팔로업 (최근 지난 시험이 있을 때): 성적 입력 → 리뷰 → 공개
    let followup: { hasResult: boolean; reviewed: boolean; published: boolean } | null = null;
    if (group.recentPast) {
      const recent = all.filter(r =>
        targets.includes(r.subject)
        && ((r.exam_date || '') >= group.recentPast.date
          || (r.submitted_at || '').slice(0, 10) >= group.recentPast.date));
      const hasResult = recent.length > 0;
      const revs = recent.map(r => reviews.get(r.id)).filter(Boolean) as ReviewRow[];
      followup = {
        hasResult,
        reviewed: revs.some(r => r.reviewed_at),
        published: revs.some(r => r.is_published),
      };
    }

    return { subjects, anyDrop, anyDoubleDrop, prep, followup };
  }

  // ── 표(엑셀) 모드: 학생×과목 평면 행 ──
  type FlatRow = {
    student: StudentRow; school: string; dday: number | null; examTitle: string | null;
    subject: string; teacher: string; last: number | null; delta: number | null;
    line: number[]; perf: number[]; scope: string | null;
    prep: ReturnType<typeof cardData>['prep']; followup: ReturnType<typeof cardData>['followup'];
    doubleDrop: boolean;
  };
  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    for (const g of schoolGroups) {
      for (const s of g.students) {
        const d = cardData(s, g);
        for (const sub of d.subjects) {
          rows.push({
            student: s,
            school: g.school,
            dday: g.upcoming?.dday ?? null,
            examTitle: g.upcoming?.title ?? (g.recentPast ? `${g.recentPast.title} 종료` : null),
            subject: sub.subject,
            teacher: teacherNameByStudentSubject.get(`${s.id}|${sub.subject}`) || '—',
            last: sub.last, delta: sub.delta,
            line: sub.line, perf: sub.perf, scope: sub.scope,
            prep: d.prep, followup: d.followup, doubleDrop: sub.doubleDrop,
          });
        }
      }
    }
    const dir = tableSort.dir;
    const key = tableSort.key;
    rows.sort((a, b) => {
      const v = (r: FlatRow): string | number => {
        switch (key) {
          case 'name': return r.student.name;
          case 'school': return r.school;
          case 'dday': return r.dday ?? 9999;
          case 'subject': return r.subject;
          case 'teacher': return r.teacher;
          case 'last': return r.last ?? -1;
          case 'delta': return r.delta ?? 999;
          default: return 0;
        }
      };
      const av = v(a), bv = v(b);
      const cmp = typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv, 'ko')
        : Number(av) - Number(bv);
      return cmp * dir || a.student.name.localeCompare(b.student.name, 'ko');
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolGroups, teacherNameByStudentSubject, tableSort, reports, enrolledStudentIds, reviews]);

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 헤더 + 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" /> 내신 보드
        </h1>
        <span className="text-sm text-muted-foreground">
          {isTeacherRole ? '내 담당 학생' : '담당 학생 기준'} · {scopedStudents.length}명
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
          {/* 보기 전환: 카드 ↔ 표 */}
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={viewMode === 'card' ? 'default' : 'ghost'} size="sm"
              className="h-8 rounded-none px-2.5" onClick={() => switchView('card')}
            >
              <LayoutGrid className="w-4 h-4 mr-1" />카드
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'} size="sm"
              className="h-8 rounded-none px-2.5" onClick={() => switchView('table')}
            >
              <Table2 className="w-4 h-4 mr-1" />표
            </Button>
          </div>
        </div>
      </div>

      {scopedStudents.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          담당 학생이 없습니다. 반 관리에서 담당 반·학생이 등록되어 있는지 확인해주세요.
        </CardContent></Card>
      )}

      {/* 학교 섹션 → 학생 카드 그리드 */}
      {viewMode === 'card' && schoolGroups.map(g => (
        <section key={g.school}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <SchoolIcon className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">{g.school}</h2>
            <span className="text-xs text-muted-foreground">{g.students.length}명</span>
            {g.upcoming ? (
              <Badge variant={g.upcoming.dday <= 7 ? 'destructive' : g.upcoming.dday <= 21 ? 'default' : 'secondary'} className="gap-1">
                <CalendarClock className="w-3 h-3" />
                {g.upcoming.title} D-{g.upcoming.dday === 0 ? 'Day' : g.upcoming.dday}
              </Badge>
            ) : g.recentPast ? (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                {g.recentPast.title} 종료 ({-g.recentPast.dday}일 전) — 팔로업
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
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {g.students
              .map(s => ({ s, d: cardData(s, g) }))
              .sort((a, b) =>
                Number(b.d.anyDoubleDrop) - Number(a.d.anyDoubleDrop)
                || Number(b.d.anyDrop) - Number(a.d.anyDrop)
                || a.s.name.localeCompare(b.s.name, 'ko'))
              .map(({ s, d }) => (
                <Card
                  key={s.id}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${
                    d.anyDoubleDrop ? 'border-red-300' : d.anyDrop ? 'border-amber-300' : ''
                  }`}
                  onClick={() => setDetailStudent(s)}
                >
                  <CardContent className="p-4 space-y-2.5">
                    {/* 이름 + 경보 */}
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.grade || (s.grade_year ? `${s.school_level || ''}${s.grade_year}` : '')}
                      </span>
                      {d.anyDoubleDrop && (
                        <Badge variant="destructive" className="ml-auto gap-1 text-[11px]">
                          <TrendingDown className="w-3 h-3" />연속 하락
                        </Badge>
                      )}
                      {!d.anyDoubleDrop && d.anyDrop && (
                        <Badge variant="outline" className="ml-auto gap-1 text-[11px] border-amber-400 text-amber-700">
                          <TrendingDown className="w-3 h-3" />하락
                        </Badge>
                      )}
                    </div>

                    {/* 과목별 점수 + 추세 */}
                    <div className="space-y-1.5">
                      {d.subjects.filter(sub => sub.last != null || sub.perf.length > 0).map(sub => (
                        <div key={sub.subject} className="flex items-center gap-2">
                          <span className="text-xs font-medium w-7 shrink-0" style={{ color: SUBJECT_COLORS[sub.subject] || DEFAULT_LINE_COLOR }}>
                            {sub.subject}
                          </span>
                          <span className="text-lg font-bold leading-none w-12 text-right">
                            {sub.last != null ? sub.last : <span className="text-xs font-normal text-muted-foreground">수행만</span>}
                          </span>
                          {sub.delta != null ? (
                            <span className={`flex items-center text-xs w-10 ${sub.delta > 0 ? 'text-green-600' : sub.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {sub.delta > 0 ? <TrendingUp className="w-3 h-3" /> : sub.delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                              {sub.delta !== 0 && (sub.delta > 0 ? `+${sub.delta}` : sub.delta)}
                            </span>
                          ) : <span className="w-10" />}
                          <ScoreSparkline line={sub.line} perf={sub.perf} color={SUBJECT_COLORS[sub.subject] || DEFAULT_LINE_COLOR} />
                        </div>
                      ))}
                      {d.subjects.every(sub => sub.last == null && sub.perf.length === 0) && (
                        <p className="text-xs text-muted-foreground">등록된 성적 없음</p>
                      )}
                    </div>

                    {/* 준비 체크 (시험 전) / 팔로업 (시험 후) */}
                    {d.prep && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t">
                        <PrepBadge ok={d.prep.scopeOk} label="시험범위" />
                        <PrepBadge ok={d.prep.reportOk} label="분석지" />
                        <PrepBadge ok={d.prep.prepEnrolled} label="특강" />
                      </div>
                    )}
                    {!d.prep && d.followup && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t">
                        <PrepBadge ok={d.followup.hasResult} label="성적 입력" failLabel="성적 미입력" />
                        <PrepBadge ok={d.followup.reviewed} label="시험지 리뷰" failLabel="리뷰 대기" />
                        <PrepBadge ok={d.followup.published} label="리뷰 공개" failLabel="공개 전" />
                      </div>
                    )}

                    {/* 시험 범위 (한 줄) */}
                    {d.prep && d.subjects.some(sub => sub.scope) && (
                      <p className="text-[11px] text-muted-foreground truncate"
                        title={d.subjects.filter(sub => sub.scope).map(sub => `${sub.subject}: ${sub.scope}`).join(' / ')}>
                        {d.subjects.filter(sub => sub.scope).map(sub => `${sub.subject} ${sub.scope}`).join(' · ')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      ))}

      {/* 표(엑셀) 모드 — 학생×과목 1행, 열 머리글 클릭으로 정렬 */}
      {viewMode === 'table' && scopedStudents.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="학생" k="name" sort={tableSort} onSort={toggleSort} />
                  <SortableHead label="학교" k="school" sort={tableSort} onSort={toggleSort} />
                  <SortableHead label="시험" k="dday" sort={tableSort} onSort={toggleSort} />
                  <SortableHead label="과목" k="subject" sort={tableSort} onSort={toggleSort} />
                  <SortableHead label="담당" k="teacher" sort={tableSort} onSort={toggleSort} />
                  <SortableHead label="최근" k="last" sort={tableSort} onSort={toggleSort} className="text-right" />
                  <SortableHead label="등락" k="delta" sort={tableSort} onSort={toggleSort} className="text-right" />
                  <TableHead>추세</TableHead>
                  <TableHead>체크</TableHead>
                  <TableHead>시험 범위</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatRows.map((r, i) => (
                  <TableRow
                    key={`${r.student.id}-${r.subject}-${i}`}
                    className="cursor-pointer"
                    onClick={() => setDetailStudent(r.student)}
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {r.student.name}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {r.student.grade || (r.student.grade_year ? `${r.student.school_level || ''}${r.student.grade_year}` : '')}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.school}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.dday != null ? (
                        <Badge variant={r.dday <= 7 ? 'destructive' : 'secondary'} className="text-[11px]">
                          D-{r.dday === 0 ? 'Day' : r.dday}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{r.examTitle || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium"
                      style={{ color: SUBJECT_COLORS[r.subject] || DEFAULT_LINE_COLOR }}>
                      {r.subject}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.teacher}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.last != null ? r.last : <span className="text-xs font-normal text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.delta != null ? (
                        <span className={`inline-flex items-center gap-0.5 text-xs ${r.delta > 0 ? 'text-green-600' : r.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {r.delta > 0 ? <TrendingUp className="w-3 h-3" /> : r.delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {r.delta !== 0 && (r.delta > 0 ? `+${r.delta}` : r.delta)}
                          {r.doubleDrop && <AlertTriangle className="w-3 h-3 text-red-500" />}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <ScoreSparkline line={r.line} perf={r.perf} color={SUBJECT_COLORS[r.subject] || DEFAULT_LINE_COLOR} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap space-x-1">
                      {r.prep && (
                        <>
                          <PrepBadge ok={r.prep.scopeOk} label="범위" />
                          <PrepBadge ok={r.prep.reportOk} label="분석지" />
                          <PrepBadge ok={r.prep.prepEnrolled} label="특강" />
                        </>
                      )}
                      {!r.prep && r.followup && (
                        <>
                          <PrepBadge ok={r.followup.hasResult} label="성적" failLabel="성적 미입력" />
                          <PrepBadge ok={r.followup.reviewed} label="리뷰" failLabel="리뷰 대기" />
                        </>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-xs text-muted-foreground truncate block" title={r.scope || ''}>
                        {r.scope || '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 하단 바로가기 */}
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/exam-archive?tab=analysis"><FileBarChart2 className="w-4 h-4 mr-1" />분석보고서</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/exam-archive?tab=prep"><GraduationCap className="w-4 h-4 mr-1" />내신특강 관리</Link>
        </Button>
      </div>

      {/* 학생 상세: 과목별 성적 이력 */}
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
                    <h4 className="text-sm font-semibold mb-1" style={{ color: SUBJECT_COLORS[subject] || DEFAULT_LINE_COLOR }}>
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

// 정렬 가능한 표 머리글
function SortableHead({ label, k, sort, onSort, className }: {
  label: string; k: string;
  sort: { key: string; dir: 1 | -1 };
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap hover:text-foreground ${className || ''}`}
      onClick={() => onSort(k)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active
          ? (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </span>
    </TableHead>
  );
}

// 준비/팔로업 체크 배지
function PrepBadge({ ok, label, failLabel }: { ok: boolean; label: string; failLabel?: string }) {
  return ok ? (
    <Badge variant="secondary" className="gap-1 text-[11px] text-green-700">
      <CheckCircle2 className="w-3 h-3" />{label}
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
      <CircleDashed className="w-3 h-3" />{failLabel || `${label} 없음`}
    </Badge>
  );
}
