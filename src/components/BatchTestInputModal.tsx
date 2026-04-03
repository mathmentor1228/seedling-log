// BATCH-TEST-INPUT-V1: Bulk test result entry for multiple students at once
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle, Minus, ClipboardEdit, Loader2 } from 'lucide-react';

interface StudentTestEntry {
  student_id: string;
  student_name: string;
  lesson_record_id: string | null;
  test_result_text: string;
  test_result: 'pass' | 'fail' | 'none';
  english_pass_fail: string | null;
}

interface BatchTestInputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: { id: string; name: string; lessonRecordId: string | null }[];
  subject: string;
  className: string;
  date: string;
  onSaved?: () => void;
}

const ASSISTANTS = ['은서조교', '유빈조교'];

export function BatchTestInputModal({
  open, onOpenChange, students, subject, className, date, onSaved,
}: BatchTestInputModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [testContent, setTestContent] = useState('');
  const [testAssistant, setTestAssistant] = useState('');
  const [entries, setEntries] = useState<StudentTestEntry[]>([]);

  useEffect(() => {
    if (open) {
      setEntries(students.map(s => ({
        student_id: s.id,
        student_name: s.name,
        lesson_record_id: s.lessonRecordId,
        test_result_text: '',
        test_result: 'none',
        english_pass_fail: null,
      })));
      setTestContent('');
      setTestAssistant('');
    }
  }, [open, students]);

  function updateEntry(idx: number, field: keyof StudentTestEntry, value: any) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  function toggleResult(idx: number) {
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const nextResult = e.test_result === 'none' ? 'pass' : e.test_result === 'pass' ? 'fail' : 'none';
      const nextPassFail = subject === '영어'
        ? (nextResult === 'pass' ? 'pass' : nextResult === 'fail' ? 'fail' : null)
        : null;
      return { ...e, test_result: nextResult, english_pass_fail: nextPassFail };
    }));
  }

  function setAllPass() {
    setEntries(prev => prev.map(e => ({
      ...e,
      test_result: 'pass',
      english_pass_fail: subject === '영어' ? 'pass' : null,
    })));
  }

  async function handleSave() {
    if (!testContent.trim()) {
      toast({ title: '테스트 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let successCount = 0;
      const savedRecordIds: string[] = [];
      
      for (const entry of entries) {
        if (!entry.lesson_record_id) continue;

        const { error } = await supabase.rpc('update_lesson_test_fields', {
          _lesson_id: entry.lesson_record_id,
          _test_content: testContent,
          _test_name: testContent,
          _test_result_text: entry.test_result_text || null,
          _test_result: entry.test_result,
          _test_date: date,
          _test_assistant: testAssistant || null,
        });

        if (!error) {
          successCount++;
          savedRecordIds.push(entry.lesson_record_id);
        }
      }

      // For students without lesson records, update directly if possible
      const noRecordStudents = entries.filter(e => !e.lesson_record_id);
      if (noRecordStudents.length > 0) {
        const { data: foundRecords } = await supabase
          .from('lesson_records')
          .select('id, student_id')
          .eq('lesson_date', date)
          .eq('subject', subject as any)
          .in('student_id', noRecordStudents.map(s => s.student_id));

        if (foundRecords && foundRecords.length > 0) {
          const recordMap = new Map(foundRecords.map(r => [r.student_id, r.id]));
          for (const entry of noRecordStudents) {
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
        }
      }

      // BATCH-TEST-SYNC-V1: Sync lesson_types to include '테스트' and english_pass_fail for English
      if (savedRecordIds.length > 0) {
        // Fetch current lesson_types for saved records
        const { data: currentRecords } = await supabase
          .from('lesson_records')
          .select('id, lesson_types, student_id')
          .in('id', savedRecordIds);

        if (currentRecords && currentRecords.length > 0) {
          for (const rec of currentRecords) {
            const currentTypes: string[] = (rec.lesson_types as string[]) || [];
            if (!currentTypes.includes('테스트')) {
              const updatedTypes = [...currentTypes, '테스트'];
              // Also set english_pass_fail for English subject
              const entry = entries.find(e => e.student_id === rec.student_id);
              const updatePayload: Record<string, any> = {
                lesson_types: updatedTypes,
              };
              if (subject === '영어' && entry) {
                updatePayload.english_pass_fail = entry.english_pass_fail;
              }
              await supabase
                .from('lesson_records')
                .update(updatePayload)
                .eq('id', rec.id);
            } else if (subject === '영어') {
              // lesson_types already has '테스트' but still sync english_pass_fail
              const entry = entries.find(e => e.student_id === rec.student_id);
              if (entry?.english_pass_fail) {
                await supabase
                  .from('lesson_records')
                  .update({ english_pass_fail: entry.english_pass_fail })
                  .eq('id', rec.id);
              }
            }
          }
        }
      }

      toast({
        title: '테스트 결과 일괄 저장 완료',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardEdit className="w-5 h-5 text-primary" />
            테스트 일괄 입력
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          {/* Common fields */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{subject}</Badge>
            <Badge variant="secondary">{className}</Badge>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">테스트 내용/범위 <span className="text-destructive">*</span></Label>
            <Input
              value={testContent}
              onChange={e => setTestContent(e.target.value)}
              placeholder="예: 단원평가 3단원, 영단어 Day 5"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">조교</Label>
            <Select value={testAssistant} onValueChange={setTestAssistant}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none_selected">선택 안함</SelectItem>
                {ASSISTANTS.map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulk action */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={setAllPass}>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              전체 통과
            </Button>
          </div>

          {/* Student entries */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">학생별 결과</Label>
            <div className="space-y-1.5">
              {entries.map((entry, idx) => (
                <div key={entry.student_id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20">
                  <span className="text-sm font-medium min-w-[60px] truncate">{entry.student_name}</span>
                  
                  {/* Pass/Fail toggle */}
                  <button
                    type="button"
                    onClick={() => toggleResult(idx)}
                    className="shrink-0"
                  >
                    {entry.test_result === 'pass' && (
                      <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-xs cursor-pointer hover:bg-green-500/25 transition-colors">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" /> 통과
                      </Badge>
                    )}
                    {entry.test_result === 'fail' && (
                      <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-xs cursor-pointer hover:bg-red-500/25 transition-colors">
                        <XCircle className="w-3 h-3 mr-0.5" /> 불통과
                      </Badge>
                    )}
                    {entry.test_result === 'none' && (
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted transition-colors">
                        <Minus className="w-3 h-3 mr-0.5" /> 미입력
                      </Badge>
                    )}
                  </button>

                  {/* Score input */}
                  <Input
                    value={entry.test_result_text}
                    onChange={e => updateEntry(idx, 'test_result_text', e.target.value)}
                    placeholder="점수/결과"
                    className="h-8 text-xs flex-1 min-w-0"
                  />
                  
                  {!entry.lesson_record_id && (
                    <span className="text-[10px] text-amber-600 shrink-0">일지없음</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving || !testContent.trim()}>
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 저장 중...</> : `${entries.length}명 일괄 저장`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
