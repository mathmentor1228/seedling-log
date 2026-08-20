import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { ReportPromptSettings } from '@/components/ReportPromptSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RiskBadge } from '@/components/ui/risk-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  CalendarIcon, 
  RefreshCw, 
  Send, 
  Loader2, 
  FileBarChart,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  FileEdit,
  Copy,
  Users,
  Search,
  UserCheck
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';

interface WeeklyReportRow {
  id: string;
  student_id: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  common_issues: string[];
  risk_level: 'low' | 'medium' | 'high' | null;
  sent_status: 'draft' | 'sent' | 'failed' | null;
  sent_at: string | null;
  summary: string | null;
  student_message: string | null;
  parent_message: string | null;
  student_sent_status: 'draft' | 'sent' | 'failed' | null;
  parent_sent_status: 'draft' | 'sent' | 'failed' | null;
  student_sent_at: string | null;
  parent_sent_at: string | null;
  student_name?: string;
  parent_phone?: string;
  student_phone?: string;
  class_name?: string;
  teacher_name?: string;
}

interface SendTarget {
  reportId: string;
  sendStudent: boolean;
  sendParent: boolean;
}

interface ClassOption {
  id: string;
  name: string;
}

interface TeacherOption {
  id: string;
  full_name: string;
}

interface ExcludedDraftInfo {
  student_id: string;
  student_name: string;
  teacher_id: string;
  teacher_name: string;
  subject: string;
  draft_created_at: string;
  lesson_date: string;
}

interface StudentOption {
  id: string;
  name: string;
  grade: string | null;
}

export default function WeeklyReportSend() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Date range state - default to this week (Mon-Sat KST)
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000; // KST is UTC+9
  const kstNow = new Date(now.getTime() + kstOffset);
  const defaultWeekStart = startOfWeek(kstNow, { weekStartsOn: 1 }); // Monday
  const saturdayEnd = new Date(defaultWeekStart);
  saturdayEnd.setDate(saturdayEnd.getDate() + 5); // Saturday
  
  const [weekStart, setWeekStart] = useState<Date>(defaultWeekStart);
  const [weekEnd, setWeekEnd] = useState<Date>(saturdayEnd);
  const [reports, setReports] = useState<WeeklyReportRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendEnabled, setResendEnabled] = useState(false);
  
  // Send targets state - tracks which checkboxes are checked per report
  const [sendTargets, setSendTargets] = useState<Map<string, SendTarget>>(new Map());
  
  // Preview state
  const [previewReport, setPreviewReport] = useState<WeeklyReportRow | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<'student' | 'parent'>('student');
  
  // Filters
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterSentStatus, setFilterSentStatus] = useState<string>('all');
  const [filterSendableOnly, setFilterSendableOnly] = useState<boolean>(false);
  
  // Excluded drafts panel
  const [excludedDrafts, setExcludedDrafts] = useState<ExcludedDraftInfo[]>([]);
  const [excludedDraftsTeacherFilter, setExcludedDraftsTeacherFilter] = useState<string>('all');
  
  // Student selection for per-student generation
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearchTerm, setStudentSearchTerm] = useState<string>('');

  useEffect(() => {
    fetchFiltersData();
    fetchAllStudents();
  }, []);

  async function fetchAllStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, grade')
        .in('enrollment_status', ['재학', '재등원'])
        .order('name');
      if (data) setAllStudents(data);
      if (error) console.error('Error fetching students:', error);
    } catch (e) {
      console.error('Error fetching students:', e);
    }
  }

  async function fetchFiltersData() {
    try {
      const [classesRes, teachersRes] = await Promise.all([
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      ]);

      if (classesRes.data) setClasses(classesRes.data);
      if (teachersRes.data) setTeachers(teachersRes.data);
    } catch (error) {
      console.error('Error fetching filters data:', error);
    }
  }

  // REPORT_GEN_DEBUG: State for debug info from last run
  const [lastDebugInfo, setLastDebugInfo] = useState<{
    timestamp: string;
    source: string;
    templateVersion: string;
    status: string;
    scope?: string;
    count?: number | string;
    message?: string;
  } | null>(null);

  async function handleGenerateReports(studentIds?: string[]) {
    const scope = studentIds && studentIds.length > 0 ? 'selected' : 'all';
    const count = studentIds?.length || 'all';
    
    // REPORT_GEN_DEBUG: Mark button click
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`REPORT_GEN_DEBUG: handler_file=src/pages/WeeklyReportSend.tsx, handler_fn=handleGenerateReports, scope=${scope}, count=${count}, mode=direct_save`);
    
    toast({
      title: 'REPORT_GEN_DEBUG: button_clicked',
      description: `Source: WeeklyReportSend.handleGenerateReports scope=${scope} count=${count} mode=direct_save at ${nowKST} KST`,
    });

    setLastDebugInfo({
      timestamp: nowKST,
      source: 'pending...',
      templateVersion: 'pending...',
      status: 'pending',
      scope,
      count,
    });

    setGenerating(true);
    try {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      // BYPASS LEGACY DB RPC: Call edge function with direct_save=true
      const { data, error } = await supabase.functions.invoke('generate-weekly-reports', {
        body: {
          manual: true,
          direct_save: true, // KEY: bypasses legacy DB RPC formatter
          // WEEKLY-REPORT-REPAIR-V1: 학생을 명시 선택한 경우에만 기존 초안 재생성 허용(공개본은 서버 보호)
          force: !!(studentIds && studentIds.length > 0),
          week_start: startStr,
          week_end: endStr,
          student_ids: studentIds && studentIds.length > 0 ? studentIds : null,

        },
      });

      if (error) throw error;

      // Load template version for debug
      let templateVersion = data?._debug?.templateVersion || 'unknown';

      setLastDebugInfo({
        timestamp: nowKST,
        source: data?._debug?.source || 'edge_function_direct_save',
        templateVersion,
        status: data?.success ? 'success' : 'partial',
        scope,
        count,
        message: `${startStr} ~ ${endStr} | ${data?.successCount || 0} success, ${data?.errorCount || 0} errors`,
      });

      toast({
        title: '리포트 생성 완료',
        description: scope === 'selected' 
          ? `${count}명의 학생 리포트가 생성되었습니다. (direct_save)`
          : `${startStr} ~ ${endStr} 기간의 주간 리포트가 생성되었습니다. (direct_save)`,
      });

      // Fetch the generated reports
      await fetchReports();
      
      // Clear selection after successful generation
      if (studentIds && studentIds.length > 0) {
        setSelectedStudentIds(new Set());
      }
    } catch (error: any) {
      console.error('Error generating reports:', error);
      
      setLastDebugInfo(prev => prev ? {
        ...prev,
        source: 'edge_function_direct_save',
        status: 'error',
        message: error.message,
      } : null);

      toast({
        title: '오류',
        description: error.message || '리포트 생성에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  }
  // Handler for generating reports for selected students only
  function handleGenerateSelectedReports() {
    if (selectedStudentIds.size === 0) {
      toast({
        title: '학생을 선택해주세요',
        description: '리포트를 생성할 학생을 1명 이상 선택해야 합니다.',
        variant: 'destructive',
      });
      return;
    }
    handleGenerateReports(Array.from(selectedStudentIds));
  }

  // Filter students by search term
  const filteredStudents = allStudents.filter(s => 
    s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
    (s.grade && s.grade.toLowerCase().includes(studentSearchTerm.toLowerCase()))
  );

  // Toggle student selection
  function toggleStudentSelection(studentId: string) {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }

  // Select/deselect all visible students
  function toggleAllVisibleStudents(select: boolean) {
    if (select) {
      const newIds = new Set(selectedStudentIds);
      filteredStudents.forEach(s => newIds.add(s.id));
      setSelectedStudentIds(newIds);
    } else {
      const newIds = new Set(selectedStudentIds);
      filteredStudents.forEach(s => newIds.delete(s.id));
      setSelectedStudentIds(newIds);
    }
  }

  async function fetchReports() {
    setLoading(true);
    try {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('weekly_reports')
        .select(`
          *,
          students:student_id (
            name,
            parent_phone,
            student_phone
          )
        `)
        .gte('week_start', startStr)
        .lte('week_end', endStr)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      const formattedReports: WeeklyReportRow[] = (data || []).map((r: any) => ({
        ...r,
        student_name: r.students?.name,
        parent_phone: r.students?.parent_phone,
        student_phone: r.students?.student_phone,
      }));

      setReports(formattedReports);
      
      // Initialize send targets - default both checked for reports with lessons
      const newTargets = new Map<string, SendTarget>();
      formattedReports.forEach(r => {
        const hasLessons = r.total_lessons > 0;
        const canSendStudent = hasLessons && (r.student_sent_status !== 'sent' || resendEnabled);
        const canSendParent = hasLessons && (r.parent_sent_status !== 'sent' || resendEnabled);
        
        newTargets.set(r.id, {
          reportId: r.id,
          sendStudent: canSendStudent,
          sendParent: canSendParent,
        });
      });
      setSendTargets(newTargets);

      // Fetch excluded drafts (unsubmitted lesson records for students with 0 lessons)
      const zeroLessonStudentIds = formattedReports
        .filter(r => r.total_lessons === 0)
        .map(r => r.student_id);

      if (zeroLessonStudentIds.length > 0) {
        await fetchExcludedDrafts(zeroLessonStudentIds, startStr, endStr);
      } else {
        setExcludedDrafts([]);
      }
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      toast({
        title: '오류',
        description: error.message || '리포트 조회에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchExcludedDrafts(studentIds: string[], startStr: string, endStr: string) {
    try {
      const { data, error } = await supabase
        .from('lesson_records')
        .select(`
          id,
          student_id,
          teacher_id,
          subject,
          lesson_date,
          draft_created_at,
          students:student_id (name),
          profiles:teacher_id (full_name)
        `)
        .in('student_id', studentIds)
        .gte('lesson_date', startStr)
        .lte('lesson_date', endStr)
        .eq('submitted', false)
        .order('draft_created_at', { ascending: false });

      if (error) {
        console.error('Error fetching excluded drafts:', error);
        return;
      }

      // Group by student and get the latest draft for each
      const latestDraftsMap = new Map<string, ExcludedDraftInfo>();
      
      (data || []).forEach((d: any) => {
        const studentId = d.student_id;
        if (!latestDraftsMap.has(studentId)) {
          latestDraftsMap.set(studentId, {
            student_id: studentId,
            student_name: d.students?.name || '알 수 없음',
            teacher_id: d.teacher_id,
            teacher_name: d.profiles?.full_name || '알 수 없음',
            subject: d.subject || '-',
            draft_created_at: d.draft_created_at,
            lesson_date: d.lesson_date,
          });
        }
      });

      setExcludedDrafts(Array.from(latestDraftsMap.values()));
    } catch (error) {
      console.error('Error fetching excluded drafts:', error);
    }
  }

  function toggleSendStudent(reportId: string) {
    setSendTargets(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(reportId);
      if (current) {
        newMap.set(reportId, { ...current, sendStudent: !current.sendStudent });
      }
      return newMap;
    });
  }

  function toggleSendParent(reportId: string) {
    setSendTargets(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(reportId);
      if (current) {
        newMap.set(reportId, { ...current, sendParent: !current.sendParent });
      }
      return newMap;
    });
  }

  function handlePreview(report: WeeklyReportRow) {
    setPreviewReport(report);
    setPreviewTab('student');
    setShowPreview(true);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: '클립보드에 복사되었습니다.' });
    } catch (err) {
      toast({ title: '복사 실패', variant: 'destructive' });
    }
  }

  async function handleSendReports() {
    if (!user) return;
    
    setSending(true);
    let studentSentCount = 0;
    let parentSentCount = 0;
    let failCount = 0;

    // Get reports with at least one target checked and has lessons
    const toProcess = filteredReports.filter(r => {
      if (r.total_lessons === 0) return false;
      const target = sendTargets.get(r.id);
      if (!target) return false;
      return target.sendStudent || target.sendParent;
    });

    if (toProcess.length === 0) {
      toast({
        title: '선택된 리포트 없음',
        description: '전송할 대상을 선택해주세요.',
        variant: 'destructive',
      });
      setSending(false);
      return;
    }

    try {
      for (const report of toProcess) {
        const target = sendTargets.get(report.id);
        if (!target) continue;

        try {
          const updates: any = {};
          
          // Send to student if checked
          if (target.sendStudent && (report.student_sent_status !== 'sent' || resendEnabled)) {
            console.log('=== 학생 메시지 전송 (테스트 모드) ===');
            console.log('학생:', report.student_name);
            console.log('연락처:', report.student_phone);
            console.log('메시지:', report.student_message);
            console.log('=====================================');
            
            updates.student_sent_status = 'sent';
            updates.student_sent_at = new Date().toISOString();
            studentSentCount++;
          }

          // Send to parent if checked
          if (target.sendParent && (report.parent_sent_status !== 'sent' || resendEnabled)) {
            console.log('=== 학부모 메시지 전송 (테스트 모드) ===');
            console.log('학생:', report.student_name);
            console.log('연락처:', report.parent_phone);
            console.log('메시지:', report.parent_message);
            console.log('=====================================');
            
            updates.parent_sent_status = 'sent';
            updates.parent_sent_at = new Date().toISOString();
            parentSentCount++;
          }

          // Update legacy sent_status if both are sent
          if (updates.student_sent_status === 'sent' && updates.parent_sent_status === 'sent') {
            updates.sent_status = 'sent';
            updates.sent_at = new Date().toISOString();
            updates.sent_by = user.id;
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from('weekly_reports')
              .update(updates)
              .eq('id', report.id);

            if (updateError) throw updateError;
          }
        } catch (err) {
          console.error(`Failed to process report ${report.id}:`, err);
          failCount++;
        }
      }

      toast({
        title: '전송 완료 (테스트 모드)',
        description: `학생 ${studentSentCount}건, 학부모 ${parentSentCount}건 처리 완료${failCount > 0 ? `, ${failCount}건 실패` : ''}. 실제 발송은 되지 않았습니다.`,
        variant: failCount > 0 ? 'destructive' : 'default',
      });

      // Sync to Google Docs if any parent message was published
      if (parentSentCount > 0) {
        try {
          const { data: gdocRes, error: gdocErr } = await supabase.functions.invoke(
            'upload-weekly-reports-to-gdoc',
            {
              body: {
                week_start: format(weekStart, 'yyyy-MM-dd'),
                week_end: format(weekEnd, 'yyyy-MM-dd'),
              },
            }
          );
          if (gdocErr) throw gdocErr;
          toast({
            title: 'Google Docs 업로드 완료',
            description: `${gdocRes?.count ?? 0}명의 코멘트가 문서에 반영되었습니다.`,
          });
        } catch (e: any) {
          console.error('gdoc upload failed', e);
          toast({
            title: 'Google Docs 업로드 실패',
            description: e?.message ?? '업로드 중 오류가 발생했습니다.',
            variant: 'destructive',
          });
        }
      }

      // Refresh the list
      await fetchReports();
    } catch (error: any) {
      console.error('Error sending reports:', error);
      toast({
        title: '오류',
        description: error.message || '리포트 전송에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  // Apply filters
  const filteredReports = reports.filter((r) => {
    if (filterRisk !== 'all' && r.risk_level !== filterRisk) return false;
    if (filterSentStatus !== 'all') {
      // Check both student and parent status
      const bothSent = r.student_sent_status === 'sent' && r.parent_sent_status === 'sent';
      const anySent = r.student_sent_status === 'sent' || r.parent_sent_status === 'sent';
      const anyFailed = r.student_sent_status === 'failed' || r.parent_sent_status === 'failed';
      
      if (filterSentStatus === 'sent' && !bothSent) return false;
      if (filterSentStatus === 'draft' && anySent) return false;
      if (filterSentStatus === 'failed' && !anyFailed) return false;
    }
    if (filterSendableOnly && (r.total_lessons === 0 || (r.student_sent_status === 'sent' && r.parent_sent_status === 'sent'))) return false;
    return true;
  });

  // Calculate excluded students
  const excludedZeroLessons = reports.filter(r => r.total_lessons === 0);

  // Count selected targets
  const selectedStudentCount = [...sendTargets.values()].filter(t => {
    const report = reports.find(r => r.id === t.reportId);
    return t.sendStudent && report && report.total_lessons > 0 && (report.student_sent_status !== 'sent' || resendEnabled);
  }).length;
  
  const selectedParentCount = [...sendTargets.values()].filter(t => {
    const report = reports.find(r => r.id === t.reportId);
    return t.sendParent && report && report.total_lessons > 0 && (report.parent_sent_status !== 'sent' || resendEnabled);
  }).length;

  const getSentStatusIcon = (status: string | null) => {
    switch (status) {
      case 'sent':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">주간 리포트 전송</h1>
        <p className="text-muted-foreground mt-1">
          주간 학습 요약 리포트를 생성하고 학부모/학생에게 전송합니다
        </p>
      </div>

      {/* Test Mode Warning */}
      <Card className="border-amber-500/50 bg-amber-500/10">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>현재는 테스트 모드입니다.</strong> 실제 발송은 되지 않습니다. 
              전송 시 메시지 내용이 로그에 저장되며, DB 상태만 업데이트됩니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Date Range & Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">리포트 기간</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Week Start */}
            <div className="space-y-2">
              <label className="text-sm font-medium">시작일</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[180px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(weekStart, 'yyyy-MM-dd')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={weekStart}
                    onSelect={(date) => date && setWeekStart(date)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Week End */}
            <div className="space-y-2">
              <label className="text-sm font-medium">종료일</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[180px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(weekEnd, 'yyyy-MM-dd')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={weekEnd}
                    onSelect={(date) => date && setWeekEnd(date)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Generate All Button */}
            <Button onClick={() => handleGenerateReports()} disabled={generating} variant="default">
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              전체 생성
            </Button>

            {/* Generate Selected Button */}
            <Button 
              onClick={handleGenerateSelectedReports} 
              disabled={generating || selectedStudentIds.size === 0}
              variant="secondary"
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="mr-2 h-4 w-4" />
              )}
              선택 생성 ({selectedStudentIds.size}명)
            </Button>
          </div>
          
          {/* REPORT_GEN_DEBUG: Debug info panel - Admin only */}
          {lastDebugInfo && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg font-mono text-xs">
              <div className="font-bold text-yellow-800 dark:text-yellow-200 mb-1">
                [REPORT_GEN_DEBUG_V2] scope={lastDebugInfo.scope || 'all'} count={lastDebugInfo.count || 'all'} templateVersion={lastDebugInfo.templateVersion}
              </div>
              <div className="text-yellow-700 dark:text-yellow-300 space-y-0.5">
                <div>source={lastDebugInfo.source}</div>
                <div>time={lastDebugInfo.timestamp} (KST)</div>
                <div>status={lastDebugInfo.status}</div>
                {lastDebugInfo.message && <div>msg={lastDebugInfo.message}</div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Selection for Per-Student Generation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            학생 선택 (선택 생성용)
            {selectedStudentIds.size > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                — {selectedStudentIds.size}명 선택됨
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름 또는 학년으로 검색..."
              value={studentSearchTerm}
              onChange={(e) => setStudentSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Select All / Deselect All */}
          <div className="flex items-center gap-4 text-sm">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => toggleAllVisibleStudents(true)}
              disabled={filteredStudents.length === 0}
            >
              전체 선택
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => toggleAllVisibleStudents(false)}
              disabled={selectedStudentIds.size === 0}
            >
              선택 해제
            </Button>
            <span className="text-muted-foreground">
              {filteredStudents.length}명 표시 중
            </span>
          </div>

          {/* Student List */}
          <ScrollArea className="h-[200px] border rounded-md p-2">
            <div className="space-y-1">
              {filteredStudents.map(student => (
                <div 
                  key={student.id}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedStudentIds.has(student.id) && "bg-primary/10"
                  )}
                  onClick={() => toggleStudentSelection(student.id)}
                >
                  <Checkbox 
                    checked={selectedStudentIds.has(student.id)}
                    onCheckedChange={() => toggleStudentSelection(student.id)}
                  />
                  <span className="font-medium">{student.name}</span>
                  {student.grade && (
                    <span className="text-sm text-muted-foreground">({student.grade})</span>
                  )}
                </div>
              ))}
              {filteredStudents.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  검색 결과가 없습니다
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">위험도</label>
              <Select value={filterRisk} onValueChange={setFilterRisk}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="medium">보통</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">발송 상태</label>
              <Select value={filterSentStatus} onValueChange={setFilterSentStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">대기중</SelectItem>
                  <SelectItem value="sent">발송됨</SelectItem>
                  <SelectItem value="failed">실패</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">클래스</label>
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 클래스</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">선생님</label>
              <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 선생님</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick filter for sendable only */}
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="sendableOnly"
                checked={filterSendableOnly}
                onCheckedChange={(checked) => setFilterSendableOnly(!!checked)}
              />
              <label htmlFor="sendableOnly" className="text-sm cursor-pointer font-medium">
                발송 가능만 보기
              </label>
              <span className="text-xs text-muted-foreground">(수업기록 있음 + 대기중)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Excluded Students Section */}
      {reports.length > 0 && excludedZeroLessons.length > 0 && (
        <Card className="border-muted">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              발송 제외 안내
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-lg">
                <span className="font-medium">수업기록 미제출:</span>
                <span>{excludedZeroLessons.length}명</span>
                <span className="text-xs text-muted-foreground">(발송 시 자동 제외)</span>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              제외된 학생: {excludedZeroLessons.map(r => r.student_name).join(', ')}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Excluded Due to Drafts Panel */}
      {excludedDrafts.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-amber-500" />
                미제출 수업기록으로 인한 제외 ({excludedDrafts.length}명)
              </CardTitle>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">선생님:</label>
                <Select 
                  value={excludedDraftsTeacherFilter} 
                  onValueChange={setExcludedDraftsTeacherFilter}
                >
                  <SelectTrigger className="w-[150px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {[...new Set(excludedDrafts.map(d => d.teacher_id))].map(teacherId => {
                      const draft = excludedDrafts.find(d => d.teacher_id === teacherId);
                      return (
                        <SelectItem key={teacherId} value={teacherId}>
                          {draft?.teacher_name || '알 수 없음'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>선생님</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>수업 날짜</TableHead>
                    <TableHead>임시저장 시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excludedDrafts
                    .filter(d => excludedDraftsTeacherFilter === 'all' || d.teacher_id === excludedDraftsTeacherFilter)
                    .map((draft, index) => (
                    <TableRow key={`${draft.student_id}-${index}`} className="bg-amber-500/5">
                      <TableCell className="font-medium">{draft.student_name}</TableCell>
                      <TableCell className="text-muted-foreground">{draft.teacher_name}</TableCell>
                      <TableCell>{draft.subject}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {draft.lesson_date ? format(new Date(draft.lesson_date), 'MM/dd') : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {draft.draft_created_at 
                          ? format(new Date(draft.draft_created_at), 'MM/dd HH:mm')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              위 학생들은 해당 기간에 제출된 수업기록이 없어 리포트 발송에서 제외됩니다. 
              선생님이 임시저장된 수업기록을 제출하면 다음 리포트 생성 시 반영됩니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reports Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">
            리포트 목록 ({filteredReports.length}건)
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="resend"
                checked={resendEnabled}
                onCheckedChange={(checked) => setResendEnabled(!!checked)}
              />
              <label htmlFor="resend" className="text-sm cursor-pointer">
                재전송 허용
              </label>
            </div>
            <Button 
              onClick={handleSendReports} 
              disabled={sending || (selectedStudentCount === 0 && selectedParentCount === 0)}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              선택 전송 (학생 {selectedStudentCount} / 학부모 {selectedParentCount})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-12">
              <FileBarChart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                리포트가 없습니다. "리포트 생성" 버튼을 클릭하여 주간 요약을 생성하세요.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">학생 전송</TableHead>
                    <TableHead className="w-[100px]">학부모 전송</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>수업 수</TableHead>
                    <TableHead>평균 점수</TableHead>
                    <TableHead>주요 이슈</TableHead>
                    <TableHead>위험도</TableHead>
                    <TableHead>학생 상태</TableHead>
                    <TableHead>학부모 상태</TableHead>
                    <TableHead>미리보기</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => {
                    const hasNoLessons = report.total_lessons === 0;
                    const target = sendTargets.get(report.id);
                    const studentDisabled = hasNoLessons || (report.student_sent_status === 'sent' && !resendEnabled);
                    const parentDisabled = hasNoLessons || (report.parent_sent_status === 'sent' && !resendEnabled);
                    
                    return (
                    <TableRow 
                      key={report.id}
                      className={cn(
                        hasNoLessons && 'bg-amber-500/5'
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={target?.sendStudent ?? false}
                          onCheckedChange={() => toggleSendStudent(report.id)}
                          disabled={studentDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={target?.sendParent ?? false}
                          onCheckedChange={() => toggleSendParent(report.id)}
                          disabled={parentDisabled}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {report.student_name || '-'}
                          {hasNoLessons && (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 border border-amber-500/30 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3" />
                              미제출로 제외
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {hasNoLessons ? (
                          <span className="text-amber-600 font-medium">0</span>
                        ) : (
                          report.total_lessons
                        )}
                      </TableCell>
                      <TableCell>
                        {report.avg_understanding ? (
                          <ScoreBadge score={Math.round(report.avg_understanding)} />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px]">
                        {report.common_issues && report.common_issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {report.common_issues.slice(0, 2).map((issue, i) => (
                              <span
                                key={i}
                                className="text-xs bg-secondary px-2 py-0.5 rounded-full"
                              >
                                {issue}
                              </span>
                            ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {report.risk_level ? (
                          <RiskBadge level={report.risk_level} />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getSentStatusIcon(report.student_sent_status)}
                          {report.student_sent_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(report.student_sent_at), 'MM/dd')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getSentStatusIcon(report.parent_sent_status)}
                          {report.parent_sent_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(report.parent_sent_at), 'MM/dd')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreview(report)}
                          disabled={hasNoLessons}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>메시지 미리보기 - {previewReport?.student_name}</DialogTitle>
            <DialogDescription>
              학생/학부모에게 전송될 메시지를 확인하세요.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as 'student' | 'parent')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student">학생용</TabsTrigger>
              <TabsTrigger value="parent">학부모용</TabsTrigger>
            </TabsList>
            
            <TabsContent value="student" className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>연락처: {previewReport?.student_phone || '번호 없음'}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewReport?.student_message && copyToClipboard(previewReport.student_message)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  복사
                </Button>
              </div>
              <ScrollArea className="h-[300px]">
                <div className="bg-muted/50 rounded-md p-4">
                  <pre className="text-sm whitespace-pre-wrap font-sans">
                    {previewReport?.student_message || '메시지가 없습니다. 리포트를 다시 생성해주세요.'}
                  </pre>
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="parent" className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>연락처: {previewReport?.parent_phone || '번호 없음'}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewReport?.parent_message && copyToClipboard(previewReport.parent_message)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  복사
                </Button>
              </div>
              <ScrollArea className="h-[300px]">
                <div className="bg-muted/50 rounded-md p-4">
                  <pre className="text-sm whitespace-pre-wrap font-sans">
                    {previewReport?.parent_message || '메시지가 없습니다. 리포트를 다시 생성해주세요.'}
                  </pre>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin-only Prompt Settings */}
      <ReportPromptSettings />
    </div>
  );
}
