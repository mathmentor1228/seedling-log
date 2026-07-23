// WEEKLY-SUMMARY-V1: Capture the weekly free-text comment that feeds the parent report.
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { safeUpsertLessonRecord } from '@/lib/lessonRecordUpsert';

import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { getMondayOfWeek } from '@/lib/weekUtils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  subject?: string;
  weekStart?: string; // YYYY-MM-DD (Mon)
  onSaved?: () => void;
}

export function WeeklySummaryDialog({ open, onOpenChange, studentId, studentName, subject = '수학', weekStart, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const week = weekStart || getMondayOfWeek(new Date());

  useEffect(() => {
    if (!open || !user) return;
    setText('');
    (async () => {
      setLoading(true);
      // WEEKLY-SUMMARY-V2: 소유 teacher_id에 관계없이 이번 주 코멘트를 불러와 표시
      const { data } = await supabase
        .from('lesson_records')
        .select('id, weekly_summary')
        .eq('student_id', studentId)
        .or(`weekly_summary_week.eq.${week},and(lesson_date.gte.${week},lesson_date.lte.${(() => { const d = new Date(week); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })()})`)
        .not('weekly_summary', 'is', null)
        .order('lesson_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.weekly_summary) setText(data.weekly_summary);
      setLoading(false);
    })();
  }, [open, user, studentId, week]);

  async function save() {
    if (!user) return;
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: '코멘트를 입력해주세요', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Find most recent lesson_records this week to attach summary to.
      const weekEnd = (() => {
        const d = new Date(week);
        d.setDate(d.getDate() + 6);
        return d.toISOString().slice(0, 10);
      })();
      const { data: latest } = await supabase
        .from('lesson_records')
        .select('id')
        .eq('teacher_id', user.id)
        .eq('student_id', studentId)
        .gte('lesson_date', week)
        .lte('lesson_date', weekEnd)
        .order('lesson_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest?.id) {
        const { error } = await supabase
          .from('lesson_records')
          .update({ weekly_summary: trimmed, weekly_summary_week: week })
          .eq('id', latest.id);
        if (error) throw error;
      } else {
        // No lesson this week yet — create a placeholder draft to hold the comment.
        const { error } = await safeUpsertLessonRecord({
          teacher_id: user.id,
          student_id: studentId,
          lesson_date: week,
          subject: subject as any,
          lesson_range: '',
          homework_status: 'none_assigned',
          submitted: false,
          weekly_summary: trimmed,
          weekly_summary_week: week,
        });
        if (error) throw error;

      }
      toast({ title: '주간 코멘트 저장 완료' });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            이번 주 핵심 코멘트
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{studentName}</Badge>
            <Badge variant="secondary" className="text-xs">주: {week}</Badge>
          </div>
          <Label className="text-xs text-muted-foreground">
            이번 주 학습/태도 핵심을 한 단락으로 작성하세요. 학부모 주간 리포트에 그대로 포함됩니다.
          </Label>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            placeholder="예) 이번 주는 함수 단원에 집중. 개념 이해는 빠르나 계산 실수가 잦아 검산 루틴을 잡아주는 중입니다."
            disabled={loading}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">취소</Button>
          <Button onClick={save} disabled={saving || loading} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
