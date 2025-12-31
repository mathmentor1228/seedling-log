import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

interface ClassStudentManagerProps {
  classId: string;
  onStudentCountChange?: (count: number) => void;
}

export function ClassStudentManager({ classId, onStudentCountChange }: ClassStudentManagerProps) {
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [assignedStudentIds, setAssignedStudentIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [classId]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch all students
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, name, grade, school')
        .order('name');

      if (studentsError) throw studentsError;

      // Fetch assigned students for this class
      const { data: assignedData, error: assignedError } = await supabase
        .from('class_students')
        .select('student_id')
        .eq('class_id', classId);

      if (assignedError) throw assignedError;

      setAllStudents(studentsData || []);
      const assignedIds = new Set((assignedData || []).map((a) => a.student_id));
      setAssignedStudentIds(assignedIds);
      onStudentCountChange?.(assignedIds.size);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: '데이터 로딩 오류',
        description: error.message || '학생 목록을 불러오지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStudent(studentId: string, isCurrentlyAssigned: boolean) {
    setUpdating(studentId);
    try {
      if (isCurrentlyAssigned) {
        // Remove student from class
        const { error } = await supabase
          .from('class_students')
          .delete()
          .eq('class_id', classId)
          .eq('student_id', studentId);

        if (error) throw error;

        setAssignedStudentIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(studentId);
          onStudentCountChange?.(newSet.size);
          return newSet;
        });

        toast({
          title: '학생 배정 해제',
          description: '학생이 클래스에서 제외되었습니다',
        });
      } else {
        // Add student to class
        const { error } = await supabase
          .from('class_students')
          .insert({ class_id: classId, student_id: studentId });

        if (error) {
          if (error.code === '23505') {
            toast({
              title: '이미 배정됨',
              description: '이 학생은 이미 이 클래스에 배정되어 있습니다',
              variant: 'destructive',
            });
            return;
          }
          throw error;
        }

        setAssignedStudentIds((prev) => {
          const newSet = new Set(prev);
          newSet.add(studentId);
          onStudentCountChange?.(newSet.size);
          return newSet;
        });

        toast({
          title: '학생 배정 완료',
          description: '학생이 클래스에 배정되었습니다',
        });
      }
    } catch (error: any) {
      console.error('Error toggling student:', error);
      toast({
        title: '오류',
        description: error.message || '학생 배정을 변경하지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  }

  const filteredStudents = allStudents.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.grade?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.school?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: assigned students first, then alphabetically
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const aAssigned = assignedStudentIds.has(a.id);
    const bAssigned = assignedStudentIds.has(b.id);
    if (aAssigned && !bAssigned) return -1;
    if (!aAssigned && bAssigned) return 1;
    return a.name.localeCompare(b.name);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" />
          학생 배정
        </h3>
        <span className="text-sm text-muted-foreground">
          배정된 학생: {assignedStudentIds.size}명
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="학생 검색 (이름, 학년, 학교)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <ScrollArea className="h-[280px] border rounded-md">
        <div className="p-2 space-y-1">
          {sortedStudents.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              {searchQuery ? '검색 결과가 없습니다' : '학생이 없습니다'}
            </p>
          ) : (
            sortedStudents.map((student) => {
              const isAssigned = assignedStudentIds.has(student.id);
              const isUpdating = updating === student.id;

              return (
                <div
                  key={student.id}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-secondary/50 transition-colors ${
                    isAssigned ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => !isUpdating && handleToggleStudent(student.id, isAssigned)}
                >
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Checkbox
                      checked={isAssigned}
                      onCheckedChange={() => handleToggleStudent(student.id, isAssigned)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{student.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[student.grade, student.school].filter(Boolean).join(' · ') || '-'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
