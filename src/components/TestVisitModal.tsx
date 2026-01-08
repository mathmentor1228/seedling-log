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
import { Calendar as CalendarIcon, Check, ChevronsUpDown, AlertCircle, FlaskConical } from 'lucide-react';
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
const ASSISTANTS = ['다인조교', '유빈조교'] as const;

// Generate time options from 16:00 to 21:00 in 30-min increments
const TIME_OPTIONS: string[] = [];
for (let hour = 16; hour <= 21; hour++) {
  TIME_OPTIONS.push(`${hour.toString().padStart(2, '0')}:00`);
  if (hour < 21) {
    TIME_OPTIONS.push(`${hour.toString().padStart(2, '0')}:30`);
  }
}

// MARKER: TESTONLY-VISIT-MODAL-V1
export function TestVisitModal({ open, onOpenChange, onSaved }: TestVisitModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);

  // Form state
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(getKSTDateObject());
  const [selectedTime, setSelectedTime] = useState<string>('16:00');
  const [testResultText, setTestResultText] = useState('');
  const [englishPassFail, setEnglishPassFail] = useState<'pass' | 'fail' | ''>('');
  const [testAssistant, setTestAssistant] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Check for existing lesson record
  const [existingRecord, setExistingRecord] = useState<ExistingLessonRecord | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  // Ref for auto-scroll to test section
  const testSectionRef = useRef<HTMLDivElement>(null);

  // Load students on open
  useEffect(() => {
    if (open) {
      fetchStudents();
      resetForm();
    }
  }, [open]);

  // Check for existing record when student, subject, date change
  useEffect(() => {
    if (selectedStudentId && selectedSubject && selectedDate) {
      checkExistingRecord();
    } else {
      setExistingRecord(null);
    }
  }, [selectedStudentId, selectedSubject, selectedDate]);

  // Auto-scroll to test section when existing record is found
  useEffect(() => {
    if (existingRecord && testSectionRef.current) {
      setTimeout(() => {
        testSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Also focus the test result input
        const input = testSectionRef.current?.querySelector('input');
        input?.focus();
      }, 100);
    }
  }, [existingRecord]);

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

  async function checkExistingRecord() {
    if (!selectedStudentId || !selectedSubject || !selectedDate) return;
    
    setCheckingExisting(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data } = await supabase
        .from('lesson_records')
        .select('id, student_id, subject, lesson_date, teacher_id, class_id, submitted, updated_at')
        .eq('student_id', selectedStudentId)
        .eq('subject', selectedSubject as SubjectType)
        .eq('lesson_date', dateStr);
      
      if (data && data.length > 0) {
        // Edge case: multiple records exist
        if (data.length > 1) {
          console.warn(
            `[TestVisitModal] Multiple lesson_records found for student=${selectedStudentId}, subject=${selectedSubject}, date=${dateStr}. Count=${data.length}`
          );
        }
        
        // Prefer submitted record, else latest updated_at
        const sorted = [...data].sort((a, b) => {
          // submitted=true first
          if (a.submitted && !b.submitted) return -1;
          if (!a.submitted && b.submitted) return 1;
          // then by updated_at desc
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        
        setExistingRecord(sorted[0] as ExistingLessonRecord);
      } else {
        setExistingRecord(null);
      }
    } catch (error) {
      console.error('Error checking existing record:', error);
    } finally {
      setCheckingExisting(false);
    }
  }

  function resetForm() {
    setSelectedStudentId('');
    setSelectedSubject('');
    setSelectedDate(getKSTDateObject());
    setSelectedTime('16:00');
    setTestResultText('');
    setEnglishPassFail('');
    setTestAssistant('');
    setNotes('');
    setExistingRecord(null);
  }

  async function handleSubmit() {
    if (!selectedStudentId || !selectedSubject || !selectedDate || !selectedTime) {
      toast({
        title: '필수 항목 누락',
        description: '학생, 과목, 날짜, 시간을 모두 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      if (existingRecord) {
        // Update existing lesson record's test fields
        const { error } = await supabase.rpc('update_lesson_test_fields', {
          _lesson_id: existingRecord.id,
          _test_name: '재시험/테스트',
          _test_result_text: testResultText || null,
          _test_result: selectedSubject === '영어' && englishPassFail ? englishPassFail : 'none',
          _test_notes: notes || null,
          _test_date: dateStr,
          _test_time: selectedTime,
          _test_assistant: testAssistant || null,
        });

        if (error) throw error;

        toast({
          title: '테스트 정보 저장 완료',
          description: '기존 수업일지의 테스트란에 기록되었습니다.',
        });
      } else {
        // Create new test_visit record
        const { error } = await supabase
          .from('test_visits')
          .insert({
            student_id: selectedStudentId,
            subject: selectedSubject,
            visit_date: dateStr,
            visit_time: selectedTime,
            test_result_text: testResultText || null,
            english_pass_fail: selectedSubject === '영어' && englishPassFail ? englishPassFail : null,
            test_assistant: testAssistant || null,
            notes: notes || null,
            created_by: user?.id,
          });

        if (error) throw error;

        toast({
          title: '테스트 방문 등록 완료',
          description: '새 테스트 방문이 등록되었습니다.',
        });
      }

      onOpenChange(false);
      onSaved?.();
    } catch (error: any) {
      console.error('Error saving test visit:', error);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            테스트만 등록
          </DialogTitle>
          <DialogDescription>
            재시험/테스트만 보러 온 학생을 등록합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing record warning with auto-scroll */}
          {existingRecord && (
            <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-400 font-medium">
                이미 오늘 {selectedSubject} 수업일지가 있어, 새 기록을 만들지 않고 기존 일지의 테스트란에 기록합니다.
              </AlertDescription>
            </Alert>
          )}

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
                      {students.map((student) => (
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
                              "mr-2 h-4 w-4",
                              selectedStudentId === student.id ? "opacity-100" : "opacity-0"
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

          {/* Subject */}
          <div className="space-y-2">
            <Label>과목 <span className="text-red-500">*</span></Label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger>
                <SelectValue placeholder="과목 선택..." />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label>날짜 <span className="text-red-500">*</span></Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
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

          {/* Time */}
          <div className="space-y-2">
            <Label>시간 <span className="text-red-500">*</span></Label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger>
                <SelectValue placeholder="시간 선택..." />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Test Result Text - scrollable target */}
          <div ref={testSectionRef} className="space-y-2">
            <Label>테스트 결과</Label>
            <Input
              placeholder="예: 85점, 8/10 등"
              value={testResultText}
              onChange={(e) => setTestResultText(e.target.value)}
              autoFocus={!!existingRecord}
            />
          </div>

          {/* English Pass/Fail (only for English) */}
          {selectedSubject === '영어' && (
            <div className="space-y-2">
              <Label>합격 여부</Label>
              <Select value={englishPassFail} onValueChange={(v) => setEnglishPassFail(v as 'pass' | 'fail' | '')}>
                <SelectTrigger>
                  <SelectValue placeholder="선택 (선택사항)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">통과 (Pass)</SelectItem>
                  <SelectItem value="fail">불통과 (Fail)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assistant */}
          <div className="space-y-2">
            <Label>담당 조교</Label>
            <Select value={testAssistant} onValueChange={setTestAssistant}>
              <SelectTrigger>
                <SelectValue placeholder="조교 선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                {ASSISTANTS.map((assistant) => (
                  <SelectItem key={assistant} value={assistant}>
                    {assistant}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>메모</Label>
            <Textarea
              placeholder="추가 메모..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={saving || checkingExisting}>
              {saving ? '저장 중...' : existingRecord ? '기존 일지에 저장' : '등록'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
