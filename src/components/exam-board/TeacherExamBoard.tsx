// EXAM-BOARD-V3: 내신 사이클 브리핑 — "화면을 보러 가는 게 아니라 할 일이 도착한다"
// ① 시험 일정(아카이브+학교일정+학원캘린더 3원 병합)이 종료를 감지 → 성적 입력 할 일 카드 자동 생성
// ② 입력은 시험 단위 시트(연도·학기 자동, Enter로 다음 학생) — ScoreEntrySheet
// ③ 기존 카드/표 보기는 상세 화면으로 유지. 담당학생 스코핑 기본 내장.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils';
import { differenceInDays, parseISO, subDays, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CalendarClock, ClipboardCheck, FileBarChart2, GraduationCap, School as SchoolIcon,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, CircleDashed,
  LayoutGrid, Table2, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Save, Inbox,
} from 'lucide-react';
import {
  CycleExam, SUBJECT_COLORS, DEFAULT_LINE_COLOR,
  normalizeSchool, detectCycleExams, periodSortKey, examResultLabel, examTitleLabel,
} from './cycleUtils';
import { ScoreEntrySheet, EntryRow } from './ScoreEntrySheet';

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
type EventRow = { title: string | null; start_at: string | null; end_at: string | null };

const COLLECT_WINDOW_DAYS = 14;  // 시험 종료 후 성적 수집 할 일을 띄우는 기간
const FOLLOWUP_WINDOW_DAYS = 30; // 팔로업 배지 추적 기간
const PREP_WINDOW_DAYS = 21;     // 시험 전 준비 카드 기간

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
  const [events, setEvents] = useState<EventRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  // 특강 등록 — 학생별 등록된 특강의 (학교, 과목) 목록. 배지는 이번 시험 학교·과목이 맞을 때만.
  const [prepEnrollMap, setPrepEnrollMap] = useState<Map<string, { school: string | null; subject: string | null }[]>>(new Map());
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [detailStudent, setDetailStudent] = useState<StudentRow | null>(null);
  const [sheetExam, setSheetExam] = useState<CycleExam | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'table'>(
    () => (localStorage.getItem('examBoard.viewMode') === 'table' ? 'table' : 'card')
  );
  const [tableSort, setTableSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'dday', dir: 1 });

  const nowKST = getTodayKST();
  const currentYear = Number(nowKST.slice(0, 4));
  const nowMonth = Number(nowKST.slice(5, 7));

  // EDIT-MODE-V1: 자유 입력(시험 시트 밖 보조 수단)
  const [editMode, setEditMode] = useState(false);
  const [entryYear, setEntryYear] = useState<number>(currentYear);
  const [entrySemester, setEntrySemester] = useState<'1' | '2'>(nowMonth >= 8 || nowMonth <= 1 ? '2' : '1');
  const [entryType, setEntryType] = useState<'midterm' | 'final' | 'performance'>(
    [3, 4, 9, 10].includes(nowMonth) ? 'midterm' : 'final'
  );
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const entryPeriod = `${entrySemester}-${entryType === 'midterm' ? 'a' : 'b'}`;

  function switchView(mode: 'card' | 'table') {
    setViewMode(mode);
    localStorage.setItem('examBoard.viewMode', mode);
  }
  function toggleSort(key: string) {
    setTableSort(prev => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }
  function draftKey(studentId: string, subject: string) {
    return `${studentId}|${subject}`;
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const windowStart = format(subDays(parseISO(nowKST), FOLLOWUP_WINDOW_DAYS), 'yyyy-MM-dd');
      const [stuRes, ciRes, tRes, resRes, arcRes, schRes, evtRes, repRes, courseRes] = await Promise.all([
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
          .gte('start_date', windowStart),
        supabase.from('academy_events')
          .select('title, start_at, end_at')
          .eq('category', 'exam')
          .gte('start_at', `${windowStart}T00:00:00`),
        supabase.from('exam_analysis_reports')
          .select('school_name, grade, subject, exam_year, exam_period, is_published'),
        supabase.from('exam_prep_courses').select('id, subject, school_name').is('deleted_at', null),
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
      setEvents((evtRes.data as EventRow[]) || []);
      setReports(((repRes.data || []) as any[]).map(r => ({ ...r, school_name: normalizeSchool(r.school_name) })));

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

      const courses = (courseRes.data || []) as any[];
      if (courses.length > 0) {
        const courseById = new Map(courses.map(c => [c.id, c]));
        const { data: enr } = await supabase.from('exam_prep_enrollments')
          .select('student_id, course_id').in('course_id', courses.map(c => c.id));
        const m = new Map<string, { school: string | null; subject: string | null }[]>();
        ((enr || []) as any[]).forEach(e => {
          const c = courseById.get(e.course_id);
          if (!c) return;
          (m.get(e.student_id) || m.set(e.student_id, []).get(e.student_id))!.push({
            school: c.school_name ? normalizeSchool(c.school_name) : null,
            subject: c.subject || null,
          });
        });
        setPrepEnrollMap(m);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 성적 저장 (시트·수정모드 공용) ──
  async function persistScore(
    student: StudentRow, subject: string, score: number,
    meta: { year: number; period: string; examType: 'midterm' | 'final' | 'performance' },
  ): Promise<boolean> {
    try {
      const existing = (resultsByStudent.get(student.id) || []).find(r =>
        r.subject === subject && r.exam_year === meta.year
        && r.exam_period === meta.period && r.exam_type === meta.examType);
      if (existing) {
        const { data, error } = await supabase.functions.invoke('student-exam-results', {
          body: { action: 'staff_update', result_id: existing.id, patch: { actual_score: score } },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        setResults(prev => prev.map(r => (r.id === existing.id ? { ...r, actual_score: score } : r)));
      } else {
        const { data: created, error: cErr } = await supabase.functions.invoke('student-exam-results', {
          body: {
            action: 'staff_create',
            student_id: student.id,
            school_name: student.school || '학교 미지정',
            subject,
            exam_type: meta.examType,
            exam_year: meta.year,
            exam_period: meta.period,
            exam_date: nowKST,
          },
        });
        if (cErr || created?.error || !created?.id) throw new Error(created?.error || cErr?.message || '생성 실패');
        const { data: upd, error: uErr } = await supabase.functions.invoke('student-exam-results', {
          body: { action: 'staff_update', result_id: created.id, patch: { actual_score: score } },
        });
        if (uErr || upd?.error) throw new Error(upd?.error || uErr?.message);
        setResults(prev => [...prev, {
          id: created.id, student_id: student.id, subject,
          exam_type: meta.examType, exam_year: meta.year, exam_period: meta.period,
          actual_score: score, exam_date: nowKST, submitted_at: new Date().toISOString(),
        }]);
      }
      const label = examResultLabel(
        { exam_year: meta.year, exam_period: meta.period, exam_type: meta.examType },
        student.grade_year, currentYear,
      );
      toast.success(`${student.name} ${subject} ${score}점 — ${label} 저장됨`);
      return true;
    } catch (e: any) {
      toast.error(`저장 실패: ${e.message || e}`);
      return false;
    }
  }

  async function saveScore(student: StudentRow, subject: string) {
    const key = draftKey(student.id, subject);
    const raw = scoreDrafts[key];
    if (raw == null || raw.trim() === '') return;
    const score = Number(raw);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      toast.error('0~100 사이 점수를 입력해주세요.');
      return;
    }
    setSavingKeys(p => ({ ...p, [key]: true }));
    const ok = await persistScore(student, subject, score, { year: entryYear, period: entryPeriod, examType: entryType });
    setSavingKeys(p => { const n = { ...p }; delete n[key]; return n; });
    if (ok) setScoreDrafts(p => { const n = { ...p }; delete n[key]; return n; });
  }

  const isTeacherRole = role === 'teacher';
  const effectiveTeacherId = isTeacherRole ? (user?.id ?? '') : teacherFilter;

  // ── 담당학생 스코핑 ──
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

  const today = useMemo(() => parseISO(nowKST), [nowKST]);

  // ── 시험 사이클 감지 (3원 병합 — 학원 캘린더 포함!) ──
  const cycleExams = useMemo(() => {
    const schoolNames = Array.from(new Set(
      scopedStudents.map(s => normalizeSchool(s.school)).filter(Boolean)
    ));
    return detectCycleExams({ archives, schedules, events, schoolNames });
  }, [archives, schedules, events, scopedStudents]);

  // ── 학교별 그룹 ──
  const schoolGroups = useMemo(() => {
    const groups = new Map<string, StudentRow[]>();
    for (const s of scopedStudents) {
      const key = normalizeSchool(s.school) || '학교 미지정';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const list = Array.from(groups.entries()).map(([school, studs]) => {
      const exams = cycleExams.get(school) || [];
      const upcomingList = exams
        .filter(e => e.start >= nowKST)
        .map(e => ({ ...e, dday: differenceInDays(parseISO(e.start), today) }));
      const upcoming = upcomingList[0] || null;
      const past = exams
        .filter(e => e.end < nowKST && differenceInDays(today, parseISO(e.end)) <= FOLLOWUP_WINDOW_DAYS)
        .sort((a, b) => b.end.localeCompare(a.end));
      const recentPast = past[0] || null;
      const perfs = schedules
        .filter(s => s.school_name === school && s.schedule_type === 'performance' && s.start_date && s.start_date >= nowKST)
        .map(s => ({ title: s.title, subject: s.subject, dday: differenceInDays(parseISO(s.start_date!), today) }))
        .filter(p => p.dday <= 45)
        .sort((a, b) => a.dday - b.dday);
      studs.sort((a, b) => (a.grade_year ?? 9) - (b.grade_year ?? 9) || a.name.localeCompare(b.name, 'ko'));
      return { school, students: studs, upcoming, recentPast, perfs };
    });
    list.sort((a, b) => ((a.upcoming?.dday ?? 9999) - (b.upcoming?.dday ?? 9999)) || a.school.localeCompare(b.school, 'ko'));
    return list;
  }, [scopedStudents, cycleExams, schedules, today, nowKST]);

  // ── 성적 수집 할 일: 종료(또는 진행 중) 시험 × 담당 학생 ──
  type CollectTask = {
    exam: CycleExam; school: string; total: number; done: number;
    daysSinceEnd: number; ongoing: boolean;
  };
  const collectTasks = useMemo<CollectTask[]>(() => {
    const tasks: CollectTask[] = [];
    for (const g of schoolGroups) {
      const exams = cycleExams.get(g.school) || [];
      for (const exam of exams) {
        const ended = exam.end < nowKST;
        const ongoing = exam.start <= nowKST && exam.end >= nowKST;
        const daysSinceEnd = ended ? differenceInDays(today, parseISO(exam.end)) : 0;
        if (!ongoing && (!ended || daysSinceEnd > COLLECT_WINDOW_DAYS)) continue;
        let total = 0, done = 0;
        for (const s of g.students) {
          // 시험 대상 학년이 명시되면(예: 자유학기제로 2·3학년만) 그 학년만 — 학년 미상 학생은 포함
          if (exam.grades && s.grade_year != null && !exam.grades.includes(s.grade_year)) continue;
          const subj = scopedSubjectsByStudent.get(s.id) || new Set<string>();
          for (const subject of subj) {
            if (subjectFilter !== 'all' && subject !== subjectFilter) continue;
            total += 1;
            const has = (resultsByStudent.get(s.id) || []).some(r =>
              r.subject === subject && r.exam_year === exam.year
              && r.exam_period === exam.period && r.exam_type === exam.examType
              && r.actual_score != null);
            if (has) done += 1;
          }
        }
        if (total > 0) tasks.push({ exam, school: g.school, total, done, daysSinceEnd, ongoing });
      }
    }
    // 미완료 먼저, 종료 오래된 순
    tasks.sort((a, b) =>
      Number(a.done === a.total) - Number(b.done === b.total)
      || b.daysSinceEnd - a.daysSinceEnd);
    return tasks;
  }, [schoolGroups, cycleExams, scopedSubjectsByStudent, resultsByStudent, subjectFilter, nowKST, today]);

  // ── 입력 시트 행 생성 ──
  const sheetRows = useMemo<EntryRow[]>(() => {
    if (!sheetExam) return [];
    const rows: EntryRow[] = [];
    const examKey = periodSortKey(sheetExam.year, sheetExam.period, null);
    for (const s of scopedStudents) {
      if (normalizeSchool(s.school) !== sheetExam.school) continue;
      if (sheetExam.grades && s.grade_year != null && !sheetExam.grades.includes(s.grade_year)) continue;
      const subj = scopedSubjectsByStudent.get(s.id) || new Set<string>();
      for (const subject of subj) {
        if (subjectFilter !== 'all' && subject !== subjectFilter) continue;
        const all = (resultsByStudent.get(s.id) || []).filter(r => r.subject === subject);
        const existing = all.find(r =>
          r.exam_year === sheetExam.year && r.exam_period === sheetExam.period
          && r.exam_type === sheetExam.examType && r.actual_score != null);
        const prevRow = all
          .filter(r => (r.exam_type === 'midterm' || r.exam_type === 'final')
            && r.actual_score != null
            && periodSortKey(r.exam_year, r.exam_period, null) < examKey)
          .pop();
        rows.push({
          studentId: s.id,
          studentName: s.name,
          gradeLabel: s.grade || (s.grade_year ? `${s.school_level || ''}${s.grade_year}` : ''),
          subject,
          prev: prevRow?.actual_score != null ? Number(prevRow.actual_score) : null,
          existing: existing?.actual_score != null ? Number(existing.actual_score) : null,
        });
      }
    }
    rows.sort((a, b) => a.subject.localeCompare(b.subject, 'ko') || a.studentName.localeCompare(b.studentName, 'ko'));
    return rows;
  }, [sheetExam, scopedStudents, scopedSubjectsByStudent, resultsByStudent, subjectFilter]);

  const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  async function handleSheetSave(row: EntryRow, score: number): Promise<boolean> {
    if (!sheetExam) return false;
    const student = studentById.get(row.studentId);
    if (!student) return false;
    return persistScore(student, row.subject, score, {
      year: sheetExam.year, period: sheetExam.period, examType: sheetExam.examType,
    });
  }

  // ── 학생 카드 데이터 ──
  function cardData(student: StudentRow, group: { upcoming: any; recentPast: CycleExam | null }) {
    const school = normalizeSchool(student.school);
    const subjSet = scopedSubjectsByStudent.get(student.id) || new Set<string>();
    const targets = subjectFilter !== 'all' ? [subjectFilter] : Array.from(subjSet).sort();
    const all = resultsByStudent.get(student.id) || [];

    const subjects = targets.map(subject => {
      const rows = all.filter(r => r.subject === subject);
      const lineRows = rows.filter(r => r.exam_type === 'midterm' || r.exam_type === 'final');
      const line = lineRows.map(r => Number(r.actual_score));
      const perf = rows.filter(r => r.exam_type === 'performance').map(r => Number(r.actual_score));
      const last = line[line.length - 1] ?? null;
      // 소수 점수 뺄셈의 부동소수점 쓰레기(+4.7000000000001 표시) 방지 — 소수 1자리 반올림
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const delta = line.length >= 2 ? round1(line[line.length - 1] - line[line.length - 2]) : null;
      const delta2 = line.length >= 3 ? round1(line[line.length - 2] - line[line.length - 3]) : null;
      const doubleDrop = delta != null && delta < 0 && delta2 != null && delta2 < 0;
      const scopeRows = archives
        .filter(a => a.school_name === school && a.subject?.startsWith(subject)
          && (a.grade_year == null || a.grade_year === student.grade_year) && a.exam_scope)
        .sort((a, b) => (a.exam_date_start || '9999').localeCompare(b.exam_date_start || '9999'));
      const scopeRow = scopeRows.find(r => (r.exam_date_start || '') >= nowKST) || scopeRows[scopeRows.length - 1];
      return {
        subject, line: line.slice(-6), perf: perf.slice(-6), last, delta, doubleDrop,
        scope: scopeRow?.exam_scope || null,
      };
    });

    const anyDrop = subjects.some(s => s.delta != null && s.delta < 0);
    const anyDoubleDrop = subjects.some(s => s.doubleDrop);

    let prep: { scopeOk: boolean; reportOk: boolean; prepEnrolled: boolean } | null = null;
    if (group.upcoming) {
      const scopeOk = subjects.some(s => !!s.scope);
      const reportOk = reports.some(r => r.school_name === school
        && (r.grade == null || r.grade === student.grade_year)
        && targets.some(t => r.subject?.startsWith(t)));
      // 특강 배지 — 이 학생의 학교·담당 과목과 맞는 특강에 등록됐을 때만 (학교/과목 미지정 특강은 통과)
      const prepEnrolled = (prepEnrollMap.get(student.id) || []).some(e =>
        (!e.school || e.school === school)
        && (!e.subject || targets.some(t => e.subject!.startsWith(t) || t.startsWith(e.subject!))));
      prep = { scopeOk, reportOk, prepEnrolled };
    }

    let followup: { hasResult: boolean; reviewed: boolean; published: boolean } | null = null;
    if (group.recentPast) {
      const rp = group.recentPast;
      const recent = all.filter(r =>
        targets.includes(r.subject)
        && r.exam_year === rp.year && r.exam_period === rp.period && r.exam_type === rp.examType);
      const hasResult = recent.some(r => r.actual_score != null);
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
            examTitle: g.upcoming ? examTitleLabel(g.upcoming) : (g.recentPast ? `${examTitleLabel(g.recentPast)} 종료` : null),
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
  }, [schoolGroups, teacherNameByStudentSubject, tableSort, reports, prepEnrollMap, reviews]);

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      </div>
    );
  }

  const pendingTasks = collectTasks.filter(t => t.done < t.total);

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
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {!isTeacherRole && (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link to="/exam-board/principal">
                <GraduationCap className="w-4 h-4 mr-1" />원장 디렉션
              </Link>
            </Button>
          )}
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
          <Button
            variant={editMode ? 'default' : 'outline'} size="sm" className="h-8"
            onClick={() => setEditMode(v => !v)}
          >
            <Pencil className="w-4 h-4 mr-1" />{editMode ? '수정 모드 끄기' : '수정 모드'}
          </Button>
        </div>
      </div>

      {/* ═══ 내신 할 일 (시험 사이클 자동 생성) ═══ */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <Inbox className="w-4 h-4" />
          내신 할 일
          {pendingTasks.length > 0 && <Badge variant="destructive" className="text-[11px]">{pendingTasks.length}건</Badge>}
          <span className="text-xs font-normal text-muted-foreground">시험 일정에서 자동 생성</span>
        </h2>

        {collectTasks.length === 0 && (
          <p className="text-sm text-muted-foreground border rounded-md px-4 py-3 bg-muted/20">
            최근 {COLLECT_WINDOW_DAYS}일 안에 종료된 시험이 없어요. 시험이 끝나면 성적 입력 할 일이 여기 자동으로 뜹니다.
            (시험 일정이 안 잡혀 있다면 내신 자료실에서 등록해주세요.)
          </p>
        )}

        {collectTasks.map(t => {
          const complete = t.done === t.total;
          return (
            <div
              key={`${t.school}-${t.exam.period}-${t.exam.year}`}
              className={`flex items-center gap-3 rounded-lg border bg-card px-4 py-3 ${complete ? 'opacity-60' : 'cursor-pointer hover:shadow-sm'} transition-shadow`}
              onClick={() => !complete && setSheetExam(t.exam)}
            >
              <span className={`w-1 self-stretch rounded ${complete ? 'bg-green-500' : t.daysSinceEnd >= 5 ? 'bg-red-500' : 'bg-amber-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold tracking-wide text-muted-foreground">
                  {t.ongoing ? '시험 진행 중' : `성적 수집 · 종료 ${t.daysSinceEnd}일째`}
                </p>
                <p className="font-semibold text-sm">
                  {t.school} {examTitleLabel(t.exam)} — 성적 입력
                  {t.exam.grades && (
                    <Badge variant="outline" className="ml-1.5 text-[11px] align-middle">
                      {t.exam.grades.join('·')}학년만
                    </Badge>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 max-w-56 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${complete ? 'bg-green-500' : 'bg-primary'} transition-all`}
                      style={{ width: `${(t.done / t.total) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums">{t.done}/{t.total}</span>
                  <span className="text-[11px] text-muted-foreground">
                    시행 {t.exam.start.slice(5).replace('-', '/')}{t.exam.end !== t.exam.start ? `–${t.exam.end.slice(5).replace('-', '/')}` : ''}
                  </span>
                </div>
              </div>
              {complete ? (
                <Badge variant="secondary" className="gap-1 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" />완료</Badge>
              ) : (
                <Button size="sm" onClick={e => { e.stopPropagation(); setSheetExam(t.exam); }}>입력 시트</Button>
              )}
            </div>
          );
        })}

        {/* 다가오는 시험·수행 요약 줄 */}
        {schoolGroups.some(g => (g.upcoming && g.upcoming.dday <= PREP_WINDOW_DAYS) || g.perfs.length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {schoolGroups.filter(g => g.upcoming && g.upcoming.dday <= PREP_WINDOW_DAYS).map(g => (
              <Badge key={g.school} variant={g.upcoming!.dday <= 7 ? 'destructive' : 'secondary'} className="gap-1">
                <CalendarClock className="w-3 h-3" />
                {g.school} {examTitleLabel(g.upcoming!)} D-{g.upcoming!.dday === 0 ? 'Day' : g.upcoming!.dday}
              </Badge>
            ))}
            {schoolGroups.flatMap(g => g.perfs.map((p, i) => (
              <Badge key={`${g.school}-p${i}`} variant="outline" className="gap-1 border-amber-400 text-amber-700">
                <AlertTriangle className="w-3 h-3" />
                {g.school} 수행{p.subject ? `(${p.subject})` : ''} D-{p.dday === 0 ? 'Day' : p.dday}
              </Badge>
            )))}
          </div>
        )}
      </section>

      {/* 수정 모드: 입력 대상 시기 선택 바 (시험 시트 밖 자유 입력용) */}
      {editMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <Pencil className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">자유 입력 대상:</span>
          <Select value={String(entryYear)} onValueChange={v => setEntryYear(Number(v))}>
            <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[entryYear - 1, entryYear, entryYear + 1].filter((v, i, a) => a.indexOf(v) === i).map(y =>
                <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entrySemester} onValueChange={v => setEntrySemester(v as '1' | '2')}>
            <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1학기</SelectItem>
              <SelectItem value="2">2학기</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entryType} onValueChange={v => setEntryType(v as any)}>
            <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="midterm">중간고사</SelectItem>
              <SelectItem value="final">기말고사</SelectItem>
              <SelectItem value="performance">수행평가</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">과거 성적 소급 입력용 — 최근 시험은 위의 할 일 카드에서 입력하는 게 빨라요.</span>
        </div>
      )}

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
                {examTitleLabel(g.upcoming)} D-{g.upcoming.dday === 0 ? 'Day' : g.upcoming.dday}
              </Badge>
            ) : g.recentPast ? (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                {examTitleLabel(g.recentPast)} 종료 — 팔로업
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">예정 시험 미등록</Badge>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-w-0">
            {g.students
              .map(s => ({ s, d: cardData(s, g) }))
              .sort((a, b) =>
                Number(b.d.anyDoubleDrop) - Number(a.d.anyDoubleDrop)
                || Number(b.d.anyDrop) - Number(a.d.anyDrop)
                || a.s.name.localeCompare(b.s.name, 'ko'))
              .map(({ s, d }) => (
                <Card
                  key={s.id}
                  className={`min-w-0 cursor-pointer transition-shadow hover:shadow-md ${
                    d.anyDoubleDrop ? 'border-red-300' : d.anyDrop ? 'border-amber-300' : ''
                  }`}
                  onClick={() => setDetailStudent(s)}
                >
                  <CardContent className="p-4 space-y-2.5">
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

                    <div className="space-y-1.5">
                      {d.subjects.filter(sub => editMode || sub.last != null || sub.perf.length > 0).map(sub => (
                        <div key={sub.subject} className="flex items-center gap-2">
                          <span className="text-xs font-medium w-7 shrink-0" style={{ color: SUBJECT_COLORS[sub.subject] || DEFAULT_LINE_COLOR }}>
                            {sub.subject}
                          </span>
                          <span className="text-lg font-bold leading-none w-12 text-right">
                            {sub.last != null ? sub.last : <span className="text-xs font-normal text-muted-foreground">{sub.perf.length > 0 ? '수행만' : '—'}</span>}
                          </span>
                          {sub.delta != null ? (
                            <span className={`flex items-center text-xs w-10 ${sub.delta > 0 ? 'text-green-600' : sub.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {sub.delta > 0 ? <TrendingUp className="w-3 h-3" /> : sub.delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                              {sub.delta !== 0 && (sub.delta > 0 ? `+${sub.delta}` : sub.delta)}
                            </span>
                          ) : <span className="w-10" />}
                          {editMode ? (
                            <span className="flex items-center gap-1 ml-auto" onClick={e => e.stopPropagation()}>
                              <Input
                                type="number" min={0} max={100} placeholder="점수"
                                className="h-7 w-16 text-sm"
                                value={scoreDrafts[draftKey(s.id, sub.subject)] ?? ''}
                                onChange={e => setScoreDrafts(p => ({ ...p, [draftKey(s.id, sub.subject)]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveScore(s, sub.subject); }}
                              />
                              <Button
                                size="sm" variant="ghost" className="h-7 w-7 p-0"
                                disabled={savingKeys[draftKey(s.id, sub.subject)] || !(scoreDrafts[draftKey(s.id, sub.subject)] ?? '').trim()}
                                onClick={() => saveScore(s, sub.subject)}
                              >
                                <Save className="w-4 h-4" />
                              </Button>
                            </span>
                          ) : (
                            <ScoreSparkline line={sub.line} perf={sub.perf} color={SUBJECT_COLORS[sub.subject] || DEFAULT_LINE_COLOR} />
                          )}
                        </div>
                      ))}
                      {!editMode && d.subjects.every(sub => sub.last == null && sub.perf.length === 0) && (
                        <p className="text-xs text-muted-foreground">등록된 성적 없음</p>
                      )}
                    </div>

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

      {/* 표(엑셀) 모드 */}
      {viewMode === 'table' && scopedStudents.length > 0 && (
        <Card className="min-w-0">
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
                  {editMode && <TableHead>점수 입력</TableHead>}
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
                    {editMode && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <span className="flex items-center gap-1">
                          <Input
                            type="number" min={0} max={100} placeholder="점수"
                            className="h-7 w-16 text-sm"
                            value={scoreDrafts[draftKey(r.student.id, r.subject)] ?? ''}
                            onChange={e => setScoreDrafts(p => ({ ...p, [draftKey(r.student.id, r.subject)]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveScore(r.student, r.subject); }}
                          />
                          <Button
                            size="sm" variant="ghost" className="h-7 w-7 p-0"
                            disabled={savingKeys[draftKey(r.student.id, r.subject)] || !(scoreDrafts[draftKey(r.student.id, r.subject)] ?? '').trim()}
                            onClick={() => saveScore(r.student, r.subject)}
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                        </span>
                      </TableCell>
                    )}
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

      {/* 시험 단위 성적 입력 시트 */}
      <ScoreEntrySheet
        open={!!sheetExam}
        onOpenChange={o => !o && setSheetExam(null)}
        exam={sheetExam}
        rows={sheetRows}
        onSave={handleSheetSave}
      />

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
                          <TableHead>시험</TableHead>
                          <TableHead className="text-right">점수</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice().reverse().map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">
                              {examResultLabel(r, detailStudent.grade_year, currentYear)}
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
