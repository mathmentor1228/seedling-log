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
  { v: 'completed', label: '완료', color: 'text-emerald-600' },
  { v: 'partial', label: '부분', color: 'text-amber-600' },
  { v: 'not_done', label: '미완', color: 'text-red-600' },
  { v: 'none_assigned', label: '없음', color: 'text-muted-foreground' },
] as const;

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
}

interface GroupState {
  key: string;
  label: string;
  studentIds: string[];
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

      // 2. Attendance for the date — intersection
      const { data: attRows } = await supabase
        .from('attendance_logs')
        .select('student_id')
        .eq('date', date)
        .in('student_id', teacherIds);
      const attendedIds = new Set<string>((attRows || []).map((r: any) => r.student_id).filter(Boolean));
      const finalIds = teacherIds.filter(id => attendedIds.has(id));

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
        return {
          ...s,
          included: true,
          understanding: avg ?? 3,
          homework: hw ? 'completed' : 'none_assigned',
          note: '',
          prevAvg: avg,
          prevHwContent: hw?.content || null,
          prevHwId: hw?.id || null,
          individualProgress: '',
          showOverride: false,
        };
      });

      setStudents(rows);

      // Build groups by school_level + grade
      const grouped = groupStudentsByGrade(rows);
      setGroups(grouped.map(([key, gs]) => ({
        key,
        label: getStudentGroupLabel(key),
        studentIds: gs.map(g => g.id),
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

    // Validate each included student has some progress
    for (const s of targets) {
      const g = groupByStudent.get(s.id);
      const progress = s.individualProgress.trim() || g?.lessonRange.trim() || '';
      if (!progress) {
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
      for (const s of targets) {
        const g = groupByStudent.get(s.id);
        const lessonRange = s.individualProgress.trim() || g?.lessonRange || '';
        const homeworkAssigned = g?.homeworkAssigned || null;
        const payload: any = {
          lesson_range: lessonRange,
          understanding_score: s.understanding,
          homework_status: s.homework,
          notes: s.note || null,
          next_lesson_goal: homeworkAssigned,
          is_common_entry: !s.individualProgress.trim(),
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
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from('lesson_records').insert(inserts);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await supabase.from('lesson_records').update(u.payload).eq('id', u.id);
        if (error) throw error;
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
          <div className="flex items-end">
            <Badge variant="outline" className="text-xs h-9 px-3 flex items-center">
              출석 {selectedCount}/{students.length}명
            </Badge>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 출석/학생 로딩...
        </CardContent></Card>
      ) : students.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          이 날짜의 출석 학생이 없습니다. (출석체크 또는 날짜를 확인해주세요)
        </CardContent></Card>
      ) : (
        groups.map((g, gi) => {
          const groupStudents = students.filter(s => g.studentIds.includes(s.id));
          return (
            <Card key={g.key} className="border-primary/20">
              <Collapsible open={!g.collapsed} onOpenChange={(o) => updateGroup(gi, 'collapsed', !o)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <CollapsibleTrigger className="flex items-center gap-2">
                      {g.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span>{g.label}</span>
                      <Badge variant="secondary" className="text-[10px]">{groupStudents.length}명</Badge>
                    </CollapsibleTrigger>
                    <Button size="sm" variant="ghost" onClick={() => prefillGroupFromLast(gi)} className="h-7 text-xs">
                      <History className="w-3 h-3 mr-1" /> 이전 회차
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-3">
                    {/* Group common fields */}
                    <div className="bg-muted/30 p-2 rounded-md space-y-2">
                      <div>
                        <Label className="text-xs">그룹 공통 진도 <span className="text-muted-foreground">(개별 진도 미입력시 적용)</span></Label>
                        <Textarea value={g.lessonRange} onChange={e => updateGroup(gi, 'lessonRange', e.target.value)}
                          rows={2} placeholder="예) 일차함수의 그래프" className="text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">오늘 부여한 과제 (선택)</Label>
                        <Input value={g.homeworkAssigned} onChange={e => updateGroup(gi, 'homeworkAssigned', e.target.value)}
                          placeholder="예) 교재 p.34-37" className="h-8 text-sm" />
                      </div>
                      <div className="flex gap-2 items-end flex-wrap">
                        <div>
                          <Label className="text-xs">기본 이해도</Label>
                          <div className="flex gap-0.5 mt-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <Button key={n} size="sm" variant={g.defaultUnderstanding === n ? 'default' : 'outline'}
                                onClick={() => updateGroup(gi, 'defaultUnderstanding', n)} className="h-7 w-7 p-0 text-xs">{n}</Button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">기본 숙제</Label>
                          <div className="flex gap-0.5 mt-1">
                            {HW_OPTIONS.map(o => (
                              <Button key={o.v} size="sm" variant={g.defaultHw === o.v ? 'default' : 'outline'}
                                onClick={() => updateGroup(gi, 'defaultHw', o.v)} className="h-7 px-1.5 text-[10px]">{o.label}</Button>
                            ))}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => applyGroupDefaults(gi)} className="h-7 text-xs">
                          그룹 일괄 적용
                        </Button>
                      </div>
                    </div>

                    {/* Per-student rows */}
                    <div className="divide-y">
                      {groupStudents.map(s => (
                        <div key={s.id} className={`py-2 space-y-1.5 ${!s.included ? 'opacity-50' : ''}`}>
                          <div className="grid grid-cols-12 gap-2 items-center text-sm">
                            <label className="col-span-3 flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={s.included}
                                onChange={e => updateStudent(s.id, 'included', e.target.checked)} className="rounded" />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{s.name}</div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {s.school || ''} {s.prevAvg != null && <span>· 평균 {s.prevAvg}</span>}
                                </div>
                              </div>
                            </label>
                            <div className="col-span-3 flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(n => (
                                <Button key={n} size="sm" variant={s.understanding === n ? 'default' : 'ghost'}
                                  disabled={!s.included}
                                  onClick={() => updateStudent(s.id, 'understanding', n)}
                                  className="h-7 w-7 p-0 text-xs">{n}</Button>
                              ))}
                            </div>
                            <div className="col-span-3 flex flex-col gap-0.5">
                              <div className="flex gap-0.5">
                                {HW_OPTIONS.map(o => (
                                  <Button key={o.v} size="sm" variant={s.homework === o.v ? 'default' : 'ghost'}
                                    disabled={!s.included}
                                    onClick={() => updateStudent(s.id, 'homework', o.v)}
                                    className="h-7 px-1.5 text-[10px]">{o.label}</Button>
                                ))}
                              </div>
                              {s.prevHwContent && (
                                <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
                                  <BookOpen className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span className="truncate" title={s.prevHwContent}>{s.prevHwContent}</span>
                                </div>
                              )}
                            </div>
                            <div className="col-span-2">
                              <Input value={s.note} onChange={e => updateStudent(s.id, 'note', e.target.value)}
                                disabled={!s.included}
                                placeholder="코멘트" className="h-7 text-xs" />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <Button size="sm" variant={s.showOverride || s.individualProgress ? 'default' : 'ghost'}
                                onClick={() => updateStudent(s.id, 'showOverride', !s.showOverride)}
                                disabled={!s.included}
                                className="h-7 px-1.5 text-[10px]" title="개별 진도 override">
                                <PenLine className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          {(s.showOverride || s.individualProgress) && s.included && (
                            <div className="pl-6">
                              <Input value={s.individualProgress}
                                onChange={e => updateStudent(s.id, 'individualProgress', e.target.value)}
                                placeholder="이 학생만의 개별 진도 (비우면 그룹 공통 진도 사용)"
                                className="h-8 text-xs" />
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
