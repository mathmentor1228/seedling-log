import { useState, useEffect } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

interface ExamPrepItem {
  id: string;
  subject: string;
  schedule_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  deadline_date: string;
  status: string;
  teacher_name: string;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

export function StudentExamPrepSchedule() {
  const { student } = useStudentAuth();
  const [schedules, setSchedules] = useState<ExamPrepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (student) fetchSchedules();
  }, [student]);

  async function fetchSchedules() {
    setLoading(true);
    const { data, error } = await studentApi.getExamPrepSchedules();
    if (!error && data) {
      setSchedules(data);
    }
    setLoading(false);
  }

  async function handleConfirm(scheduleId: string) {
    setConfirming(true);
    const { error } = await studentApi.confirmExamPrepSchedule(scheduleId);
    if (!error) {
      setSchedules(prev =>
        prev.map(s => s.id === scheduleId ? { ...s, status: 'confirmed' } : s)
      );
      setConfirmDialog(null);
    }
    setConfirming(false);
  }

  const pendingSchedules = schedules.filter(s => s.status === 'pending');
  const confirmedSchedules = schedules.filter(s => s.status !== 'pending');

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (schedules.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <CalendarCheck className="w-5 h-5 text-primary" /> 내신 특강 일정
      </h2>

      {pendingSchedules.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <Clock className="w-4 h-4" /> 확인이 필요한 일정
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingSchedules.map(sch => (
              <div key={sch.id} className="bg-white rounded-lg border border-amber-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{sch.subject}</Badge>
                    <span className="text-sm font-medium">{fmt(sch.schedule_date)}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {sch.start_time.slice(0, 5)}-{sch.end_time.slice(0, 5)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{sch.teacher_name}</span>
                </div>
                {sch.description && (
                  <p className="text-xs text-muted-foreground">{sch.description}</p>
                )}
                <div className="pt-1">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2.5 mb-2">
                    <p className="text-xs text-destructive font-medium flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      일정 확정 시 추후 변경 및 보강은 불가능합니다. 신중히 확인 후 동의해주세요.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => setConfirmDialog(sch.id)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> 일정 확인 및 동의
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  마지노선: {fmt(sch.deadline_date)}까지
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {confirmedSchedules.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" /> 확정된 일정
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {confirmedSchedules.map(sch => (
              <div key={sch.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{sch.subject}</Badge>
                  <span className="text-sm">{fmt(sch.schedule_date)}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {sch.start_time.slice(0, 5)}-{sch.end_time.slice(0, 5)}
                  </span>
                </div>
                <Badge variant={sch.status === 'confirmed' ? 'default' : 'secondary'} className="text-[10px]">
                  {sch.status === 'confirmed' ? '확인완료' : '시스템 확정'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일정 확인 및 동의</DialogTitle>
            <DialogDescription>
              아래 일정에 동의하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm text-destructive font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              일정 확정 시 추후 변경 및 보강은 불가능합니다. 신중히 확인 후 동의해주세요.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>취소</Button>
            <Button onClick={() => confirmDialog && handleConfirm(confirmDialog)} disabled={confirming}>
              {confirming ? '처리 중...' : '동의합니다'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
