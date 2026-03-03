import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight } from 'lucide-react';

interface ScheduleOverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  classId: string;
  className: string;
  subject: string;
  teacherId: string;
  originalDate: string; // yyyy-MM-dd
  originalStartTime: string;
  originalEndTime: string;
  onSuccess?: () => void;
}

export function ScheduleOverrideModal({
  open,
  onOpenChange,
  scheduleId,
  classId,
  className,
  subject,
  teacherId,
  originalDate,
  originalStartTime,
  originalEndTime,
  onSuccess,
}: ScheduleOverrideModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState(originalStartTime.slice(0, 5));
  const [newEndTime, setNewEndTime] = useState(originalEndTime.slice(0, 5));
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newDate) {
      toast({ title: '오류', description: '변경할 날짜를 입력해주세요', variant: 'destructive' });
      return;
    }

    if (!newStartTime || !newEndTime) {
      toast({ title: '오류', description: '변경할 시간을 입력해주세요', variant: 'destructive' });
      return;
    }

    if (newStartTime >= newEndTime) {
      toast({ title: '오류', description: '종료 시간은 시작 시간보다 늦어야 합니다', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase.from('schedule_overrides' as any) as any).upsert({
        schedule_id: scheduleId,
        class_id: classId,
        teacher_id: teacherId,
        original_date: originalDate,
        override_type: 'moved',
        new_date: newDate,
        new_start_time: newStartTime,
        new_end_time: newEndTime,
        reason: reason || null,
        created_by: teacherId,
      }, { onConflict: 'schedule_id,original_date' });

      if (error) throw error;

      toast({ title: '성공', description: '수업 일정이 변경되었습니다' });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error('Error creating schedule override:', err);
      toast({ title: '오류', description: err.message || '일정 변경에 실패했습니다', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase.from('schedule_overrides' as any) as any).upsert({
        schedule_id: scheduleId,
        class_id: classId,
        teacher_id: teacherId,
        original_date: originalDate,
        override_type: 'cancelled',
        new_date: null,
        new_start_time: null,
        new_end_time: null,
        reason: reason || '수업 취소',
        created_by: teacherId,
      }, { onConflict: 'schedule_id,original_date' });

      if (error) throw error;

      toast({ title: '성공', description: '수업이 취소 처리되었습니다' });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error('Error creating schedule override:', err);
      toast({ title: '오류', description: err.message || '일정 변경에 실패했습니다', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>수업 일정 변경</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
          <div className="font-medium">{className} ({subject})</div>
          <div className="text-muted-foreground">
            기존: {originalDate} {originalStartTime.slice(0, 5)}–{originalEndTime.slice(0, 5)}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
            변경할 일정
          </div>

          <div className="space-y-2">
            <Label>새 날짜 *</Label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>시작 시간 *</Label>
              <Input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>종료 시간 *</Label>
              <Input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>사유 (선택)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="변경 사유를 입력해주세요"
              rows={2}
            />
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleCancel}
              disabled={saving}
            >
              수업 취소만
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                닫기
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                일정 변경
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
