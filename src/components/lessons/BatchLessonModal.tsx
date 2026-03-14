import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin as checkIsAdmin } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { getTodayKST } from '@/lib/utils';
import { Users, Plus, Save, Send, Loader2, Trash2, Search, CheckSquare } from 'lucide-react';

type SubjectType = '수학' | '과학' | '영어' | '국어';

interface StudentItem {
  id: string;
  name: string;
  grade?: string | null;
}

interface ClassItem {
  id: string;
  name: string;
  subject: string;
  students?: StudentItem[];
}

interface HomeworkItem {
  tempId: string;
  content: string;
  homework_type: string;
}

interface BatchLessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const SUBJECTS: SubjectType[] = ['수학', '영어', '국어', '과학'];

const HOMEWORK_STATUS_OPTIONS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '일부완료' },
  { value: 'not_done', label: '미이행' },
  { value: 'none_assigned', label: '없음' },
];

export function BatchLessonModal({ open, onOpenChange, onSaved }: BatchLessonModalProps) {
  const { user, role } = useAuth();
  const isAdmin = checkIsAdmin(role);
  const { toast } = useToast();

  // Selection state
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classStudents, setClassStudents] = useState<StudentItem[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [allStudents, setAllStudents] = useState<StudentItem[]>([]);
  const [manualMode, setManualMode] = useState(false);

  // Lesson data
  const [subject, setSubject] = useState<SubjectType>('수학');
  const [lessonDate, setLessonDate] = useState(getTodayKST());
  const [lessonRange, setLessonRange] = useState('');
  const [understandingScore, setUnderstandingScore] = useState<number>(3);
  const [homeworkStatus, setHomeworkStatus] = useState('none_assigned');
  const [notes, setNotes] = useState('');
  const [nextLessonGoal, setNextLessonGoal] = useState('');
  const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassStudents(selectedClassId);
      // Auto-set subject from class
      const cls = classes.find(c => c.id === selectedClassId);
      if (cls) setSubject(cls.subject as SubjectType);
    } else {
      setClassStudents([]);
    }
  }, [selectedClassId]);

  function resetForm() {
    setSelectedClassId('');
    setSelectedStudentIds(new Set());
    setStudentSearch('');
    setManualMode(false);
    setSubject('수학');
    setLessonDate(getTodayKST());
    setLessonRange('');
    setUnderstandingScore(3);
    setHomeworkStatus('none_assigned');
    setNotes('');
    setNextLessonGoal('');
    setHomeworkItems([]);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const [classesRes, studentsRes] = await Promise.all([
        supabase.from('classes').select('id, name, subject').order('name'),
        supabase.from('students').select('id, name, grade').neq('enrollment_status', '퇴원').order('name'),
      ]);
      setClasses(classesRes.data || []);
      setAllStudents(studentsRes.data || []);
    } catch (err) {
      console.error('BatchLessonModal fetchData error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchClassStudents(classId: string) {
    const { data } = await supabase
      .from('class_students')
      .select('student_id, students:student_id!inner(id, name, grade)')
      .eq('class_id', classId)
      .neq('students.enrollment_status', '퇴원');

    const students: StudentItem[] = (data || []).map((cs: any) => ({
      id: cs.students.id,
      name: cs.students.name,
      grade: cs.students.grade,
    }));
    setClassStudents(students);
    // Auto-select all students
    setSelectedStudentIds(new Set(students.map(s => s.id)));
  }

  function toggleStudent(id: string) {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(students: StudentItem[]) {
    setSelectedStudentIds(new Set(students.map(s => s.id)));
  }

  function deselectAll() {
    setSelectedStudentIds(new Set());
  }

  function addHomework() {
    setHomeworkItems(prev => [...prev, { tempId: crypto.randomUUID(), content: '', homework_type: 'daily' }]);
  }

  function removeHomework(tempId: string) {
    setHomeworkItems(prev => prev.filter(h => h.tempId !== tempId));
  }

  function updateHomework(tempId: string, field: keyof HomeworkItem, value: string) {
    setHomeworkItems(prev => prev.map(h => h.tempId === tempId ? { ...h, [field]: value } : h));
  }

  const displayStudents = manualMode
    ? allStudents.filter(s => {
        if (!studentSearch) return false;
        return s.name.toLowerCase().includes(studentSearch.toLowerCase());
      })
    : classStudents;

  async function handleSave(submit: boolean) {
    if (selectedStudentIds.size === 0) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' });
      return;
    }
    if (!lessonRange.trim()) {
      toast({ title: '수업 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    submit ? setSubmitting(true) : setSaving(true);

    try {
      const studentIds = Array.from(selectedStudentIds);
      const now = new Date().toISOString();

      // Create lesson records for each student
      const records = studentIds.map(studentId => ({
        student_id: studentId,
        class_id: selectedClassId || null,
        subject: subject as SubjectType,
        lesson_date: lessonDate,
        lesson_range: lessonRange.trim(),
        understanding_score: understandingScore,
        homework_status: homeworkStatus,
        notes: notes.trim() || null,
        next_lesson_goal: nextLessonGoal.trim() || null,
        teacher_id: user!.id,
        submitted: submit,
        submitted_at: submit ? now : null,
        draft_created_at: now,
      }));

      const { data: insertedRecords, error: insertError } = await supabase
        .from('lesson_records')
        .insert(records)
        .select('id, student_id');

      if (insertError) throw insertError;

      // Create homework assignments if any
      if (homeworkItems.length > 0 && insertedRecords) {
        const hwAssignments = insertedRecords.flatMap(record =>
          homeworkItems
            .filter(hw => hw.content.trim())
            .map(hw => ({
              student_id: record.student_id,
              subject: subject as SubjectType,
              lesson_record_id: record.id,
              assigned_date: lessonDate,
              content: hw.content.trim(),
              homework_type: hw.homework_type,
              check_status: 'unchecked' as const,
              created_by: user!.id,
            }))
        );

        if (hwAssignments.length > 0) {
          const { error: hwError } = await supabase
            .from('homework_assignments')
            .insert(hwAssignments);
          if (hwError) throw hwError;
        }
      }

      toast({
        title: submit ? '일괄 제출 완료' : '일괄 저장 완료',
        description: `${studentIds.length}명의 수업일지가 ${submit ? '제출' : '저장'}되었습니다.`,
      });

      onSaved?.();
      if (submit) onOpenChange(false);
    } catch (err: any) {
      console.error('BatchLessonModal save error:', err);
      toast({
        title: '저장 실패',
        description: err.message || '수업일지 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0 bg-primary/5">
          <DialogTitle className="text-base font-bold tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            일괄 수업일지 작성
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            여러 학생을 선택하여 동일한 수업 내용과 숙제를 한번에 입력합니다.
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-5 pb-5 pt-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Step 1: Student Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
                    학생 선택
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={!manualMode ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setManualMode(false); setSelectedStudentIds(new Set()); }}
                    >
                      반 선택
                    </Button>
                    <Button
                      variant={manualMode ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setManualMode(true); setSelectedClassId(''); setSelectedStudentIds(new Set()); }}
                    >
                      직접 선택
                    </Button>
                  </div>
                </div>

                {!manualMode ? (
                  <div className="space-y-2">
                    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="반을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.subject})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      placeholder="학생 이름 검색..."
                      className="pl-9 h-9"
                    />
                  </div>
                )}

                {displayStudents.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                      <span className="text-xs font-medium text-muted-foreground">
                        {selectedStudentIds.size}명 선택됨
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => selectAll(displayStudents)}>
                          <CheckSquare className="w-3 h-3 mr-1" />전체선택
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={deselectAll}>
                          해제
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-border">
                      {displayStudents.map(student => (
                        <label
                          key={student.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selectedStudentIds.has(student.id)}
                            onCheckedChange={() => toggleStudent(student.id)}
                          />
                          <span className="text-sm font-medium">{student.name}</span>
                          {student.grade && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{student.grade}</Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Lesson Info */}
              <div className="space-y-3 pt-2 border-t">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
                  수업 정보
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">과목</Label>
                    <Select value={subject} onValueChange={v => setSubject(v as SubjectType)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">수업일</Label>
                    <Input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)} className="h-9" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">수업 내용 <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={lessonRange}
                    onChange={e => setLessonRange(e.target.value)}
                    placeholder="예: 미적분 - 도함수의 활용 (증가·감소, 극값)"
                    className="min-h-[60px] resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">이해도</Label>
                    <div className="flex items-center gap-1 pt-1">
                      {[1, 2, 3, 4, 5].map(score => (
                        <button
                          key={score}
                          onClick={() => setUnderstandingScore(score)}
                          className={`transition-transform hover:scale-110 ${understandingScore === score ? 'ring-2 ring-primary ring-offset-1 rounded-full' : 'opacity-40'}`}
                        >
                          <ScoreBadge score={score} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">숙제 상태</Label>
                    <Select value={homeworkStatus} onValueChange={setHomeworkStatus}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOMEWORK_STATUS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">비고 / 메모</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="수업 중 특이사항..."
                    className="min-h-[50px] resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">다음 수업 목표</Label>
                  <Input
                    value={nextLessonGoal}
                    onChange={e => setNextLessonGoal(e.target.value)}
                    placeholder="다음 시간 진도 계획..."
                    className="h-9"
                  />
                </div>
              </div>

              {/* Step 3: Homework */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
                    숙제 배정
                  </h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addHomework}>
                    <Plus className="w-3 h-3" /> 숙제 추가
                  </Button>
                </div>

                {homeworkItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">배정할 숙제가 없습니다. 필요 시 '숙제 추가' 버튼을 누르세요.</p>
                ) : (
                  <div className="space-y-2">
                    {homeworkItems.map((hw, idx) => (
                      <div key={hw.tempId} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">숙제 {idx + 1}</Badge>
                            <Select
                              value={hw.homework_type}
                              onValueChange={v => updateHomework(hw.tempId, 'homework_type', v)}
                            >
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="daily">일일</SelectItem>
                                <SelectItem value="weekly">주간</SelectItem>
                                <SelectItem value="long_term">장기</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            value={hw.content}
                            onChange={e => updateHomework(hw.tempId, 'content', e.target.value)}
                            placeholder="숙제 내용을 입력하세요"
                            className="h-8 text-sm"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive shrink-0 mt-1"
                          onClick={() => removeHomework(hw.tempId)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary */}
              {selectedStudentIds.size > 0 && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <p className="text-sm font-medium text-foreground">
                    📋 <strong>{selectedStudentIds.size}명</strong>의 학생에게 동일한 수업일지가 생성됩니다.
                  </p>
                  {homeworkItems.filter(h => h.content.trim()).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      + 숙제 {homeworkItems.filter(h => h.content.trim()).length}건이 각 학생에게 배정됩니다.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave(false)}
              disabled={saving || submitting || selectedStudentIds.size === 0}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              임시저장
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave(true)}
              disabled={saving || submitting || selectedStudentIds.size === 0}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              일괄 제출 ({selectedStudentIds.size}명)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
