import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

// TEACHER-HW-ALERT-V2: Modal to show homework check note and allow acknowledgement

interface HomeworkAlertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  subject: string;
  lessonId: string;
  noteText: string;
  teacherId: string;
  studentId: string;
  onAcknowledged?: () => void;
}

export function HomeworkAlertModal({
  open,
  onOpenChange,
  studentName,
  subject,
  lessonId,
  noteText,
  teacherId,
  studentId,
  onAcknowledged,
}: HomeworkAlertModalProps) {
  const { toast } = useToast();
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  async function handleAcknowledge() {
    setIsAcknowledging(true);
    try {
      const { error } = await supabase
        .from('homework_alert_ack')
        .insert({
          teacher_id: teacherId,
          student_id: studentId,
          subject: subject,
          source_lesson_id: lessonId,
        });

      if (error) {
        // Check for unique constraint violation (already acknowledged)
        if (error.code === '23505') {
          toast({
            title: '이미 확인됨',
            description: '이 알림은 이미 확인 완료 처리되었습니다.',
          });
          onOpenChange(false);
          onAcknowledged?.();
          return;
        }
        throw error;
      }

      toast({
        title: '확인 완료',
        description: '알림을 확인 완료 처리했습니다.',
      });
      onOpenChange(false);
      onAcknowledged?.();
    } catch (error: any) {
      console.error('Error acknowledging alert:', error);
      toast({
        title: '오류',
        description: error.message || '확인 완료 처리에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsAcknowledging(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            별도 확인 요청
          </DialogTitle>
        </DialogHeader>

        {/* TEACHER-HW-ALERT-V2 marker */}
        <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
          TEACHER-HW-ALERT-V2
        </div>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{studentName}</span>
            <span className="mx-1">/</span>
            <span>{subject}</span>
          </div>

          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm whitespace-pre-wrap">{noteText}</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
            <Button onClick={handleAcknowledge} disabled={isAcknowledging}>
              {isAcknowledging ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              확인 완료
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
