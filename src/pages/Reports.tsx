import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RiskBadge } from '@/components/ui/risk-badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  FileBarChart, 
  Calendar, 
  Send, 
  Loader2, 
  Eye, 
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  Users,
  Trash2
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format, startOfWeek, subWeeks, addWeeks, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReportPromptSettings } from '@/components/ReportPromptSettings';
import { WeeklyReportGenerationStatus } from '@/components/admin/WeeklyReportGenerationStatus';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Share link generation state
interface ShareLinkState {
  loading: boolean;
  reportId: string | null;
}

interface WeeklyReport {
  id: string;
  student_id: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  homework_completion_rate: number | null;
  common_issues: string[];
  summary: string | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  generated_at: string;
  student_message: string | null;
  parent_message: string | null;
  student_sent_status: 'draft' | 'sent' | 'failed' | null;
  parent_sent_status: 'draft' | 'sent' | 'failed' | null;
  student_sent_at: string | null;
  parent_sent_at: string | null;
  student_name?: string;
  parent_phone?: string;
  student_phone?: string;
  principal_comment?: string | null;
  principal_comment_enabled?: boolean | null;
  report_quality_tag?: 'GREEN' | 'YELLOW' | 'RED' | null;
  // REPORT-ERROR-DETAIL-V1: Include debug_info for error visibility
  debug_info?: string | null;
  parent_visible?: boolean;
}

type QualityFilter = 'all' | 'sendable' | 'RED';

interface SendTarget {
  reportId: string;
  sendStudent: boolean;
  sendParent: boolean;
}

interface StudentForGeneration {
  id: string;
  name: string;
  grade: string | null;
  alreadyGenerated?: boolean;
}

// REPORT-ERROR-PANEL-V1: Error structure from edge function
interface GenerationError {
  student_id: string;
  student_name: string;
  stage: string;
  message: string;
  code: string | null;
  fetched_total: number;
  fetched_submitted: number;
  fetched_draft: number;
}

export default function Reports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [resendEnabled, setResendEnabled] = useState(false);
  const { toast } = useToast();

  // Send targets state
  const [sendTargets, setSendTargets] = useState<Map<string, SendTarget>>(new Map());
  
  // Preview state
  const [previewReport, setPreviewReport] = useState<WeeklyReport | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<'student' | 'parent'>('student');

  // Principal comment state
  const [principalCommentEnabled, setPrincipalCommentEnabled] = useState(false);
  const [principalComment, setPrincipalComment] = useState('');

  // Per-student generation state
  const [allStudents, setAllStudents] = useState<StudentForGeneration[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  
  // REPORT-ERROR-PANEL-V1: Store last generation errors for visible panel
  const [lastGenerationErrors, setLastGenerationErrors] = useState<GenerationError[]>([]);
  
  // Quality tag filter state - default to sendable (GREEN + YELLOW)
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('sendable');

  // Batch generation progress
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; errors: number } | null>(null);

  // Share link state
  const [shareLinkState, setShareLinkState] = useState<ShareLinkState>({ loading: false, reportId: null });

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk delete state
  const [bulkDeleteIds, setBulkDeleteIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkVisibleUpdating, setBulkVisibleUpdating] = useState(false);

  // Active main tab
  const [mainTab, setMainTab] = useState<'generate' | 'prompt'>('generate');

  // Custom week range state
  const [weekStart, setWeekStart] = useState<string>(() => {
    const lastWeek = subWeeks(new Date(), 1);
    const mon = startOfWeek(lastWeek, { weekStartsOn: 1 });
    return format(mon, 'yyyy-MM-dd');
  });
  const [weekEnd, setWeekEnd] = useState<string>(() => {
    const lastWeek = subWeeks(new Date(), 1);
    const mon = startOfWeek(lastWeek, { weekStartsOn: 1 });
    return format(addDays(mon, 5), 'yyyy-MM-dd'); // Saturday
  });

  // Report list week filter — defaults to same as generation week
  const [reportWeekFilter, setReportWeekFilter] = useState<string>(() => {
    const lastWeek = subWeeks(new Date(), 1);
    const mon = startOfWeek(lastWeek, { weekStartsOn: 1 });
    return format(mon, 'yyyy-MM-dd');
  });

  // Track which students already have reports for the selected week
  const [existingReportStudentIds, setExistingReportStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchReports();
    fetchAllStudents();
  }, []);

  // Fetch existing reports when week changes to block duplicates
  useEffect(() => {
    if (weekStart) {
      fetchExistingReportsForWeek();
    }
  }, [weekStart, weekEnd]);

  // Track which students have successful (non-RED) reports — RED reports can be retried
  const [failedReportStudentIds, setFailedReportStudentIds] = useState<Set<string>>(new Set());

  // Allow regeneration of already-generated (GREEN/YELLOW) reports
  const [allowRegenerate, setAllowRegenerate] = useState(false);

  async function fetchExistingReportsForWeek() {
    try {
      // Fetch all reports for this week with their quality tag
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('student_id, report_quality_tag')
        .eq('week_start', weekStart);
      if (error) throw error;

      const successIds = new Set<string>();
      const failedIds = new Set<string>();
      (data || []).forEach(r => {
        if (r.report_quality_tag === 'RED') {
          failedIds.add(r.student_id);
        } else {
          successIds.add(r.student_id);
        }
      });
      setExistingReportStudentIds(successIds);
      setFailedReportStudentIds(failedIds);
    } catch (err) {
      console.error('Error fetching existing reports for week:', err);
    }
  }

  async function fetchAllStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, grade')
        .in('enrollment_status', ['재학', '재등원'])
        .order('name');
      
      if (error) throw error;
      setAllStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  }

  // Week range as object for compatibility
  const weekRange = useMemo(() => ({
    start: weekStart,
    end: weekEnd,
  }), [weekStart, weekEnd]);

  // Navigate weeks
  function shiftWeek(direction: -1 | 1) {
    const fn = direction === -1 ? subWeeks : addWeeks;
    const baseDate = new Date(weekStart);
    const newBase = fn(baseDate, 1);
    const mon = startOfWeek(newBase, { weekStartsOn: 1 });
    setWeekStart(format(mon, 'yyyy-MM-dd'));
    setWeekEnd(format(addDays(mon, 5), 'yyyy-MM-dd')); // Saturday
  }

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!studentSearchQuery.trim()) return allStudents;
    const q = studentSearchQuery.toLowerCase();
    return allStudents.filter(s => s.name.toLowerCase().includes(q));
  }, [allStudents, studentSearchQuery]);

  function toggleStudentSelection(studentId: string) {
    if (!allowRegenerate && existingReportStudentIds.has(studentId)) return; // Block already-generated unless regenerate allowed
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

  function selectAllFilteredStudents() {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      filteredStudents
        .filter(s => allowRegenerate || !existingReportStudentIds.has(s.id))
        .forEach(s => next.add(s.id));
      return next;
    });
  }

  function clearSelectedStudents() {
    setSelectedStudentIds(new Set());
  }

  const BATCH_SIZE = 10; // Max students per edge function call

  async function handleGenerateReports(scope: 'all' | 'selected') {
    setGenerating(true);
    setLastGenerationErrors([]);
    setBatchProgress(null);
    
    try {
      const allTargetIds = scope === 'selected' ? Array.from(selectedStudentIds) : allStudents.map(s => s.id);
      const totalCount = allTargetIds.length;

      if (totalCount === 0) {
        toast({ title: '생성할 학생이 없습니다.', variant: 'destructive' });
        setGenerating(false);
        return;
      }

      // Split into batches
      const batches: string[][] = [];
      for (let i = 0; i < allTargetIds.length; i += BATCH_SIZE) {
        batches.push(allTargetIds.slice(i, i + BATCH_SIZE));
      }

      console.log(`[REPORT_GEN_BATCH] total=${totalCount} batches=${batches.length} batchSize=${BATCH_SIZE}`);

      let totalSuccess = 0;
      let totalErrors = 0;
      const allErrors: GenerationError[] = [];

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        setBatchProgress({ current: batchIdx * BATCH_SIZE + batch.length, total: totalCount, errors: totalErrors });

        const { data, error } = await supabase.functions.invoke('generate-weekly-reports', {
          body: {
            manual: true,
            direct_save: true,
            // WEEKLY-REPORT-REPAIR-V1: 재생성 허용 시에만 기존 초안 덮어쓰기(공개본은 서버에서 보호)
            force: allowRegenerate,
            week_start: weekRange.start,
            week_end: weekRange.end,
            student_ids: batch,

          },
        });

        if (error) {
          console.error(`[REPORT_GEN_BATCH] Batch ${batchIdx + 1} failed:`, error);
          totalErrors += batch.length;
          continue;
        }

        totalSuccess += data?.successCount ?? 0;
        totalErrors += data?.errorCount ?? 0;
        if (data?.errors) {
          allErrors.push(...data.errors);
        }
      }

      setBatchProgress(null);
      setLastGenerationErrors(allErrors);

      if (totalErrors > 0) {
        toast({
          title: `생성 완료 (${totalSuccess}건 성공, ${totalErrors}건 실패)`,
          description: `총 ${totalCount}명 중 ${totalSuccess}명 완료. 하단 오류 패널 확인.`,
          variant: 'destructive',
          duration: 8000,
        });
      } else {
        toast({
          title: `전체 ${totalSuccess}명 생성 완료`,
          description: `${batches.length > 1 ? `${batches.length}개 배치로 나눠 처리` : '1회 처리'} 완료`,
        });
      }

      await fetchReports();
      await fetchExistingReportsForWeek(); // Refresh blocked students
      if (scope === 'selected') clearSelectedStudents();
    } catch (error: any) {
      console.error('Error generating reports:', error);
      toast({
        title: '생성 실패',
        description: error.message || '리포트 생성에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
      setBatchProgress(null);
    }
  }
  async function fetchReports() {
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select(`
          *,
          students:student_id (name, parent_phone, student_phone, enrollment_status)
        `)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      const formattedReports: WeeklyReport[] = (data || [])
        .filter((r: any) => ['재학'].includes(r.students?.enrollment_status))
        .map((r: any) => ({
          ...r,
          student_name: r.students?.name,
          parent_phone: r.students?.parent_phone,
          student_phone: r.students?.student_phone,
        }));

      setReports(formattedReports);
      
      // Initialize send targets - disable for RED quality tag
      const newTargets = new Map<string, SendTarget>();
      formattedReports.forEach(r => {
        const hasLessons = r.total_lessons > 0;
        const isRed = r.report_quality_tag === 'RED';
        const canSendStudent = hasLessons && !isRed && (r.student_sent_status !== 'sent' || resendEnabled);
        const canSendParent = hasLessons && !isRed && (r.parent_sent_status !== 'sent' || resendEnabled);
        
        newTargets.set(r.id, {
          reportId: r.id,
          sendStudent: canSendStudent,
          sendParent: canSendParent,
        });
      });
      setSendTargets(newTargets);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({
        title: '오류',
        description: '리포트를 불러오지 못했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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

  function handlePreview(report: WeeklyReport) {
    setPreviewReport(report);
    setPreviewTab('student');
    setShowPreview(true);
  }

  // REPORT_COPY_CLEAN_V1: Strip debug markers from message for clean copy
  function stripDebugMarkers(text: string): string {
    if (!text) return '';
    return text
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        // Exclude debug markers
        if (trimmed.startsWith('[NARRATIVE_RENDER_ACTIVE')) return false;
        if (trimmed.startsWith('[REPORT_GEN_DEBUG')) return false;
        if (trimmed.startsWith('[REPORT-')) return false;
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Collapse multiple blank lines
      .trim();
  }

  // REPORT_COPY_CLEAN_V1: Check if line is a debug marker
  function isDebugMarker(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('[NARRATIVE_RENDER_ACTIVE') ||
      trimmed.startsWith('[REPORT_GEN_DEBUG') ||
      trimmed.startsWith('[REPORT-')
    );
  }

  async function copyToClipboard(text: string) {
    try {
      // REPORT_COPY_CLEAN_V1: Always strip debug markers before copying
      const cleanText = stripDebugMarkers(text);
      await navigator.clipboard.writeText(cleanText);
      toast({ title: '클립보드에 복사되었습니다.' });
    } catch (err) {
      toast({ title: '복사 실패', variant: 'destructive' });
    }
  }

  async function generateShareLink(reportId: string) {
    setShareLinkState({ loading: true, reportId });
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-report?action=generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ report_id: reportId }),
        }
      );
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error);

      const publishedOrigin = 'https://seedling-log.lovable.app';
      const publicUrl = `${publishedOrigin}/report/view?token=${result.token}`;
      await navigator.clipboard.writeText(publicUrl);
      toast({ title: '공유 링크가 복사되었습니다!', description: '카톡에 붙여넣기 하세요.' });
    } catch (err: any) {
      toast({ title: '링크 생성 실패', description: err.message, variant: 'destructive' });
    } finally {
      setShareLinkState({ loading: false, reportId: null });
    }
  }

  async function handleDeleteReport(reportId: string) {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('weekly_reports')
        .delete()
        .eq('id', reportId);
      if (error) throw error;
      toast({ title: '리포트가 삭제되었습니다.' });
      setDeleteTarget(null);
      await fetchReports();
      await fetchExistingReportsForWeek();
    } catch (error: any) {
      console.error('Error deleting report:', error);
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  function toggleBulkDelete(reportId: string) {
    setBulkDeleteIds(prev => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  }

  function toggleBulkDeleteAll() {
    if (bulkDeleteIds.size === filteredReports.length) {
      setBulkDeleteIds(new Set());
    } else {
      setBulkDeleteIds(new Set(filteredReports.map(r => r.id)));
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      const ids = Array.from(bulkDeleteIds);
      const { error } = await supabase
        .from('weekly_reports')
        .delete()
        .in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length}건의 리포트가 삭제되었습니다.` });
      setBulkDeleteIds(new Set());
      setShowBulkDeleteConfirm(false);
      await fetchReports();
      await fetchExistingReportsForWeek();
    } catch (error: any) {
      console.error('Error bulk deleting reports:', error);
      toast({ title: '일괄 삭제 실패', description: error.message, variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkParentVisible(visible: boolean) {
    setBulkVisibleUpdating(true);
    try {
      const ids = Array.from(bulkDeleteIds);
      const { error } = await supabase
        .from('weekly_reports')
        .update({ parent_visible: visible } as any)
        .in('id', ids);
      if (error) throw error;
      setReports(prev => prev.map(r => ids.includes(r.id) ? { ...r, parent_visible: visible } : r));
      toast({ title: `${ids.length}건 ${visible ? '학부모 공개' : '학부모 비공개'} 처리 완료` });
      // Sync affected weeks to Google Docs
      const affectedWeeks = new Set<string>();
      reports.forEach(r => {
        if (ids.includes(r.id)) affectedWeeks.add(`${r.week_start}|${r.week_end}`);
      });
      for (const key of affectedWeeks) {
        const [ws, we] = key.split('|');
        supabase.functions.invoke('upload-weekly-reports-to-gdoc', {
          body: { week_start: ws, week_end: we },
        }).catch((e) => console.error('gdoc sync failed', e));
      }
    } catch (error: any) {
      toast({ title: '처리 실패', description: error.message, variant: 'destructive' });
    } finally {
      setBulkVisibleUpdating(false);
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
            // Prepare message with optional principal comment
            let finalParentMessage = report.parent_message || '';
            if (principalCommentEnabled && principalComment.trim()) {
              // Insert principal comment after comparison sentence (after second \n\n)
              const parts = finalParentMessage.split('\n\n');
              if (parts.length >= 2) {
                parts.splice(2, 0, `💬 원장 코멘트: ${principalComment.trim()}`);
                finalParentMessage = parts.join('\n\n');
              } else {
                finalParentMessage = finalParentMessage + `\n\n💬 원장 코멘트: ${principalComment.trim()}`;
              }
            }
            
            console.log('=== 학부모 메시지 전송 (테스트 모드) ===');
            console.log('학생:', report.student_name);
            console.log('연락처:', report.parent_phone);
            console.log('메시지:', finalParentMessage);
            console.log('=====================================');
            
            updates.parent_sent_status = 'sent';
            updates.parent_sent_at = new Date().toISOString();
            
            // Save principal comment settings to DB
            if (principalCommentEnabled && principalComment.trim()) {
              updates.principal_comment = principalComment.trim();
              updates.principal_comment_enabled = true;
            }
            
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

  // Filter by search query, quality tag, and week
  const filteredReports = reports.filter((report) => {
    // Week filter
    if (reportWeekFilter && report.week_start !== reportWeekFilter) return false;

    // Name filter
    const matchesName = report.student_name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesName) return false;
    
    // Quality tag filter
    if (qualityFilter === 'sendable') {
      return report.report_quality_tag === 'GREEN' || report.report_quality_tag === 'YELLOW' || !report.report_quality_tag;
    } else if (qualityFilter === 'RED') {
      return report.report_quality_tag === 'RED';
    }
    return true;
  });

  // Count reports by quality tag (within week filter)
  const weekFilteredReports = reports.filter(r => !reportWeekFilter || r.week_start === reportWeekFilter);
  const qualityCounts = {
    GREEN: weekFilteredReports.filter(r => r.report_quality_tag === 'GREEN').length,
    YELLOW: weekFilteredReports.filter(r => r.report_quality_tag === 'YELLOW').length,
    RED: weekFilteredReports.filter(r => r.report_quality_tag === 'RED').length,
  };

  // Count selected targets - exclude RED reports
  const selectedStudentCount = [...sendTargets.values()].filter(t => {
    const report = reports.find(r => r.id === t.reportId);
    return t.sendStudent && report && report.total_lessons > 0 && report.report_quality_tag !== 'RED' && (report.student_sent_status !== 'sent' || resendEnabled);
  }).length;
  
  const selectedParentCount = [...sendTargets.values()].filter(t => {
    const report = reports.find(r => r.id === t.reportId);
    return t.sendParent && report && report.total_lessons > 0 && report.report_quality_tag !== 'RED' && (report.parent_sent_status !== 'sent' || resendEnabled);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">주간 리포트</h1>
          <p className="text-muted-foreground mt-1">
            학생별 주간 학습 요약 리포트
          </p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'generate' | 'prompt')}>
        <TabsList>
          <TabsTrigger value="generate">리포트 생성 / 관리</TabsTrigger>
          <TabsTrigger value="prompt">프롬프트 설정</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
        <div className="flex items-center gap-3">
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

      {/* WEEKLY-REPORT-REPAIR-V1: 생성 상태 패널 */}
      <WeeklyReportGenerationStatus
        weekStart={weekRange.start}
        weekEnd={weekRange.end}
        generating={generating}
        onGenerateAll={() => handleGenerateReports('all')}
      />

      {/* Per-Student Report Generation Section - REPORT-PER-STUDENT-V1 */}

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">학생별 생성</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftWeek(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={weekStart}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setWeekStart(val);
                      // Auto-adjust weekEnd to Saturday (start + 5 days)
                      const newEnd = format(addDays(new Date(val), 5), 'yyyy-MM-dd');
                      setWeekEnd(newEnd);
                    }
                  }}
                  className="h-8 w-[130px] text-xs"
                />
                <span className="text-muted-foreground text-sm">~</span>
                <Input
                  type="date"
                  value={weekEnd}
                  onChange={(e) => {
                    if (e.target.value) {
                      setWeekEnd(e.target.value);
                    }
                  }}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftWeek(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학생명 검색..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllFilteredStudents}
              disabled={filteredStudents.length === 0}
            >
              전체 선택
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelectedStudents}
              disabled={selectedStudentIds.size === 0}
            >
              선택 해제
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Switch
                id="allow-regenerate"
                checked={allowRegenerate}
                onCheckedChange={setAllowRegenerate}
              />
              <Label htmlFor="allow-regenerate" className="text-xs text-muted-foreground cursor-pointer">
                재생성 허용
              </Label>
            </div>
          </div>

          <ScrollArea className="h-48 border rounded-md">
            <div className="p-2 space-y-1">
              {filteredStudents.map((student) => {
                const alreadyGenerated = existingReportStudentIds.has(student.id);
                const isFailed = failedReportStudentIds.has(student.id);
                const isBlocked = alreadyGenerated && !allowRegenerate;
                return (
                  <div
                    key={student.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                      isBlocked
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:bg-muted/50",
                      !isBlocked && selectedStudentIds.has(student.id) && "bg-primary/10 hover:bg-primary/20",
                      isFailed && !alreadyGenerated && "border border-destructive/30 bg-destructive/5",
                      allowRegenerate && alreadyGenerated && !selectedStudentIds.has(student.id) && "border border-primary/20 bg-primary/5"
                    )}
                    onClick={() => toggleStudentSelection(student.id)}
                  >
                    <Checkbox
                      checked={selectedStudentIds.has(student.id)}
                      onCheckedChange={() => toggleStudentSelection(student.id)}
                      disabled={isBlocked}
                    />
                    <span className="font-medium">{student.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {student.grade || '학년 미지정'}
                    </span>
                    {alreadyGenerated && !allowRegenerate && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        생성됨
                      </span>
                    )}
                    {alreadyGenerated && allowRegenerate && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        재생성 가능
                      </span>
                    )}
                    {isFailed && !alreadyGenerated && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        재시도 가능
                      </span>
                    )}
                  </div>
                );
              })}
              {filteredStudents.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  검색 결과가 없습니다
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Batch progress indicator */}
          {batchProgress && (
            <div className="space-y-1.5 pt-2 border-t">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  배치 처리 중... ({batchProgress.current}/{batchProgress.total}명)
                </span>
                {batchProgress.errors > 0 && (
                  <span className="text-destructive">{batchProgress.errors}건 오류</span>
                )}
              </div>
              <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-2" />
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>선택: <span className="font-medium text-foreground">{selectedStudentIds.size}명</span></span>
              <span className="text-xs">1회 최대 {BATCH_SIZE}명씩 배치 처리</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => handleGenerateReports('selected')}
                disabled={generating || selectedStudentIds.size === 0}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                선택 생성
              </Button>
              <Button
                onClick={() => handleGenerateReports('all')}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                전체 생성
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* REPORT-ERROR-PANEL-V1: Visible error panel when generation has errors */}
      {lastGenerationErrors.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                <CardTitle className="text-lg text-destructive">
                  생성 실패 상세
                </CardTitle>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  REPORT-ERROR-PANEL-V1
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLastGenerationErrors([])}
                className="h-7 text-xs"
              >
                닫기
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastGenerationErrors.slice(0, 5).map((err, idx) => (
              <div
                key={`${err.student_id}-${idx}`}
                className="p-3 bg-background rounded-lg border border-destructive/30"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">{err.student_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive font-mono">
                    stage={err.stage}
                  </span>
                  {err.code && (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted font-mono">
                      code={err.code}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {err.message}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>fetched_total={err.fetched_total}</span>
                  <span>submitted={err.fetched_submitted}</span>
                  <span>draft={err.fetched_draft}</span>
                </div>
              </div>
            ))}
            {lastGenerationErrors.length > 5 && (
              <p className="text-sm text-muted-foreground text-center">
                ...외 {lastGenerationErrors.length - 5}건 더 있음
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Mode Warning */}
      <Card className="border-amber-500/50 bg-amber-500/10">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>현재는 테스트 모드입니다.</strong> 실제 발송은 되지 않습니다. 
              전송 시 DB 상태만 업데이트됩니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Principal Comment Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                <Label htmlFor="principal-toggle" className="font-medium cursor-pointer">
                  원장 코멘트 포함
                </Label>
              </div>
              <Switch
                id="principal-toggle"
                checked={principalCommentEnabled}
                onCheckedChange={setPrincipalCommentEnabled}
              />
            </div>
            {principalCommentEnabled && (
              <div className="space-y-2">
                <Textarea
                  placeholder="학부모 메시지에 추가할 원장 코멘트를 입력하세요 (최대 120자)"
                  value={principalComment}
                  onChange={(e) => setPrincipalComment(e.target.value.slice(0, 120))}
                  maxLength={120}
                  rows={2}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {principalComment.length}/120자
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            {/* Week filter navigation */}
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">주차 필터:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    const prev = format(subWeeks(new Date(reportWeekFilter), 1), 'yyyy-MM-dd');
                    const mon = format(startOfWeek(new Date(prev), { weekStartsOn: 1 }), 'yyyy-MM-dd');
                    setReportWeekFilter(mon);
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-mono min-w-[160px] text-center">
                  {reportWeekFilter} ~ {format(addDays(new Date(reportWeekFilter), 5), 'yyyy-MM-dd')}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    const next = format(addWeeks(new Date(reportWeekFilter), 1), 'yyyy-MM-dd');
                    const mon = format(startOfWeek(new Date(next), { weekStartsOn: 1 }), 'yyyy-MM-dd');
                    setReportWeekFilter(mon);
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <span className="text-sm text-muted-foreground">
                ({weekFilteredReports.length}건)
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="학생 이름으로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            {/* Quality Tag Filter Chips - REPORT-QUALITY-FILTER-V1 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground mr-1">품질:</span>
              <Button
                variant={qualityFilter === 'sendable' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setQualityFilter('sendable')}
                className="h-7 text-xs"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                전송 가능 ({qualityCounts.GREEN + qualityCounts.YELLOW})
              </Button>
              <Button
                variant={qualityFilter === 'RED' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setQualityFilter('RED')}
                className={cn("h-7 text-xs", qualityFilter !== 'RED' && "text-destructive border-destructive/50 hover:bg-destructive/10")}
              >
                <XCircle className="w-3 h-3 mr-1" />
                팔로업 필요 ({qualityCounts.RED})
              </Button>
              <Button
                variant={qualityFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setQualityFilter('all')}
                className="h-7 text-xs"
              >
                전체 ({reports.length})
              </Button>
              
              {/* RED report follow-up helper */}
              {qualityFilter === 'RED' && qualityCounts.RED > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Generate follow-up message template for RED reports
                    const redReports = filteredReports.filter(r => r.report_quality_tag === 'RED');
                    const studentList = redReports.map(r => r.student_name).filter(Boolean).join(', ');
                    const message = `[추가 관찰 요청]\n\n다음 학생의 주간 리포트에 추가 코멘트가 필요합니다:\n\n${studentList}\n\n상세 관찰 내용을 기록해주세요.`;
                    navigator.clipboard.writeText(message);
                    toast({ title: '팔로업 템플릿 복사 완료', description: `${redReports.length}명 학생 목록이 복사되었습니다.` });
                  }}
                  className="h-7 text-xs ml-2"
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  추가 코멘트 요청 복사
                </Button>
              )}
              
              {/* Quality Tag Legend */}
              <div className="ml-auto flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  GREEN: {qualityCounts.GREEN}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  YELLOW: {qualityCounts.YELLOW}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  RED: {qualityCounts.RED}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredReports.length === 0 ? (
            <div className="text-center py-12">
              <FileBarChart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? '검색 결과가 없습니다'
                  : '아직 생성된 리포트가 없습니다. 리포트는 매주 금요일에 자동 생성됩니다.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Bulk delete action bar */}
              {bulkDeleteIds.size > 0 && (
                <div className="flex items-center gap-3 mb-3 p-3 bg-muted/50 border border-border rounded-lg flex-wrap">
                  <Checkbox
                    checked={bulkDeleteIds.size === filteredReports.length && filteredReports.length > 0}
                    onCheckedChange={toggleBulkDeleteAll}
                  />
                  <span className="text-sm font-medium">
                    {bulkDeleteIds.size}건 선택됨
                  </span>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={bulkVisibleUpdating}
                    onClick={() => handleBulkParentVisible(true)}
                  >
                    {bulkVisibleUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                    학부모 공개
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkVisibleUpdating}
                    onClick={() => handleBulkParentVisible(false)}
                  >
                    학부모 비공개
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    선택 삭제
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkDeleteIds(new Set())}
                  >
                    선택 해제
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={bulkDeleteIds.size === filteredReports.length && filteredReports.length > 0}
                        onCheckedChange={toggleBulkDeleteAll}
                      />
                    </TableHead>
                    <TableHead className="w-[90px]">학생 전송</TableHead>
                    <TableHead className="w-[90px]">학부모 전송</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>기간</TableHead>
                    <TableHead>수업 수</TableHead>
                    <TableHead>평균 점수</TableHead>
                    <TableHead>주요 이슈</TableHead>
                    <TableHead>품질</TableHead>
                    <TableHead>위험도</TableHead>
                    <TableHead>학생 상태</TableHead>
                    <TableHead>학부모 상태</TableHead>
                     <TableHead>미리보기</TableHead>
                     <TableHead>공유 링크</TableHead>
                     <TableHead>학부모 공개</TableHead>
                     <TableHead>삭제</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => {
                    const hasNoLessons = report.total_lessons === 0;
                    const isRed = report.report_quality_tag === 'RED';
                    const target = sendTargets.get(report.id);
                    const studentDisabled = hasNoLessons || isRed || (report.student_sent_status === 'sent' && !resendEnabled);
                    const parentDisabled = hasNoLessons || isRed || (report.parent_sent_status === 'sent' && !resendEnabled);
                    
                    return (
                      <TableRow 
                        key={report.id}
                        className={cn(
                          hasNoLessons && 'bg-amber-500/5',
                          isRed && 'bg-destructive/5'
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={bulkDeleteIds.has(report.id)}
                            onCheckedChange={() => toggleBulkDelete(report.id)}
                          />
                        </TableCell>
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
                        <TableCell className="text-muted-foreground">
                          {format(new Date(report.week_start), 'MM/dd')} -{' '}
                          {format(new Date(report.week_end), 'MM/dd')}
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
                              {report.common_issues.length > 2 && (
                                <span className="text-xs text-muted-foreground">
                                  +{report.common_issues.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {report.report_quality_tag ? (
                            <span className={cn(
                              "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
                              report.report_quality_tag === 'GREEN' && "bg-green-500/15 text-green-600 border border-green-500/30",
                              report.report_quality_tag === 'YELLOW' && "bg-yellow-500/15 text-yellow-600 border border-yellow-500/30",
                              report.report_quality_tag === 'RED' && "bg-red-500/15 text-red-600 border border-red-500/30"
                            )}>
                              {report.report_quality_tag === 'GREEN' && <CheckCircle2 className="w-3 h-3" />}
                              {report.report_quality_tag === 'YELLOW' && <AlertTriangle className="w-3 h-3" />}
                              {report.report_quality_tag === 'RED' && <XCircle className="w-3 h-3" />}
                              {report.report_quality_tag}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
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
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generateShareLink(report.id)}
                            disabled={hasNoLessons || (shareLinkState.loading && shareLinkState.reportId === report.id)}
                          >
                            {shareLinkState.loading && shareLinkState.reportId === report.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={report.parent_visible ?? false}
                            onCheckedChange={async (checked) => {
                              await supabase
                                .from('weekly_reports')
                                .update({ parent_visible: checked } as any)
                                .eq('id', report.id);
                              setReports(prev => prev.map(r => r.id === report.id ? { ...r, parent_visible: checked } : r));
                              toast({ title: checked ? '학부모 공개됨' : '학부모 비공개됨' });
                              supabase.functions.invoke('upload-weekly-reports-to-gdoc', {
                                body: { week_start: report.week_start, week_end: report.week_end },
                              }).catch((e) => console.error('gdoc sync failed', e));
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: report.id, name: report.student_name || '알 수 없음' });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Summary Cards */}
      {filteredReports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="animate-fade-in">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                고위험 학생
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-risk-high">
                {reports.filter((r) => r.risk_level === 'high').length}
              </p>
            </CardContent>
          </Card>
          <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                중위험 학생
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-risk-medium">
                {reports.filter((r) => r.risk_level === 'medium').length}
              </p>
            </CardContent>
          </Card>
          <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                저위험 학생
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-risk-low">
                {reports.filter((r) => r.risk_level === 'low').length}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
        </TabsContent>

        <TabsContent value="prompt">
          <ReportPromptSettings />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>리포트 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>의 리포트를 삭제하시겠습니까? 삭제 후 다시 생성할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDeleteReport(deleteTarget.id)}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>리포트 일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 <strong>{bulkDeleteIds.size}건</strong>의 리포트를 삭제하시겠습니까? 삭제 후 다시 생성할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {bulkDeleteIds.size}건 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Message Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>메시지 미리보기 - {previewReport?.student_name}</DialogTitle>
            <DialogDescription>
              학생/학부모에게 전송될 메시지를 확인하세요.
            </DialogDescription>
          </DialogHeader>
          
          {/* REPORT-ERROR-DETAIL-V1: Show debug_info for RED reports with errors */}
          {previewReport?.report_quality_tag === 'RED' && previewReport?.debug_info && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 mb-2">
              <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-1">
                <AlertTriangle className="h-4 w-4" />
                오류 상세 정보
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground overflow-x-auto">
                {previewReport.debug_info}
              </pre>
            </div>
          )}
          
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
              <ScrollArea className="h-[350px]">
                <div className="bg-muted/50 rounded-md p-4">
                  {previewReport?.student_message ? (
                    <div className="text-sm space-y-3">
                      {/* REPORT_COPY_CLEAN_V1: Debug markers section (non-selectable) */}
                      {previewReport.student_message.split('\n').some(line => isDebugMarker(line)) && (
                        <div 
                          className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2 mb-3 select-none"
                          style={{ userSelect: 'none' }}
                        >
                          <div className="text-xs text-amber-600 font-medium mb-1">🔧 Debug Info (복사 제외)</div>
                          {previewReport.student_message.split('\n').filter(line => isDebugMarker(line)).map((line, idx) => (
                            <div key={`debug-${idx}`} className="text-xs font-mono text-muted-foreground">
                              {line}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* REPORT_COPY_CLEAN_V1: Copyable content section */}
                      <div id="student-report-copy-content">
                        {previewReport.student_message.split('\n').filter(line => !isDebugMarker(line)).map((line, idx) => {
                          // Subject headers get special styling
                          if (line.startsWith('■')) {
                            return (
                              <div key={idx} className="font-semibold text-primary border-l-2 border-primary pl-2 mt-4 first:mt-0">
                                {line}
                              </div>
                            );
                          }
                          // Header line
                          if (line.startsWith('[더멘토]')) {
                            return (
                              <div key={idx} className="font-bold text-base mb-2">
                                {line}
                              </div>
                            );
                          }
                          // Empty lines
                          if (line.trim() === '') {
                            return <div key={idx} className="h-1" />;
                          }
                          // Regular lines
                          return <div key={idx}>{line}</div>;
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">메시지가 없습니다. 리포트를 다시 생성해주세요.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="parent" className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>연락처: {previewReport?.parent_phone || '번호 없음'}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    let msg = previewReport?.parent_message || '';
                    // Include principal comment in copied message
                    if (principalCommentEnabled && principalComment.trim()) {
                      const parts = msg.split('\n\n');
                      if (parts.length >= 2) {
                        parts.splice(2, 0, `💬 원장 코멘트: ${principalComment.trim()}`);
                        msg = parts.join('\n\n');
                      } else {
                        msg = msg + `\n\n💬 원장 코멘트: ${principalComment.trim()}`;
                      }
                    }
                    copyToClipboard(msg);
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  복사
                </Button>
              </div>
              <ScrollArea className="h-[350px]">
                <div className="bg-muted/50 rounded-md p-4">
                  {previewReport?.parent_message ? (
                    <div className="text-sm space-y-2">
                      {(() => {
                        // Prepare message with principal comment for preview
                        let msgToRender = previewReport.parent_message;
                        if (principalCommentEnabled && principalComment.trim()) {
                          const parts = msgToRender.split('\n\n');
                          if (parts.length >= 2) {
                            parts.splice(2, 0, `💬 원장 코멘트: ${principalComment.trim()}`);
                            msgToRender = parts.join('\n\n');
                          } else {
                            msgToRender = msgToRender + `\n\n💬 원장 코멘트: ${principalComment.trim()}`;
                          }
                        }
                        const lines = msgToRender.split('\n');
                        const debugLines = lines.filter(line => isDebugMarker(line));
                        const contentLines = lines.filter(line => !isDebugMarker(line));
                        
                        return (
                          <>
                            {/* REPORT_COPY_CLEAN_V1: Debug markers section (non-selectable) */}
                            {debugLines.length > 0 && (
                              <div 
                                className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2 mb-3 select-none"
                                style={{ userSelect: 'none' }}
                              >
                                <div className="text-xs text-amber-600 font-medium mb-1">🔧 Debug Info (복사 제외)</div>
                                {debugLines.map((line, idx) => (
                                  <div key={`debug-${idx}`} className="text-xs font-mono text-muted-foreground">
                                    {line}
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* REPORT_COPY_CLEAN_V1: Copyable content section */}
                            <div id="parent-report-copy-content">
                              {contentLines.map((line, idx) => {
                                // Principal comment styling
                                if (line.startsWith('💬 원장 코멘트:')) {
                                  return (
                                    <div key={idx} className="bg-blue-500/10 border border-blue-500/30 rounded-md p-3 my-2">
                                      <span className="font-medium text-blue-600 dark:text-blue-400">{line}</span>
                                    </div>
                                  );
                                }
                                // Comparison sentence styling (emoji prefixed lines after header)
                                if (line.startsWith('📈') || line.startsWith('📊') || line.startsWith('📋')) {
                                  return (
                                    <div key={idx} className="bg-secondary/50 rounded-md p-2 my-2 text-sm">
                                      {line}
                                    </div>
                                  );
                                }
                                // Subject headers get special styling
                                if (line.startsWith('■')) {
                                  return (
                                    <div key={idx} className="font-semibold text-primary border-l-2 border-primary pl-2 mt-4 first:mt-0 bg-primary/5 py-1 rounded-r">
                                      {line}
                                    </div>
                                  );
                                }
                                // Header line
                                if (line.startsWith('[더멘토]')) {
                                  return (
                                    <div key={idx} className="font-bold text-base mb-3 pb-2 border-b border-border">
                                      {line}
                                    </div>
                                  );
                                }
                                // Bullet points
                                if (line.startsWith('- ')) {
                                  return (
                                    <div key={idx} className="pl-4 text-muted-foreground">
                                      {line}
                                    </div>
                                  );
                                }
                                // Empty lines
                                if (line.trim() === '') {
                                  return <div key={idx} className="h-1" />;
                                }
                                // Regular lines (closing message)
                                return <div key={idx} className="mt-2">{line}</div>;
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">메시지가 없습니다. 리포트를 다시 생성해주세요.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="flex-row gap-2">
            {previewReport && (
              <Button
                variant="secondary"
                onClick={() => generateShareLink(previewReport.id)}
                disabled={shareLinkState.loading && shareLinkState.reportId === previewReport.id}
              >
                {shareLinkState.loading && shareLinkState.reportId === previewReport.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                공유 링크 복사
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
