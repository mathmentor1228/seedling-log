import { useCallback, useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { BellRing, CheckCircle2, Clock3, Loader2, MessageSquareText, Phone, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  ATTENDANCE_NOTIFICATION_LABEL,
  type AttendanceNotificationType,
  buildAttendanceNotificationMessage,
  defaultAttendanceNotificationType,
  formatMakeupText,
} from '@/lib/attendanceNotification';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AttendanceNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: string; name: string; status: string };
  subject: string;
  startTime: string;
  onSent: (type: AttendanceNotificationType) => void;
  /** 결석 처리 직후 열 때: 사유와 보강 일정을 함께 보낸다 */
  absence?: { reason: string; makeupDate: string | null; makeupTime: string | null };
}

interface Preview {
  student_id: string;
  student_name: string;
  phone_masked: string;
  teacher_name: string;
  message: string;
  duplicate: boolean;
  previous_sent_at: string | null;
  missing: string[];
}

interface FunctionPayload {
  preview?: Preview;
  error?: string;
  detail?: string;
  missing?: string[];
  notification_id?: string;
}

export function AttendanceNotificationDialog({
  open,
  onOpenChange,
  student,
  subject,
  startTime,
  onSent,
  absence,
}: AttendanceNotificationDialogProps) {
  const [type, setType] = useState<AttendanceNotificationType>(() => absence ? 'absent' : defaultAttendanceNotificationType(student.status));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const fallbackMessage = buildAttendanceNotificationMessage({
    type,
    studentName: student.name,
    subject,
    startTime,
    teacherName: '담당 선생님',
    absenceReason: absence?.reason,
    makeupText: absence ? formatMakeupText(absence.makeupDate, absence.makeupTime) : undefined,
  });

  const invoke = useCallback(async (dryRun: boolean, allowResend = false): Promise<FunctionPayload> => {
    const { data, error: invokeError } = await supabase.functions.invoke('send-attendance-notification', {
      body: {
        student_id: student.id,
        notification_type: type,
        subject,
        start_time: startTime,
        dry_run: dryRun,
        allow_resend: allowResend,
        ...(absence && type === 'absent' ? { absence_reason: absence.reason, makeup_date: absence.makeupDate, makeup_time: absence.makeupTime } : {}),
      },
    });

    if (invokeError) {
      let payload: FunctionPayload = {};
      if (invokeError instanceof FunctionsHttpError) {
        payload = await invokeError.context.json().catch(() => ({}));
      }
      const message = payload.error === 'already_sent'
        ? '오늘 같은 알림을 이미 보냈습니다.'
        : payload.error === 'forbidden'
          ? '담당 학생에게만 알림을 발송할 수 있습니다.'
          : payload.detail || payload.error || invokeError.message;
      throw new Error(message);
    }
    return (data || {}) as FunctionPayload;
  }, [student.id, type, subject, startTime, absence]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSentMessage(null);
    setPreview(null);

    invoke(true)
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.detail || data.error);
        if (data.preview) setPreview(data.preview);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '알림 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, invoke]);

  const handleSend = async (allowResend = false) => {
    setSending(true);
    setError(null);
    try {
      const data = await invoke(false, allowResend);
      if (data.error === 'not_configured') {
        setError('출결 알림톡 템플릿이 아직 연결되지 않았습니다. 원장님께 연결을 요청해 주세요.');
        return;
      }
      if (data.error) throw new Error(data.detail || data.error);
      setSentMessage('학부모님께 카카오 알림톡 발송을 접수했습니다.');
      onSent(type);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알림톡을 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const missingTemplate = !!preview?.missing.length;
  const busy = loading || sending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            학부모 출결 알림 — {student.name}
          </DialogTitle>
          <DialogDescription>
            {subject} {startTime} 수업 · 학부모님께 보낼 카카오 알림톡 내용을 확인해 주세요.
          </DialogDescription>
        </DialogHeader>

        {sentMessage ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-5 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-9 w-9 text-success" />
            <p className="text-sm font-semibold text-foreground">{sentMessage}</p>
            <p className="text-xs text-muted-foreground">발송 접수이며, 학부모님의 실제 수신·읽음 여부와는 다릅니다.</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!absence && <div className="grid grid-cols-2 gap-2" role="group" aria-label="알림 종류">
              {(['late', 'not_arrived'] as AttendanceNotificationType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busy}
                  onClick={() => setType(option)}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-left transition-colors',
                    type === option
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
                  )}
                  aria-pressed={type === option}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {option === 'late' ? <Clock3 className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                    {ATTENDANCE_NOTIFICATION_LABEL[option]} 알림
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed">
                    {option === 'late' ? '늦게 등원해 수업에 참여함' : '수업 시작까지 아직 등원하지 않음'}
                  </span>
                </button>
              ))}
            </div>}

            <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> 받는 사람</span>
                <span className="font-medium text-foreground">
                  {loading ? '확인 중…' : preview ? `학부모님 ${preview.phone_masked}` : '학부모님'}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
                {preview?.message || fallbackMessage}
              </pre>
            </div>

            {loading && (
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 연락처와 오늘 발송 기록을 확인하고 있습니다.
              </p>
            )}

            {missingTemplate && (
              <Alert variant="default" className="border-warning/40 bg-warning/10">
                <AlertTitle>아직 실제 발송은 할 수 없습니다</AlertTitle>
                <AlertDescription>
                  {type === 'absent' ? '결석 안내' : '출결 알림'}용 템플릿이 아직 카카오 검수 중이거나 연결되지 않았습니다. 문구 미리보기는 가능하며, 승인되면 바로 발송할 수 있습니다.
                </AlertDescription>
              </Alert>
            )}

            {preview?.duplicate && (
              <Alert variant="default" className="border-warning/40 bg-warning/10">
                <AlertTitle>오늘 같은 알림을 이미 발송했습니다</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>같은 알림이 반복되지 않도록 한 번 더 확인해 주세요. 필요한 경우에만 재발송할 수 있습니다.</p>
                  <Button type="button" size="sm" variant="outline" disabled={busy || missingTemplate} onClick={() => handleSend(true)}>
                    그래도 재발송
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTitle>알림을 발송할 수 없습니다</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {!sentMessage && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>취소</Button>
            <Button
              onClick={() => handleSend(false)}
              disabled={busy || !preview || missingTemplate || preview.duplicate}
              className="gap-1.5"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? '발송 확인 중…' : '알림톡 발송'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
