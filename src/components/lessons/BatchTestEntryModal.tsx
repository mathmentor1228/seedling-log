// BATCH-TEST-ENTRY-V2: Standalone batch test input with subject-based student filtering + school/grade grouping
// Supports assistant role with teacher selector, creates lesson_records if needed
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAssistant as checkIsAssistant } from '@/lib/auth';
import { CheckCircle2, XCircle, Minus, Loader2, Users } from 'lucide-react';
import { ASSISTANTS } from './constants';
import { useTeachersList } from './useTeachersList';
import { getTodayKST } from '@/lib/utils';

interface StudentEntry {
  student_id: string;
  student_name: string;
  school_name: string;
  school_level: string;
  grade_year: number | null;
  selected: boolean;
  test_result_text: string;
  test_result: 'pass' | 'fail' | 'none';
}

interface BatchTestEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSubject?: string;
  defaultDate?: string;
  onSaved?: () => void;
}

const SUBJECTS = ['수학', '영어', '과학', '국어'] as const;
const SCHOOL_LEVEL_ORDER: Record<string, number> = { '초': 0, '중': 1, '고': 2 };

function groupStudents(students: StudentEntry[]) {
  const groups = new Map<string, StudentEntry[]>();
  for (const s of students) {
    const level = s.school_level || '기타';
    const grade = s.grade_year ?? 0;
    const key = `${level}${grade}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const levelA = SCHOOL_LEVEL_ORDER[a[0]] ?? 99;
    const levelB = SCHOOL_LEVEL_ORDER[b[0]] ?? 99;
    if (levelA !== levelB) return levelA - levelB;
    return a.localeCompare(b);
  });
}

function getGroupLabel(key: string) {
  if (key === '기타0') return '미분류';
  const level = key[0];
  const grade = key.slice(1);
  const levelName = level === '초' ? '초등' : level === '중' ? '중등' : level === '고' ? '고등' : level;
  return `${levelName} ${grade}학년`;
}

export function BatchTestEntryModal({
  open, onOpenChange, defaultSubject, defaultDate, onSaved,
}: BatchTestEntryModalProps) {
  const { toast } = useToast();
  const { user, role } = useAuth();
  const isAssistant = checkIsAssistant(role);
  const { teachers } = useTeachersList();
  const [subject, setSubject] = useState(defaultSubject || '');
  const [date, setDate] = useState(defaultDate || getTodayKST());
  const [testContent, setTestContent] = useState('');
  const [testAssistant, setTestAssistant] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [entries, setEntries] = useState<StudentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch students for the selected subject
  const fetchStudents = useCallback(async (subj: string) => {
    if (!subj) { setEntries([]); return; }
    setLoading(true);
    try {
      const { data: classes } = await supabase
        .from('classes')
        .select('id')
        .eq('subject', subj as any);

      if (!classes || classes.length === 0) { setEntries([]); setLoading(false); return; }

      const classIds = classes.map(c => c.id);
      const { data: classStudents } = await supabase
        .from('class_students')
        .select('student_id')
        .in('class_id', classIds);

      if (!classStudents || classStudents.length === 0) { setEntries([]); setLoading(false); return; }

      const studentIds = [...new Set(classStudents.map(cs => cs.student_id))];
      const { data: students } = await supabase
        .from('students')
        .select('id, name, school, school_level, grade_year')
        .in('id', studentIds)
        .eq('enrollment_status', '재학')
        .order('name');

      setEntries((students || []).map(s => ({
        student_id: s.id,
        student_name: s.name,
        school_name: s.school || '',
        school_level: s.school_level || '',
        grade_year: s.grade_year,
        selected: true,
        test_result_text: '',
        test_result: 'none',
      })));
    } catch {
      toast({ title: '학생 목록 로딩 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      setSubject(defaultSubject || '');
      setDate(defaultDate || getTodayKST());
      setTestContent('');
      setTestAssistant('');
      setTeacherId(isAssistant ? '' : (user?.id || ''));
      setEntries([]);
      if (defaultSubject) fetchStudents(defaultSubject);
    }
  }, [open, defaultSubject, defaultDate, fetchStudents, isAssistant, user?.id]);

  function toggleResult(idx: number) {
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const next = e.test_result === 'none' ? 'pass' : e.test_result === 'pass' ? 'fail' : 'none';
      return { ...e, test_result: next };
    }));
  }

  function toggleSelect(idx: number) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, selected: !e.selected } : e));
  }

  function selectAll(selected: boolean) {
    setEntries(prev => prev.map(e => ({ ...e, selected })));
  }

  function setAllPass() {
    setEntries(prev => prev.map(e => e.selected ? { ...e, test_result: 'pass' } : e));
  }

  async function handleSave() {
    const selected = entries.filter(e => e.selected);
    if (!testContent.trim()) {
      toast({ title: '테스트 내용을 입력해주세요', variant: 'destructive' });
      return;
    }
    if (selected.length === 0) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' });
      return;
    }

    const effectiveTeacherId = isAssistant ? teacherId : (user?.id || '');
    if (!effectiveTeacherId) {
      toast({ title: '담당 선생님을 선택해주세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Find existing lesson records for these students on this date/subject
      const { data: existingRecords } = await supabase
        .from('lesson_records')
        .select('id, student_id')
        .eq('lesson_date', date)
        .eq('subject', subject as any)
        .in('student_id', selected.map(s => s.student_id));

      const recordMap = new Map((existingRecords || []).map(r => [r.student_id, r.id]));

      // Create lesson records for students that don't have one
      const missingStudents = selected.filter(e => !recordMap.has(e.student_id));
      if (missingStudents.length > 0) {
        const newRecords = missingStudents.map(s => ({
          student_id: s.student_id,
          teacher_id: effectiveTeacherId,
          lesson_date: date,
          subject: subject as any,
          lesson_types: ['테스트'] as string[],
          understanding_score: 0,
          homework_status: 'none',
          lesson_range: '테스트',
          submitted: true,
          submitted_at: new Date().toISOString(),
          test_content: testContent,
          test_name: testContent,
          test_date: date,
          test_assistant: testAssistant || null,
        }));

        const { data: inserted, error: insertError } = await supabase
          .from('lesson_records')
          .insert(newRecords)
          .select('id, student_id');

        if (insertError) {
          console.error('Insert error:', insertError);
        } else if (inserted) {
          for (const rec of inserted) {
            recordMap.set(rec.student_id, rec.id);
          }
        }
      }

      let successCount = 0;
      const savedRecordIds: string[] = [];

      for (const entry of selected) {
        const recordId = recordMap.get(entry.student_id);
        if (!recordId) continue;

        const { error } = await supabase.rpc('update_lesson_test_fields', {
          _lesson_id: recordId,
          _test_content: testContent,
          _test_name: testContent,
          _test_result_text: entry.test_result_text || null,
          _test_result: entry.test_result,
          _test_date: date,
          _test_assistant: testAssistant || null,
        });

        if (!error) {
          successCount++;
          savedRecordIds.push(recordId);
        }
      }

      // Sync lesson_types and english_pass_fail
      if (savedRecordIds.length > 0) {
        const { data: currentRecords } = await supabase
          .from('lesson_records')
          .select('id, lesson_types, student_id')
          .in('id', savedRecordIds);

        if (currentRecords) {
          for (const rec of currentRecords) {
            const currentTypes: string[] = (rec.lesson_types as string[]) || [];
            const entry = selected.find(e => e.student_id === rec.student_id);
            const updatePayload: Record<string, any> = {};

            if (!currentTypes.includes('테스트')) {
              updatePayload.lesson_types = [...currentTypes, '테스트'];
            }
            if (subject === '영어' && entry) {
              updatePayload.english_pass_fail = entry.test_result === 'pass' ? 'pass' : entry.test_result === 'fail' ? 'fail' : null;
            }
            if (Object.keys(updatePayload).length > 0) {
              await supabase.from('lesson_records').update(updatePayload).eq('id', rec.id);
            }
          }
        }
      }

      toast({
        title: '일괄 저장 완료',
        description: `${successCount}명의 테스트 결과를 저장했습니다.`,
      });
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast({ title: '저장 실패', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = entries.filter(e => e.selected).length;
  const grouped = groupStudents(entries);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            테스트 일괄 입력
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          {/* Subject + Date */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">과목 <span className="text-destructive">*</span></Label>
              <Select value={subject} onValueChange={v => { setSubject(v); fetchStudents(v); }}>
                <SelectTrigger><SelectValue placeholder="과목 선택" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">날짜</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* Teacher selector for assistants */}
          {isAssistant && (
            <div className="space-y-1">
              <Label className="text-xs">담당 선생님 <span className="text-destructive">*</span></Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Test content + assistant */}
          <div className="space-y-2">
            <Label className="text-xs">테스트 내용/범위 <span className="text-destructive">*</span></Label>
            <Input
              value={testContent}
              onChange={e => setTestContent(e.target.value)}
              placeholder="예: 단원평가 3단원, 영단어 Day 5"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">조교</Label>
            <Select value={testAssistant} onValueChange={setTestAssistant}>
              <SelectTrigger><SelectValue placeholder="선택 (선택사항)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none_selected">선택 안함</SelectItem>
                {ASSISTANTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Bulk actions */}
          {entries.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCount === entries.length}
                  onCheckedChange={checked => selectAll(!!checked)}
                />
                <span className="text-xs text-muted-foreground">
                  전체 선택 ({selectedCount}/{entries.length})
                </span>
              </div>
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={setAllPass}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                선택 전체 통과
              </Button>
            </div>
          )}

          {/* Student list grouped by school/grade */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 학생 목록 로딩 중...
            </div>
          ) : !subject ? (
            <div className="text-center py-8 text-muted-foreground text-sm">과목을 선택해주세요</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">해당 과목 수강 학생이 없습니다</div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([groupKey, students]) => (
                <div key={groupKey}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="secondary" className="text-[11px] font-medium">
                      {getGroupLabel(groupKey)}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{students.length}명</span>
                  </div>
                  <div className="space-y-1">
                    {students.map(entry => {
                      const idx = entries.findIndex(e => e.student_id === entry.student_id);
                      return (
                        <div key={entry.student_id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20">
                          <Checkbox
                            checked={entry.selected}
                            onCheckedChange={() => toggleSelect(idx)}
                            className="shrink-0"
                          />
                          <span className="text-sm font-medium min-w-[52px] truncate">{entry.student_name}</span>
                          {entry.school_name && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">{entry.school_name}</span>
                          )}

                          {/* Pass/Fail toggle */}
                          <button type="button" onClick={() => toggleResult(idx)} className="shrink-0 ml-auto">
                            {entry.test_result === 'pass' && (
                              <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-xs cursor-pointer hover:bg-green-500/25">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" /> 통과
                              </Badge>
                            )}
                            {entry.test_result === 'fail' && (
                              <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-xs cursor-pointer hover:bg-red-500/25">
                                <XCircle className="w-3 h-3 mr-0.5" /> 불통과
                              </Badge>
                            )}
                            {entry.test_result === 'none' && (
                              <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                                <Minus className="w-3 h-3 mr-0.5" /> 미입력
                              </Badge>
                            )}
                          </button>

                          {/* Score input */}
                          <Input
                            value={entry.test_result_text}
                            onChange={e => setEntries(prev => prev.map((en, i) => i === idx ? { ...en, test_result_text: e.target.value } : en))}
                            placeholder="점수"
                            className="h-7 text-xs w-20 shrink-0"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving || !testContent.trim() || !subject || selectedCount === 0 || (isAssistant && !teacherId)}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 저장 중...</> : `${selectedCount}명 일괄 저장`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
