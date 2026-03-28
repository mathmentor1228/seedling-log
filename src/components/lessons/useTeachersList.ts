import { useState, useEffect } from 'react';
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
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher');
      const ids = (roleData || []).map(r => r.user_id);
      if (ids.length === 0) { setTeachers([]); setLoading(false); return; }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      setTeachers((profiles || []).map(p => ({ id: p.id, full_name: p.full_name || '알 수 없음' })));
      setLoading(false);
    })();
  }, []);

  return { teachers, loading };
}
