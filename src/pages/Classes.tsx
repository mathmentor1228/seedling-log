import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, BookOpen, Edit2, Trash2, Loader2, Clock } from 'lucide-react';
import { ClassScheduleManager, formatScheduleDisplay, type Schedule } from '@/components/ClassScheduleManager';

type SubjectType = '수학' | '과학' | '영어' | '국어';

const SUBJECTS: { value: SubjectType; label: string }[] = [
  { value: '수학', label: '수학' },
  { value: '과학', label: '과학' },
  { value: '영어', label: '영어' },
  { value: '국어', label: '국어' },
];

interface ClassItem {
  id: string;
  name: string;
  subject: SubjectType;
  teacher_id: string | null;
  schedule: string | null;
  created_at: string;
  teacher_email?: string;
  student_count?: number;
  schedules?: Schedule[];
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

export default function Classes() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    teacher_id: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
  }, []);

  async function fetchClasses() {
    try {
      // Fetch classes with student count and schedules
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select(`
          *,
          class_students (count),
          class_schedules (id, day_of_week, start_time, end_time)
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

      // Collect teacher IDs to fetch emails separately
      const teacherIds = (classData || [])
        .map((c: any) => c.teacher_id)
        .filter((id: string | null) => id !== null);

      let teacherMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', teacherIds);

        if (profilesError) {
          console.error('Supabase profiles error:', profilesError);
        } else {
          teacherMap = (profilesData || []).reduce((acc: Record<string, string>, p: any) => {
            acc[p.id] = p.email;
            return acc;
          }, {});
        }
      }

      const formattedClasses = (classData || []).map((c: any) => ({
        ...c,
        teacher_email: c.teacher_id ? teacherMap[c.teacher_id] : null,
        student_count: c.class_students?.[0]?.count ?? 0,
        schedules: c.class_schedules || [],
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
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher');

      if (rolesError) throw rolesError;

      if (rolesData && rolesData.length > 0) {
        const teacherIds = rolesData.map((r) => r.user_id);
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
          title: 'Success',
          description: 'Class updated successfully',
        });
      } else {
        const { error } = await supabase.from('classes').insert(classPayload);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Class created successfully',
        });
      }

      setIsDialogOpen(false);
      setEditingClass(null);
      setFormData({ name: '', subject: '', teacher_id: '' });
      fetchClasses();
    } catch (error: any) {
      console.error('Error saving class:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save class',
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
    if (!confirm('Are you sure you want to delete this class?')) return;

    try {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Class deleted successfully',
      });
      fetchClasses();
    } catch (error: any) {
      console.error('Error deleting class:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete class',
        variant: 'destructive',
      });
    }
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
          <h1 className="text-2xl font-bold text-foreground">Classes</h1>
          <p className="text-muted-foreground mt-1">Manage your class schedule</p>
        </div>

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
              Add Class
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingClass ? 'Edit Class' : 'Create New Class'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Class Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Math 101"
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
                <Label htmlFor="teacher">Assigned Teacher</Label>
                <Select
                  value={formData.teacher_id}
                  onValueChange={(value) => setFormData({ ...formData, teacher_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.full_name} ({teacher.email})
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
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingClass ? 'Update' : 'Create'} Class
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No classes yet. Create your first class!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((classItem) => (
            <Card key={classItem.id} className="animate-fade-in">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{classItem.name}</CardTitle>
                    <Badge variant="secondary" className="mt-1">
                      {classItem.subject}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(classItem)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(classItem.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{classItem.student_count} students</span>
                  </div>
                  <p className="text-muted-foreground">
                    담당: {classItem.teacher_email || '미배정'}
                  </p>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{formatScheduleDisplay(classItem.schedules || [])}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
