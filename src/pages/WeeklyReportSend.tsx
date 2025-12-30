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
  Clock
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, addHours } from 'date-fns';
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
  
  // Date range state - default to this week (Mon-Fri KST)
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000; // KST is UTC+9
  const kstNow = new Date(now.getTime() + kstOffset);
  const defaultWeekStart = startOfWeek(kstNow, { weekStartsOn: 1 }); // Monday
  const defaultWeekEnd = endOfWeek(kstNow, { weekStartsOn: 1 }); // Sunday, but we want Friday
  const fridayEnd = new Date(defaultWeekStart);
  fridayEnd.setDate(fridayEnd.getDate() + 4); // Friday
  
  const [weekStart, setWeekStart] = useState<Date>(defaultWeekStart);
  const [weekEnd, setWeekEnd] = useState<Date>(fridayEnd);
  const [reports, setReports] = useState<WeeklyReportRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [resendEnabled, setResendEnabled] = useState(false);
  
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
        title: 'Reports Generated',
        description: `Weekly reports for ${startStr} to ${endStr} have been generated.`,
      });

      // Fetch the generated reports
      await fetchReports();
    } catch (error: any) {
      console.error('Error generating reports:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate reports',
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

      // We need to join with students to get names and phones
      // And optionally with lesson_records to get class/teacher info
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
        title: 'Error',
        description: error.message || 'Failed to fetch reports',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReports() {
    if (!user) return;
    
    const toSend = filteredReports.filter((r) => {
      if (!selectedReports.has(r.id)) return false;
      if (r.sent_status === 'sent' && !resendEnabled) return false;
      return true;
    });

    if (toSend.length === 0) {
      toast({
        title: 'No Reports to Send',
        description: 'Please select reports to send.',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const report of toSend) {
        try {
          // Here you would integrate with SMS service (e.g., Twilio, Kakao)
          // For now, we'll simulate sending and update the status
          
          // Build message content
          const message = buildReportMessage(report);
          
          // TODO: Actually send SMS to report.parent_phone and report.student_phone
          // await sendSMS(report.parent_phone, message.parent);
          // await sendSMS(report.student_phone, message.student);
          
          console.log('Would send to parent:', report.parent_phone, message.parent);
          console.log('Would send to student:', report.student_phone, message.student);

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
          console.error(`Failed to send report ${report.id}:`, err);
          
          // Mark as failed
          await supabase
            .from('weekly_reports')
            .update({ sent_status: 'failed' })
            .eq('id', report.id);
          
          failCount++;
        }
      }

      toast({
        title: 'Sending Complete',
        description: `${successCount} reports sent successfully${failCount > 0 ? `, ${failCount} failed` : ''}.`,
        variant: failCount > 0 ? 'destructive' : 'default',
      });

      // Refresh the list
      await fetchReports();
    } catch (error: any) {
      console.error('Error sending reports:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send reports',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
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

  // Apply filters
  const filteredReports = reports.filter((r) => {
    if (filterRisk !== 'all' && r.risk_level !== filterRisk) return false;
    if (filterSentStatus !== 'all' && r.sent_status !== filterSentStatus) return false;
    // Note: class and teacher filters would need additional joins
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
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Weekly Report Send</h1>
        <p className="text-muted-foreground mt-1">
          Generate and send weekly summary reports to parents and students
        </p>
      </div>

      {/* Date Range & Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Week Start */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Week Start</label>
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
              <label className="text-sm font-medium">Week End</label>
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
              Generate Reports
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Risk Level</label>
              <Select value={filterRisk} onValueChange={setFilterRisk}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sent Status</label>
              <Select value={filterSentStatus} onValueChange={setFilterSentStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Class</label>
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Teacher</label>
              <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teachers</SelectItem>
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
            Reports Preview ({filteredReports.length})
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="resend"
                checked={resendEnabled}
                onCheckedChange={(checked) => setResendEnabled(!!checked)}
              />
              <label htmlFor="resend" className="text-sm cursor-pointer">
                Allow Resend
              </label>
            </div>
            <Button 
              onClick={handleSendReports} 
              disabled={sending || selectedReports.size === 0}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Reports ({selectedReports.size})
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
                No reports found. Click "Generate Reports" to create weekly summaries.
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
                    <TableHead>Student</TableHead>
                    <TableHead>Parent Phone</TableHead>
                    <TableHead>Student Phone</TableHead>
                    <TableHead>Lessons</TableHead>
                    <TableHead>Avg Score</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent At</TableHead>
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
                          <span className="text-sm capitalize">
                            {report.sent_status || 'draft'}
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

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> SMS sending requires integration with a messaging service (e.g., Kakao, Twilio). 
            Currently, clicking "Send Reports" will mark reports as sent and log the message content to console. 
            Contact your administrator to set up SMS integration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
