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
import { DeliveryConfirmRow } from '@/components/reports/DeliveryConfirmRow';
import { countConfirmations, type DeliveryEvent } from '@/lib/reportDelivery';
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
  // REPORT-DELIVERY-CONFIRM-V1: 발송 확인 이력 (append-only)
  const [eventsByReport, setEventsByReport] = useState<Record<string, DeliveryEvent[]>>({});
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [eventsError, setEventsError] = useState<string | null>(null);

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
      await fetchDeliveryEvents(rows.map(r => r.id));
    } catch (err: any) {
      console.error('Error fetching report status:', err);
      setLoadError(err?.message || '리포트 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  // REPORT-DELIVERY-CONFIRM-V1: 발송 확인 이력 조회 (읽기 전용, 실제 전송 없음)
  async function fetchDeliveryEvents(reportIds: string[]) {
    setEventsError(null);
    if (reportIds.length === 0) { setEventsByReport({}); return; }
    try {
      const { data, error } = await supabase
        .from('report_delivery_events')
        .select('id, report_id, status, channel, note, actor_id, created_at')
        .in('report_id', reportIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const map: Record<string, DeliveryEvent[]> = {};
      (data || []).forEach((e: any) => {
        (map[e.report_id] ||= []).push(e as DeliveryEvent);
      });
      setEventsByReport(map);

      const actorIds = Array.from(new Set((data || []).map((e: any) => e.actor_id)));
      if (actorIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
        const names: Record<string, string> = {};
        (profs || []).forEach((p: any) => { names[p.id] = p.full_name || '담당자'; });
        setActorNames(names);
      }
    } catch (err: any) {
      console.error('Error fetching delivery events:', err);
      setEventsError(err?.message || '발송 확인 이력을 불러오지 못했습니다.');
    }
  }


  const filtered = useMemo(() => {
    let rows = reports;
    if (statusFilter !== 'all') {
      rows = rows.filter(r => {
        const ws = getWriteStatus(r);
        if (statusFilter === 'published') return ws === 'published';
        if (statusFilter === 'needs_review') return ws === 'needs_review' || ws === 'zero_lessons';
        return ws === 'ready'; // draft
      });
    }
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(r => r.student_name.toLowerCase().includes(q));
  }, [reports, searchQuery, statusFilter]);

  // 작성 상태 / 발송 상태 집계 (분리)
  const summary = useMemo(() => summarizeWeek(reports, reports.length), [reports]);
  // REPORT-DELIVERY-CONFIRM-V1: 발송 확인(수동 기록) 집계
  const confirmCounts = useMemo(
    () => countConfirmations(reports.map(r => r.id), eventsByReport),
    [reports, eventsByReport]
  );

  const lastChangedAt = useMemo(
    () => reports.reduce<string | null>((acc, r) => (r.generated_at && (!acc || r.generated_at > acc) ? r.generated_at : acc), null),
    [reports]
  );


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

          <ReportPurposeBanner current="status" weekStart={weekStart} />

          {/* Week nav + search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(-1)} aria-label="이전 주">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="px-3 py-1.5 bg-muted rounded-md text-sm font-medium whitespace-nowrap">
                {weekStart} ~ {weekEnd}
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(1)} aria-label="다음 주">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학생 이름 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* REPORT-STATUS-CLARITY-V1: 작성 상태 / 발송 상태 분리 집계 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 min-w-0">
              <p className="text-xs font-semibold mb-2">작성 상태 (조회 범위 {reports.length}건)</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { k: 'all', label: `전체 ${reports.length}` },
                  { k: 'published', label: `학부모 공개됨 ${summary.published}` },
                  { k: 'draft', label: `비공개 초안 ${summary.sendable}` },
                  { k: 'needs_review', label: `검수 필요·수업 0건 ${summary.needsReview + summary.caution}` },
                ] as const).map(c => (
                  <button
                    key={c.k}
                    type="button"
                    onClick={() => setStatusFilter(c.k as any)}
                    className={cn(
                      'text-xs px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      statusFilter === c.k ? 'bg-primary/10 border-primary text-primary' : 'hover:bg-muted'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                마지막 변경(생성)일: {lastChangedAt ? new Date(lastChangedAt).toLocaleString('ko-KR') : '없음'}
              </p>
            </div>
            <div className="rounded-lg border p-3 min-w-0">
              <p className="text-xs font-semibold mb-2">발송 확인 (수동 기록)</p>
              <p className="text-xs text-foreground break-words">
                대상 {reports.length}건 · 공개 {summary.published}건 · 발송 확인 {confirmCounts.confirmed}건 ·
                실패 기록 {confirmCounts.failed}건 · 미확인 {confirmCounts.unconfirmed}건
              </p>
              <p className="text-[11px] text-muted-foreground mt-2 break-words">
                자동 발송 근거(sent_status)는 여전히 {summary.deliveryConfirmed}건입니다. 이 시스템은 메시지를 전송하지 않으며,
                외부로 보낸 뒤 사람이 기록한 확인 이력만 표시합니다.
              </p>
              {eventsError && (
                <p className="text-[11px] text-destructive mt-1 break-words">
                  발송 확인 이력 일부를 불러오지 못했습니다: {eventsError}
                </p>
              )}
            </div>

          </div>

          {/* Report cards */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <div className="text-center py-16 text-sm text-destructive break-words px-4">
              일부 데이터를 불러오지 못했습니다: {loadError}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              해당 주차/필터에 해당하는 리포트가 없습니다
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
                const ws = getWriteStatus(r);
                const ds = getDeliveryStatus(r);
                return (
                  <Card key={r.id} className={cardBorder}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <h3 className="font-semibold text-foreground break-all">{r.student_name}</h3>
                          {isHigh && <span className="text-2xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">주의</span>}
                          {isMedium && <span className="text-2xs px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">관찰</span>}
                          {r.teacher_subjects && r.teacher_subjects.length > 0 && r.teacher_subjects.map(subj => (
                            <span key={subj} className="text-2xs px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">{subj}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-2xs px-1.5 py-0.5 rounded border font-medium">작성: {WRITE_STATUS_LABEL[ws]}</span>
                          <span className="text-2xs px-1.5 py-0.5 rounded border font-medium text-muted-foreground" title={ds.evidence}>
                            발송: {ds.label}
                          </span>
                          <span className="text-xs text-muted-foreground">수업 {r.total_lessons}회</span>
                        </div>
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
