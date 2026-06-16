import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Copy, Check, Users, ChevronDown, ChevronUp, Pencil, X, Save } from 'lucide-react';
import { useAuth, isAdmin } from '@/lib/auth';
import { formatStudentGrade } from '@/lib/utils';

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
  scheduleId?: string;
}

interface StudentInfo {
  id: string;
  name: string;
  grade?: string | null;
  school_level?: string | null;
  grade_year?: number | null;
}

interface TeacherScheduleTableProps {
  scheduleRows: ScheduleRow[];
  onRowClick?: (classId: string) => void;
  highlightClassId?: string | null;
  showStudentManageLink?: boolean;
  onScheduleUpdated?: () => void;
  editable?: boolean;
}

export function TeacherScheduleTable({ 
  scheduleRows, 
  onRowClick,
  highlightClassId,
  showStudentManageLink = false,
  onScheduleUpdated,
  editable = true,
}: TeacherScheduleTableProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [studentsByClass, setStudentsByClass] = useState<Record<string, StudentInfo[]>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [density, setDensity] = useState<'compact' | 'expanded'>('compact');
  const [copiedClassId, setCopiedClassId] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ className: string; startTime: string; endTime: string }>({
    className: '',
    startTime: '',
    endTime: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const sortedRows = useMemo(() => {
    return [...scheduleRows].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [scheduleRows]);

  const classIds = useMemo(() => {
    return [...new Set(scheduleRows.map((r) => r.classId))];
  }, [scheduleRows]);

  useEffect(() => {
    if (classIds.length === 0) {
      setStudentsByClass({});
      return;
    }

    async function fetchStudents() {
      setLoadingStudents(true);
      try {
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

        const studentIds = [...new Set(classStudents.map((cs) => cs.student_id))];

        const { data: students, error: sError } = await supabase
          .from('students')
          .select('id, name, grade, school_level, grade_year')
          .in('id', studentIds);

        if (sError) throw sError;

        const studentMap: Record<string, { name: string; grade?: string | null; school_level?: string | null; grade_year?: number | null }> = {};
        (students || []).forEach((s) => {
          studentMap[s.id] = { name: s.name, grade: s.grade, school_level: s.school_level, grade_year: s.grade_year };
        });

        const grouped: Record<string, StudentInfo[]> = {};
        classStudents.forEach((cs) => {
          if (!grouped[cs.class_id]) {
            grouped[cs.class_id] = [];
          }
          const info = studentMap[cs.student_id];
          grouped[cs.class_id].push({
            id: cs.student_id,
            name: info?.name || '이름없음',
            grade: info?.grade,
            school_level: info?.school_level,
            grade_year: info?.grade_year,
          });
        });

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

  const startEdit = (row: ScheduleRow, key: string) => {
    setEditingKey(key);
    setEditForm({
      className: row.className,
      startTime: formatTime(row.startTime),
      endTime: formatTime(row.endTime),
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
  };

  const saveEdit = async (row: ScheduleRow) => {
    if (!row.scheduleId) {
      toast({ title: '수정 불가', description: '스케줄 ID가 없습니다', variant: 'destructive' });
      return;
    }
    const { className, startTime, endTime } = editForm;
    if (!className.trim() || !startTime || !endTime) {
      toast({ title: '입력 확인', description: '모든 항목을 입력해주세요', variant: 'destructive' });
      return;
    }
    if (startTime >= endTime) {
      toast({ title: '시간 오류', description: '종료 시간은 시작 시간보다 늦어야 합니다', variant: 'destructive' });
      return;
    }
    setSavingEdit(true);
    try {
      const { error: schErr } = await supabase
        .from('class_schedules')
        .update({ start_time: startTime, end_time: endTime })
        .eq('id', row.scheduleId);
      if (schErr) throw schErr;

      if (className.trim() !== row.className) {
        const { error: clsErr } = await supabase
          .from('classes')
          .update({ name: className.trim() })
          .eq('id', row.classId);
        if (clsErr) throw clsErr;
      }

      toast({ title: '저장됨', description: '시간표가 수정되었습니다' });
      setEditingKey(null);
      onScheduleUpdated?.();
    } catch (e: any) {
      console.error('Edit save error:', e);
      toast({ title: '저장 실패', description: e?.message || '오류가 발생했습니다', variant: 'destructive' });
    } finally {
      setSavingEdit(false);
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
              {editable && <TableHead className="py-2 px-3 w-24">수정</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, idx) => {
              const students = studentsByClass[row.classId] || [];
              const visibleStudents = students.slice(0, maxVisibleStudents);
              const overflowCount = students.length - maxVisibleStudents;
              const rowKey = `${row.scheduleId || row.classId}-${row.dayOfWeek}-${idx}`;
              const isEditing = editingKey === rowKey;

              return (
                <TableRow
                  key={rowKey}
                  className={`text-sm ${!isEditing ? 'cursor-pointer hover:bg-muted/30' : ''} ${
                    highlightClassId === row.classId ? 'bg-primary/10' : ''
                  }`}
                  onClick={() => !isEditing && onRowClick?.(row.classId)}
                >
                  <TableCell className="py-2 px-3">
                    <Badge variant="outline" className="text-xs">
                      {DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-3 font-mono text-xs" onClick={(e) => isEditing && e.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        type="time"
                        value={editForm.startTime}
                        onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                        className="h-7 text-xs px-2 w-24"
                      />
                    ) : (
                      formatTime(row.startTime)
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-3 font-mono text-xs" onClick={(e) => isEditing && e.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        type="time"
                        value={editForm.endTime}
                        onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                        className="h-7 text-xs px-2 w-24"
                      />
                    ) : (
                      formatTime(row.endTime)
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-3">
                    <Badge variant="secondary" className="text-xs">
                      {row.subject}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-xs max-w-[160px]" onClick={(e) => isEditing && e.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        value={editForm.className}
                        onChange={(e) => setEditForm({ ...editForm, className: e.target.value })}
                        className="h-7 text-xs px-2"
                      />
                    ) : (
                      <span className="truncate block">{row.className}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-wrap">
                      {loadingStudents ? (
                        <span className="text-xs text-muted-foreground">로딩...</span>
                      ) : students.length === 0 ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <>
                          {visibleStudents.map((student) => {
                            const gradeLabel = formatStudentGrade(student);
                            return (
                              <Badge
                                key={student.id}
                                variant="outline"
                                className="text-xs font-normal"
                              >
                                {student.name}
                                {gradeLabel && (
                                  <span className="text-[10px] text-muted-foreground ml-1">({gradeLabel})</span>
                                )}
                              </Badge>
                            );
                          })}
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
                                    {students.map((s) => {
                                      const gradeLabel = formatStudentGrade(s);
                                      return (
                                        <Badge
                                          key={s.id}
                                          variant="outline"
                                          className="text-xs font-normal"
                                        >
                                          {s.name}
                                          {gradeLabel && (
                                            <span className="text-[10px] text-muted-foreground ml-1">({gradeLabel})</span>
                                          )}
                                        </Badge>
                                      );
                                    })}
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
                  {editable && (
                    <TableCell className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 w-7 p-0"
                            disabled={savingEdit}
                            onClick={() => saveEdit(row)}
                            title="저장"
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={savingEdit}
                            onClick={cancelEdit}
                            title="취소"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => startEdit(row, rowKey)}
                          title="시간/이름 수정"
                          disabled={!row.scheduleId}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
