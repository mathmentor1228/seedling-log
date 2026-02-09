import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Loader2, ChevronLeft, ChevronRight, FileBarChart,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';

interface ReportRow {
  id: string;
  student_id: string;
  student_name: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  student_message: string | null;
  parent_message: string | null;
  generated_at: string;
}

function stripDebugMarkers(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !t.startsWith('[NARRATIVE_RENDER_ACTIVE') && !t.startsWith('[REPORT_GEN_DEBUG') && !t.startsWith('[REPORT-');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function ReportStatusPage() {
  const { role, user } = useAuth();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [weekStart, setWeekStart] = useState(() => {
    const lastWeek = subWeeks(new Date(), 1);
    return format(startOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  });
  const [weekEnd, setWeekEnd] = useState(() => {
    const lastWeek = subWeeks(new Date(), 1);
    return format(endOfWeek(lastWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  });

  function shiftWeek(dir: -1 | 1) {
    const fn = dir === -1 ? subWeeks : addWeeks;
    const base = fn(new Date(weekStart), 1);
    setWeekStart(format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    setWeekEnd(format(endOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  }

  useEffect(() => { fetchReports(); }, [weekStart, weekEnd]);

  async function fetchReports() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select(`
          id, student_id, week_start, week_end, total_lessons,
          student_message, parent_message, generated_at,
          students:student_id (name)
        `)
        .gte('week_start', weekStart)
        .lte('week_end', weekEnd)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      let rows: ReportRow[] = (data || []).map((r: any) => ({
        ...r,
        student_name: r.students?.name || '알 수 없음',
      }));

      // Teachers: filter to own students
      if (role === 'teacher' && user) {
        const [linksRes, classesRes, sstRes] = await Promise.all([
          supabase.from('teacher_student_links').select('student_id').eq('teacher_id', user.id),
          supabase.from('classes').select('id').eq('teacher_id', user.id),
          supabase.from('student_subject_teachers').select('student_id').eq('teacher_id', user.id),
        ]);

        const myStudentIds = new Set<string>();
        (linksRes.data || []).forEach((l: any) => myStudentIds.add(l.student_id));
        (sstRes.data || []).forEach((s: any) => myStudentIds.add(s.student_id));

        if (classesRes.data && classesRes.data.length > 0) {
          const { data: csData } = await supabase
            .from('class_students')
            .select('student_id')
            .in('class_id', classesRes.data.map((c: any) => c.id));
          (csData || []).forEach((cs: any) => myStudentIds.add(cs.student_id));
        }

        rows = rows.filter(r => myStudentIds.has(r.student_id));
      }

      setReports(rows);
    } catch (err) {
      console.error('Error fetching report status:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase();
    return reports.filter(r => r.student_name.toLowerCase().includes(q));
  }, [reports, searchQuery]);

  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <AppLayout>
        <div className="space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileBarChart className="w-5 h-5" />
              주간 리포트 현황
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {role === 'admin' ? '전체 학생' : '내 학생'}의 주간 리포트 내용을 확인합니다
            </p>
          </div>

          {/* Week nav + search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="px-3 py-1.5 bg-muted rounded-md text-sm font-medium whitespace-nowrap">
                {weekStart} ~ {weekEnd}
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학생 이름 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* Report cards */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              해당 주차에 생성된 리포트가 없습니다
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map(r => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-foreground">{r.student_name}</h3>
                      <span className="text-xs text-muted-foreground">수업 {r.total_lessons}회</span>
                    </div>
                    <Tabs defaultValue="parent" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-8">
                        <TabsTrigger value="parent" className="text-xs">학부모용</TabsTrigger>
                        <TabsTrigger value="student" className="text-xs">학생용</TabsTrigger>
                      </TabsList>
                      <TabsContent value="parent" className="mt-2">
                        <div className="bg-muted/50 rounded-md p-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground max-h-60 overflow-y-auto">
                          {r.parent_message
                            ? stripDebugMarkers(r.parent_message)
                            : <span className="text-muted-foreground">학부모 메시지가 없습니다.</span>}
                        </div>
                      </TabsContent>
                      <TabsContent value="student" className="mt-2">
                        <div className="bg-muted/50 rounded-md p-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground max-h-60 overflow-y-auto">
                          {r.student_message
                            ? stripDebugMarkers(r.student_message)
                            : <span className="text-muted-foreground">학생 메시지가 없습니다.</span>}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
