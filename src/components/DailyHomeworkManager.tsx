// DAILY-HOMEWORK-V2: Per-student daily homework assignment grouped by teacher & grade
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { CalendarPlus, Loader2, Users, BookOpen, ChevronDown } from 'lucide-react';
import { format, startOfWeek, addDays, differenceInCalendarDays } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const SUBJECTS = ['수학', '영어', '국어', '과학'] as const;
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

interface StudentWithMeta {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

interface TeacherGroup {
  teacher_id: string;
  teacher_name: string;
  students: StudentWithMeta[];
}

export default function DailyHomeworkManager() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return format(now, 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const fri = addDays(startOfWeek(now, { weekStartsOn: 1 }), 4);
    return format(fri, 'yyyy-MM-dd');
  });
  const [subject, setSubject] = useState<string>('수학');
  const [teacherGroups, setTeacherGroups] = useState<TeacherGroup[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [homeworkContent, setHomeworkContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());
  const [requiredSubmissions, setRequiredSubmissions] = useState(1);

  // Fetch students grouped by teacher when dialog opens or subject changes
  useEffect(() => {
    if (open) {
      fetchStudentsBySubject(subject);
    }
  }, [open, subject]);

  async function fetchStudentsBySubject(subj: string) {
    setLoading(true);
    try {
      // Get students mapped to teachers for this subject via student_subject_teachers
      let mappingsQuery = supabase
        .from('student_subject_teachers')
        .select('student_id, teacher_id, subject')
        .eq('subject', subj);

      // Teachers only see their own students
      if (role === 'teacher' && user?.id) {
        mappingsQuery = mappingsQuery.eq('teacher_id', user.id);
      }

      const { data: mappings } = await mappingsQuery;

      if (!mappings || mappings.length === 0) {
        // Fallback: try class-based grouping
        let classQuery = supabase
          .from('classes')
          .select('id, teacher_id, name')
          .eq('subject', subj as any);

        // Teachers only see their own classes
        if (role === 'teacher' && user?.id) {
          classQuery = classQuery.eq('teacher_id', user.id);
        }

        const { data: classData } = await classQuery;
        if (!classData || classData.length === 0) {
          setTeacherGroups([]);
          setLoading(false);
          return;
        }

        const classIds = classData.map(c => c.id);
        const teacherIds = [...new Set(classData.map(c => c.teacher_id).filter(Boolean))] as string[];

        const [studentsRes, profilesRes] = await Promise.all([
          supabase
            .from('class_students')
            .select('class_id, students:student_id (id, name, grade, school, enrollment_status)')
            .in('class_id', classIds),
          teacherIds.length > 0
            ? supabase.from('profiles').select('id, full_name').in('id', teacherIds)
            : Promise.resolve({ data: [] }),
        ]);

        const teacherNameMap: Record<string, string> = {};
        (profilesRes.data || []).forEach((p: any) => {
          teacherNameMap[p.id] = p.full_name;
        });

        const groups: Record<string, TeacherGroup> = {};
        const classTeacherMap: Record<string, string> = {};
        classData.forEach(c => {
          if (c.teacher_id) classTeacherMap[c.id] = c.teacher_id;
        });

        (studentsRes.data || []).forEach((cs: any) => {
          const student = cs.students;
          if (!student || student.enrollment_status !== '재학') return;
          const teacherId = classTeacherMap[cs.class_id] || 'unknown';
          if (!groups[teacherId]) {
            groups[teacherId] = {
              teacher_id: teacherId,
              teacher_name: teacherNameMap[teacherId] || '미배정',
              students: [],
            };
          }
          if (!groups[teacherId].students.find(s => s.id === student.id)) {
            groups[teacherId].students.push({
              id: student.id,
              name: student.name,
              grade: student.grade,
              school: student.school,
            });
          }
        });

        const result = Object.values(groups).map(g => ({
          ...g,
          students: g.students.sort((a, b) => {
            const gradeA = a.grade || '';
            const gradeB = b.grade || '';
            if (gradeA !== gradeB) return gradeA.localeCompare(gradeB);
            return a.name.localeCompare(b.name);
          }),
        }));

        setTeacherGroups(result);
        setExpandedTeachers(new Set(result.map(g => g.teacher_id)));
        setLoading(false);
        return;
      }

      // Use student_subject_teachers mappings
      const studentIds = [...new Set(mappings.map(m => m.student_id))];
      const teacherIds = [...new Set(mappings.map(m => m.teacher_id))];

      const [studentsRes, profilesRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, grade, school, enrollment_status')
          .in('id', studentIds)
          .in('enrollment_status', ['재학']),
        supabase.from('profiles').select('id, full_name').in('id', teacherIds),
      ]);

      const studentMap: Record<string, StudentWithMeta> = {};
      (studentsRes.data || []).forEach((s: any) => {
        studentMap[s.id] = { id: s.id, name: s.name, grade: s.grade, school: s.school };
      });

      const teacherNameMap: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => {
        teacherNameMap[p.id] = p.full_name;
      });

      const groups: Record<string, TeacherGroup> = {};
      mappings.forEach(m => {
        if (!studentMap[m.student_id]) return;
        if (!groups[m.teacher_id]) {
          groups[m.teacher_id] = {
            teacher_id: m.teacher_id,
            teacher_name: teacherNameMap[m.teacher_id] || '미배정',
            students: [],
          };
        }
        if (!groups[m.teacher_id].students.find(s => s.id === m.student_id)) {
          groups[m.teacher_id].students.push(studentMap[m.student_id]);
        }
      });

      const result = Object.values(groups).map(g => ({
        ...g,
        students: g.students.sort((a, b) => {
          const gradeA = a.grade || '';
          const gradeB = b.grade || '';
          if (gradeA !== gradeB) return gradeA.localeCompare(gradeB);
          return a.name.localeCompare(b.name);
        }),
      }));

      setTeacherGroups(result);
      setExpandedTeachers(new Set(result.map(g => g.teacher_id)));
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleStudent(id: string) {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTeacherGroup(teacherId: string) {
    const group = teacherGroups.find(g => g.teacher_id === teacherId);
    if (!group) return;
    const allSelected = group.students.every(s => selectedStudents.has(s.id));
    setSelectedStudents(prev => {
      const next = new Set(prev);
      group.students.forEach(s => {
        if (allSelected) next.delete(s.id);
        else next.add(s.id);
      });
      return next;
    });
  }

  function toggleExpandTeacher(teacherId: string) {
    setExpandedTeachers(prev => {
      const next = new Set(prev);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  }

  // Total days in the selected range (including weekends)
  const totalDays = (() => {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    if (s > e) return 0;
    return differenceInCalendarDays(e, s) + 1;
  })();

  const totalStudents = teacherGroups.reduce((sum, g) => sum + g.students.length, 0);

  async function handleSubmit() {
    if (selectedStudents.size === 0) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' });
      return;
    }

    if (!homeworkContent.trim()) {
      toast({ title: '숙제 내용을 입력해주세요', variant: 'destructive' });
      return;
    }

    if (totalDays === 0) {
      toast({ title: '올바른 기간을 선택해주세요', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const inserts: any[] = [];

      for (const studentId of selectedStudents) {
        inserts.push({
          student_id: studentId,
          subject: subject,
          content: homeworkContent.trim(),
          assigned_date: startDate,
          end_date: endDate,
          required_submissions: requiredSubmissions,
          homework_type: 'daily',
          check_status: 'unchecked',
          created_by: user?.id || null,
        });
      }

      const { error } = await supabase
        .from('homework_assignments')
        .insert(inserts);

      if (error) throw error;

      toast({
        title: '데일리숙제 등록 완료',
        description: `${selectedStudents.size}명 × ${totalDays}일 기간 (인증 ${requiredSubmissions}회)`,
      });

      setHomeworkContent('');
      setSelectedStudents(new Set());
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
              데일리숙제 등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Date Range & Subject Selection */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">시작일</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // Auto-adjust end date if it's before start
                    if (e.target.value > endDate) setEndDate(e.target.value);
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">종료일</label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">과목</label>
                <Select value={subject} onValueChange={(v) => { setSubject(v); setSelectedStudents(new Set()); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date range & submissions display */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {startDate} ~ {endDate} ({totalDays}일)
              </Badge>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">인증 횟수</label>
                <Input
                  type="number"
                  min={1}
                  max={totalDays || 1}
                  value={requiredSubmissions}
                  onChange={(e) => setRequiredSubmissions(Math.max(1, Math.min(totalDays || 1, parseInt(e.target.value) || 1)))}
                  className="w-20 h-8"
                />
                <span className="text-xs text-muted-foreground">회</span>
              </div>
              {totalDays === 0 && (
                <span className="text-xs text-destructive">올바른 기간을 선택해주세요</span>
              )}
            </div>

            {/* Homework Content */}
            <div>
              <label className="text-sm font-medium mb-1 block">숙제 내용 (전체 주간 동일 적용)</label>
              <Textarea
                placeholder="예: 교재 p.30~35 풀기"
                value={homeworkContent}
                onChange={(e) => setHomeworkContent(e.target.value)}
                rows={3}
              />
            </div>

            {/* Student Selection by Teacher & Grade */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  학생 선택 ({selectedStudents.size}/{totalStudents})
                </label>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : teacherGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  해당 과목에 배정된 학생이 없습니다.
                </p>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto border rounded-lg p-2">
                  {teacherGroups.map(group => {
                    const allSelected = group.students.every(s => selectedStudents.has(s.id));
                    const someSelected = group.students.some(s => selectedStudents.has(s.id));
                    const isExpanded = expandedTeachers.has(group.teacher_id);

                    // Group students by grade
                    const byGrade: Record<string, StudentWithMeta[]> = {};
                    group.students.forEach(s => {
                      const grade = s.grade || '학년 미지정';
                      if (!byGrade[grade]) byGrade[grade] = [];
                      byGrade[grade].push(s);
                    });

                    return (
                      <div key={group.teacher_id} className="border rounded-lg overflow-hidden">
                        {/* Teacher header */}
                        <div
                          className="flex items-center justify-between p-2 bg-muted/50 cursor-pointer hover:bg-muted/80"
                          onClick={() => toggleExpandTeacher(group.teacher_id)}
                        >
                          <div className="flex items-center gap-2">
                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            <span className="font-medium text-sm">{group.teacher_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {group.students.filter(s => selectedStudents.has(s.id)).length}/{group.students.length}명
                            </Badge>
                          </div>
                          <Checkbox
                            checked={allSelected}
                            // @ts-ignore
                            indeterminate={someSelected && !allSelected}
                            onCheckedChange={() => toggleTeacherGroup(group.teacher_id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        {/* Students by grade */}
                        {isExpanded && (
                          <div className="p-2 space-y-2">
                            {Object.entries(byGrade).sort(([a], [b]) => a.localeCompare(b)).map(([grade, students]) => (
                              <div key={grade}>
                                <div className="text-xs text-muted-foreground font-medium mb-1 pl-1">
                                  {grade}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                                  {students.map(s => (
                                    <label
                                      key={s.id}
                                      className={`flex items-center gap-2 p-1.5 rounded text-sm cursor-pointer transition-colors ${
                                        selectedStudents.has(s.id) ? 'bg-primary/10' : 'hover:bg-accent'
                                      }`}
                                    >
                                      <Checkbox
                                        checked={selectedStudents.has(s.id)}
                                        onCheckedChange={() => toggleStudent(s.id)}
                                      />
                                      <span>{s.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedStudents.size === 0 || !homeworkContent.trim() || totalDays === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  등록 중...
                </>
              ) : (
                <>
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  {selectedStudents.size}명에게 데일리숙제 등록 ({totalDays}일, 인증 {requiredSubmissions}회)
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
