import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getKSTDateObject, getTodayKST } from '@/lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar as CalendarIcon, Check, ChevronsUpDown, AlertCircle, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  name: string;
}

interface ExistingLessonRecord {
  id: string;
  student_id: string;
  subject: string;
  lesson_date: string;
  teacher_id: string;
  class_id: string | null;
  submitted: boolean;
  updated_at: string;
}

interface TestVisitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

type SubjectType = '수학' | '과학' | '영어' | '국어';
const SUBJECTS: SubjectType[] = ['수학', '과학', '영어', '국어'];
const ASSISTANTS = ['은서조교', '유빈조교', '최수린조교'] as const;

// Generate time options from 16:00 to 21:00 in 30-min increments
const TIME_OPTIONS: string[] = [];
for (let hour = 16; hour <= 21; hour++) {
  TIME_OPTIONS.push(`${hour.toString().padStart(2, '0')}:00`);
  if (hour < 21) {
    TIME_OPTIONS.push(`${hour.toString().padStart(2, '0')}:30`);
  }
}

interface TestRow {
  id: string;
  subject: string;
  testContent: string; // TEST-CONTENT-REQUIRED-V1: What was tested (required)
  testTitle: string; // Fallback for display compatibility
  testResultText: string; // Score/result
  testTime: string;
  testAssistant: string;
  englishPassFail: 'pass' | 'fail' | '';
  existingRecord: ExistingLessonRecord | null;
}

function generateRowId() {
  return Math.random().toString(36).substring(2, 9);
}

// MARKER: ASSISTANT-TEST-FORM-V3 (Multi-subject support)
export function TestVisitModal({ open, onOpenChange, onSaved }: TestVisitModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);

  // Form state
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(getKSTDateObject());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [notes, setNotes] = useState('');

  // Multi-subject test rows
  const [testRows, setTestRows] = useState<TestRow[]>([
    {
      id: generateRowId(),
      subject: '',
      testContent: '', // TEST-CONTENT-REQUIRED-V1: required field
      testTitle: '', // kept for backward compatibility
      testResultText: '',
      testTime: '16:00',
      testAssistant: '',
      englishPassFail: '',
      existingRecord: null,
    },
  ]);

  // Load students on open
  useEffect(() => {
    if (open) {
      fetchStudents();
      resetForm();
    }
  }, [open]);

  // Check for existing records when student or date changes
  useEffect(() => {
    if (selectedStudentId && selectedDate) {
      checkExistingRecordsForRows();
    }
  }, [selectedStudentId, selectedDate, testRows.map(r => r.subject).join(',')]);

  async function fetchStudents() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('students')
        .select('id, name')
        .order('name');
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkExistingRecordsForRows() {
    if (!selectedStudentId || !selectedDate) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const subjects = testRows.map(r => r.subject).filter(Boolean);

    if (subjects.length === 0) return;

    try {
      const { data } = await supabase
        .from('lesson_records')
        .select('id, student_id, subject, lesson_date, teacher_id, class_id, submitted, updated_at')
        .eq('student_id', selectedStudentId)
        .eq('lesson_date', dateStr)
        .in('subject', subjects as SubjectType[]);

      // Update test rows with existing record info
      setTestRows(prev =>
        prev.map(row => {
          if (!row.subject) return { ...row, existingRecord: null };

          const matching = (data || []).filter(
            r => r.subject === row.subject
          );

          if (matching.length > 0) {
            // Prefer submitted, then latest
            const sorted = [...matching].sort((a, b) => {
              if (a.submitted && !b.submitted) return -1;
              if (!a.submitted && b.submitted) return 1;
              return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
            return { ...row, existingRecord: sorted[0] as ExistingLessonRecord };
          }

          return { ...row, existingRecord: null };
        })
      );
    } catch (error) {
      console.error('Error checking existing records:', error);
    }
  }

  function resetForm() {
    setSelectedStudentId('');
    setSelectedDate(getKSTDateObject());
    setNotes('');
    setTestRows([
      {
        id: generateRowId(),
        subject: '',
        testContent: '', // TEST-CONTENT-REQUIRED-V1
        testTitle: '',
        testResultText: '',
        testTime: '16:00',
        testAssistant: '',
        englishPassFail: '',
        existingRecord: null,
      },
    ]);
  }

  function addTestRow() {
    setTestRows(prev => [
      ...prev,
      {
        id: generateRowId(),
        subject: '',
        testContent: '', // TEST-CONTENT-REQUIRED-V1
        testTitle: '',
        testResultText: '',
        testTime: '16:00',
        testAssistant: '',
        englishPassFail: '',
        existingRecord: null,
      },
    ]);
  }

  function removeTestRow(rowId: string) {
    if (testRows.length === 1) return;
    setTestRows(prev => prev.filter(r => r.id !== rowId));
  }

  function updateTestRow(rowId: string, field: keyof TestRow, value: string) {
    setTestRows(prev =>
      prev.map(row =>
        row.id === rowId ? { ...row, [field]: value } : row
      )
    );
  }

  async function handleSubmit() {
    if (!selectedStudentId || !selectedDate) {
      toast({
        title: '필수 항목 누락',
        description: '학생과 날짜를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // Validate each row
    const validRows = testRows.filter(r => r.subject);
    if (validRows.length === 0) {
      toast({
        title: '과목 선택 필요',
        description: '최소 한 과목을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // TEST-CONTENT-REQUIRED-V1: Validate required fields
    for (const row of validRows) {
      if (!row.testContent.trim()) {
        toast({
          title: '테스트내용 누락',
          description: `테스트내용(무엇을 봤는지)을 입력해주세요. (${row.subject})`,
          variant: 'destructive',
        });
        return;
      }
      if (!row.testResultText.trim()) {
        toast({
          title: '테스트결과 누락',
          description: `${row.subject} 과목의 테스트결과를 입력해주세요.`,
          variant: 'destructive',
        });
        return;
      }
    }

    // Check for duplicate subjects
    const subjectCounts: Record<string, number> = {};
    for (const row of validRows) {
      subjectCounts[row.subject] = (subjectCounts[row.subject] || 0) + 1;
      if (subjectCounts[row.subject] > 1) {
        toast({
          title: '중복 과목',
          description: `${row.subject}이(가) 중복되었습니다. 같은 과목은 하나만 등록해주세요.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // Refresh existing records before saving
      await checkExistingRecordsForRows();

      for (const row of validRows) {
        const englishPassFailValue =
          row.subject === '영어' && row.englishPassFail ? row.englishPassFail : null;

        try {
          // Re-check for existing record
          const { data: existingData } = await supabase
            .from('lesson_records')
            .select('id')
            .eq('student_id', selectedStudentId)
            .eq('subject', row.subject as SubjectType)
            .eq('lesson_date', dateStr)
            .order('updated_at', { ascending: false })
            .limit(1);

          const existingRecordId = existingData?.[0]?.id;

          if (existingRecordId) {
            // Update existing lesson record's test fields
            // TEST-CONTENT-REQUIRED-V1: Save test_content as primary field
            const { error } = await supabase
              .from('lesson_records')
              .update({
                test_content: row.testContent.trim(), // Primary content field
                test_title: row.testContent.trim(), // Backward compatibility
                test_name: '재시험/테스트',
                test_result_text: row.testResultText.trim(),
                test_result:
                  row.subject === '영어' && row.englishPassFail
                    ? row.englishPassFail
                    : 'none',
                test_notes: notes || null,
                test_date: dateStr,
                test_time: row.testTime,
                test_assistant: row.testAssistant || null,
                english_pass_fail: englishPassFailValue,
              })
              .eq('id', existingRecordId);

            if (error) throw error;
          } else {
            // Create new lesson_record tagged as 테스트방문
            // TEST-CONTENT-REQUIRED-V1: Save test_content as primary field
            const { error } = await supabase.from('lesson_records').insert({
              student_id: selectedStudentId,
              subject: row.subject as SubjectType,
              lesson_date: dateStr,
              lesson_types: ['테스트방문'],
              attendance_status: ['정상등원'],
              teacher_id: user?.id || '',
              homework_status: 'none',
              lesson_range: '테스트만',
              understanding_score: 0,
              test_content: row.testContent.trim(), // Primary content field
              test_title: row.testContent.trim(), // Backward compatibility
              test_name: '재시험/테스트',
              test_result_text: row.testResultText.trim(),
              test_result:
                row.subject === '영어' && row.englishPassFail
                  ? row.englishPassFail
                  : 'none',
              test_notes: notes || null,
              test_date: dateStr,
              test_time: row.testTime,
              test_assistant: row.testAssistant || null,
              english_pass_fail: englishPassFailValue,
              submitted: true,
              submitted_at: new Date().toISOString(),
            });

            if (error) throw error;
          }

          successCount++;
        } catch (err: any) {
          console.error(`Error saving ${row.subject}:`, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: '테스트 기록 저장 완료',
          description: `${successCount}개 과목 저장됨${errorCount > 0 ? `, ${errorCount}개 실패` : ''}`,
          variant: errorCount > 0 ? 'destructive' : 'default',
        });
      }

      if (errorCount === 0) {
        onOpenChange(false);
        onSaved?.();
      }
    } catch (error: any) {
      console.error('Error saving test records:', error);
      toast({
        title: '저장 오류',
        description: error.message || '저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Get subjects already used in rows
  const usedSubjects = testRows.map(r => r.subject).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            테스트만 등록 (다과목)
          </DialogTitle>
          <DialogDescription>
            한 번 방문에서 여러 과목 테스트를 등록할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student Search */}
          <div className="space-y-2">
            <Label>학생 <span className="text-red-500">*</span></Label>
            <Popover open={studentSearchOpen} onOpenChange={setStudentSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={studentSearchOpen}
                  className="w-full justify-between"
                  disabled={loading}
                >
                  {selectedStudent?.name || '학생 선택...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="학생 이름 검색..." />
                  <CommandList>
                    <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                    <CommandGroup>
                      {students.map(student => (
                        <CommandItem
                          key={student.id}
                          value={student.name}
                          onSelect={() => {
                            setSelectedStudentId(student.id);
                            setStudentSearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedStudentId === student.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {student.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label>날짜 <span className="text-red-500">*</span></Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={date => {
                    if (date) {
                      setSelectedDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  locale={ko}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Test Rows */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">과목별 테스트</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTestRow}
                disabled={testRows.length >= 4}
              >
                <Plus className="w-4 h-4 mr-1" />
                과목 추가
              </Button>
            </div>

            {testRows.map((row, idx) => (
              <div
                key={row.id}
                className="border rounded-lg p-4 space-y-3 bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    테스트 #{idx + 1}
                  </span>
                  {testRows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeTestRow(row.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Existing record warning */}
                {row.existingRecord && (
                  <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 py-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700 dark:text-amber-400 text-xs">
                      기존 {row.subject} 수업일지에 테스트 정보를 추가합니다.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Subject */}
                <div className="space-y-1">
                  <Label className="text-xs">과목 <span className="text-red-500">*</span></Label>
                  <Select
                    value={row.subject}
                    onValueChange={v => updateTestRow(row.id, 'subject', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="과목 선택..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.filter(
                        s => !usedSubjects.includes(s) || s === row.subject
                      ).map(subject => (
                        <SelectItem key={subject} value={subject}>
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">테스트 제목 <span className="text-destructive">(단원/범위 필수) *</span></Label>
                  <Input
                    placeholder="예: 중2 1단원 단원평가 / 영단어 Day5 재시험"
                    value={row.testContent}
                    onChange={e => updateTestRow(row.id, 'testContent', e.target.value)}
                  />
                </div>

                {/* Test Result Text - Score/Result */}
                <div className="space-y-1">
                  <Label className="text-xs">결과/점수 <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="예: 18/25, 단어 27/30, 85점 등"
                    value={row.testResultText}
                    onChange={e => updateTestRow(row.id, 'testResultText', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Time */}
                  <div className="space-y-1">
                    <Label className="text-xs">시간</Label>
                    <Select
                      value={row.testTime}
                      onValueChange={v => updateTestRow(row.id, 'testTime', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map(time => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assistant */}
                  <div className="space-y-1">
                    <Label className="text-xs">담당 조교</Label>
                    <Select
                      value={row.testAssistant}
                      onValueChange={v => updateTestRow(row.id, 'testAssistant', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSISTANTS.map(assistant => (
                          <SelectItem key={assistant} value={assistant}>
                            {assistant}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* English Pass/Fail (only for English) */}
                {row.subject === '영어' && (
                  <div className="space-y-1">
                    <Label className="text-xs">합격 여부</Label>
                    <Select
                      value={row.englishPassFail}
                      onValueChange={v =>
                        updateTestRow(row.id, 'englishPassFail', v as 'pass' | 'fail' | '')
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="선택 (선택사항)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">통과 (Pass)</SelectItem>
                        <SelectItem value="fail">불통과 (Fail)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>메모 (전체 공통)</Label>
            <Textarea
              placeholder="추가 메모..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? '저장 중...' : `${testRows.filter(r => r.subject).length}개 과목 저장`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
