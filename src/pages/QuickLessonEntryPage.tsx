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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  ChevronDown, ChevronRight, PenLine, BookOpen,
} from 'lucide-react';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MissingAttendanceDialog } from '@/components/lessons/MissingAttendanceDialog';

const SUBJECTS = ['수학', '영어', '과학', '국어'] as const;
const HW_OPTIONS = [
  { v: 'completed', label: '완료', cls: 'bg-emerald-500 text-white border-emerald-500', dim: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-900' },
  { v: 'partial', label: '부분', cls: 'bg-amber-500 text-white border-amber-500', dim: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 border-amber-200/60 dark:border-amber-900' },
  { v: 'not_done', label: '미완', cls: 'bg-red-500 text-white border-red-500', dim: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200/60 dark:border-red-900' },
  { v: 'none_assigned', label: '없음', cls: 'bg-muted text-foreground border-muted', dim: 'text-muted-foreground hover:bg-muted border-border' },
] as const;
const LESSON_TYPES = ['정규수업', '보충수업', '시험특강', '방학특강', '테스트', '휴강'] as const;
const ATTENDANCE_STATUSES = ['출석', '지각', '조퇴', '인정결석', '무단결석'] as const;

const UNDERSTANDING_COLORS: Record<number, { active: string; dim: string }> = {
  1: { active: 'bg-red-500 text-white border-red-500',     dim: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' },
  2: { active: 'bg-orange-500 text-white border-orange-500', dim: 'text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40' },
  3: { active: 'bg-amber-500 text-white border-amber-500',  dim: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40' },
  4: { active: 'bg-lime-500 text-white border-lime-500',    dim: 'text-lime-700 hover:bg-lime-50 dark:hover:bg-lime-950/40' },
  5: { active: 'bg-emerald-500 text-white border-emerald-500', dim: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40' },
};

const ATTENDANCE_COLOR: Record<string, string> = {
  '출석': 'bg-emerald-500 text-white border-emerald-500',
  '지각': 'bg-amber-500 text-white border-amber-500',
  '조퇴': 'bg-orange-500 text-white border-orange-500',
  '인정결석': 'bg-slate-500 text-white border-slate-500',
  '무단결석': 'bg-red-500 text-white border-red-500',
};


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
          attendanceStatuses: (rec?.attendance_status as string[]) ?? (hasAtt ? ['출석'] : ['출석']),
          hasAttendanceLog: hasAtt,
          existingDraft: !!rec,
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

  async function save(submit: boolean) {
    if (!effectiveTeacherId) { toast({ title: '선생님을 선택해주세요', variant: 'destructive' }); return; }
    const targets = students.filter(s => s.included);
    if (targets.length === 0) { toast({ title: '학생을 1명 이상 선택해주세요', variant: 'destructive' }); return; }

    // Build per-student progress map from groups
    const groupByStudent = new Map<string, GroupState>();
    for (const g of groups) for (const sid of g.studentIds) groupByStudent.set(sid, g);

    // Helper: get effective progress/homework for a student based on group mode
    const resolveProgress = (s: StudentRow) => {
      const g = groupByStudent.get(s.id);
      if (!g) return { range: s.individualProgress.trim(), hw: null as string | null, isCommon: false };
      const inGroup = g.mode === 'group' && g.groupMemberIds.includes(s.id);
      if (inGroup) {
        return { range: g.lessonRange.trim(), hw: g.homeworkAssigned || null, isCommon: true };
      }
      return { range: s.individualProgress.trim(), hw: g.homeworkAssigned || null, isCommon: false };
    };

    // Validate each included student has some progress
    for (const s of targets) {
      const { range } = resolveProgress(s);
      if (!range) {
        toast({ title: `진도 누락: ${s.name}`, description: '그룹 또는 개별 진도를 입력해주세요', variant: 'destructive' });
        return;
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
        const payload: any = {
          lesson_range: range,
          understanding_score: s.understanding,
          homework_status: s.homework,
          notes: s.note || null,
          next_lesson_goal: hw,
          is_common_entry: isCommon,
          lesson_types: s.lessonTypes,
          attendance_status: s.attendanceStatuses,
          submitted: submit,
          submitted_at: submit ? new Date().toISOString() : null,
        };
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
        const { error } = await supabase.from('lesson_records').insert(inserts);
        if (error) throw error;
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
    <div className="max-w-5xl mx-auto px-3 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/lessons')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" /> 오늘 수업 한번에 기록
        </h1>
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
          <div className="flex items-end gap-2">
            <Badge variant="outline" className="text-xs h-9 px-3 flex items-center">
              출석 {selectedCount}/{students.length}명
            </Badge>
            <Button variant="outline" size="sm" className="h-9 text-xs"
              onClick={() => setMissingOpen(true)}
              disabled={!effectiveTeacherId || !subject || !date}>
              <UserPlus className="w-3.5 h-3.5 mr-1" /> 누락 추가
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
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          이 날짜의 출석 또는 임시저장 학생이 없습니다. "누락 추가"로 학생을 추가하거나 날짜를 확인해주세요.
        </CardContent></Card>
      ) : (
        groups.map((g, gi) => {
          const groupStudents = students.filter(s => g.studentIds.includes(s.id));
          return (
            <Card key={g.key} className="border-l-4 border-l-primary border-y border-r overflow-hidden">
              <Collapsible open={!g.collapsed} onOpenChange={(o) => updateGroup(gi, 'collapsed', !o)}>
                <CardHeader className="pb-2 bg-primary/5">
                  <CardTitle className="text-base flex items-center justify-between">
                    <CollapsibleTrigger className="flex items-center gap-2">
                      {g.collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      <span className="font-bold">{g.label}</span>
                      <Badge className="text-xs bg-primary/15 text-primary border-0 hover:bg-primary/20">{groupStudents.length}명</Badge>
                    </CollapsibleTrigger>
                    <Button size="sm" variant="ghost" onClick={() => prefillGroupFromLast(gi)} className="h-8 text-xs">
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

                    {/* Per-student rows */}
                    <div className="space-y-2">
                      {groupStudents.map((s, idx) => {
                        const inCommonGroup = g.mode === 'group' && g.groupMemberIds.includes(s.id);
                        const needsIndividualProgress = !inCommonGroup;
                        return (
                        <div key={s.id}
                          className={`rounded-lg border bg-card p-3 transition ${!s.included ? 'opacity-50' : 'hover:border-primary/40'} ${idx % 2 === 1 ? 'bg-muted/20' : ''} ${inCommonGroup ? 'border-l-4 border-l-primary/60' : ''}`}>
                          {/* Row 1: name + meta */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                              <input type="checkbox" checked={s.included}
                                onChange={e => updateStudent(s.id, 'included', e.target.checked)}
                                className="rounded w-4 h-4" />
                              <div className="min-w-0">
                                <div className="font-semibold text-base flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate">{s.name}</span>
                                  {inCommonGroup && (
                                    <Badge className="text-[10px] h-5 px-1.5 bg-primary/15 text-primary border-0 hover:bg-primary/20">공통진도 적용</Badge>
                                  )}
                                  {s.existingDraft && (
                                    <Badge className="text-[10px] h-5 px-1.5 bg-blue-500/15 text-blue-600 dark:text-blue-400 border-0 hover:bg-blue-500/20">임시저장</Badge>
                                  )}
                                  {!s.hasAttendanceLog && (
                                    <Badge className="text-[10px] h-5 px-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 hover:bg-amber-500/20">출결없음</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate mt-0.5">
                                  {s.school || '—'} {s.prevAvg != null && <span className="ml-1">· 이전 평균 <b className="text-foreground">{s.prevAvg}</b></span>}
                                </div>
                              </div>
                            </label>
                          </div>

                          {/* Row 2: understanding + homework */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-muted-foreground w-10 shrink-0">이해도</span>
                              <div className="flex gap-1 flex-1">
                                {[1, 2, 3, 4, 5].map(n => {
                                  const active = s.understanding === n;
                                  const c = UNDERSTANDING_COLORS[n];
                                  return (
                                    <button key={n} type="button" disabled={!s.included}
                                      onClick={() => updateStudent(s.id, 'understanding', n)}
                                      className={`h-8 flex-1 rounded-md border text-sm font-bold transition ${active ? c.active : `${c.dim} border-border bg-background`}`}>
                                      {n}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-muted-foreground w-10 shrink-0">숙제</span>
                              <div className="flex gap-1 flex-1">
                                {HW_OPTIONS.map(o => {
                                  const active = s.homework === o.v;
                                  return (
                                    <button key={o.v} type="button" disabled={!s.included}
                                      onClick={() => updateStudent(s.id, 'homework', o.v)}
                                      className={`h-8 flex-1 rounded-md border text-xs font-semibold transition ${active ? o.cls : `${o.dim} bg-background`}`}>
                                      {o.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Row 3: lesson types + attendance status */}
                          {s.included && (
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-medium text-muted-foreground w-10 shrink-0">수업</span>
                                <div className="flex gap-1 flex-wrap">
                                  {LESSON_TYPES.map(lt => {
                                    const on = s.lessonTypes.includes(lt);
                                    return (
                                      <button key={lt} type="button"
                                        onClick={() => updateStudent(s.id, 'lessonTypes',
                                          on ? s.lessonTypes.filter(x => x !== lt) : [...s.lessonTypes, lt])}
                                        className={`px-2 py-1 rounded-md border text-[11px] font-medium transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted bg-background'}`}>
                                        {lt}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap md:justify-end">
                                <span className="text-[11px] font-medium text-muted-foreground shrink-0">출결</span>
                                <div className="flex gap-1 flex-wrap">
                                  {ATTENDANCE_STATUSES.map(at => {
                                    const on = s.attendanceStatuses.includes(at);
                                    return (
                                      <button key={at} type="button"
                                        onClick={() => updateStudent(s.id, 'attendanceStatuses',
                                          on ? s.attendanceStatuses.filter(x => x !== at) : [at])}
                                        className={`px-2 py-1 rounded-md border text-[11px] font-semibold transition ${on ? ATTENDANCE_COLOR[at] : 'border-border text-muted-foreground hover:bg-muted bg-background'}`}>
                                        {at}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Row 4: prev HW hint + note */}
                          {s.prevHwContent && (
                            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1 mb-2">
                              <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                              <span className="font-medium">이전 숙제:</span>
                              <span className="truncate" title={s.prevHwContent}>{s.prevHwContent}</span>
                            </div>
                          )}
                          <Input value={s.note} onChange={e => updateStudent(s.id, 'note', e.target.value)}
                            disabled={!s.included}
                            placeholder="이 학생만 코멘트 (선택)" className="h-8 text-sm" />

                          {(s.showOverride || s.individualProgress) && s.included && (
                            <div className="mt-2">
                              <Input value={s.individualProgress}
                                onChange={e => updateStudent(s.id, 'individualProgress', e.target.value)}
                                placeholder="이 학생만의 개별 진도 (비우면 그룹 공통 진도 사용)"
                                className="h-9 text-sm border-primary/50 focus-visible:border-primary" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })
      )}

      {students.length > 0 && (
        <div className="sticky bottom-2 flex gap-2 justify-end bg-background/80 backdrop-blur p-2 rounded-lg border">
          <Button variant="outline" onClick={() => save(false)} disabled={saving} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            임시저장
          </Button>
          <Button onClick={() => save(true)} disabled={saving} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            {selectedCount}명 제출
          </Button>
        </div>
      )}
    </div>
  );
}

export default function QuickLessonEntryPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <QuickLessonEntryContent />
    </ProtectedRoute>
  );
}
