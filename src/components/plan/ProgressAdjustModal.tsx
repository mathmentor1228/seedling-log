// PLAN-POS-ADJUST-V1: 진도 위치 조정 — 잘못 기록된 진도를 SQL 없이 바로 리셋/이동
// "여기까지 나갔다"를 고르면: 그 목표까지 전원 나감 처리, 그 뒤 기록은 삭제.
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MapPin, Undo2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchGoals, fetchDesignProgressRows, setDesignPosition,
  PlanGoal, ProgressDetailRow,
} from './planApi';

const db = supabase as any;
const ADVANCED = ['advanced', 'partial', 'verified_ok', 'verified_weak', 'skipped'];

export function ProgressAdjustModal({ open, onOpenChange, designId, trackId, endGoalId, title, onChanged }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  designId: string;
  trackId: string;
  endGoalId: string | null;
  title?: string;
  onChanged?: () => void;
}) {
  const [goals, setGoals] = useState<PlanGoal[]>([]);
  const [rows, setRows] = useState<ProgressDetailRow[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // 선택: -1 = 처음부터(기록 전체 삭제), i = trackGoals[i]까지 나감
  const [selected, setSelected] = useState<number | null>(null);
  // 배지 클릭 → 그 목표의 학생별 상태 펼치기
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  const studentIds = useMemo(() => students.map(s => s.id), [students]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setExpandedGoalId(null);
    (async () => {
      setLoading(true);
      try {
        const [gs, prs, psRes] = await Promise.all([
          fetchGoals(trackId),
          fetchDesignProgressRows(designId),
          db.from('plan_students').select('student_id').eq('design_id', designId),
        ]);
        setGoals(gs);
        setRows(prs);
        const ids = ((psRes.data || []) as any[]).map((r: any) => r.student_id);
        const { data: studs } = ids.length > 0
          ? await supabase.from('students').select('id, name').in('id', ids)
          : { data: [] as any[] };
        setStudents(((studs || []) as any[])
          .map((s: any) => ({ id: s.id, name: s.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')));
      } catch (e: any) {
        toast.error(`불러오기 실패: ${e.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, designId, trackId]);

  const endIdx = useMemo(() => {
    const i = goals.findIndex(g => g.id === endGoalId);
    return i >= 0 ? i : goals.length - 1;
  }, [goals, endGoalId]);
  const trackGoals = useMemo(() => goals.slice(0, endIdx + 1), [goals, endIdx]);

  // 현재 그룹 위치 = 나감/일부 기록이 있는 가장 뒤 목표 (수업 화면과 동일 계산)
  const currentIdx = useMemo(() => {
    const adv = new Set(rows.filter(r => ADVANCED.includes(r.status)).map(r => r.goal_id));
    let idx = -1;
    trackGoals.forEach((g, i) => { if (adv.has(g.id)) idx = i; });
    return idx;
  }, [rows, trackGoals]);

  function summaryFor(goalId: string): { done: number; partial: number; partialUpto: string | null } {
    const mine = rows.filter(r => r.goal_id === goalId);
    const done = mine.filter(r => ['advanced', 'verified_ok', 'verified_weak'].includes(r.status)).length;
    const partials = mine.filter(r => r.status === 'partial');
    return { done, partial: partials.length, partialUpto: partials[0]?.partial_upto || null };
  }

  // 목표별 학생 상태 상세 — 배지 클릭 시 누가 나갔는지/못 나갔는지
  function detailFor(goalId: string): { done: string[]; partial: string[]; defer: string[]; none: string[] } {
    const out = { done: [] as string[], partial: [] as string[], defer: [] as string[], none: [] as string[] };
    for (const s of students) {
      const r = rows.find(x => x.goal_id === goalId && x.student_id === s.id);
      if (!r) out.none.push(s.name);
      else if (['advanced', 'verified_ok', 'verified_weak'].includes(r.status)) out.done.push(s.name);
      else if (r.status === 'partial') out.partial.push(`${s.name}${r.partial_upto ? ` (~${r.partial_upto})` : ''}`);
      else if (r.status === 'skipped') out.defer.push(`${s.name} (건너뜀)`);
      else if (r.status === 'deferred') out.defer.push(s.name);
      else out.none.push(s.name); // skipped_absent 등 — 안 나간 것으로 표시
    }
    return out;
  }

  async function apply() {
    if (selected == null) return;
    setSaving(true);
    try {
      const doneGoalIds = selected >= 0 ? trackGoals.slice(0, selected + 1).map(g => g.id) : [];
      // 삭제는 끝점 뒤 목표까지 포함해 전체 트랙에서 — 벗어난 잔여 기록도 청소
      const clearGoalIds = goals.slice(selected + 1).map(g => g.id);
      await setDesignPosition(designId, studentIds, doneGoalIds, clearGoalIds);
      toast.success(selected < 0
        ? '진도 기록을 초기화했어요 — 첫 목표부터 다시 시작합니다'
        : `"${trackGoals[selected].order_index}. ${trackGoals[selected].title}"까지 나간 것으로 맞췄어요`);
      onChanged?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`저장 실패: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4" />진도 위치 조정{title ? ` — ${title}` : ''}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          기록이 실제와 다를 때 여기서 바로잡으세요. 반 전체 기준으로 "여기까지 나갔다"를 고르면
          그 뒤의 진도 기록은 삭제됩니다. (쪽지시험 점수는 유지)
        </p>

        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border divide-y">
            {/* 처음부터 */}
            <button
              className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition
                ${selected === -1 ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
              onClick={() => setSelected(-1)}>
              <Undo2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-bold">처음부터 (아직 시작 전)</span>
              <span className="text-[11px] text-muted-foreground">— 진도 기록 전체 삭제</span>
              {currentIdx < 0 && <Badge variant="secondary" className="ml-auto text-[10px]">현재</Badge>}
              {selected === -1 && <Check className="w-4 h-4 text-primary ml-auto shrink-0" />}
            </button>
            {trackGoals.map((g, i) => {
              const s = summaryFor(g.id);
              const isCurrent = i === currentIdx;
              const isSelected = selected === i;
              const hasRecord = s.done > 0 || s.partial > 0;
              const isExpanded = expandedGoalId === g.id;
              const toggleDetail = (e: React.MouseEvent) => {
                e.stopPropagation();
                setExpandedGoalId(prev => (prev === g.id ? null : g.id));
              };
              const detail = isExpanded ? detailFor(g.id) : null;
              return (
                <div key={g.id}>
                  <button
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition
                      ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
                    onClick={() => setSelected(i)}>
                    <span className="min-w-0 flex-1 truncate">
                      <b>{g.order_index}.</b> {g.title}
                      {g.pages && <span className="ml-1 text-[11px] text-muted-foreground">{g.pages}</span>}
                    </span>
                    {s.done > 0 && (
                      <Badge variant="outline"
                        className="text-[10px] border-green-400 text-green-700 bg-green-50 shrink-0 cursor-pointer hover:bg-green-100"
                        title="누가 나갔는지 보기" onClick={toggleDetail}>
                        나감 {s.done} {isExpanded ? '▴' : '▾'}
                      </Badge>
                    )}
                    {s.partial > 0 && (
                      <Badge variant="outline"
                        className="text-[10px] border-amber-400 text-amber-700 bg-amber-50 shrink-0 cursor-pointer hover:bg-amber-100"
                        title="누가 어디까지 나갔는지 보기" onClick={toggleDetail}>
                        일부 {s.partial}{s.partialUpto ? ` (~${s.partialUpto})` : ''} {isExpanded ? '▴' : '▾'}
                      </Badge>
                    )}
                    {isCurrent && <Badge variant="secondary" className="text-[10px] shrink-0">현재</Badge>}
                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                  {hasRecord && isExpanded && detail && (
                    <div className="px-3 pb-2 pt-0.5 bg-muted/20 text-[11px] space-y-0.5">
                      {detail.done.length > 0 && (
                        <p><span className="font-bold text-green-700">✓ 나감:</span> {detail.done.join(', ')}</p>
                      )}
                      {detail.partial.length > 0 && (
                        <p><span className="font-bold text-amber-700">◐ 일부:</span> {detail.partial.join(', ')}</p>
                      )}
                      {detail.defer.length > 0 && (
                        <p><span className="font-bold text-muted-foreground">→ 미룸:</span> {detail.defer.join(', ')}</p>
                      )}
                      {detail.none.length > 0 && (
                        <p><span className="font-bold text-muted-foreground">· 안 나감:</span> {detail.none.join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selected != null && (
          <p className="text-xs rounded-lg bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2">
            {selected < 0
              ? `⚠ 이 설계의 진도 기록을 모두 삭제하고 첫 목표부터 시작합니다 (학생 ${studentIds.length}명).`
              : `"${trackGoals[selected]?.order_index}. ${trackGoals[selected]?.title}"까지 학생 ${studentIds.length}명 전원 나간 것으로 기록하고, 그 뒤 기록은 삭제합니다.`}
          </p>
        )}
        <Button className="w-full" disabled={selected == null || saving || loading} onClick={apply}>
          {saving ? '적용 중…' : '이 위치로 맞추기'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
