import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Copy, Check, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DAYS_OF_WEEK = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

interface Student {
  id: string;
  name: string;
}

interface StudentScheduleRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  teacherName: string;
  className: string;
}

export function StudentTimetableLookup() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [scheduleRows, setScheduleRows] = useState<StudentScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (searchQuery.length > 0) {
      const filtered = students.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredStudents(filtered.slice(0, 20));
    } else {
      setFilteredStudents(students.slice(0, 20));
    }
  }, [searchQuery, students]);

  useEffect(() => {
    if (selectedStudentId) {
      fetchStudentSchedule(selectedStudentId);
    } else {
      setScheduleRows([]);
    }
  }, [selectedStudentId]);

  async function fetchStudents() {
    const { data, error } = await supabase
      .from('students')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setStudents(data);
      setFilteredStudents(data.slice(0, 20));
    }
  }

  async function fetchStudentSchedule(studentId: string) {
    setLoading(true);
    try {
      // Get class IDs for this student
      const { data: classStudents, error: csError } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', studentId);

      if (csError) throw csError;

      if (!classStudents || classStudents.length === 0) {
        setScheduleRows([]);
        setLoading(false);
        return;
      }

      const classIds = classStudents.map((cs) => cs.class_id);

      // Get classes with schedules
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          id, name, subject, teacher_id,
          class_schedules (id, day_of_week, start_time, end_time, is_active, teacher_id)
        `)
        .in('id', classIds);

      if (classError) throw classError;

      // Collect teacher IDs
      const teacherIds = new Set<string>();
      (classData || []).forEach((c: any) => {
        if (c.teacher_id) teacherIds.add(c.teacher_id);
        (c.class_schedules || []).forEach((s: any) => {
          if (s.teacher_id) teacherIds.add(s.teacher_id);
        });
      });

      // Fetch teacher names
      let teacherMap: Record<string, string> = {};
      if (teacherIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(teacherIds));

        if (profiles) {
          teacherMap = profiles.reduce((acc: Record<string, string>, p) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {});
        }
      }

      // Build schedule rows
      const rows: StudentScheduleRow[] = [];
      (classData || []).forEach((cls: any) => {
        (cls.class_schedules || []).filter((s: any) => s.is_active).forEach((sch: any) => {
          const teacherId = sch.teacher_id || cls.teacher_id;
          rows.push({
            dayOfWeek: sch.day_of_week,
            startTime: sch.start_time,
            endTime: sch.end_time,
            subject: cls.subject,
            teacherName: teacherId ? teacherMap[teacherId] || '미배정' : '미배정',
            className: cls.name,
          });
        });
      });

      // Sort by day then time
      rows.sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startTime.localeCompare(b.startTime);
      });

      setScheduleRows(rows);
    } catch (error) {
      console.error('Error fetching student schedule:', error);
      toast({
        title: '오류',
        description: '시간표를 불러오지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (time: string) => time.slice(0, 5);

  const copyText = useMemo(() => {
    if (!selectedStudentName || scheduleRows.length === 0) return '';

    const lines = [`[${selectedStudentName} 주간 시간표]`, ''];
    scheduleRows.forEach((row) => {
      const dayLabel = DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label || '';
      lines.push(
        `${dayLabel} ${formatTime(row.startTime)}-${formatTime(row.endTime)} ${row.subject}(${row.teacherName})`
      );
    });

    return lines.join('\n');
  }, [selectedStudentName, scheduleRows]);

  const handleCopy = async () => {
    if (!copyText) return;

    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      toast({ title: '복사됨', description: '시간표가 클립보드에 복사되었습니다' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: '복사 실패',
        description: '클립보드 복사에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    const student = students.find((s) => s.id === studentId);
    setSelectedStudentName(student?.name || '');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">학생 검색</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="학생 이름 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedStudentId} onValueChange={handleStudentSelect}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="학생 선택" />
            </SelectTrigger>
            <SelectContent>
              {filteredStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedStudentId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              {selectedStudentName} 시간표
            </h4>
            {scheduleRows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="text-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 mr-1" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    복사용 텍스트
                  </>
                )}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : scheduleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              배정된 수업이 없습니다
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50">
                  <TableRow className="text-xs">
                    <TableHead className="py-2 px-3">요일</TableHead>
                    <TableHead className="py-2 px-3">시작</TableHead>
                    <TableHead className="py-2 px-3">종료</TableHead>
                    <TableHead className="py-2 px-3">과목</TableHead>
                    <TableHead className="py-2 px-3">선생님</TableHead>
                    <TableHead className="py-2 px-3">클래스명</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleRows.map((row, idx) => (
                    <TableRow key={idx} className="text-sm">
                      <TableCell className="py-2 px-3">
                        <Badge variant="outline" className="text-xs">
                          {DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 px-3 font-mono text-xs">
                        {formatTime(row.startTime)}
                      </TableCell>
                      <TableCell className="py-2 px-3 font-mono text-xs">
                        {formatTime(row.endTime)}
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <Badge variant="secondary" className="text-xs">
                          {row.subject}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-xs">
                        {row.teacherName}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-xs truncate max-w-[120px]">
                        {row.className}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
