// NEW-LESSON-ENTRY-V1: Choose individual or batch lesson record creation
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAssistant as checkIsAssistant } from '@/lib/auth';
import { useTeachersList } from './useTeachersList';
import { fetchStudentsByIds, fetchTeacherStudentIds, groupStudentsByGrade, getStudentGroupLabel } from './studentSelection';
import { getTodayKST } from '@/lib/utils';
import { User, Users, Search, Loader2, CheckCircle2, UserCheck, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SUBJECTS = ['수학', '영어', '과학', '국어'] as const;

interface StudentItem {
  id: string;
  name: string;
  school: string | null;
  school_level: string | null;
  grade_year: number | null;
  selected: boolean;
}

interface NewLessonEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndividual: () => void;
  onBatchCreate: (studentIds: string[], subject: string, date: string, teacherId: string) => void;
}

export function NewLessonEntryDialog({ open, onOpenChange, onIndividual, onBatchCreate }: NewLessonEntryDialogProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAssistant = checkIsAssistant(role);
  const { teachers } = useTeachersList();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'choose' | 'batch'>('choose');
  const [teacherId, setTeacherId] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(getTodayKST());
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open) {
      setMode('choose');
      setTeacherId('');
      setSubject('');
      setDate(getTodayKST());
      setStudents([]);
      setSearchQuery('');
    }
  }, [open]);

  const effectiveTeacherId = isAssistant ? teacherId : (user?.id || '');

  const fetchStudentList = useCallback(async () => {
    if (!effectiveTeacherId || !subject) { setStudents([]); return; }
    setLoading(true);
    try {
      const ids = await fetchTeacherStudentIds(effectiveTeacherId, subject);
      const list = await fetchStudentsByIds(ids);
      setStudents(list.map(s => ({ ...s, selected: true })));
    } catch {
      setStudents([]);
      toast({ title: '학생 목록 로딩 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [effectiveTeacherId, subject, toast]);

  useEffect(() => {
    if (mode === 'batch' && effectiveTeacherId && subject) {
      fetchStudentList();
    }
  }, [mode, effectiveTeacherId, subject, fetchStudentList]);

  function toggleStudent(idx: number) {
    setStudents(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
  }

  function selectAll(checked: boolean) {
    setStudents(prev => prev.map(s => ({ ...s, selected: checked })));
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.school || '').toLowerCase().includes(q) ||
      `${s.school_level || ''}${s.grade_year ?? ''}`.includes(q)
    );
  }, [students, searchQuery]);

  const selectedCount = students.filter(s => s.selected).length;
  const grouped = groupStudentsByGrade(filtered);

  async function handleBatchCreate() {
    const selectedStudents = students.filter(s => s.selected);
    if (selectedStudents.length === 0) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' });
      return;
    }
    if (!effectiveTeacherId) {
      toast({ title: '담당 선생님을 선택해주세요', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      // Check for existing records
      const { data: existing } = await supabase
        .from('lesson_records')
        .select('student_id')
        .eq('lesson_date', date)
        .eq('subject', subject as any)
        .eq('teacher_id', effectiveTeacherId)
        .in('student_id', selectedStudents.map(s => s.id));

      const existingIds = new Set((existing || []).map(r => r.student_id));
      const newStudents = selectedStudents.filter(s => !existingIds.has(s.id));

      if (newStudents.length > 0) {
        const records = newStudents.map(s => ({
          student_id: s.id,
          teacher_id: effectiveTeacherId,
          lesson_date: date,
          subject: subject as any,
          lesson_range: '',
          homework_status: 'none_assigned',
          submitted: false,
          understanding_score: null,
        }));

        const { error } = await supabase.from('lesson_records').insert(records);
        if (error) throw error;
      }

      const createdCount = newStudents.length;
      const skippedCount = existingIds.size;

      toast({
        title: '수업일지 일괄 생성 완료',
        description: `${createdCount}명 생성${skippedCount > 0 ? `, ${skippedCount}명 이미 존재` : ''}`,
      });

      onBatchCreate(
        selectedStudents.map(s => s.id),
        subject,
        date,
        effectiveTeacherId
      );
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: '생성 실패', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  const teacherName = teachers.find(t => t.id === (isAssistant ? teacherId : user?.id))?.full_name || '';

  if (mode === 'choose') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">수업기록 생성 방식</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2 hover:border-primary hover:bg-primary/5"
              onClick={() => { onOpenChange(false); onIndividual(); }}
            >
              <User className="w-6 h-6 text-primary" />
              <div className="text-center">
                <p className="font-semibold text-sm">개별 생성</p>
                <p className="text-xs text-muted-foreground">학생 한 명의 수업일지를 작성합니다</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2 hover:border-primary hover:bg-primary/5"
              onClick={() => setMode('batch')}
            >
              <Users className="w-6 h-6 text-primary" />
              <div className="text-center">
                <p className="font-semibold text-sm">일괄 생성</p>
                <p className="text-xs text-muted-foreground">여러 학생의 수업일지를 한 번에 생성합니다</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b bg-primary/5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="w-5 h-5 text-primary" />
            수업일지 일괄 생성
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 px-5 py-4">
          {/* Teacher + Subject + Date */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> 담당선생님 · 과목 · 날짜
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">담당 선생님 <span className="text-destructive">*</span></Label>
                  {isAssistant ? (
                    <Select value={teacherId} onValueChange={setTeacherId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-9 flex items-center px-3 rounded-md border bg-muted/50 text-sm">
                      {teacherName || '본인'}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">과목 <span className="text-destructive">*</span></Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="과목 선택" /></SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">수업 날짜</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Student Selection */}
          {effectiveTeacherId && subject && (
            <Card className="border-muted">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">학생 선택</p>
                  {teacherName && (
                    <Badge variant="outline" className="text-[10px]">
                      {teacherName} · {subject}
                    </Badge>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="이름/학교/학년 검색" className="pl-8 h-8 text-xs" />
                </div>

                {students.length > 0 && (
                  <div className="flex items-center justify-between py-1 border-b pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={selectedCount === students.length && students.length > 0} onCheckedChange={checked => selectAll(!!checked)} />
                      <span className="text-xs text-muted-foreground">전체 선택 ({selectedCount}/{students.length})</span>
                    </label>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> 학생 로딩 중...
                  </div>
                ) : students.length === 0 && effectiveTeacherId && subject ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    해당 선생님/과목의 학생이 없습니다
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {grouped.map(([groupKey, groupStudents]) => (
                      <div key={groupKey}>
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1 sticky top-0 bg-background py-0.5">
                          {getStudentGroupLabel(groupKey)} ({groupStudents.length}명)
                        </p>
                        {groupStudents.map(student => {
                          const realIdx = students.findIndex(s => s.id === student.id);
                          return (
                            <label key={student.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer">
                              <Checkbox
                                checked={student.selected}
                                onCheckedChange={() => toggleStudent(realIdx)}
                              />
                              <span className="text-sm">{student.name}</span>
                              {student.school && (
                                <span className="text-[10px] text-muted-foreground ml-auto">{student.school}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setMode('choose')}>뒤로</Button>
          <Button
            size="sm"
            onClick={handleBatchCreate}
            disabled={creating || selectedCount === 0 || !subject || !effectiveTeacherId}
          >
            {creating ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 생성 중...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-1" /> {selectedCount}명 일괄 생성</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
