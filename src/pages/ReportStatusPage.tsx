import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, CheckCircle2, Clock, XCircle, Eye, Loader2,
  ChevronLeft, ChevronRight, FileBarChart, Users, Send as SendIcon,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';

interface ReportRow {
  id: string;
  student_id: string;
  student_name: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  risk_level: string | null;
  student_message: string | null;
  parent_message: string | null;
  student_sent_status: string | null;
  parent_sent_status: string | null;
  student_sent_at: string | null;
  parent_sent_at: string | null;
  parent_visible: boolean;
  generated_at: string;
  report_quality_tag: string | null;
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'sent') return <Badge className="bg-primary/10 text-primary border-primary/20 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />발송완료</Badge>;
  if (status === 'failed') return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" />실패</Badge>;
  return <Badge variant="secondary" className="text-xs gap-1"><Clock className="w-3 h-3" />미발송</Badge>;
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
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Preview
  const [previewReport, setPreviewReport] = useState<ReportRow | null>(null);
  const [previewTab, setPreviewTab] = useState<'student' | 'parent'>('parent');

  // Week navigation
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
      let query = supabase
        .from('weekly_reports')
        .select(`
          id, student_id, week_start, week_end, total_lessons,
          avg_understanding, risk_level,
          student_message, parent_message,
          student_sent_status, parent_sent_status,
          student_sent_at, parent_sent_at,
          parent_visible, generated_at, report_quality_tag,
          students:student_id (name)
        `)
        .gte('week_start', weekStart)
        .lte('week_end', weekEnd)
        .order('generated_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      let rows: ReportRow[] = (data || []).map((r: any) => ({
        ...r,
        student_name: r.students?.name || '알 수 없음',
      }));

      // For teachers: filter to only their students
      if (role === 'teacher' && user) {
        const { data: links } = await supabase
          .from('teacher_student_links')
          .select('student_id')
          .eq('teacher_id', user.id);
        const myStudentIds = new Set((links || []).map((l: any) => l.student_id));

        const { data: classLinks } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', user.id);
        if (classLinks && classLinks.length > 0) {
          const classIds = classLinks.map((c: any) => c.id);
          const { data: csData } = await supabase
            .from('class_students')
            .select('student_id')
            .in('class_id', classIds);
          (csData || []).forEach((cs: any) => myStudentIds.add(cs.student_id));
        }

        const { data: sstData } = await supabase
          .from('student_subject_teachers')
          .select('student_id')
          .eq('teacher_id', user.id);
        (sstData || []).forEach((s: any) => myStudentIds.add(s.student_id));

        rows = rows.filter(r => myStudentIds.has(r.student_id));
      }

      setReports(rows);
    } catch (err) {
      console.error('Error fetching report status:', err);
    } finally {
      setLoading(false);
    }
  }

  // Stats
  const stats = useMemo(() => {
    const total = reports.length;
    const parentSent = reports.filter(r => r.parent_sent_status === 'sent').length;
    const studentSent = reports.filter(r => r.student_sent_status === 'sent').length;
    const visible = reports.filter(r => r.parent_visible).length;
    return { total, parentSent, studentSent, visible };
  }, [reports]);

  // Filtered
  const filtered = useMemo(() => {
    let list = reports;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.student_name.toLowerCase().includes(q));
    }
    if (statusFilter === 'sent') list = list.filter(r => r.parent_sent_status === 'sent' || r.student_sent_status === 'sent');
    if (statusFilter === 'unsent') list = list.filter(r => r.parent_sent_status !== 'sent' && r.student_sent_status !== 'sent');
    if (statusFilter === 'visible') list = list.filter(r => r.parent_visible);
    return list;
  }, [reports, searchQuery, statusFilter]);

  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <AppLayout>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <FileBarChart className="w-5 h-5" />
                리포트 발송 현황
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {role === 'admin' ? '전체 학생' : '내 학생'}의 주간 리포트 발송 상태를 확인합니다
              </p>
            </div>
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-3 py-1.5 bg-muted rounded-md text-sm font-medium">
              {weekStart} ~ {weekEnd}
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">전체 리포트</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-primary">{stats.parentSent}</p>
                <p className="text-xs text-muted-foreground">학부모 발송</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-accent-foreground">{stats.studentSent}</p>
                <p className="text-xs text-muted-foreground">학생 발송</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-secondary-foreground">{stats.visible}</p>
                <p className="text-xs text-muted-foreground">학부모 공개</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학생 이름 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="sent">발송완료</SelectItem>
                <SelectItem value="unsent">미발송</SelectItem>
                <SelectItem value="visible">학부모공개</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  해당 주차에 생성된 리포트가 없습니다
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">학생</TableHead>
                        <TableHead className="text-center">수업수</TableHead>
                        <TableHead className="text-center">학부모</TableHead>
                        <TableHead className="text-center">학생</TableHead>
                        <TableHead className="text-center">공개</TableHead>
                        <TableHead className="text-center w-[60px]">미리보기</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(r => (
                        <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setPreviewReport(r); setPreviewTab('parent'); }}>
                          <TableCell className="font-medium text-sm">{r.student_name}</TableCell>
                          <TableCell className="text-center text-sm">{r.total_lessons}</TableCell>
                          <TableCell className="text-center"><StatusBadge status={r.parent_sent_status} /></TableCell>
                          <TableCell className="text-center"><StatusBadge status={r.student_sent_status} /></TableCell>
                          <TableCell className="text-center">
                            {r.parent_visible ? (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">공개</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">비공개</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setPreviewReport(r); setPreviewTab('parent'); }}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview Dialog */}
        <Dialog open={!!previewReport} onOpenChange={open => { if (!open) setPreviewReport(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-base">
                {previewReport?.student_name} — 리포트 미리보기
              </DialogTitle>
            </DialogHeader>
            <Tabs value={previewTab} onValueChange={v => setPreviewTab(v as 'student' | 'parent')} className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="parent">학부모용</TabsTrigger>
                <TabsTrigger value="student">학생용</TabsTrigger>
              </TabsList>
              <TabsContent value="parent" className="flex-1 min-h-0">
                <ScrollArea className="h-[50vh] border rounded-md p-4">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {previewReport?.parent_message
                      ? stripDebugMarkers(previewReport.parent_message)
                      : '학부모 메시지가 없습니다.'}
                  </div>
                </ScrollArea>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <StatusBadge status={previewReport?.parent_sent_status || null} />
                  {previewReport?.parent_sent_at && (
                    <span>{format(new Date(previewReport.parent_sent_at), 'M/d HH:mm')} 발송</span>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="student" className="flex-1 min-h-0">
                <ScrollArea className="h-[50vh] border rounded-md p-4">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {previewReport?.student_message
                      ? stripDebugMarkers(previewReport.student_message)
                      : '학생 메시지가 없습니다.'}
                  </div>
                </ScrollArea>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <StatusBadge status={previewReport?.student_sent_status || null} />
                  {previewReport?.student_sent_at && (
                    <span>{format(new Date(previewReport.student_sent_at), 'M/d HH:mm')} 발송</span>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </AppLayout>
    </ProtectedRoute>
  );
}
