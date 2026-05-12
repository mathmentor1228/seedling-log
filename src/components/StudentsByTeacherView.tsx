import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronRight, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// STUDENTS-BY-TEACHER-VIEW-V1: 담당 선생님별 학생 명단 그룹 뷰
interface Props {
  onSelectStudent?: (studentId: string) => void;
}

interface TeacherGroup {
  teacher_id: string;
  teacher_name: string;
  subject: string;
  students: { id: string; name: string; school: string | null; school_level: string | null; grade_year: number | null; enrollment_status: string }[];
}

const SUBJECT_COLOR: Record<string, string> = {
  '수학': 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  '영어': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  '국어': 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  '과학': 'bg-purple-500/15 text-purple-500 border-purple-500/30',
};

export default function StudentsByTeacherView({ onSelectStudent }: Props) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [{ data: mappings }, { data: profiles }, { data: students }] = await Promise.all([
          supabase.from('student_subject_teachers').select('student_id, subject, teacher_id').not('teacher_id', 'is', null),
          supabase.from('profiles').select('id, full_name, is_active'),
          supabase.from('students').select('id, name, school, school_level, grade_year, enrollment_status').neq('enrollment_status', '퇴원'),
        ]);
        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        const studentMap = new Map((students || []).map((s: any) => [s.id, s]));

        const bucket = new Map<string, TeacherGroup>();
        for (const m of (mappings || []) as any[]) {
          const stu = studentMap.get(m.student_id);
          if (!stu) continue;
          const prof: any = profileMap.get(m.teacher_id);
          const tname = prof?.full_name || '알 수 없음';
          const key = `${m.teacher_id}::${m.subject}`;
          if (!bucket.has(key)) {
            bucket.set(key, {
              teacher_id: m.teacher_id,
              teacher_name: tname,
              subject: m.subject,
              students: [],
            });
          }
          bucket.get(key)!.students.push(stu);
        }
        const arr = [...bucket.values()].map((g) => ({
          ...g,
          students: g.students.sort((a, b) => a.name.localeCompare(b.name, 'ko')),
        }));
        arr.sort((a, b) => {
          const subj = a.subject.localeCompare(b.subject, 'ko');
          if (subj !== 0) return subj;
          return a.teacher_name.localeCompare(b.teacher_name, 'ko');
        });
        setGroups(arr);
        setExpanded(new Set(arr.map((g) => `${g.teacher_id}::${g.subject}`)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const subjects = useMemo(() => [...new Set(groups.map((g) => g.subject))].sort(), [groups]);
  const filtered = useMemo(
    () => (subjectFilter === 'all' ? groups : groups.filter((g) => g.subject === subjectFilter)),
    [groups, subjectFilter],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder="과목" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 과목</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length}개 그룹 · 총 {filtered.reduce((sum, g) => sum + g.students.length, 0)}명 (중복 포함)
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            담당 선생님이 지정된 학생이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((g) => {
            const key = `${g.teacher_id}::${g.subject}`;
            const open = expanded.has(key);
            return (
              <Card key={key} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', SUBJECT_COLOR[g.subject] || 'bg-muted text-muted-foreground border-border')}>
                    {g.subject}
                  </span>
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground">{g.teacher_name} 선생님</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{g.students.length}명</Badge>
                </button>
                {open && (
                  <CardContent className="pt-0 pb-3 px-4">
                    <div className="flex flex-wrap gap-1.5 pl-7">
                      {g.students.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onSelectStudent?.(s.id)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted hover:border-primary/40 transition-colors text-xs"
                        >
                          <span className="font-medium">{s.name}</span>
                          {s.school_level && s.grade_year && (
                            <span className="text-[10px] text-muted-foreground">{s.school_level}{s.grade_year}</span>
                          )}
                          {s.enrollment_status && s.enrollment_status !== '재학' && (
                            <span className="text-[10px] text-warn">{s.enrollment_status}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
