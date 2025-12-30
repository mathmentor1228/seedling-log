import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
}

interface SendTarget {
  reportId: string;
  sendStudent: boolean;
  sendParent: boolean;
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

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    try {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select(`
          *,
          students:student_id (name, parent_phone, student_phone)
        `)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      const formattedReports: WeeklyReport[] = (data || []).map((r: any) => ({
        ...r,
        student_name: r.students?.name,
        parent_phone: r.students?.parent_phone,
        student_phone: r.students?.student_phone,
      }));

      setReports(formattedReports);
      
      // Initialize send targets
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

  const filteredReports = reports.filter((report) =>
    report.student_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      </div>

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

      <Card>
        <CardHeader className="pb-4">
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>리포트 생성: 매주 금요일 22:00 KST</span>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">학생 전송</TableHead>
                    <TableHead className="w-[90px]">학부모 전송</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>기간</TableHead>
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
                        className={cn(hasNoLessons && 'bg-amber-500/5')}
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
              <ScrollArea className="h-[350px]">
                <div className="bg-muted/50 rounded-md p-4">
                  {previewReport?.student_message ? (
                    <div className="text-sm space-y-3">
                      {previewReport.student_message.split('\n').map((line, idx) => {
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
                  onClick={() => previewReport?.parent_message && copyToClipboard(previewReport.parent_message)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  복사
                </Button>
              </div>
              <ScrollArea className="h-[350px]">
                <div className="bg-muted/50 rounded-md p-4">
                  {previewReport?.parent_message ? (
                    <div className="text-sm space-y-2">
                      {previewReport.parent_message.split('\n').map((line, idx) => {
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
                  ) : (
                    <p className="text-muted-foreground">메시지가 없습니다. 리포트를 다시 생성해주세요.</p>
                  )}
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
    </div>
  );
}
