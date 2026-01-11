// WEEKLY-SCHED-VERIFY-V1: Admin verification panel for weekly report schedule
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Clock, RefreshCw, Play, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface JobLogEntry {
  id: string;
  job_name: string;
  scheduler_source: string | null;
  schedule_text: string | null;
  run_at: string;
  week_start: string | null;
  week_end: string | null;
  status: string;
  message: string | null;
  created_at: string;
}

const SCHEDULE_CONFIG = {
  schedule_text: 'Sat 22:00 KST',
  cron_utc: '0 13 * * 6',
  description: '매주 토요일 22:00 (한국시간)',
};

export function WeeklyScheduleVerification() {
  const [logs, setLogs] = useState<JobLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const { toast } = useToast();

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('weekly_jobs_log')
        .select('*')
        .eq('job_name', 'generate_weekly_reports')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching weekly job logs:', error);
      toast({
        title: '로그 조회 실패',
        description: '주간 리포트 로그를 불러오지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleManualTrigger = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-weekly-reports', {
        body: { scheduled: false, manual: true },
      });

      if (error) throw error;

      toast({
        title: '수동 실행 완료',
        description: `주간 리포트 생성이 완료되었습니다. (${data?.weekStart} ~ ${data?.weekEnd})`,
      });

      // Refresh logs after trigger
      await fetchLogs();
    } catch (error: any) {
      console.error('Error triggering weekly reports:', error);
      toast({
        title: '수동 실행 실패',
        description: error.message || '주간 리포트 생성에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setTriggering(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500/15 text-green-600 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            완료
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-500/15 text-red-600 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" />
            실패
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            실행중
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertCircle className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            주간 리포트 자동 생성 상태
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            주간 리포트 자동 생성 상태
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleManualTrigger}
              disabled={triggering}
            >
              <Play className={`w-4 h-4 mr-1 ${triggering ? 'animate-pulse' : ''}`} />
              {triggering ? '실행중...' : '지금 수동 실행(테스트)'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Schedule Info */}
        <div className="p-4 bg-secondary/50 rounded-lg border">
          <h4 className="font-medium mb-2 text-sm text-muted-foreground">현재 스케줄 설정</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">실행 시간:</span>
              <span className="ml-2 font-medium">{SCHEDULE_CONFIG.description}</span>
            </div>
            <div>
              <span className="text-muted-foreground">UTC Cron:</span>
              <code className="ml-2 px-2 py-0.5 bg-muted rounded text-xs">
                {SCHEDULE_CONFIG.cron_utc}
              </code>
            </div>
            <div>
              <span className="text-muted-foreground">스케줄 소스:</span>
              <Badge variant="outline" className="ml-2">pg_cron</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">대상 범위:</span>
              <span className="ml-2">월요일 ~ 토요일</span>
            </div>
          </div>
        </div>

        {/* Recent Runs */}
        <div>
          <h4 className="font-medium mb-3 text-sm text-muted-foreground">최근 실행 기록 (최대 5건)</h4>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              아직 실행 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusBadge(log.status)}
                      <span className="text-sm text-muted-foreground">
                        {log.scheduler_source === 'manual' ? '수동 실행' : '자동 실행'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        실행: {formatDateTime(log.run_at || log.created_at)}
                      </span>
                      {log.week_start && log.week_end && (
                        <span>
                          범위: {log.week_start} ~ {log.week_end}
                        </span>
                      )}
                    </div>
                    {log.message && log.status === 'failed' && (
                      <p className="text-xs text-red-500 mt-1 truncate">
                        {log.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
