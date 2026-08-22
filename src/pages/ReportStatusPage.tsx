import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Loader2, ChevronLeft, ChevronRight, FileBarChart,
} from 'lucide-react';
import { format, startOfWeek, subWeeks, addWeeks, addDays } from 'date-fns';
import { ReportPurposeBanner } from '@/components/reports/ReportPurposeBanner';
import { getWriteStatus, getDeliveryStatus, WRITE_STATUS_LABEL, summarizeWeek } from '@/lib/reportStatus';
import { cn } from '@/lib/utils';

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
  risk_level: string | null;
  parent_visible?: boolean | null;
  report_quality_tag?: string | null;
  student_sent_status?: string | null;
  parent_sent_status?: string | null;
  student_sent_at?: string | null;
  parent_sent_at?: string | null;
  teacher_subjects?: string[]; // subjects this teacher teaches for this student
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

const GUIDANCE_KEYWORDS = [
  '지도 방향', '지도방향', '다음 수업', '앞으로', '계획', '목표',
  '중점적으로', '보완', '강화', '집중', '유도', '이끌어',
  '방향으로', '진행할', '예정', '필요합니다', '살펴볼',
];

function highlightGuidance(text: string): React.ReactNode[] {
  if (!text) return [];
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const isGuidance = GUIDANCE_KEYWORDS.some(kw => line.includes(kw));
    return (
      <span key={i}>
        {isGuidance ? (
          <span className="bg-primary/8 border-l-2 border-primary/40 pl-2 -ml-2 inline-block w-full">{line}</span>
        ) : line}
        {i < lines.length - 1 && '\n'}
      </span>
    );
  });
}

export default function ReportStatusPage() {
  const { role, user } = useAuth();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  // REPORT-STATUS-CLARITY-V1: 작성 상태 필터 (발송 상태와 분리)
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'needs_review'>('all');

  const [weekStart, setWeekStart] = useState(() => {
    const fromUrl = searchParams.get('week');
    if (fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl)) return fromUrl;
    const lastWeek = subWeeks(new Date(), 1);
    const mon = startOfWeek(lastWeek, { weekStartsOn: 1 });
    return format(mon, 'yyyy-MM-dd');
  });
  const [weekEnd, setWeekEnd] = useState(() => {
    const fromUrl = searchParams.get('week');
    const mon = fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl)
      ? new Date(fromUrl)
      : startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
    return format(addDays(mon, 5), 'yyyy-MM-dd'); // Saturday
  });

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('week', weekStart);
    if (statusFilter === 'all') next.delete('status'); else next.set('status', statusFilter);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, statusFilter]);

  function shiftWeek(dir: -1 | 1) {
    const fn = dir === -1 ? subWeeks : addWeeks;
    const base = fn(new Date(weekStart), 1);
    const mon = startOfWeek(base, { weekStartsOn: 1 });
    setWeekStart(format(mon, 'yyyy-MM-dd'));
    setWeekEnd(format(addDays(mon, 5), 'yyyy-MM-dd')); // Saturday
  }

  useEffect(() => { fetchReports(); }, [weekStart, weekEnd]);

  async function fetchReports() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select(`
          id, student_id, week_start, week_end, total_lessons,
          student_message, parent_message, generated_at, risk_level,
          parent_visible, report_quality_tag,
          student_sent_status, parent_sent_status, student_sent_at, parent_sent_at,
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

      // Teachers: filter to own students and attach subject info
      if (role === 'teacher' && user) {
        const [linksRes, classesRes, sstRes] = await Promise.all([
          supabase.from('teacher_student_links').select('student_id').eq('teacher_id', user.id),
          supabase.from('classes').select('id, subject').eq('teacher_id', user.id),
          supabase.from('student_subject_teachers').select('student_id, subject').eq('teacher_id', user.id),
        ]);

        // Build student → subjects map
        const studentSubjects = new Map<string, Set<string>>();
        const addStudentSubject = (sid: string, subj?: string) => {
          if (!studentSubjects.has(sid)) studentSubjects.set(sid, new Set());
          if (subj) studentSubjects.get(sid)!.add(subj);
        };

        (linksRes.data || []).forEach((l: any) => addStudentSubject(l.student_id));
        (sstRes.data || []).forEach((s: any) => addStudentSubject(s.student_id, s.subject));

        if (classesRes.data && classesRes.data.length > 0) {
          const classSubjectMap = new Map<string, string>();
          classesRes.data.forEach((c: any) => classSubjectMap.set(c.id, c.subject));

          const { data: csData } = await supabase
            .from('class_students')
            .select('student_id, class_id, students:student_id!inner(enrollment_status)')
            .in('class_id', classesRes.data.map((c: any) => c.id))
            .neq('students.enrollment_status', '퇴원');
          (csData || []).forEach((cs: any) => {
            addStudentSubject(cs.student_id, classSubjectMap.get(cs.class_id));
          });
        }

        rows = rows
          .filter(r => studentSubjects.has(r.student_id))
          .map(r => ({
            ...r,
            teacher_subjects: Array.from(studentSubjects.get(r.student_id) || []),
          }));
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
              {filtered.map(r => {
                const isHigh = r.risk_level === 'high' || r.risk_level === 'RED';
                const isMedium = r.risk_level === 'medium' || r.risk_level === 'YELLOW';
                const cardBorder = isHigh
                  ? 'border-destructive/40 bg-destructive/5'
                  : isMedium
                  ? 'border-warning/40 bg-warning/5'
                  : '';
                return (
                  <Card key={r.id} className={cardBorder}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{r.student_name}</h3>
                          {isHigh && <span className="text-2xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">주의</span>}
                          {isMedium && <span className="text-2xs px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">관찰</span>}
                          {r.teacher_subjects && r.teacher_subjects.length > 0 && r.teacher_subjects.map(subj => (
                            <span key={subj} className="text-2xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{subj}</span>
                          ))}
                        </div>
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
                              ? highlightGuidance(stripDebugMarkers(r.parent_message))
                              : <span className="text-muted-foreground">학부모 메시지가 없습니다.</span>}
                          </div>
                        </TabsContent>
                        <TabsContent value="student" className="mt-2">
                          <div className="bg-muted/50 rounded-md p-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground max-h-60 overflow-y-auto">
                            {r.student_message
                              ? highlightGuidance(stripDebugMarkers(r.student_message))
                              : <span className="text-muted-foreground">학생 메시지가 없습니다.</span>}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
          )}
        </div>
    </ProtectedRoute>
  );
}
