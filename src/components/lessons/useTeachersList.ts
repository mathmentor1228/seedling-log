import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TeacherOption {
  id: string;
  full_name: string;
}

export function useTeachersList() {
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: classes }, { data: subjectTeachers }, { data: lessons }] = await Promise.all([
          supabase.from('classes').select('teacher_id').not('teacher_id', 'is', null),
          supabase.from('student_subject_teachers').select('teacher_id'),
          supabase.from('lesson_records').select('teacher_id').not('teacher_id', 'is', null),
        ]);

        const teacherIds = [...new Set([
          ...(classes || []).map((row) => row.teacher_id).filter(Boolean),
          ...(subjectTeachers || []).map((row) => row.teacher_id).filter(Boolean),
          ...(lessons || []).map((row) => row.teacher_id).filter(Boolean),
        ])] as string[];

        if (teacherIds.length === 0) {
          setTeachers([]);
          setLoading(false);
          return;
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('is_active', true)
          .in('id', teacherIds)
          .order('full_name');

        setTeachers((profiles || []).map((profile) => ({
          id: profile.id,
          full_name: profile.full_name || '알 수 없음',
        })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { teachers, loading };
}
