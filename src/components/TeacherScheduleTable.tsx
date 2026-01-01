import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth, isAdmin } from '@/lib/auth';

const DAYS_OF_WEEK = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

interface ScheduleRow {
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  studentCount: number;
}

interface StudentInfo {
  id: string;
  name: string;
}

interface TeacherScheduleTableProps {
  scheduleRows: ScheduleRow[];
  onRowClick?: (classId: string) => void;
  highlightClassId?: string | null;
  showStudentManageLink?: boolean;
}

export function TeacherScheduleTable({ 
  scheduleRows, 
  onRowClick,
  highlightClassId,
  showStudentManageLink = false,
}: TeacherScheduleTableProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [studentsByClass, setStudentsByClass] = useState<Record<string, StudentInfo[]>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [density, setDensity] = useState<'compact' | 'expanded'>('compact');
  const [copiedClassId, setCopiedClassId] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    return [...scheduleRows].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [scheduleRows]);

  // Get unique class IDs
  const classIds = useMemo(() => {
    return [...new Set(scheduleRows.map((r) => r.classId))];
  }, [scheduleRows]);

  // Batch fetch students for all classes (2 queries total: class_students + students)
  useEffect(() => {
    if (classIds.length === 0) {
      setStudentsByClass({});
      return;
    }

    async function fetchStudents() {
      setLoadingStudents(true);
      try {
        // Query 1: Get class-student mappings
        const { data: classStudents, error: csError } = await supabase
          .from('class_students')
          .select('class_id, student_id')
          .in('class_id', classIds);

        if (csError) throw csError;

        if (!classStudents || classStudents.length === 0) {
          setStudentsByClass({});
          setLoadingStudents(false);
          return;
        }

        // Get unique student IDs
        const studentIds = [...new Set(classStudents.map((cs) => cs.student_id))];

        // Query 2: Get student names
        const { data: students, error: sError } = await supabase
          .from('students')
          .select('id, name')
          .in('id', studentIds);

        if (sError) throw sError;

        // Build map: student_id -> name
        const studentMap: Record<string, string> = {};
        (students || []).forEach((s) => {
          studentMap[s.id] = s.name;
        });

        // Group by class_id
        const grouped: Record<string, StudentInfo[]> = {};
        classStudents.forEach((cs) => {
          if (!grouped[cs.class_id]) {
            grouped[cs.class_id] = [];
          }
          grouped[cs.class_id].push({
            id: cs.student_id,
            name: studentMap[cs.student_id] || '이름없음',
          });
        });

        // Sort students by name within each class
        Object.keys(grouped).forEach((classId) => {
          grouped[classId].sort((a, b) => a.name.localeCompare(b.name));
        });

        setStudentsByClass(grouped);
      } catch (error) {
        console.error('Error fetching students for schedule:', error);
      } finally {
        setLoadingStudents(false);
      }
    }

    fetchStudents();
  }, [classIds]);

  const formatTime = (time: string) => time.slice(0, 5);

  const maxVisibleStudents = density === 'compact' ? 3 : 6;

  const handleCopyStudents = async (classId: string) => {
    const students = studentsByClass[classId] || [];
    if (students.length === 0) return;

    const names = students.map((s) => s.name).join(', ');
    try {
      await navigator.clipboard.writeText(names);
      setCopiedClassId(classId);
      toast({ title: '복사됨', description: '학생 명단이 복사되었습니다' });
      setTimeout(() => setCopiedClassId(null), 2000);
    } catch {
      toast({
        title: '복사 실패',
        description: '클립보드 복사에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  if (sortedRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        등록된 시간표가 없습니다
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Density toggle */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDensity(density === 'compact' ? 'expanded' : 'compact')}
          className="text-xs h-7"
        >
          {density === 'compact' ? (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              확장
            </>
          ) : (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              컴팩트
            </>
          )}
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="sticky top-0 bg-muted/50">
            <TableRow className="text-xs">
              <TableHead className="py-2 px-3">요일</TableHead>
              <TableHead className="py-2 px-3">시작</TableHead>
              <TableHead className="py-2 px-3">종료</TableHead>
              <TableHead className="py-2 px-3">과목</TableHead>
              <TableHead className="py-2 px-3">클래스명</TableHead>
              <TableHead className="py-2 px-3">학생</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, idx) => {
              const students = studentsByClass[row.classId] || [];
              const visibleStudents = students.slice(0, maxVisibleStudents);
              const overflowCount = students.length - maxVisibleStudents;

              return (
                <TableRow
                  key={`${row.classId}-${row.dayOfWeek}-${idx}`}
                  className={`text-sm cursor-pointer hover:bg-muted/30 ${
                    highlightClassId === row.classId ? 'bg-primary/10' : ''
                  }`}
                  onClick={() => onRowClick?.(row.classId)}
                >
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
                  <TableCell className="py-2 px-3 text-xs truncate max-w-[100px]">
                    {row.className}
                  </TableCell>
                  <TableCell className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-wrap">
                      {loadingStudents ? (
                        <span className="text-xs text-muted-foreground">로딩...</span>
                      ) : students.length === 0 ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <>
                          {visibleStudents.map((student) => (
                            <Badge
                              key={student.id}
                              variant="outline"
                              className="text-xs font-normal"
                            >
                              {student.name}
                            </Badge>
                          ))}
                          {overflowCount > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className="text-xs cursor-pointer hover:bg-secondary/80"
                                >
                                  +{overflowCount}
                                </Badge>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3" align="start">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      학생 목록 ({students.length}명)
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                                    {students.map((s) => (
                                      <Badge
                                        key={s.id}
                                        variant="outline"
                                        className="text-xs font-normal"
                                      >
                                        {s.name}
                                      </Badge>
                                    ))}
                                  </div>
                                  <div className="flex gap-2 pt-2 border-t">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 text-xs h-7"
                                      onClick={() => handleCopyStudents(row.classId)}
                                    >
                                      {copiedClassId === row.classId ? (
                                        <>
                                          <Check className="w-3 h-3 mr-1" />
                                          복사됨
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3 mr-1" />
                                          명단 복사
                                        </>
                                      )}
                                    </Button>
                                    {(showStudentManageLink || isAdmin(role)) && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="flex-1 text-xs h-7"
                                        onClick={() => onRowClick?.(row.classId)}
                                      >
                                        <Users className="w-3 h-3 mr-1" />
                                        배정 관리
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                          {overflowCount <= 0 && students.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 ml-1"
                                >
                                  <Users className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-3" align="start">
                                <div className="space-y-3">
                                  <span className="text-sm font-medium">
                                    학생 목록 ({students.length}명)
                                  </span>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 text-xs h-7"
                                      onClick={() => handleCopyStudents(row.classId)}
                                    >
                                      {copiedClassId === row.classId ? (
                                        <>
                                          <Check className="w-3 h-3 mr-1" />
                                          복사됨
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3 mr-1" />
                                          명단 복사
                                        </>
                                      )}
                                    </Button>
                                    {(showStudentManageLink || isAdmin(role)) && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="flex-1 text-xs h-7"
                                        onClick={() => onRowClick?.(row.classId)}
                                      >
                                        배정 관리
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
