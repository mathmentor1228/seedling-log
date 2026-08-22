// CONSULT-LOG-V1 — 상담 직후 1분 입력 다이얼로그 (기존 team_notes 에 추가만, 수정·삭제 없음)
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getTodayKST } from '@/lib/utils';
import {
  CONSULT_METHODS, CONSULT_SENSITIVE_NOTICE, CONSULT_SUMMARY_MAX, CONSULT_TARGETS,
  buildConsultInsert, detectSensitive, emptyConsultDraft, isConsultDraftDirty,
  validateConsultDraft, type ConsultDraft, type ConsultErrors,
} from '@/lib/consultLog';

function nowLocalKst(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 16);
}

export function ConsultLogDialog({
  open, onOpenChange, studentId, studentName, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  studentName: string;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = getTodayKST();
  const [draft, setDraft] = useState<ConsultDraft>(() => emptyConsultDraft(studentId, nowLocalKst()));
  const [errors, setErrors] = useState<ConsultErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (open) {
      setDraft(emptyConsultDraft(studentId, nowLocalKst()));
      setErrors({});
      setSaveError(null);
      busy.current = false;
      setSaving(false);
    }
  }, [open, studentId]);

  const sensitive = useMemo(() => detectSensitive(draft.summary), [draft.summary]);
  const set = <K extends keyof ConsultDraft>(k: K, v: ConsultDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (saving) return;
    if (isConsultDraftDirty(draft) && !window.confirm('작성 중인 상담 내용이 저장되지 않았습니다. 닫을까요?')) return;
    onOpenChange(false);
  };

  async function handleSave() {
    if (busy.current) return; // 중복 클릭 방지
    const errs = validateConsultDraft(draft, today);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (!user?.id) throw new Error('로그인 정보를 확인할 수 없습니다.');
      const payload = buildConsultInsert(draft, user.id);
      const { error } = await supabase.from('team_notes').insert(payload as any);
      if (error) throw error;
      toast({ title: '상담 기록을 저장했습니다.', description: '카르테 상담 영역에서 바로 확인할 수 있습니다.' });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || '저장에 실패했습니다.';
      setSaveError(
        /row-level security|permission/i.test(msg)
          ? '권한이 없어 저장하지 못했습니다. 담당 학생인지 확인해 주세요.'
          : `저장에 실패했습니다. 다시 시도해 주세요. (${msg})`
      );
      busy.current = false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">상담 기록 추가</DialogTitle>
          <DialogDescription className="text-xs">
            상담 직후 요지만 남기는 화면입니다. 저장 후에는 이 화면에서 수정·삭제하지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
            <p className="text-[11px] text-muted-foreground">학생</p>
            <p className="text-sm font-semibold break-words">{studentName}</p>
            {errors.studentId && <p className="text-[11px] text-destructive mt-0.5">{errors.studentId}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="consult-at" className="text-xs">상담 일시 *</Label>
            <Input
              id="consult-at" type="datetime-local" className="h-9 text-sm"
              value={draft.consultedAt} onChange={(e) => set('consultedAt', e.target.value)}
            />
            {errors.consultedAt && <p className="text-[11px] text-destructive">{errors.consultedAt}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">대상 *</Label>
              <Select value={draft.target} onValueChange={(v) => set('target', v as any)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {CONSULT_TARGETS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.target && <p className="text-[11px] text-destructive">{errors.target}</p>}
            </div>
            <div className="space-y-1 min-w-0">
              <Label className="text-xs">방식 *</Label>
              <Select value={draft.method} onValueChange={(v) => set('method', v as any)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {CONSULT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.method && <p className="text-[11px] text-destructive">{errors.method}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="consult-summary" className="text-xs">핵심 내용 *</Label>
            <Textarea
              id="consult-summary" rows={4} className="text-sm"
              placeholder="예) 숙제 이행이 불규칙해 가정에서 확인 요청. 다음 주까지 진행 상황 재확인."
              value={draft.summary}
              onChange={(e) => set('summary', e.target.value.slice(0, CONSULT_SUMMARY_MAX))}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">{CONSULT_SENSITIVE_NOTICE}</p>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {draft.summary.trim().length}/{CONSULT_SUMMARY_MAX}
              </span>
            </div>
            {sensitive.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                {sensitive.join(', ')}가 포함된 것 같습니다. 지우고 요지만 남겨주세요.
              </p>
            )}
            {errors.summary && <p className="text-[11px] text-destructive">{errors.summary}</p>}
          </div>

          <div className="rounded-lg border border-border/60 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="consult-follow" className="text-xs">후속조치 필요</Label>
              <Switch id="consult-follow" checked={draft.followUp} onCheckedChange={(v) => set('followUp', v)} />
            </div>
            {draft.followUp && (
              <div className="space-y-1">
                <Label htmlFor="consult-due" className="text-xs">예정일 *</Label>
                <Input
                  id="consult-due" type="date" className="h-9 text-sm"
                  value={draft.followUpDate} onChange={(e) => set('followUpDate', e.target.value)}
                />
                {errors.followUpDate && <p className="text-[11px] text-destructive">{errors.followUpDate}</p>}
                <p className="text-[11px] text-muted-foreground">
                  원장 화면 업무 목록에 표시됩니다. 자동 알림·문자는 전송되지 않습니다.
                </p>
              </div>
            )}
          </div>

          {saveError && <p className="text-xs text-destructive">{saveError}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => requestClose(false)} disabled={saving}>
              취소
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 저장 중</> : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
