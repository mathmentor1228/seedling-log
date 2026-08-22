// REPORT-DELIVERY-CONFIRM-V1
// 발송 '확인 기록' 전용 UI. 이 컴포넌트는 어떤 메시지도 실제로 전송하지 않는다.
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, History, Loader2, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  CHANNEL_LABEL, EVENT_STATUS_LABEL, buildIdempotencyKey, containsPersonalData,
  getConfirmEligibility, summarizeEvents,
  type DeliveryChannel, type DeliveryEvent, type DeliveryEventStatus, type EligibilityInput,
} from '@/lib/reportDelivery';

interface Props {
  reportId: string;
  report: EligibilityInput;
  events: DeliveryEvent[];
  actorNames: Record<string, string>;
  currentUserId?: string;
  onSaved: () => void;
}

export function DeliveryConfirmRow({ reportId, report, events, actorNames, currentUserId, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeliveryEventStatus>('confirmed');
  const [channel, setChannel] = useState<DeliveryChannel>('kakao');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const summary = summarizeEvents(events);
  const eligibility = getConfirmEligibility(report);
  const actorLabel = (id: string) => actorNames[id] || '담당자';

  function openDialog(next: DeliveryEventStatus) {
    setMode(next);
    setChannel((summary.last?.channel as DeliveryChannel) || 'kakao');
    setNote('');
    setOpen(true);
  }

  async function save() {
    if (saving || !currentUserId) return;
    if (note && containsPersonalData(note)) {
      toast({
        title: '메모를 저장할 수 없습니다',
        description: '전화번호·메시지 본문 등 개인정보는 기록하지 마세요.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const key = buildIdempotencyKey(reportId, mode, channel, currentUserId);
      const { error } = await supabase.from('report_delivery_events').insert({
        report_id: reportId,
        status: mode,
        channel,
        note: note.trim() || null,
        actor_id: currentUserId,
        idempotency_key: key,
      });
      if (error) {
        // 중복 클릭/재시도로 같은 키가 이미 저장된 경우는 성공으로 간주 (idempotent)
        if ((error as any).code === '23505') {
          toast({ title: '이미 기록되었습니다', description: '중복 기록은 저장되지 않습니다.' });
        } else {
          throw error;
        }
      } else {
        toast({ title: '기록 완료', description: '발송 확인 이력이 추가되었습니다. (실제 메시지는 전송되지 않습니다)' });
      }
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast({ title: '기록 실패', description: e?.message || '다시 시도해 주세요.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const stateChip =
    summary.state === 'confirmed'
      ? 'bg-primary/10 text-primary border-primary/30'
      : summary.state === 'failed'
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : 'text-muted-foreground';

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      <span className={`text-2xs px-1.5 py-0.5 rounded border font-medium ${stateChip}`}>
        발송 확인: {summary.label}
      </span>
      {summary.last && (
        <span className="text-2xs text-muted-foreground break-all">
          {CHANNEL_LABEL[summary.last.channel]} · {actorLabel(summary.last.actor_id)} ·{' '}
          {new Date(summary.last.created_at).toLocaleString('ko-KR')}
        </span>
      )}

      {summary.state === 'confirmed' ? (
        <Button variant="outline" size="sm" className="h-7 text-2xs" onClick={() => openDialog('revoked')}>
          확인 취소·정정
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-2xs"
          disabled={!eligibility.allowed || !currentUserId}
          title={eligibility.allowed ? undefined : eligibility.blockers.join(' / ')}
          onClick={() => openDialog('confirmed')}
        >
          <Send className="w-3 h-3 mr-1" /> 발송 확인 기록
        </Button>
      )}
      {summary.state !== 'failed' && eligibility.allowed && (
        <Button variant="ghost" size="sm" className="h-7 text-2xs" onClick={() => openDialog('failed')}>
          발송 실패 기록
        </Button>
      )}
      {summary.historyCount > 0 && (
        <Button variant="ghost" size="sm" className="h-7 text-2xs" onClick={() => setHistoryOpen(true)}>
          <History className="w-3 h-3 mr-1" /> 이력 {summary.historyCount}
        </Button>
      )}
      {!eligibility.allowed && summary.state === 'unconfirmed' && (
        <span className="text-2xs text-muted-foreground break-words">{eligibility.blockers.join(' / ')}</span>
      )}

      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === 'confirmed' ? '발송 확인 기록' : mode === 'failed' ? '발송 실패 기록' : '발송 확인 취소·정정'}
            </DialogTitle>
            <DialogDescription className="break-words">
              이 화면은 <strong>실제 메시지를 전송하지 않습니다</strong>. 외부(카카오톡·문자·전화)로 이미 전달한 사실만
              기록합니다. 기존 기록은 수정·삭제되지 않고 새 이력으로 추가됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {eligibility.cautions.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 rounded-md p-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="break-words">{eligibility.cautions.join(' / ')}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="break-words">
                학부모 공개 상태 확인됨 · 학생/학부모 메시지 작성됨
              </span>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">전달 채널</label>
              <Select value={channel} onValueChange={(v) => setChannel(v as DeliveryChannel)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHANNEL_LABEL) as DeliveryChannel[]).map((c) => (
                    <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">기록 시각</label>
              <p className="text-xs text-muted-foreground">{new Date().toLocaleString('ko-KR')} (저장 시각으로 기록됨)</p>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">메모 (선택)</label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="예: 학부모 요청으로 재전달"
              />
              <p className="text-2xs text-muted-foreground mt-1">
                전화번호·메시지 본문 등 개인정보는 입력하지 마세요. (최대 200자)
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>취소</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              기록 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>발송 확인 이력</DialogTitle>
            <DialogDescription>기록은 수정·삭제되지 않고 누적됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {[...events]
              .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
              .map((e) => (
                <div key={e.id} className="text-xs border rounded-md p-2 break-words">
                  <div className="font-medium">{EVENT_STATUS_LABEL[e.status]} · {CHANNEL_LABEL[e.channel]}</div>
                  <div className="text-muted-foreground">
                    {actorLabel(e.actor_id)} · {new Date(e.created_at).toLocaleString('ko-KR')}
                  </div>
                  {e.note && <div className="mt-1">{e.note}</div>}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
