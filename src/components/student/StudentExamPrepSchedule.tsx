import { useState, useEffect } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

interface TimeSlotInfo { start_time: string; end_time: string; }
interface SessionInfo {
  session_label: string; schedule_date: string;
  start_time: string; end_time: string;
  time_slots?: TimeSlotInfo[];
}
interface ExamPrepCourseItem {
  course_id: string; subject: string; title: string;
  description: string | null; deadline_date: string;
  status: string; teacher_name: string;
  sessions: SessionInfo[];
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  pending: { label: '미확인', color: 'text-amber-700' },
  needs_reconfirm: { label: '재확인 필요', color: 'text-destructive' },
  confirmed: { label: '확인완료', color: 'text-primary' },
  auto_confirmed: { label: '시스템 확정', color: 'text-muted-foreground' },
};

export function StudentExamPrepSchedule() {
  const { student } = useStudentAuth();
  const [courses, setCourses] = useState<ExamPrepCourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { if (student) fetchSchedules(); }, [student]);

  async function fetchSchedules() {
    setLoading(true);
    const { data, error } = await studentApi.getExamPrepSchedules();
    if (!error && data) setCourses(data);
    setLoading(false);
  }

  async function handleConfirm(courseId: string) {
    setConfirming(true);
    const { error } = await studentApi.confirmExamPrepSchedule(courseId);
    if (!error) {
      setCourses(prev => prev.map(c => c.course_id === courseId ? { ...c, status: 'confirmed' } : c));
      setConfirmDialog(null);
    }
    setConfirming(false);
  }

  const pendingCourses = courses.filter(c => c.status === 'pending');
  const confirmedCourses = courses.filter(c => c.status !== 'pending');

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  if (courses.length === 0) return null;

  function renderSessionSlots(sess: SessionInfo) {
    const slots = sess.time_slots && sess.time_slots.length > 0 ? sess.time_slots : null;
    return (
      <div key={sess.session_label} className="flex items-start gap-2 text-xs">
        <Badge variant="secondary" className="text-[10px] min-w-[45px] justify-center mt-0.5">{sess.session_label}</Badge>
        <div>
          <span>{fmt(sess.schedule_date)}</span>
          {slots ? (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {slots.map((sl, i) => (
                <Badge key={i} variant="outline" className="text-[9px] font-mono">
                  {sl.start_time.slice(0, 5)}-{sl.end_time.slice(0, 5)}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground font-mono ml-2">
              {sess.start_time.slice(0, 5)}-{sess.end_time.slice(0, 5)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <CalendarCheck className="w-5 h-5 text-primary" /> 내신 특강 일정
      </h2>

      {pendingCourses.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <Clock className="w-4 h-4" /> 확인이 필요한 특강
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingCourses.map(course => (
              <div key={course.course_id} className="bg-white rounded-lg border border-amber-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{course.subject}</Badge>
                    <span className="text-sm font-medium">{course.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{course.teacher_name}</span>
                </div>
                <div className="space-y-1.5">{course.sessions.map(renderSessionSlots)}</div>
                {course.description && <p className="text-xs text-muted-foreground">{course.description}</p>}
                <div className="pt-1">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2.5 mb-2">
                    <p className="text-xs text-destructive font-medium flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      일정 확정 시 추후 변경 및 보강은 불가능합니다. 신중히 확인 후 동의해주세요.
                    </p>
                  </div>
                  <Button size="sm" className="w-full" onClick={() => setConfirmDialog(course.course_id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> 일정 확인 및 동의
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground text-right">마지노선: {fmt(course.deadline_date)}까지</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {confirmedCourses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" /> 확정된 특강
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {confirmedCourses.map(course => (
              <div key={course.course_id} className="bg-muted/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{course.subject}</Badge>
                    <span className="text-sm font-medium">{course.title}</span>
                  </div>
                  <Badge variant={course.status === 'confirmed' ? 'default' : 'secondary'} className="text-[10px]">
                    {course.status === 'confirmed' ? '확인완료' : '시스템 확정'}
                  </Badge>
                </div>
                <div className="space-y-1.5">{course.sessions.map(renderSessionSlots)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일정 확인 및 동의</DialogTitle>
            <DialogDescription>아래 특강 전체 일정에 동의하시겠습니까?</DialogDescription>
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
