import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Users } from 'lucide-react';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
}

interface SubjectMapping {
  subject: string;
  teacher_ids: string[];
}

interface StudentSubjectTeacherMappingProps {
  studentId: string;
  studentName: string;
}

const SUBJECTS = ['수학', '과학', '영어', '국어'] as const;

export default function StudentSubjectTeacherMapping({ studentId, studentName }: StudentSubjectTeacherMappingProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [mappings, setMappings] = useState<SubjectMapping[]>(
    SUBJECTS.map(s => ({ subject: s, teacher_ids: [] }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [studentId]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch teachers from profiles that have teacher role
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      
      if (profilesError) throw profilesError;

      // Filter to only teachers by checking user_roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher');

      if (rolesError) throw rolesError;

      const teacherUserIds = new Set(rolesData?.map(r => r.user_id) || []);
      const teacherProfiles = (profilesData || []).filter(p => teacherUserIds.has(p.id));
      setTeachers(teacherProfiles);

      // Fetch existing mappings for this student
      const { data: mappingsData, error: mappingsError } = await supabase
        .from('student_subject_teachers')
        .select('subject, teacher_id')
        .eq('student_id', studentId);

      if (mappingsError) throw mappingsError;

      // Build mappings state
      const newMappings: SubjectMapping[] = SUBJECTS.map(subject => ({
        subject,
        teacher_ids: (mappingsData || [])
          .filter(m => m.subject === subject)
          .map(m => m.teacher_id)
      }));
      setMappings(newMappings);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는데 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const toggleTeacher = (subject: string, teacherId: string) => {
    setMappings(prev => prev.map(m => {
      if (m.subject !== subject) return m;
      const hasTeacher = m.teacher_ids.includes(teacherId);
      return {
        ...m,
        teacher_ids: hasTeacher
          ? m.teacher_ids.filter(id => id !== teacherId)
          : [...m.teacher_ids, teacherId]
      };
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete all existing mappings for this student
      const { error: deleteError } = await supabase
        .from('student_subject_teachers')
        .delete()
        .eq('student_id', studentId);

      if (deleteError) throw deleteError;

      // Insert new mappings
      const inserts: { student_id: string; subject: string; teacher_id: string }[] = [];
      mappings.forEach(m => {
        m.teacher_ids.forEach(tid => {
          inserts.push({
            student_id: studentId,
            subject: m.subject,
            teacher_id: tid
          });
        });
      });

      if (inserts.length > 0) {
        const { error: insertError } = await supabase
          .from('student_subject_teachers')
          .insert(inserts);

        if (insertError) throw insertError;
      }

      toast({
        title: '저장 완료',
        description: '과목별 담당 선생님이 저장되었습니다',
      });
    } catch (error) {
      console.error('Error saving mappings:', error);
      toast({
        title: '오류',
        description: '저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* SUBJECT-TEACHER-MAP-V1 marker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium">과목별 담당 선생님</h3>
          <Badge variant="outline" className="text-xs font-mono">SUBJECT-TEACHER-MAP-V1</Badge>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          저장
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        이 학생의 과목별 수업기록(숙제 체인)을 공유할 선생님을 지정합니다.
      </p>

      <div className="grid gap-4">
        {SUBJECTS.map(subject => {
          const mapping = mappings.find(m => m.subject === subject);
          return (
            <div key={subject} className="p-3 rounded-lg border bg-secondary/30">
              <Label className="font-medium mb-2 block">{subject}</Label>
              <div className="flex flex-wrap gap-2">
                {teachers.length === 0 ? (
                  <span className="text-sm text-muted-foreground">등록된 선생님이 없습니다</span>
                ) : (
                  teachers.map(teacher => {
                    const isSelected = mapping?.teacher_ids.includes(teacher.id) || false;
                    return (
                      <div
                        key={teacher.id}
                        className="flex items-center gap-1.5"
                      >
                        <Checkbox
                          id={`${subject}-${teacher.id}`}
                          checked={isSelected}
                          onCheckedChange={() => toggleTeacher(subject, teacher.id)}
                        />
                        <label
                          htmlFor={`${subject}-${teacher.id}`}
                          className={`text-sm cursor-pointer ${isSelected ? 'font-medium' : 'text-muted-foreground'}`}
                        >
                          {teacher.full_name || teacher.email}
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
