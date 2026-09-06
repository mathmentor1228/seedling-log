import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Users, Lock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Teacher {
  id: string;
  full_name: string;
  email: string;
}

interface SubjectMapping {
  subject: string;
  teacher_ids: string[];
}

interface Props {
  studentId: string;
  studentName: string;
}

const SUBJECTS = ['수학', '영어', '국어', '과학'] as const;

// Allowed teacher names per subject. Subjects with 1 candidate auto-assign.
const SUBJECT_TEACHERS: Record<string, string[]> = {
  '수학': ['이나연', '함유빈', '최윤기', '황은지'],
  '영어': ['김민희', '이재진', '김은수'],
  '국어': ['조준희'],
  '과학': ['최윤기'],
};

export default function StudentSubjectTeacherMapping({ studentId }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [enrolledSubjects, setEnrolledSubjects] = useState<string[]>([]);
  const [mappings, setMappings] = useState<SubjectMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { fetchData(); }, [studentId]);

  async function fetchData() {
    setLoading(true);
    try {
      // ENGLISH-TEACHER-FIX-V2: 이름 공백/표기 차이로 후보가 누락되지 않도록
      // 활성 프로필 전체를 받아 트림 비교로 필터링한다.
      const allowedNames = Array.from(
        new Set(Object.values(SUBJECT_TEACHERS).flat().map((n) => n.trim()))
      );
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_active')
        .order('full_name');
      const teacherProfiles = ((profilesData || []) as any[])
        .filter((p) => p.is_active !== false)
        .filter((p) => allowedNames.includes((p.full_name || '').trim())) as Teacher[];
      setTeachers(teacherProfiles);



      // Enrolled subjects from student_courses → course_policies
      const { data: coursesData } = await supabase
        .from('student_courses')
        .select('course_policies(subject)')
        .eq('student_id', studentId)
        .eq('is_active', true);
      const allowed = SUBJECTS as readonly string[];
      const enrolled = [
        ...new Set(
          (coursesData || [])
            .map((r: any) => r.course_policies?.subject as string | undefined)
            .filter((s): s is string => !!s && allowed.includes(s))
        ),
      ];
      setEnrolledSubjects(enrolled);

      const { data: mappingsData } = await supabase
        .from('student_subject_teachers')
        .select('subject, teacher_id')
        .eq('student_id', studentId);

      const newMappings: SubjectMapping[] = enrolled.map((subject) => ({
        subject,
        teacher_ids: (mappingsData || []).filter((m) => m.subject === subject).map((m) => m.teacher_id),
      }));

      // Auto-assign: only for enrolled subjects with exactly 1 allowed teacher
      const autoInserts: { student_id: string; subject: string; teacher_id: string }[] = [];
      for (const m of newMappings) {
        const candidates = candidatesFor(m.subject, teacherProfiles);
        if (candidates.length === 1 && !m.teacher_ids.includes(candidates[0].id)) {
          m.teacher_ids = [candidates[0].id];
          autoInserts.push({ student_id: studentId, subject: m.subject, teacher_id: candidates[0].id });
        }
      }
      if (autoInserts.length > 0) {
        await supabase.from('student_subject_teachers').upsert(autoInserts, {
          onConflict: 'student_id,subject,teacher_id',
        });
      }
      setMappings(newMappings);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: '오류', description: '데이터를 불러오는데 실패했습니다', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function candidatesFor(subject: string, allTeachers: Teacher[]): Teacher[] {
    const allowed = SUBJECT_TEACHERS[subject] || [];
    if (allowed.length === 0) return allTeachers;
    return allTeachers.filter((t) => allowed.includes((t.full_name || '').trim()));
  }

  const toggleTeacher = (subject: string, teacherId: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.subject !== subject
          ? m
          : {
              ...m,
              teacher_ids: m.teacher_ids.includes(teacherId)
                ? m.teacher_ids.filter((id) => id !== teacherId)
                : [...m.teacher_ids, teacherId],
            }
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from('student_subject_teachers').delete().eq('student_id', studentId);
      if (deleteError) throw deleteError;

      const inserts: { student_id: string; subject: string; teacher_id: string }[] = [];
      mappings.forEach((m) => {
        m.teacher_ids.forEach((tid) => {
          inserts.push({ student_id: studentId, subject: m.subject, teacher_id: tid });
        });
      });
      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from('student_subject_teachers').insert(inserts);
        if (insertError) throw insertError;
      }
      toast({ title: '저장 완료', description: '과목별 담당 선생님이 저장되었습니다' });
    } catch (error) {
      console.error('Error saving mappings:', error);
      toast({ title: '오류', description: '저장에 실패했습니다', variant: 'destructive' });
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">과목별 담당 선생님 지정</span>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" variant="outline">
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          저장
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground rounded-lg bg-muted/40 border border-border px-2.5 py-2 leading-relaxed">
        수강과정에서 선생님을 지정하면 이 화면의 담당은 자동으로 함께 반영됩니다. 여기서는 예외적으로 다르게
        지정해야 할 때만 수정하세요.
      </p>


      {enrolledSubjects.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">
          학습과정에 등록된 과목이 없습니다. 먼저 수강 과목을 추가하면 담당 선생님을 지정할 수 있습니다.
        </p>
      )}
      <div className="grid gap-2">
        {enrolledSubjects.map((subject) => {
          const mapping = mappings.find((m) => m.subject === subject)!;
          const candidates = candidatesFor(subject, teachers);
          const isAuto = candidates.length === 1;

          return (
            <div key={subject} className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">{subject}</Label>
                {isAuto && (
                  <Badge variant="outline" className="text-[10px] gap-1 bg-muted/40">
                    <Lock className="w-3 h-3" /> 자동 지정
                  </Badge>
                )}
              </div>

              {candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">담당 가능한 선생님이 없습니다</p>
              ) : isAuto ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                  <Check className="w-3 h-3" />
                  {candidates[0].full_name || candidates[0].email} · 자동
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((t) => {
                    const selected = mapping.teacher_ids.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTeacher(subject, t.id)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {t.full_name || t.email}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        학습과정(수강 중인 과목)만 표시됩니다. 선생님이 1명뿐인 과목은 자동 지정, 수학·영어는 직접 선택해야 합니다.
      </p>

    </div>
  );
}
