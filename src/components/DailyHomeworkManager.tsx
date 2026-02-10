// DAILY-HOMEWORK-V1: Bulk daily homework assignment (Mon-Fri weekly)
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin as checkIsAdmin } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarPlus, Loader2, Users, BookOpen } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';

const SUBJECTS = ['수학', '영어', '국어', '과학'] as const;
const DAY_LABELS = ['월', '화', '수', '목', '금'];

interface StudentItem {
  id: string;
  name: string;
}

interface DailyContent {
  [day: number]: string; // 0=Mon, 1=Tue, ..., 4=Fri
}

export default function DailyHomeworkManager() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [weekStartDate, setWeekStartDate] = useState(() => {
    const now = new Date();
    const mon = startOfWeek(now, { weekStartsOn: 1 });
    return format(mon, 'yyyy-MM-dd');
  });
  const [subject, setSubject] = useState<string>('수학');
  const [classId, setClassId] = useState<string>('');
  const [classes, setClasses] = useState<{ id: string; name: string; subject: string }[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [dailyContent, setDailyContent] = useState<DailyContent>({
    0: '', 1: '', 2: '', 3: '', 4: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Fetch classes on open
  useEffect(() => {
    if (open) {
      fetchClasses();
    }
  }, [open]);

  // Fetch students when class changes
  useEffect(() => {
    if (classId) {
      fetchStudentsByClass(classId);
    } else {
      setStudents([]);
      setSelectedStudents(new Set());
    }
  }, [classId]);

  async function fetchClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, name, subject')
      .order('name');
    setClasses(data || []);
  }

  async function fetchStudentsByClass(cId: string) {
    setLoadingStudents(true);
    const { data } = await supabase
      .from('class_students')
      .select('students:student_id (id, name)')
      .eq('class_id', cId);

    const list = (data || [])
      .map((d: any) => d.students)
      .filter(Boolean)
      .sort((a: StudentItem, b: StudentItem) => a.name.localeCompare(b.name));
    
    setStudents(list);
    setSelectedStudents(new Set(list.map((s: StudentItem) => s.id)));
    setLoadingStudents(false);
  }

  function toggleStudent(id: string) {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map(s => s.id)));
    }
  }

  // Get the selected class's subject
  useEffect(() => {
    if (classId) {
      const cls = classes.find(c => c.id === classId);
      if (cls) setSubject(cls.subject);
    }
  }, [classId, classes]);

  const weekDates = Array.from({ length: 5 }, (_, i) => {
    const mon = new Date(weekStartDate + 'T00:00:00');
    return addDays(mon, i);
  });

  async function handleSubmit() {
    if (selectedStudents.size === 0) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' });
      return;
    }

    // Check at least one day has content
    const hasContent = Object.values(dailyContent).some(c => c.trim());
    if (!hasContent) {
      toast({ title: '최소 1일 이상 숙제 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const inserts: any[] = [];

      for (const studentId of selectedStudents) {
        for (let day = 0; day < 5; day++) {
          const content = dailyContent[day]?.trim();
          if (!content) continue;

          inserts.push({
            student_id: studentId,
            subject: subject,
            content: content,
            assigned_date: format(weekDates[day], 'yyyy-MM-dd'),
            homework_type: 'daily',
            check_status: 'unchecked',
          });
        }
      }

      if (inserts.length === 0) {
        toast({ title: '생성할 숙제가 없습니다', variant: 'destructive' });
        return;
      }

      const { error } = await supabase
        .from('homework_assignments')
        .insert(inserts);

      if (error) throw error;

      toast({
        title: '데일리숙제 등록 완료',
        description: `${selectedStudents.size}명 × ${inserts.length / selectedStudents.size}일 = ${inserts.length}건 생성`,
      });

      // Reset
      setDailyContent({ 0: '', 1: '', 2: '', 3: '', 4: '' });
      setOpen(false);
    } catch (error: any) {
      console.error('Daily homework error:', error);
      toast({
        title: '등록 실패',
        description: error.message || '데일리숙제 등록에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus className="w-4 h-4 mr-2" />
        데일리숙제 등록
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              데일리숙제 주간 일괄 등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Week & Class Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">주간 시작 (월요일)</label>
                <Input
                  type="date"
                  value={weekStartDate}
                  onChange={(e) => setWeekStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">반 선택</label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="반 선택" />
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
            </div>

            {/* Subject display */}
            {classId && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">과목:</span>
                <Badge variant="outline">{subject}</Badge>
              </div>
            )}

            {/* Student Selection */}
            {classId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    학생 선택 ({selectedStudents.size}/{students.length})
                  </label>
                  <Button variant="ghost" size="sm" onClick={toggleAll}>
                    {selectedStudents.size === students.length ? '전체 해제' : '전체 선택'}
                  </Button>
                </div>

                {loadingStudents ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : students.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">이 반에 배정된 학생이 없습니다.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {students.map(s => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selectedStudents.has(s.id)}
                          onCheckedChange={() => toggleStudent(s.id)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Daily Content Input */}
            {classId && (
              <div className="space-y-3">
                <label className="text-sm font-medium">요일별 숙제 내용</label>
                {weekDates.map((date, dayIdx) => (
                  <div key={dayIdx} className="flex items-start gap-2">
                    <Badge
                      variant="outline"
                      className="mt-2 min-w-[60px] justify-center"
                    >
                      {DAY_LABELS[dayIdx]} {format(date, 'M/d')}
                    </Badge>
                    <Textarea
                      placeholder={`${DAY_LABELS[dayIdx]}요일 숙제 내용 (비우면 건너뜀)`}
                      value={dailyContent[dayIdx] || ''}
                      onChange={(e) =>
                        setDailyContent(prev => ({ ...prev, [dayIdx]: e.target.value }))
                      }
                      rows={2}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Submit */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedStudents.size === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  등록 중...
                </>
              ) : (
                <>
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  데일리숙제 일괄 등록
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
