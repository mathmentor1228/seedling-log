import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
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
  Eye
} from 'lucide-react';
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
  student_name?: string;
  parent_phone?: string;
  student_phone?: string;
  class_name?: string;
  teacher_name?: string;
}

interface MessagePreview {
  studentName: string;
  parentPhone: string;
  studentPhone: string;
  parentMessage: string;
  studentMessage: string;
}

interface ClassOption {
  id: string;
  name: string;
}

interface TeacherOption {
  id: string;
  full_name: string;
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
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [resendEnabled, setResendEnabled] = useState(false);
  
  // Message preview state
  const [showPreview, setShowPreview] = useState(false);
  const [messagePreviews, setMessagePreviews] = useState<MessagePreview[]>([]);
  const [sentMessagesLog, setSentMessagesLog] = useState<MessagePreview[]>([]);
  const [showSentLog, setShowSentLog] = useState(false);
  
  // Filters
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterSentStatus, setFilterSentStatus] = useState<string>('all');

  useEffect(() => {
    fetchFiltersData();
  }, []);

  async function fetchFiltersData() {
    try {
      const [classesRes, teachersRes] = await Promise.all([
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name').order('full_name'),
      ]);

      if (classesRes.data) setClasses(classesRes.data);
      if (teachersRes.data) setTeachers(teachersRes.data);
    } catch (error) {
      console.error('Error fetching filters data:', error);
    }
  }

  async function handleGenerateReports() {
    setGenerating(true);
    try {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      // Call the database function
      const { error } = await supabase.rpc('generate_weekly_reports', {
        _week_start: startStr,
        _week_end: endStr,
      });

      if (error) throw error;

      toast({
        title: '리포트 생성 완료',
        description: `${startStr} ~ ${endStr} 기간의 주간 리포트가 생성되었습니다.`,
      });

      // Fetch the generated reports
      await fetchReports();
    } catch (error: any) {
      console.error('Error generating reports:', error);
      toast({
        title: '오류',
        description: error.message || '리포트 생성에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
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
      setSelectedReports(new Set());
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

  function buildReportMessage(report: WeeklyReportRow) {
    const riskLabel = report.risk_level === 'high' ? '⚠️ 주의 필요' : 
                      report.risk_level === 'medium' ? '📊 보통' : '✅ 양호';
    
    const issues = report.common_issues?.length > 0 
      ? report.common_issues.join(', ') 
      : '없음';

    const parentMessage = `[주간 학습 리포트]
학생: ${report.student_name}
기간: ${report.week_start} ~ ${report.week_end}
수업 횟수: ${report.total_lessons}회
평균 이해도: ${report.avg_understanding?.toFixed(1) || '-'}/5
학습 상태: ${riskLabel}
주요 이슈: ${issues}`;

    const studentMessage = `[이번 주 학습 리포트]
${report.student_name}님, 이번 주 수고했어요!
수업: ${report.total_lessons}회
이해도: ${report.avg_understanding?.toFixed(1) || '-'}/5
다음 주도 화이팅! 💪`;

    return { parent: parentMessage, student: studentMessage };
  }

  function handlePreviewMessages() {
    const toSend = filteredReports.filter((r) => {
      if (!selectedReports.has(r.id)) return false;
      if (r.sent_status === 'sent' && !resendEnabled) return false;
      return true;
    });

    if (toSend.length === 0) {
      toast({
        title: '선택된 리포트 없음',
        description: '전송할 리포트를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const previews: MessagePreview[] = toSend.map((report) => {
      const messages = buildReportMessage(report);
      return {
        studentName: report.student_name || '-',
        parentPhone: report.parent_phone || '-',
        studentPhone: report.student_phone || '-',
        parentMessage: messages.parent,
        studentMessage: messages.student,
      };
    });

    setMessagePreviews(previews);
    setShowPreview(true);
  }

  async function handleSendReports() {
    if (!user) return;
    
    setShowPreview(false);
    setSending(true);
    let successCount = 0;
    let failCount = 0;
    const sentMessages: MessagePreview[] = [];

    const toSend = filteredReports.filter((r) => {
      if (!selectedReports.has(r.id)) return false;
      if (r.sent_status === 'sent' && !resendEnabled) return false;
      return true;
    });

    try {
      for (const report of toSend) {
        try {
          const messages = buildReportMessage(report);
          
          // TEST MODE: Log messages instead of sending
          console.log('=== 테스트 모드 - 메시지 미리보기 ===');
          console.log('학생:', report.student_name);
          console.log('학부모 전화번호:', report.parent_phone);
          console.log('학부모 메시지:', messages.parent);
          console.log('학생 전화번호:', report.student_phone);
          console.log('학생 메시지:', messages.student);
          console.log('=====================================');

          // Save to log
          sentMessages.push({
            studentName: report.student_name || '-',
            parentPhone: report.parent_phone || '-',
            studentPhone: report.student_phone || '-',
            parentMessage: messages.parent,
            studentMessage: messages.student,
          });

          // Update the report status
          const { error: updateError } = await supabase
            .from('weekly_reports')
            .update({
              sent_status: 'sent',
              sent_at: new Date().toISOString(),
              sent_by: user.id,
            })
            .eq('id', report.id);

          if (updateError) throw updateError;
          successCount++;
        } catch (err) {
          console.error(`Failed to process report ${report.id}:`, err);
          
          // Mark as failed
          await supabase
            .from('weekly_reports')
            .update({ sent_status: 'failed' })
            .eq('id', report.id);
          
          failCount++;
        }
      }

      // Update sent messages log
      setSentMessagesLog(sentMessages);
      setShowSentLog(true);

      toast({
        title: '전송 완료 (테스트 모드)',
        description: `${successCount}건 처리 완료${failCount > 0 ? `, ${failCount}건 실패` : ''}. 실제 발송은 되지 않았습니다.`,
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

  // Apply filters
  const filteredReports = reports.filter((r) => {
    if (filterRisk !== 'all' && r.risk_level !== filterRisk) return false;
    if (filterSentStatus !== 'all' && r.sent_status !== filterSentStatus) return false;
    return true;
  });

  const toggleSelectAll = () => {
    if (selectedReports.size === filteredReports.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(filteredReports.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedReports);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedReports(newSet);
  };

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

  const getSentStatusLabel = (status: string | null) => {
    switch (status) {
      case 'sent':
        return '발송됨';
      case 'failed':
        return '실패';
      default:
        return '대기중';
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

            {/* Generate Button */}
            <Button onClick={handleGenerateReports} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              리포트 생성
            </Button>
          </div>
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
          </div>
        </CardContent>
      </Card>

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
            {sentMessagesLog.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowSentLog(true)}>
                <Eye className="mr-2 h-4 w-4" />
                전송 로그 보기
              </Button>
            )}
            <Button 
              onClick={handlePreviewMessages} 
              disabled={sending || selectedReports.size === 0}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              알림톡 전송 ({selectedReports.size}건)
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
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedReports.size === filteredReports.length && filteredReports.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>학부모 연락처</TableHead>
                    <TableHead>학생 연락처</TableHead>
                    <TableHead>수업 수</TableHead>
                    <TableHead>평균 점수</TableHead>
                    <TableHead>주요 이슈</TableHead>
                    <TableHead>위험도</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>발송 시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow 
                      key={report.id}
                      className={cn(
                        report.sent_status === 'sent' && !resendEnabled && 'opacity-50'
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedReports.has(report.id)}
                          onCheckedChange={() => toggleSelect(report.id)}
                          disabled={report.sent_status === 'sent' && !resendEnabled}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {report.student_name || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {report.parent_phone || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {report.student_phone || '-'}
                      </TableCell>
                      <TableCell>{report.total_lessons}</TableCell>
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
                          {getSentStatusIcon(report.sent_status)}
                          <span className="text-sm">
                            {getSentStatusLabel(report.sent_status)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {report.sent_at 
                          ? format(new Date(report.sent_at), 'MM/dd HH:mm')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
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
            <DialogTitle>메시지 미리보기</DialogTitle>
            <DialogDescription>
              전송될 메시지를 확인하세요. 확인 후 "전송하기"를 클릭하면 상태가 업데이트됩니다.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {messagePreviews.map((preview, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{preview.studentName}</h4>
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">학부모:</span>
                      <span>{preview.parentPhone || '번호 없음'}</span>
                    </div>
                    <div className="bg-muted/50 rounded-md p-3">
                      <pre className="text-sm whitespace-pre-wrap font-sans">{preview.parentMessage}</pre>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">학생:</span>
                      <span>{preview.studentPhone || '번호 없음'}</span>
                    </div>
                    <div className="bg-muted/50 rounded-md p-3">
                      <pre className="text-sm whitespace-pre-wrap font-sans">{preview.studentMessage}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              취소
            </Button>
            <Button onClick={handleSendReports} disabled={sending}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              전송하기 (테스트 모드)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sent Messages Log Dialog */}
      <Dialog open={showSentLog} onOpenChange={setShowSentLog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>전송 로그</DialogTitle>
            <DialogDescription>
              최근 전송 처리된 메시지 목록입니다. (테스트 모드 - 실제 발송 안됨)
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {sentMessagesLog.map((log, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{log.studentName}</h4>
                    <div className="flex items-center gap-1 text-green-500 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>처리됨</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">학부모:</span>
                      <span>{log.parentPhone || '번호 없음'}</span>
                    </div>
                    <div className="bg-muted/50 rounded-md p-3">
                      <pre className="text-sm whitespace-pre-wrap font-sans">{log.parentMessage}</pre>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-muted-foreground">학생:</span>
                      <span>{log.studentPhone || '번호 없음'}</span>
                    </div>
                    <div className="bg-muted/50 rounded-md p-3">
                      <pre className="text-sm whitespace-pre-wrap font-sans">{log.studentMessage}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSentLog(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
