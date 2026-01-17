import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { Plus, BookOpen, Edit2, Trash2, Loader2, Users, Copy, Calendar, ChevronDown, ChevronRight, Power, PowerOff } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { getTodayKST } from '@/lib/utils';
import { ClassScheduleManager, type Schedule } from '@/components/ClassScheduleManager';
import { ClassStudentManager } from '@/components/ClassStudentManager';
import { TeacherScheduleTable } from '@/components/TeacherScheduleTable';
import { StudentTimetableLookup } from '@/components/StudentTimetableLookup';
import { useAuth, isAdmin } from '@/lib/auth';

type SubjectType = '수학' | '과학' | '영어' | '국어';

const SUBJECTS: { value: SubjectType; label: string }[] = [
  { value: '수학', label: '수학' },
  { value: '과학', label: '과학' },
  { value: '영어', label: '영어' },
  { value: '국어', label: '국어' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

// CLASS-ACTIVE-TOGGLE-V1: Extended schedule row with inactive_until
interface ClassScheduleRow {
  classId: string;
  className: string;
  subject: SubjectType;
  teacherId: string | null;
  teacherName: string | null;
  scheduleId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  inactiveUntil: string | null;
  inactiveReason: string | null;
  studentCount: number;
}

interface ClassItem {
  id: string;
  name: string;
  subject: SubjectType;
  teacher_id: string | null;
  schedule: string | null;
  created_at: string;
  teacher_email?: string;
  teacher_name?: string;
  student_count?: number;
  schedules?: Schedule[];
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

export default function Classes() {
  const { role, user } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [detailClass, setDetailClass] = useState<ClassItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    teacher_id: '',
  });

  // Filters
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');

  // Admin view mode
  const [adminViewMode, setAdminViewMode] = useState<'teacher' | 'student'>('teacher');
  const [adminSelectedTeacher, setAdminSelectedTeacher] = useState<string>('all');
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());

  // Highlight class for teacher schedule
  const [highlightClassId, setHighlightClassId] = useState<string | null>(null);

  // Bulk creation form
  const [bulkForm, setBulkForm] = useState({
    teacher_id: '',
    subject: '',
    start_time: '09:00',
    end_time: '10:00',
    selectedDays: [] as number[],
  });

  // CLASS-ACTIVE-TOGGLE-V1: Deactivation state
  const [deactivateDialog, setDeactivateDialog] = useState<{
    open: boolean;
    scheduleId: string | null;
    currentIsActive: boolean;
    inactiveUntil: string;
    inactiveReason: string;
  }>({
    open: false,
    scheduleId: null,
    currentIsActive: true,
    inactiveUntil: '',
    inactiveReason: '',
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
  }, []);

  async function fetchClasses() {
    try {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          *,
          class_students (count),
          class_schedules (id, day_of_week, start_time, end_time, is_active, inactive_until, inactive_reason, teacher_id)
        `)
        .order('name');

      if (classError) {
        console.error('Supabase classes error:', classError);
        toast({
          title: '클래스 로딩 오류',
          description: classError.message || '클래스 목록을 불러오지 못했습니다',
          variant: 'destructive',
        });
        setClasses([]);
        return;
      }

      // Collect teacher IDs to fetch names separately
      const teacherIds = new Set<string>();
      (classData || []).forEach((c: any) => {
        if (c.teacher_id) teacherIds.add(c.teacher_id);
        (c.class_schedules || []).forEach((s: any) => {
          if (s.teacher_id) teacherIds.add(s.teacher_id);
        });
      });

      let teacherMap: Record<string, { email: string; name: string }> = {};
      if (teacherIds.size > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', Array.from(teacherIds));

        if (profilesError) {
          console.error('Supabase profiles error:', profilesError);
        } else {
          teacherMap = (profilesData || []).reduce((acc: Record<string, { email: string; name: string }>, p: any) => {
            acc[p.id] = { email: p.email, name: p.full_name };
            return acc;
          }, {});
        }
      }

      const formattedClasses = (classData || []).map((c: any) => ({
        ...c,
        teacher_email: c.teacher_id ? teacherMap[c.teacher_id]?.email : null,
        teacher_name: c.teacher_id ? teacherMap[c.teacher_id]?.name : null,
        student_count: c.class_students?.[0]?.count ?? 0,
        schedules: (c.class_schedules || []).map((s: any) => ({
          ...s,
          teacher_name: s.teacher_id ? teacherMap[s.teacher_id]?.name : null,
          inactive_until: s.inactive_until || null,
          inactive_reason: s.inactive_reason || null,
        })),
      }));

      setClasses(formattedClasses);
    } catch (error: any) {
      console.error('Error fetching classes:', error);
      toast({
        title: '오류',
        description: error?.message || '클래스 목록을 불러오지 못했습니다',
        variant: 'destructive',
      });
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTeachers() {
    try {
      // Fetch users with teacher OR admin role
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['teacher', 'admin']);

      if (rolesError) throw rolesError;

      if (rolesData && rolesData.length > 0) {
        // Deduplicate user IDs (in case someone has both roles)
        const teacherIds = [...new Set(rolesData.map((r) => r.user_id))];
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', teacherIds);

        if (profilesError) throw profilesError;
        setTeachers(profilesData || []);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  }

  // Flatten classes + schedules into table rows
  const scheduleRows: ClassScheduleRow[] = useMemo(() => {
    const rows: ClassScheduleRow[] = [];
    classes.forEach((cls) => {
      (cls.schedules || []).forEach((sch: any) => {
        rows.push({
          classId: cls.id,
          className: cls.name,
          subject: cls.subject,
          teacherId: sch.teacher_id || cls.teacher_id,
          teacherName: sch.teacher_name || cls.teacher_name || null,
          scheduleId: sch.id,
          dayOfWeek: sch.day_of_week,
          startTime: sch.start_time,
          endTime: sch.end_time,
          isActive: sch.is_active,
          inactiveUntil: sch.inactive_until || null,
          inactiveReason: sch.inactive_reason || null,
          studentCount: cls.student_count || 0,
        });
      });
    });
    return rows;
  }, [classes]);

  // Teacher's own schedule rows (for teacher view "내 시간표")
  const myScheduleRows = useMemo(() => {
    if (isAdmin(role)) return [];
    return scheduleRows.filter((r) => r.teacherId === user?.id).sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [scheduleRows, role, user?.id]);

  // Group schedules by teacher for admin "전체" view
  const schedulesByTeacher = useMemo(() => {
    const map = new Map<string, { teacherName: string; rows: ClassScheduleRow[] }>();
    scheduleRows.forEach((r) => {
      const tId = r.teacherId || 'unassigned';
      if (!map.has(tId)) {
        map.set(tId, { teacherName: r.teacherName || '미배정', rows: [] });
      }
      map.get(tId)!.rows.push(r);
    });
    // Sort each teacher's rows
    map.forEach((val) => {
      val.rows.sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.startTime.localeCompare(b.startTime);
      });
    });
    return map;
  }, [scheduleRows]);

  // Apply filters and sorting
  const filteredRows = useMemo(() => {
    let result = scheduleRows;

    if (filterTeacher !== 'all') {
      result = result.filter((r) => r.teacherId === filterTeacher);
    }
    if (filterDay !== 'all') {
      result = result.filter((r) => r.dayOfWeek === parseInt(filterDay));
    }
    if (filterSubject !== 'all') {
      result = result.filter((r) => r.subject === filterSubject);
    }

    // Sort: day_of_week -> start_time -> teacher_name
    result.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return (a.teacherName || '').localeCompare(b.teacherName || '');
    });

    return result;
  }, [scheduleRows, filterTeacher, filterDay, filterSubject]);

  const toggleTeacherExpand = (teacherId: string) => {
    setExpandedTeachers((prev) => {
      const next = new Set(prev);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5); // HH:MM
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.subject) {
      toast({
        title: '유효성 오류',
        description: '이름과 과목은 필수입니다',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const classPayload = {
        name: formData.name.trim(),
        subject: formData.subject as SubjectType,
        teacher_id: formData.teacher_id || null,
      };

      if (editingClass) {
        const { error } = await supabase
          .from('classes')
          .update(classPayload)
          .eq('id', editingClass.id);

        if (error) throw error;

        toast({
          title: '성공',
          description: '클래스가 수정되었습니다',
        });
      } else {
        const { error } = await supabase.from('classes').insert(classPayload);

        if (error) throw error;

        toast({
          title: '성공',
          description: '클래스가 생성되었습니다',
        });
      }

      setIsDialogOpen(false);
      setEditingClass(null);
      setFormData({ name: '', subject: '', teacher_id: '' });
      fetchClasses();
    } catch (error: any) {
      console.error('Error saving class:', error);
      toast({
        title: '오류',
        description: error.message || '클래스 저장 실패',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (classItem: ClassItem) => {
    setEditingClass(classItem);
    setFormData({
      name: classItem.name,
      subject: classItem.subject,
      teacher_id: classItem.teacher_id || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 클래스를 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: '성공',
        description: '클래스가 삭제되었습니다',
      });
      fetchClasses();
    } catch (error: any) {
      console.error('Error deleting class:', error);
      toast({
        title: '오류',
        description: error.message || '클래스 삭제 실패',
        variant: 'destructive',
      });
    }
  };

  const handleOpenDetail = (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    if (cls) setDetailClass(cls);
  };

  // CLASS-ACTIVE-TOGGLE-V1: Open deactivation dialog for a schedule
  const handleOpenDeactivateDialog = (row: ClassScheduleRow) => {
    const todayKST = getTodayKST();
    // Compute effective active status
    const effectivelyActive = row.isActive && (!row.inactiveUntil || row.inactiveUntil < todayKST);
    
    setDeactivateDialog({
      open: true,
      scheduleId: row.scheduleId,
      currentIsActive: effectivelyActive,
      inactiveUntil: row.inactiveUntil || '',
      inactiveReason: row.inactiveReason || '',
    });
  };

  // CLASS-ACTIVE-TOGGLE-V1: Toggle schedule active status
  const handleToggleScheduleActive = async () => {
    if (!deactivateDialog.scheduleId) return;

    setIsSubmitting(true);
    try {
      const todayKST = getTodayKST();
      const effectivelyActive = deactivateDialog.currentIsActive;

      if (effectivelyActive) {
        // Deactivating: set is_active=false OR set inactive_until
        const updateData: any = {
          is_active: !deactivateDialog.inactiveUntil, // if has inactive_until, keep is_active=true
          inactive_until: deactivateDialog.inactiveUntil || null,
          inactive_reason: deactivateDialog.inactiveReason || null,
        };
        
        // If we have an inactive_until date, keep is_active=true (will auto-reactivate)
        if (deactivateDialog.inactiveUntil) {
          updateData.is_active = true;
        }

        const { error } = await supabase
          .from('class_schedules')
          .update(updateData)
          .eq('id', deactivateDialog.scheduleId);

        if (error) throw error;

        toast({
          title: '비활성화 완료',
          description: deactivateDialog.inactiveUntil 
            ? `${deactivateDialog.inactiveUntil}까지 비활성화됩니다.` 
            : '슬롯이 비활성화되었습니다.',
        });
      } else {
        // Reactivating: clear inactive_until and set is_active=true
        const { error } = await supabase
          .from('class_schedules')
          .update({
            is_active: true,
            inactive_until: null,
            inactive_reason: null,
          })
          .eq('id', deactivateDialog.scheduleId);

        if (error) throw error;

        toast({
          title: '활성화 완료',
          description: '슬롯이 다시 활성화되었습니다.',
        });
      }

      setDeactivateDialog({ ...deactivateDialog, open: false, scheduleId: null });
      fetchClasses();
    } catch (error: any) {
      console.error('Error toggling schedule active:', error);
      toast({
        title: '오류',
        description: error.message || '상태 변경 실패',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // CLASS-ACTIVE-TOGGLE-V1: Get status badge for a schedule
  const getScheduleStatusBadge = (row: ClassScheduleRow) => {
    const todayKST = getTodayKST();
    
    if (!row.isActive) {
      return { label: '비활성(종료일 미정)', variant: 'outline' as const, isInactive: true };
    }
    
    if (row.inactiveUntil && row.inactiveUntil >= todayKST) {
      return { 
        label: `비활성(~${row.inactiveUntil.slice(5).replace('-', '/')})`, 
        variant: 'outline' as const, 
        isInactive: true 
      };
    }
    
    return { label: '활성', variant: 'default' as const, isInactive: false };
  };

  // Bulk creation handler
  const handleBulkCreate = async () => {
    if (!bulkForm.teacher_id || !bulkForm.subject || bulkForm.selectedDays.length === 0) {
      toast({
        title: '유효성 오류',
        description: '선생님, 과목, 최소 하나의 요일을 선택해주세요',
        variant: 'destructive',
      });
      return;
    }

    if (bulkForm.start_time >= bulkForm.end_time) {
      toast({
        title: '유효성 오류',
        description: '종료 시간은 시작 시간보다 늦어야 합니다',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const createdDays: string[] = [];
      const warningDays: string[] = [];

      // Non-blocking overlap warning (creation is ALWAYS allowed)
      let existingSchedules: Array<{ day_of_week: number; start_time: string; end_time: string }> = [];
      const { data: existingSchedulesData, error: existingSchedulesError } = await supabase
        .from('class_schedules')
        .select('day_of_week, start_time, end_time')
        .eq('teacher_id', bulkForm.teacher_id)
        .eq('is_active', true)
        .in('day_of_week', bulkForm.selectedDays);

      if (!existingSchedulesError && existingSchedulesData) {
        existingSchedules = existingSchedulesData as any;
      }

      const newStart = bulkForm.start_time;
      const newEnd = bulkForm.end_time;

      for (const day of bulkForm.selectedDays) {
        const dayLabel = DAYS_OF_WEEK.find((d) => d.value === day)?.label || String(day);

        const overlaps = existingSchedules.some((s) => {
          const sStart = (s.start_time || '').slice(0, 5);
          const sEnd = (s.end_time || '').slice(0, 5);
          return s.day_of_week === day && newStart < sEnd && sStart < newEnd;
        });

        if (overlaps) {
          warningDays.push(dayLabel);
        }

        // Create class for this day
        const className = `${bulkForm.subject} ${dayLabel} ${bulkForm.start_time}`;
        const { data: newClass, error: classError } = await supabase
          .from('classes')
          .insert({
            name: className,
            subject: bulkForm.subject as SubjectType,
            teacher_id: bulkForm.teacher_id,
          })
          .select()
          .single();

        if (classError) {
          console.error('Error creating class:', classError);
          continue;
        }

        // Create schedule for this class
        const { error: scheduleError } = await supabase
          .from('class_schedules')
          .insert({
            class_id: newClass.id,
            teacher_id: bulkForm.teacher_id,
            day_of_week: day,
            start_time: bulkForm.start_time,
            end_time: bulkForm.end_time,
          });

        if (scheduleError) {
          console.error('Error creating schedule:', scheduleError);
          // Rollback class creation
          await supabase.from('classes').delete().eq('id', newClass.id);
          continue;
        }

        createdDays.push(dayLabel);
      }

      toast({
        title: createdDays.length > 0 ? '일괄 생성 완료' : '일괄 생성 실패',
        description: createdDays.length > 0 ? `생성 완료: ${createdDays.length}개` : '생성된 슬롯이 없습니다',
        variant: createdDays.length > 0 ? 'default' : 'destructive',
      });

      if (createdDays.length > 0 && warningDays.length > 0) {
        toast({
          title: '주의',
          description: '동일 시간대 슬롯이 이미 존재합니다. 학생 배정 시 충돌이 발생할 수 있어요.',
        });
      }

      if (createdDays.length > 0) {
        setIsBulkDialogOpen(false);
        setBulkForm({
          teacher_id: '',
          subject: '',
          start_time: '09:00',
          end_time: '10:00',
          selectedDays: [],
        });
        fetchClasses();
      }
    } catch (error: any) {
      console.error('Error in bulk creation:', error);
      toast({
        title: '오류',
        description: error.message || '일괄 생성 실패',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleBulkDay = (day: number) => {
    setBulkForm((prev) => ({
      ...prev,
      selectedDays: prev.selectedDays.includes(day)
        ? prev.selectedDays.filter((d) => d !== day)
        : [...prev.selectedDays, day].sort((a, b) => a - b),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">수업 관리</h1>
          <p className="text-muted-foreground mt-1">수업 시간표를 관리합니다</p>
        </div>

        <div className="flex gap-2">
          {isAdmin(role) && (
            <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Copy className="w-4 h-4 mr-2" />
                  일괄 생성
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>일괄 슬롯 생성</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>선생님 *</Label>
                    <Select
                      value={bulkForm.teacher_id}
                      onValueChange={(value) => setBulkForm({ ...bulkForm, teacher_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선생님 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {isAdmin(role) && user && (
                          <SelectItem key="self" value={user.id} className="border-b border-border mb-1 pb-2">
                            <span className="font-medium">나 (원장)</span>
                          </SelectItem>
                        )}
                        {teachers.filter(t => !(isAdmin(role) && user && t.id === user.id)).map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            <span>{teacher.full_name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{teacher.email}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>과목 *</Label>
                    <Select
                      value={bulkForm.subject}
                      onValueChange={(value) => setBulkForm({ ...bulkForm, subject: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="과목 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map((subject) => (
                          <SelectItem key={subject.value} value={subject.value}>
                            {subject.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>시작 시간 *</Label>
                      <Input
                        type="time"
                        value={bulkForm.start_time}
                        onChange={(e) => setBulkForm({ ...bulkForm, start_time: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>종료 시간 *</Label>
                      <Input
                        type="time"
                        value={bulkForm.end_time}
                        onChange={(e) => setBulkForm({ ...bulkForm, end_time: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>요일 선택 *</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <div
                          key={day.value}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`day-${day.value}`}
                            checked={bulkForm.selectedDays.includes(day.value)}
                            onCheckedChange={() => toggleBulkDay(day.value)}
                          />
                          <Label
                            htmlFor={`day-${day.value}`}
                            className="text-sm cursor-pointer"
                          >
                            {day.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsBulkDialogOpen(false)}
                    >
                      취소
                    </Button>
                    <Button onClick={handleBulkCreate} disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      생성
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingClass(null);
              setFormData({ name: '', subject: '', teacher_id: '' });
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                클래스 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingClass ? '클래스 수정' : '새 클래스 생성'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">클래스 이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="예: 수학 월 09:00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">과목 *</Label>
                  <Select
                    value={formData.subject}
                    onValueChange={(value) => setFormData({ ...formData, subject: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="과목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map((subject) => (
                        <SelectItem key={subject.value} value={subject.value}>
                          {subject.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teacher">담당 선생님</Label>
                  <Select
                    value={formData.teacher_id}
                    onValueChange={(value) => setFormData({ ...formData, teacher_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="선생님 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {isAdmin(role) && user && (
                        <SelectItem key="self" value={user.id} className="border-b border-border mb-1 pb-2">
                          <span className="font-medium">나 (원장)</span>
                        </SelectItem>
                      )}
                      {teachers.filter(t => !(isAdmin(role) && user && t.id === user.id)).map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          <span>{teacher.full_name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{teacher.email}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editingClass && (
                  <ClassScheduleManager
                    classId={editingClass.id}
                    teacherId={formData.teacher_id || null}
                    onSchedulesChange={fetchClasses}
                  />
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    취소
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingClass ? '수정' : '생성'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Admin: View toggle */}
      {isAdmin(role) && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">보기 모드</Label>
                <div className="flex gap-1">
                  <Button
                    variant={adminViewMode === 'teacher' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAdminViewMode('teacher')}
                  >
                    <Calendar className="w-4 h-4 mr-1" />
                    선생님 시간표
                  </Button>
                  <Button
                    variant={adminViewMode === 'student' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAdminViewMode('student')}
                  >
                    <Users className="w-4 h-4 mr-1" />
                    학생 시간표
                  </Button>
                </div>
              </div>
              {adminViewMode === 'teacher' && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">선생님</Label>
                  <Select value={adminSelectedTeacher} onValueChange={setAdminSelectedTeacher}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin: Student timetable lookup */}
      {isAdmin(role) && adminViewMode === 'student' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">학생 시간표 조회</CardTitle>
          </CardHeader>
          <CardContent>
            <StudentTimetableLookup />
          </CardContent>
        </Card>
      )}

      {/* Admin: Teacher schedules view */}
      {isAdmin(role) && adminViewMode === 'teacher' && (
        <>
          {adminSelectedTeacher === 'all' ? (
            <div className="space-y-3">
              {Array.from(schedulesByTeacher.entries()).map(([teacherId, { teacherName, rows }]) => (
                <Collapsible
                  key={teacherId}
                  open={expandedTeachers.has(teacherId)}
                  onOpenChange={() => toggleTeacherExpand(teacherId)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {expandedTeachers.has(teacherId) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            <span className="font-medium">{teacherName}</span>
                            <Badge variant="secondary" className="text-xs">
                              {rows.length}개 수업
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4">
                        <TeacherScheduleTable
                          scheduleRows={rows}
                          onRowClick={handleOpenDetail}
                        />
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {teachers.find((t) => t.id === adminSelectedTeacher)?.full_name || '선생님'} 시간표
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TeacherScheduleTable
                  scheduleRows={scheduleRows.filter((r) => r.teacherId === adminSelectedTeacher)}
                  onRowClick={handleOpenDetail}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Teacher: Side-by-side layout with schedule panel */}
      {!isAdmin(role) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">요일</Label>
                    <Select value={filterDay} onValueChange={setFilterDay}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        {DAYS_OF_WEEK.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">과목</Label>
                    <Select value={filterSubject} onValueChange={setFilterSubject}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        {SUBJECTS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            {filteredRows.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {scheduleRows.length === 0
                      ? '등록된 수업 시간표가 없습니다.'
                      : '필터 조건에 맞는 수업이 없습니다'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>요일</TableHead>
                      <TableHead>시간</TableHead>
                      <TableHead>과목</TableHead>
                      <TableHead className="text-center">배정학생수</TableHead>
                      <TableHead className="text-center">활성</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow
                        key={row.scheduleId}
                        className={highlightClassId === row.classId ? 'bg-primary/10' : ''}
                      >
                        <TableCell>
                          <Badge variant="outline">
                            {DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatTime(row.startTime)}–{formatTime(row.endTime)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.subject}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="flex items-center justify-center gap-1">
                            <Users className="w-3 h-3" />
                            {row.studentCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const status = getScheduleStatusBadge(row);
                            return (
                              <Badge variant={status.variant} className={status.isInactive ? 'text-muted-foreground' : ''}>
                                {status.label}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const cls = classes.find((c) => c.id === row.classId);
                                if (cls) handleEdit(cls);
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDetail(row.classId)}
                            >
                              <Users className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>

          {/* Right side panel: Teacher's schedule */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  내 시간표
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TeacherScheduleTable
                  scheduleRows={myScheduleRows}
                  onRowClick={(classId) => setHighlightClassId(classId)}
                  highlightClassId={highlightClassId}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Admin: Full table with all columns */}
      {isAdmin(role) && adminViewMode === 'teacher' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">선생님</Label>
                  <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">요일</Label>
                  <Select value={filterDay} onValueChange={setFilterDay}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">과목</Label>
                  <Select value={filterSubject} onValueChange={setFilterSubject}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {SUBJECTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {filteredRows.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {scheduleRows.length === 0
                    ? '등록된 수업 시간표가 없습니다. 클래스를 추가해주세요!'
                    : '필터 조건에 맞는 수업이 없습니다'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>선생님</TableHead>
                    <TableHead>요일</TableHead>
                    <TableHead>시간</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead className="text-center">배정학생수</TableHead>
                    <TableHead className="text-center">활성</TableHead>
                    <TableHead className="text-right">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.scheduleId}>
                      <TableCell className="font-medium">
                        {row.teacherName || '미배정'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatTime(row.startTime)}–{formatTime(row.endTime)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.subject}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center justify-center gap-1">
                          <Users className="w-3 h-3" />
                          {row.studentCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const status = getScheduleStatusBadge(row);
                          return (
                            <Badge variant={status.variant} className={status.isInactive ? 'text-muted-foreground' : ''}>
                              {status.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDeactivateDialog(row)}
                            title={getScheduleStatusBadge(row).isInactive ? '활성화' : '비활성화'}
                          >
                            {getScheduleStatusBadge(row).isInactive ? (
                              <Power className="w-4 h-4 text-green-600" />
                            ) : (
                              <PowerOff className="w-4 h-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const cls = classes.find((c) => c.id === row.classId);
                              if (cls) handleEdit(cls);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetail(row.classId)}
                          >
                            <Users className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(row.classId)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Class Detail Dialog */}
      <Dialog open={!!detailClass} onOpenChange={(open) => !open && setDetailClass(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailClass?.name}
              <Badge variant="secondary">{detailClass?.subject}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>담당: {detailClass?.teacher_name || detailClass?.teacher_email || '미배정'}</p>
            </div>
            {detailClass && (
              <ClassStudentManager
                classId={detailClass.id}
                onStudentCountChange={(count) => {
                  setClasses((prev) =>
                    prev.map((c) =>
                      c.id === detailClass.id ? { ...c, student_count: count } : c
                    )
                  );
                  setDetailClass((prev) =>
                    prev ? { ...prev, student_count: count } : prev
                  );
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CLASS-ACTIVE-TOGGLE-V1: Deactivation Dialog */}
      <Dialog 
        open={deactivateDialog.open} 
        onOpenChange={(open) => !open && setDeactivateDialog({ ...deactivateDialog, open: false })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {deactivateDialog.currentIsActive ? (
                <>
                  <PowerOff className="w-5 h-5" />
                  슬롯 비활성화
                </>
              ) : (
                <>
                  <Power className="w-5 h-5 text-green-600" />
                  슬롯 활성화
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {deactivateDialog.currentIsActive ? (
              <>
                <p className="text-sm text-muted-foreground">
                  비활성화하면 오늘 출석부(로스터)에서 이 슬롯이 숨겨집니다.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="inactive_until">비활성 종료일 (재활성 예정일)</Label>
                  <Input
                    id="inactive_until"
                    type="date"
                    value={deactivateDialog.inactiveUntil}
                    onChange={(e) => setDeactivateDialog({ 
                      ...deactivateDialog, 
                      inactiveUntil: e.target.value 
                    })}
                    min={getTodayKST()}
                  />
                  <p className="text-xs text-muted-foreground">
                    이 날짜까지 비활성 상태이며, 다음 날부터 자동 활성화됩니다. 비워두면 수동으로 활성화해야 합니다.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inactive_reason">사유 (선택)</Label>
                  <Textarea
                    id="inactive_reason"
                    placeholder="예: 방학 기간, 선생님 휴가"
                    value={deactivateDialog.inactiveReason}
                    onChange={(e) => setDeactivateDialog({ 
                      ...deactivateDialog, 
                      inactiveReason: e.target.value 
                    })}
                    rows={2}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                이 슬롯을 다시 활성화하시겠습니까? 활성화하면 오늘 출석부에 다시 표시됩니다.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setDeactivateDialog({ ...deactivateDialog, open: false })}
              >
                취소
              </Button>
              <Button 
                onClick={handleToggleScheduleActive}
                disabled={isSubmitting}
                variant={deactivateDialog.currentIsActive ? 'destructive' : 'default'}
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {deactivateDialog.currentIsActive ? '비활성화' : '활성화'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
