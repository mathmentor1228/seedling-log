// QUICK-LESSON-ENTRY-V2: Group-by-grade batch lesson entry.
// - Roster = (teacher's students for subject) ∩ (attendance_logs on selected date)
// - Each grade group has its own 진도 / 숙제범위 / 일괄적용 (그룹 단위 진도)
// - Each student row can override progress individually (개별 진도)
// - Each student row shows previous-assigned homework as hint for HW check
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { toStorageAttendanceStatuses } from '@/lib/attendance';
import { safeUpsertLessonRecords } from '@/lib/lessonRecordUpsert';

import { useAuth, isAssistant as checkIsAssistant } from '@/lib/auth';
import { useTeachersList } from '@/components/lessons/useTeachersList';
import {
  fetchStudentsByIds,
  fetchTeacherStudentIds,
  groupStudentsByGrade,
  getStudentGroupLabel,
  sortStudents,
} from '@/components/lessons/studentSelection';
import { getTodayKST } from '@/lib/utils';
import {
  ArrowLeft, Loader2, CheckCircle2, Clock, XCircle, History, Zap, Send, Save,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MissingAttendanceDialog } from '@/components/lessons/MissingAttendanceDialog';

import { UnifiedLessonRow } from '@/components/lessons/UnifiedLessonRow';
import { LinkedRecordsChip, LinkedRecordsState, LinkedChoices } from '@/components/lessons/LinkedRecordsChip';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';

const SUBJECTS = ['수학', '영어', '과학', '국어'] as const;


interface StudentRow {
  id: string;
  name: string;
  school: string | null;
  school_level: string | null;
  grade_year: number | null;
  included: boolean;
  understanding: number;
  homework: string;
  note: string;
  prevAvg: number | null;
  prevHwContent: string | null;
  prevHwId: string | null;
  individualProgress: string; // empty => use group progress
  showOverride: boolean;
  lessonTypes: string[];
  attendanceStatuses: string[];
  hasAttendanceLog: boolean; // false => auto-create on save
  existingDraft: boolean;    // true => roster forced by draft lesson_record
  linked: LinkedRecordsState;
  linkedChoices: LinkedChoices;
}

interface GroupState {
  key: string;
  label: string;
  studentIds: string[];
  mode: 'individual' | 'group';        // 학년별 입력 방식
  groupMemberIds: string[];             // 그룹입력 시 공통 진도를 적용할 학생들
  lessonRange: string;
  homeworkAssigned: string;
  defaultUnderstanding: number;
  defaultHw: string;
  collapsed: boolean;
}

function QuickLessonEntryContent() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isAssistant = checkIsAssistant(role);
  const { teachers } = useTeachersList();

  const [teacherId, setTeacherId] = useState(isAssistant ? '' : (user?.id || ''));
  const [subject, setSubject] = useState<string>('수학');
  const [date, setDate] = useState(getTodayKST());

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [groups, setGroups] = useState<GroupState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [validation, setValidation] = useState<{ open: boolean; issues: { name: string; problems: string[] }[] }>({ open: false, issues: [] });


  const effectiveTeacherId = isAssistant ? teacherId : (user?.id || '');

  const loadStudents = useCallback(async () => {
    if (!effectiveTeacherId || !subject || !date) { setStudents([]); setGroups([]); return; }
    setLoading(true);
    try {
      // 1. Teacher's students for subject
      const teacherIds = await fetchTeacherStudentIds(effectiveTeacherId, subject);
      if (teacherIds.length === 0) { setStudents([]); setGroups([]); return; }

      // 2a. Attendance for the date
      const { data: attRows } = await supabase
        .from('attendance_logs')
        .select('student_id')
        .eq('date', date)
        .in('student_id', teacherIds);
      const attendedIds = new Set<string>((attRows || []).map((r: any) => r.student_id).filter(Boolean));

      // 2b. Existing lesson_records (drafts or submitted) for this teacher/date/subject
      const { data: existingRecs } = await supabase
        .from('lesson_records')
        .select('id, student_id, lesson_range, understanding_score, homework_status, notes, next_lesson_goal, lesson_types, attendance_status, submitted, is_common_entry')
        .eq('teacher_id', effectiveTeacherId)
        .eq('lesson_date', date)
        .eq('subject', subject as any)
        .in('student_id', teacherIds);
      const recordMap = new Map<string, any>((existingRecs || []).map((r: any) => [r.student_id, r]));

      // Union: attendance ∪ existing records
      const finalIds = teacherIds.filter(id => attendedIds.has(id) || recordMap.has(id));

      if (finalIds.length === 0) {
        setStudents([]);
        setGroups([]);
        return;
      }

      const list = await fetchStudentsByIds(finalIds);

      // 3. Previous lesson avg understanding
      const { data: prevRecs } = await supabase
        .from('lesson_records')
        .select('student_id, understanding_score')
        .eq('teacher_id', effectiveTeacherId)
        .eq('subject', subject as any)
        .not('understanding_score', 'is', null)
        .order('lesson_date', { ascending: false })
        .limit(500);
      const avgMap = new Map<string, { sum: number; n: number }>();
      for (const r of (prevRecs || []) as any[]) {
        const cur = avgMap.get(r.student_id) || { sum: 0, n: 0 };
        cur.sum += r.understanding_score;
        cur.n += 1;
        avgMap.set(r.student_id, cur);
      }

      // 4. Previous homework assignment (most recent per student, before today, same subject)
      const { data: hwRows } = await supabase
        .from('homework_assignments')
        .select('id, student_id, content, assigned_date')
        .in('student_id', finalIds)
        .eq('subject', subject as any)
        .lt('assigned_date', date)
        .order('assigned_date', { ascending: false })
        .limit(500);
      const hwMap = new Map<string, { id: string; content: string }>();
      for (const r of (hwRows || []) as any[]) {
        if (!hwMap.has(r.student_id)) hwMap.set(r.student_id, { id: r.id, content: r.content });
      }

      // 5. Linked records: test/clinic/self_study for same day + subject (per student)
      const [testRes, clinicRes, studyRes] = await Promise.all([
        supabase.from('test_records').select('id, student_id, test_type, content, score, passed')
          .in('student_id', finalIds).eq('test_date', date).eq('subject', subject),
        supabase.from('clinic_records').select('id, student_id, content, teacher_note')
          .in('student_id', finalIds).eq('clinic_date', date).eq('subject', subject),
        supabase.from('self_study_records').select('id, student_id, task_list, memo, duration_minutes')
          .in('student_id', finalIds).eq('study_date', date).eq('subject', subject),
      ]);
      const testsBy = new Map<string, any[]>();
      for (const r of (testRes.data || []) as any[]) {
        const arr = testsBy.get(r.student_id) || []; arr.push(r); testsBy.set(r.student_id, arr);
      }
      const clinicsBy = new Map<string, any[]>();
      for (const r of (clinicRes.data || []) as any[]) {
        const arr = clinicsBy.get(r.student_id) || []; arr.push(r); clinicsBy.set(r.student_id, arr);
      }
      const studiesBy = new Map<string, any[]>();
      for (const r of (studyRes.data || []) as any[]) {
        const arr = studiesBy.get(r.student_id) || []; arr.push(r); studiesBy.set(r.student_id, arr);
      }

      const rows: StudentRow[] = sortStudents(list).map(s => {
        const a = avgMap.get(s.id);
        const avg = a ? Math.round(a.sum / a.n) : null;
        const hw = hwMap.get(s.id) || null;
        const rec = recordMap.get(s.id);
        const hasAtt = attendedIds.has(s.id);
        return {
          ...s,
          included: true,
          understanding: rec?.understanding_score ?? avg ?? 3,
          homework: rec?.homework_status ?? (hw ? 'completed' : 'none_assigned'),
          note: rec?.notes ?? '',
          prevAvg: avg,
          prevHwContent: hw?.content || null,
          prevHwId: hw?.id || null,
          individualProgress: rec && rec.is_common_entry === false ? (rec.lesson_range || '') : '',
          showOverride: !!(rec && rec.is_common_entry === false && rec.lesson_range),
          lessonTypes: (rec?.lesson_types as string[]) ?? ['정규수업'],
          attendanceStatuses: (rec?.attendance_status as string[]) ?? ['정상등원'],
          hasAttendanceLog: hasAtt,
          existingDraft: !!rec,
          linked: {
            tests: testsBy.get(s.id) || [],
            clinics: clinicsBy.get(s.id) || [],
            studies: studiesBy.get(s.id) || [],
          },
          linkedChoices: { test: 'merge', clinic: 'merge', study: 'merge' },
        };
      });

      setStudents(rows);

      // Build groups by school_level + grade
      const grouped = groupStudentsByGrade(rows);
      setGroups(grouped.map(([key, gs]) => ({
        key,
        label: getStudentGroupLabel(key),
        studentIds: gs.map(g => g.id),
        mode: 'individual' as const,
        groupMemberIds: [],
        lessonRange: '',
        homeworkAssigned: '',
        defaultUnderstanding: 3,
        defaultHw: 'none_assigned',
        collapsed: false,
      })));
    } catch (e: any) {
      toast({ title: '학생 로드 실패', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [effectiveTeacherId, subject, date, toast]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  async function prefillGroupFromLast(groupIdx: number) {
    const g = groups[groupIdx];
    if (!g || g.studentIds.length === 0) return;
    // Use first student in group as representative
    const { data } = await supabase
      .from('lesson_records')
      .select('lesson_range, next_lesson_goal')
      .eq('teacher_id', effectiveTeacherId)
      .eq('subject', subject as any)
      .in('student_id', g.studentIds)
      .order('lesson_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const suggested = data.next_lesson_goal || data.lesson_range || '';
      updateGroup(groupIdx, 'lessonRange', suggested);
      toast({ title: `${g.label} 이전 회차 자동채움` });
    } else {
      toast({ title: '이전 기록 없음' });
    }
  }

  function updateGroup<K extends keyof GroupState>(idx: number, key: K, value: GroupState[K]) {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, [key]: value } : g));
  }

  function applyGroupDefaults(idx: number) {
    const g = groups[idx];
    if (!g) return;
    setStudents(prev => prev.map(s => g.studentIds.includes(s.id)
      ? { ...s, understanding: g.defaultUnderstanding, homework: g.defaultHw }
      : s
    ));
    toast({ title: `${g.label} 일괄 적용` });
  }

  function updateStudent<K extends keyof StudentRow>(id: string, key: K, value: StudentRow[K]) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s));
  }

  const selectedCount = useMemo(() => students.filter(s => s.included).length, [students]);
  const stats = useMemo(() => {
    const total = students.length;
    const draft = students.filter(s => s.existingDraft).length;
    const linked = students.filter(s => s.linked.tests.length + s.linked.clinics.length + s.linked.studies.length > 0).length;
    const absent = students.filter(s => s.attendanceStatuses.some(a => a.includes('결석'))).length;
    return { total, draft, linked, absent };
  }, [students]);

  // Color accent per group (cycles by group index)
  const GROUP_ACCENTS = [
    { bar: 'border-l-blue-500',    bg: 'bg-blue-500/5',    chip: 'bg-blue-500/15 text-blue-600 dark:text-blue-300' },
    { bar: 'border-l-emerald-500', bg: 'bg-emerald-500/5', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
    { bar: 'border-l-purple-500',  bg: 'bg-purple-500/5',  chip: 'bg-purple-500/15 text-purple-600 dark:text-purple-300' },
    { bar: 'border-l-amber-500',   bg: 'bg-amber-500/5',   chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
    { bar: 'border-l-rose-500',    bg: 'bg-rose-500/5',    chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' },
    { bar: 'border-l-cyan-500',    bg: 'bg-cyan-500/5',    chip: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300' },
  ];

  async function save(submit: boolean) {
    if (!effectiveTeacherId) { toast({ title: '선생님을 선택해주세요', variant: 'destructive' }); return; }
    const targets = students.filter(s => s.included);
    if (targets.length === 0) { toast({ title: '학생을 1명 이상 선택해주세요', variant: 'destructive' }); return; }

    // Build per-student progress map from groups
    const groupByStudent = new Map<string, GroupState>();
    for (const g of groups) for (const sid of g.studentIds) groupByStudent.set(sid, g);

    // Helper: get effective progress/homework for a student.
    // If student is in common group AND has individual progress text → MERGE both.
    const resolveProgress = (s: StudentRow) => {
      const g = groupByStudent.get(s.id);
      const indiv = s.individualProgress.trim();
      if (!g) return { range: indiv, hw: null as string | null, isCommon: false };
      const inGroup = g.mode === 'group' && g.groupMemberIds.includes(s.id);
      const groupRange = g.lessonRange.trim();
      if (inGroup) {
        const merged = indiv ? `${groupRange}\n[개별] ${indiv}` : groupRange;
        return { range: merged, hw: g.homeworkAssigned || null, isCommon: true };
      }
      return { range: indiv, hw: g.homeworkAssigned || null, isCommon: false };
    };

    // PRE-SUBMIT VALIDATION (only when submitting; temp save is unrestricted)
    if (submit) {
      const issues: { name: string; problems: string[] }[] = [];
      for (const s of targets) {
        const probs: string[] = [];
        const { range } = resolveProgress(s);
        if (!range) probs.push('수업 진도 누락');
        if (!s.attendanceStatuses || s.attendanceStatuses.length === 0) probs.push('출결 상태 미선택');
        if (!s.lessonTypes || s.lessonTypes.length === 0) probs.push('수업 종류 미선택');
        // Homework check: if a previous HW was assigned, status must not remain 'none_assigned'
        if (s.prevHwId && s.homework === 'none_assigned') probs.push('숙제 확인 누락 (이전 숙제 있음)');
        if (probs.length > 0) issues.push({ name: s.name, problems: probs });
      }
      if (issues.length > 0) {
        setValidation({ open: true, issues });
        return;
      }
    } else {
      // For temp save: still require progress (otherwise nothing to record)
      for (const s of targets) {
        const { range } = resolveProgress(s);
        if (!range) {
          toast({ title: `진도 누락: ${s.name}`, description: '임시저장이라도 진도는 필요합니다', variant: 'destructive' });
          return;
        }
      }
    }

    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('lesson_records')
        .select('id, student_id')
        .eq('teacher_id', effectiveTeacherId)
        .eq('lesson_date', date)
        .eq('subject', subject as any)
        .in('student_id', targets.map(t => t.id));
      const existingMap = new Map<string, string>((existing || []).map((r: any) => [r.student_id, r.id]));

      const inserts: any[] = [];
      const updates: { id: string; payload: any }[] = [];
      const autoAttendance: any[] = [];
      for (const s of targets) {
        const { range, hw, isCommon } = resolveProgress(s);

        // Apply linked records (test/clinic/self_study) per merge choice
        let mergedNotes = s.note || '';
        let testName: string | null = null;
        let testContent: string | null = null;
        let testResultText: string | null = null;

        const tc = s.linkedChoices;
        if (tc.test !== 'skip' && s.linked.tests.length > 0) {
          const parts = s.linked.tests.map(t =>
            `${t.test_type || '테스트'}${t.content ? ` ${t.content}` : ''}${t.score ? ` (${t.score})` : ''}${t.passed === true ? ' ✓' : t.passed === false ? ' ✗' : ''}`
          );
          testName = s.linked.tests[0].test_type || '테스트';
          testContent = s.linked.tests.map(t => t.content || '').filter(Boolean).join(' / ') || null;
          testResultText = parts.join(' / ');
        }
        const appendNote = (label: string, lines: string[]) => {
          if (lines.length === 0) return;
          const block = `[${label}] ${lines.join(' / ')}`;
          mergedNotes = mergedNotes ? `${mergedNotes}\n${block}` : block;
        };
        const replaceNote = (label: string, lines: string[]) => {
          if (lines.length === 0) return;
          mergedNotes = `[${label}] ${lines.join(' / ')}`;
        };
        if (s.linked.clinics.length > 0 && tc.clinic !== 'skip') {
          const lines = s.linked.clinics.map(c => c.content || c.teacher_note || '').filter(Boolean);
          if (tc.clinic === 'replace') replaceNote('클리닉', lines);
          else appendNote('클리닉', lines);
        }
        if (s.linked.studies.length > 0 && tc.study !== 'skip') {
          const lines = s.linked.studies.map(st => {
            const tasks = Array.isArray(st.task_list)
              ? st.task_list.map((t: any) => t?.title || t?.name || '').filter(Boolean).join(', ')
              : '';
            return `${tasks || st.memo || ''}${st.duration_minutes ? ` (${st.duration_minutes}분)` : ''}`.trim();
          }).filter(Boolean);
          if (tc.study === 'replace') replaceNote('자습', lines);
          else appendNote('자습', lines);
        }

        const payload: any = {
          lesson_range: range,
          // ABSENT-NO-UNDERSTANDING-V1: 결석 처리된 학생은 이해도를 저장하지 않는다
          understanding_score: s.attendanceStatuses.some(a => ['결석', '인정결석', '무단결석', '보충불가'].includes(a))
            ? null
            : s.understanding,
          homework_status: s.homework,
          notes: mergedNotes || null,
          next_lesson_goal: hw,
          is_common_entry: isCommon,
          lesson_types: s.lessonTypes,
          attendance_status: toStorageAttendanceStatuses(s.attendanceStatuses),
          submitted: submit,
          submitted_at: submit ? new Date().toISOString() : null,
        };
        if (testName) {
          payload.test_name = testName;
          payload.test_content = testContent;
          payload.test_result_text = testResultText;
        }
        const existId = existingMap.get(s.id);
        if (existId) updates.push({ id: existId, payload });
        else inserts.push({
          teacher_id: effectiveTeacherId,
          student_id: s.id,
          lesson_date: date,
          subject: subject as any,
          ...payload,
        });
        // Auto-create attendance_log if missing (only for non-absent statuses)
        const isAbsent = s.attendanceStatuses.some(a => a.includes('결석'));
        if (!s.hasAttendanceLog && !isAbsent) {
          autoAttendance.push({
            student_id: s.id,
            student_name: s.name,
            date,
            checked_in_at: `${date}T09:00:00+09:00`,
            recorded_by: effectiveTeacherId,
          });
        }
      }

      if (inserts.length > 0) {
        const results = await safeUpsertLessonRecords(inserts as any);
        const firstErr = results.find(r => r.error)?.error;
        if (firstErr) throw firstErr;
      }

      for (const u of updates) {
        const { error } = await supabase.from('lesson_records').update(u.payload).eq('id', u.id);
        if (error) throw error;
      }
      if (autoAttendance.length > 0) {
        await supabase.from('attendance_logs').insert(autoAttendance);
      }

      toast({
        title: submit ? '제출 완료' : '임시저장 완료',
        description: `${targets.length}명 (신규 ${inserts.length} / 갱신 ${updates.length})`,
      });
      navigate('/lessons');
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 space-y-3 pb-24">
      {/* Header bar */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/lessons')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold leading-tight">오늘 수업 한번에 기록</h1>
            <p className="text-xs text-muted-foreground">출석 학생 자동 로드 · 학년별 그룹 입력 · 외부기록 흡수</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Badge variant="outline" className="h-7 px-2.5 text-xs">출석 <b className="ml-1">{stats.total}</b></Badge>
          {stats.draft > 0 && <Badge className="h-7 px-2.5 text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0">임시 {stats.draft}</Badge>}
          {stats.linked > 0 && <Badge className="h-7 px-2.5 text-xs bg-purple-500/15 text-purple-700 dark:text-purple-300 border-0">외부기록 {stats.linked}</Badge>}
          {stats.absent > 0 && <Badge className="h-7 px-2.5 text-xs bg-rose-500/15 text-rose-700 dark:text-rose-300 border-0">결석 {stats.absent}</Badge>}
        </div>
      </div>

      {/* Header context */}
      <Card>
        <CardContent className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {isAssistant ? (
            <div>
              <Label className="text-xs">담당 선생님</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label className="text-xs">담당 선생님</Label>
              <div className="h-9 px-3 flex items-center text-sm border rounded-md bg-muted/30">본인</div>
            </div>
          )}
          <div>
            <Label className="text-xs">과목</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">수업 날짜</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" className="h-9 text-xs w-full"
              onClick={() => setMissingOpen(true)}
              disabled={!effectiveTeacherId || !subject || !date}>
              <UserPlus className="w-3.5 h-3.5 mr-1" /> 누락 학생 추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <MissingAttendanceDialog
        open={missingOpen}
        onOpenChange={setMissingOpen}
        teacherId={effectiveTeacherId}
        subject={subject}
        date={date}
        onDone={loadStudents}
      />

      {loading ? (
        <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 출석/학생 로딩...
        </CardContent></Card>
      ) : students.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-10 text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">이 날짜의 출석 또는 임시저장 학생이 없습니다</p>
          <p className="text-xs text-muted-foreground">"누락 학생 추가"로 직접 추가하거나 다른 날짜를 선택해주세요.</p>
        </CardContent></Card>
      ) : (
        groups.map((g, gi) => {
          const groupStudents = students.filter(s => g.studentIds.includes(s.id));
          const accent = GROUP_ACCENTS[gi % GROUP_ACCENTS.length];
          const draftCount = groupStudents.filter(s => s.existingDraft).length;
          return (
            <Card key={g.key} className={`border-l-4 ${accent.bar} border-y border-r overflow-hidden shadow-sm`}>
              <Collapsible open={!g.collapsed} onOpenChange={(o) => updateGroup(gi, 'collapsed', !o)}>
                <CardHeader className={`pb-2 ${accent.bg}`}>
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <CollapsibleTrigger className="flex items-center gap-2 min-w-0">
                      {g.collapsed ? <ChevronRight className="w-5 h-5 shrink-0" /> : <ChevronDown className="w-5 h-5 shrink-0" />}
                      <span className="font-bold text-lg">{g.label}</span>
                      <Badge className={`text-xs border-0 ${accent.chip} hover:opacity-90`}>{groupStudents.length}명</Badge>
                      {draftCount > 0 && (
                        <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0">임시 {draftCount}</Badge>
                      )}
                      {g.mode === 'group' && (
                        <Badge className="text-[10px] bg-primary/15 text-primary border-0">그룹입력 {g.groupMemberIds.length}명</Badge>
                      )}
                    </CollapsibleTrigger>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); prefillGroupFromLast(gi); }} className="h-8 text-xs shrink-0">
                      <History className="w-3.5 h-3.5 mr-1" /> 이전 회차
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-3">
                    {/* Mode toggle: 개별입력 vs 그룹입력 */}
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border">
                      <span className="text-xs font-medium text-muted-foreground shrink-0">입력 방식</span>
                      <div className="flex gap-1">
                        <button type="button"
                          onClick={() => updateGroup(gi, 'mode', 'individual')}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${g.mode === 'individual' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:bg-muted'}`}>
                          개별입력
                        </button>
                        <button type="button"
                          onClick={() => updateGroup(gi, 'mode', 'group')}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${g.mode === 'group' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:bg-muted'}`}>
                          그룹입력
                        </button>
                      </div>
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        {g.mode === 'group'
                          ? `공통 진도 적용: ${g.groupMemberIds.length}명 / 개별: ${groupStudents.length - g.groupMemberIds.length}명`
                          : '학생마다 진도 개별 입력'}
                      </span>
                    </div>

                    {/* Group mode only: member selection + common inputs */}
                    {g.mode === 'group' && (
                      <div className="bg-primary/5 border border-primary/20 p-3 rounded-md space-y-3">
                        <div>
                          <Label className="text-xs font-semibold">① 공통 진도를 적용할 학생 선택</Label>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <button type="button"
                              onClick={() => updateGroup(gi, 'groupMemberIds',
                                g.groupMemberIds.length === groupStudents.length ? [] : groupStudents.map(s => s.id))}
                              className="px-2 py-1 rounded-md text-[11px] font-medium border border-dashed border-primary/50 text-primary hover:bg-primary/10">
                              {g.groupMemberIds.length === groupStudents.length ? '전체 해제' : '전체 선택'}
                            </button>
                            {groupStudents.map(s => {
                              const on = g.groupMemberIds.includes(s.id);
                              return (
                                <button key={s.id} type="button"
                                  onClick={() => updateGroup(gi, 'groupMemberIds',
                                    on ? g.groupMemberIds.filter(x => x !== s.id) : [...g.groupMemberIds, s.id])}
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-foreground hover:bg-muted'}`}>
                                  {s.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs font-semibold">② 공통 진도</Label>
                            <Textarea value={g.lessonRange} onChange={e => updateGroup(gi, 'lessonRange', e.target.value)}
                              rows={2} placeholder="예) 일차함수의 그래프" className="text-sm mt-1" />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold">③ 공통 숙제 범위 (선택)</Label>
                            <Input value={g.homeworkAssigned} onChange={e => updateGroup(gi, 'homeworkAssigned', e.target.value)}
                              placeholder="예) 교재 p.34-37" className="h-9 text-sm mt-1" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Per-student rows (extracted to UnifiedLessonRow for reuse) */}
                    <div className="space-y-2">
                      {groupStudents.map((s, idx) => {
                        const inCommonGroup = g.mode === 'group' && g.groupMemberIds.includes(s.id);
                        const hasLinked = s.linked.tests.length + s.linked.clinics.length + s.linked.studies.length > 0;
                        return (
                          <div key={s.id} className="space-y-1">
                            {hasLinked && (
                              <div className="flex justify-end pr-1">
                                <LinkedRecordsChip
                                  studentName={s.name}
                                  linked={s.linked}
                                  choices={s.linkedChoices}
                                  onChange={(c) => updateStudent(s.id, 'linkedChoices', c)}
                                />
                              </div>
                            )}
                            <UnifiedLessonRow
                              student={s}
                              idx={idx}
                              inCommonGroup={inCommonGroup}
                              groupMode={g.mode}
                              onChange={(key, value) => updateStudent(s.id, key, value as any)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })
      )}

      {students.length > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-background/95 backdrop-blur shadow-xl border-2 border-primary/30 rounded-2xl px-4 py-2.5">
          <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <b className="text-foreground">{selectedCount}</b>명 기록 준비됨
          </div>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <Button variant="outline" onClick={() => save(false)} disabled={saving} size="sm" className="h-9">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            임시저장
          </Button>
          <Button onClick={() => save(true)} disabled={saving} size="sm" className="h-9 px-4 font-semibold shadow-md">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            {selectedCount}명 제출
          </Button>
        </div>
      )}

      <Dialog open={validation.open} onOpenChange={(o) => setValidation(v => ({ ...v, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" /> 제출 전 확인 필요 ({validation.issues.length}명)
            </DialogTitle>
            <DialogDescription>
              아래 항목이 누락되었습니다. 수정 후 다시 제출해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {validation.issues.map(it => (
              <div key={it.name} className="border rounded-md p-2.5 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="font-semibold text-sm mb-1">{it.name}</div>
                <ul className="text-xs text-muted-foreground space-y-0.5 ml-2">
                  {it.problems.map(p => (
                    <li key={p} className="flex items-start gap-1.5">
                      <span className="text-amber-600 mt-0.5">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidation({ open: false, issues: [] })}>
              수정하러 가기
            </Button>
            <Button variant="secondary" onClick={() => { setValidation({ open: false, issues: [] }); save(false); }}>
              그래도 임시저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function QuickLessonEntryPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <ArchiveNotice to="/lessons/close" label="수업 마감" />
      <QuickLessonEntryContent />
    </div>
    </ProtectedRoute>
  );
}
