// QUICK-LESSON-ENTRY-V1: Single-step batch lesson entry — common fields + per-student fast row.
// Picks teacher + subject + date, loads students, applies common values once, and
// optionally overrides understanding / homework / comment per student. Saves all in
// one DB write — no draft-then-edit flow.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAssistant as checkIsAssistant } from '@/lib/auth';
import { useTeachersList } from '@/components/lessons/useTeachersList';
import { fetchStudentsByIds, fetchTeacherStudentIds, sortStudents } from '@/components/lessons/studentSelection';
import { getTodayKST } from '@/lib/utils';
import { ArrowLeft, Loader2, CheckCircle2, Clock, XCircle, History, Zap, Send, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SUBJECTS = ['수학', '영어', '과학', '국어'] as const;
const HW_OPTIONS = [
  { v: 'completed', label: '완료', icon: CheckCircle2, color: 'text-emerald-600' },
  { v: 'partial', label: '부분', icon: Clock, color: 'text-amber-600' },
  { v: 'not_done', label: '미완', icon: XCircle, color: 'text-red-600' },
  { v: 'none_assigned', label: '없음', icon: null, color: 'text-muted-foreground' },
];

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

  const [lessonRange, setLessonRange] = useState('');
  const [homeworkAssigned, setHomeworkAssigned] = useState('');
  const [defaultUnderstanding, setDefaultUnderstanding] = useState(3);
  const [defaultHw, setDefaultHw] = useState('none_assigned');

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prevLoading, setPrevLoading] = useState(false);

  const effectiveTeacherId = isAssistant ? teacherId : (user?.id || '');

  const loadStudents = useCallback(async () => {
    if (!effectiveTeacherId || !subject) { setStudents([]); return; }
    setLoading(true);
    try {
      const ids = await fetchTeacherStudentIds(effectiveTeacherId, subject);
      const list = await fetchStudentsByIds(ids);

      // Fetch previous avg understanding (last 5 lessons per student)
      const { data: prev } = await supabase
        .from('lesson_records')
        .select('student_id, understanding_score')
        .eq('teacher_id', effectiveTeacherId)
        .eq('subject', subject as any)
        .not('understanding_score', 'is', null)
        .order('lesson_date', { ascending: false })
        .limit(500);
      const avgMap = new Map<string, { sum: number; n: number }>();
      for (const r of (prev || []) as any[]) {
        const cur = avgMap.get(r.student_id) || { sum: 0, n: 0 };
        cur.sum += r.understanding_score;
        cur.n += 1;
        avgMap.set(r.student_id, cur);
      }

      setStudents(sortStudents(list).map(s => {
        const a = avgMap.get(s.id);
        const avg = a ? Math.round(a.sum / a.n) : null;
        return {
          ...s,
          included: true,
          understanding: avg ?? 3,
          homework: 'none_assigned',
          note: '',
          prevAvg: avg,
        };
      }));
    } catch (e: any) {
      toast({ title: '학생 로드 실패', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [effectiveTeacherId, subject, toast]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Prefill common fields from previous lesson by same teacher/subject
  async function prefillFromLastLesson() {
    if (!effectiveTeacherId) return;
    setPrevLoading(true);
    try {
      const { data } = await supabase
        .from('lesson_records')
        .select('lesson_range, next_lesson_goal')
        .eq('teacher_id', effectiveTeacherId)
        .eq('subject', subject as any)
        .order('lesson_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        // Suggest: today's range = previous "next_lesson_goal" or just previous range
        const suggested = data.next_lesson_goal || data.lesson_range || '';
        if (suggested) setLessonRange(suggested);
        toast({ title: '이전 회차 진도를 자동 채움', description: suggested ? `"${suggested.slice(0, 30)}..."` : '데이터 없음' });
      } else {
        toast({ title: '이전 회차 기록이 없습니다' });
      }
    } finally {
      setPrevLoading(false);
    }
  }

  function applyCommonToAll() {
    setStudents(prev => prev.map(s => ({
      ...s,
      understanding: defaultUnderstanding,
      homework: defaultHw,
    })));
    toast({ title: `이해도 ${defaultUnderstanding} / 숙제 일괄 적용` });
  }

  function updateStudent<K extends keyof StudentRow>(idx: number, key: K, value: StudentRow[K]) {
    setStudents(prev => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }

  const selectedCount = useMemo(() => students.filter(s => s.included).length, [students]);

  async function save(submit: boolean) {
    if (!effectiveTeacherId) { toast({ title: '선생님을 선택해주세요', variant: 'destructive' }); return; }
    if (!lessonRange.trim()) { toast({ title: '수업 내용(진도)을 입력해주세요', variant: 'destructive' }); return; }
    const targets = students.filter(s => s.included);
    if (targets.length === 0) { toast({ title: '학생을 1명 이상 선택해주세요', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      // Check existing records — upsert by (teacher,student,date,subject)
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
        const payload: any = {
          lesson_range: lessonRange,
          understanding_score: s.understanding,
          homework_status: s.homework,
          notes: s.note || null,
          next_lesson_goal: homeworkAssigned || null,
          is_common_entry: true,
          submitted: submit,
          submitted_at: submit ? new Date().toISOString() : null,
        };
        const existId = existingMap.get(s.id);
        if (existId) {
          updates.push({ id: existId, payload });
        } else {
          inserts.push({
            teacher_id: effectiveTeacherId,
            student_id: s.id,
            lesson_date: date,
            subject: subject as any,
            ...payload,
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
              포함 {selectedCount}/{students.length}명
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Common fields */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>공통란 (모든 학생에 적용)</span>
            <Button size="sm" variant="ghost" onClick={prefillFromLastLesson} disabled={prevLoading} className="h-7 text-xs">
              {prevLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <History className="w-3 h-3 mr-1" />}
              이전 회차에서 가져오기
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">진도 / 수업 내용 <span className="text-destructive">*</span></Label>
            <Textarea value={lessonRange} onChange={e => setLessonRange(e.target.value)} rows={2}
              placeholder="예) 함수 단원 - 일차함수의 그래프" />
          </div>
          <div>
            <Label className="text-xs">오늘 부여한 과제 / 다음 수업 목표 (선택)</Label>
            <Input value={homeworkAssigned} onChange={e => setHomeworkAssigned(e.target.value)}
              placeholder="예) 교재 p.34-37 풀이 + 오답노트" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs">기본 이해도 (1-5)</Label>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <Button key={n} size="sm" variant={defaultUnderstanding === n ? 'default' : 'outline'}
                    onClick={() => setDefaultUnderstanding(n)} className="h-8 w-8 p-0">{n}</Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">기본 숙제 상태</Label>
              <div className="flex gap-1 mt-1">
                {HW_OPTIONS.map(o => (
                  <Button key={o.v} size="sm" variant={defaultHw === o.v ? 'default' : 'outline'}
                    onClick={() => setDefaultHw(o.v)} className="h-8 px-2 text-xs">
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={applyCommonToAll} className="h-8">
              전체 학생에 일괄 적용
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-student grid */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">학생별 빠른 평가</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 학생 로딩...
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">담당 학생이 없습니다.</div>
          ) : (
            <div className="divide-y">
              {students.map((s, idx) => (
                <div key={s.id} className={`p-2 grid grid-cols-12 gap-2 items-center text-sm ${!s.included ? 'opacity-50' : ''}`}>
                  <label className="col-span-3 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={s.included}
                      onChange={e => updateStudent(idx, 'included', e.target.checked)} className="rounded" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {s.school || ''} {s.school_level}{s.grade_year ?? ''}
                        {s.prevAvg != null && <span className="ml-1">· 평균 {s.prevAvg}</span>}
                      </div>
                    </div>
                  </label>
                  <div className="col-span-3 flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Button key={n} size="sm" variant={s.understanding === n ? 'default' : 'ghost'}
                        disabled={!s.included}
                        onClick={() => updateStudent(idx, 'understanding', n)}
                        className="h-7 w-7 p-0 text-xs">{n}</Button>
                    ))}
                  </div>
                  <div className="col-span-3 flex gap-0.5">
                    {HW_OPTIONS.map(o => (
                      <Button key={o.v} size="sm" variant={s.homework === o.v ? 'default' : 'ghost'}
                        disabled={!s.included}
                        onClick={() => updateStudent(idx, 'homework', o.v)}
                        className="h-7 px-1.5 text-[10px]">{o.label}</Button>
                    ))}
                  </div>
                  <div className="col-span-3">
                    <Input value={s.note} onChange={e => updateStudent(idx, 'note', e.target.value)}
                      disabled={!s.included}
                      placeholder="짧은 코멘트 (선택)" className="h-7 text-xs" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
