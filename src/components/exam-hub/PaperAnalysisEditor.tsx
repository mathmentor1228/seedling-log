// EXAM-PAPER-MATERIALS-V1: 시험지 분석 정리 — 총평/출제 포인트/까다로운 포인트 + 문항별 난도·단원·메모.
// 학생 개별 피드백(generate-exam-student-analysis)이 틀린 문항 번호와 이 내용을 연결해 쓴다.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const EXAM_DIFF = ['매우쉬움', '쉬움', '중', '어려움', '매우어려움'];
const ITEM_DIFF = ['하', '중하', '중', '중상', '상', '매우어려움'];

type Item = { item_number: number; points: string; unit_name: string; question_type: string; difficulty: string; note: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportId: string | null;
  title: string;
  onSaved: () => void;
}

export function PaperAnalysisEditor({ open, onOpenChange, reportId, title, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [head, setHead] = useState({ exam_difficulty: '', avg_score: '', grade_cutoffs: '', overall_review: '', focus_summary: '', tricky_points: '' });
  const [items, setItems] = useState<Item[]>([]);
  const [origNums, setOrigNums] = useState<number[]>([]);
  const [bulkCount, setBulkCount] = useState('');

  useEffect(() => {
    if (!open || !reportId) return;
    setLoading(true);
    (async () => {
      const db = supabase as any;
      const [{ data: r }, { data: its }] = await Promise.all([
        db.from('exam_analysis_reports').select('exam_difficulty, avg_score, grade_cutoffs, overall_review, focus_summary, tricky_points').eq('id', reportId).maybeSingle(),
        db.from('exam_analysis_items').select('item_number, points, unit_name, question_type, difficulty, note').eq('report_id', reportId).order('item_number'),
      ]);
      setHead({
        exam_difficulty: r?.exam_difficulty || '', avg_score: r?.avg_score != null ? String(r.avg_score) : '',
        grade_cutoffs: r?.grade_cutoffs || '',
        overall_review: r?.overall_review || '', focus_summary: r?.focus_summary || '', tricky_points: r?.tricky_points || '',
      });
      const list: Item[] = ((its || []) as any[]).map(i => ({
        item_number: i.item_number, points: i.points != null ? String(i.points) : '', unit_name: i.unit_name || '',
        question_type: i.question_type || '', difficulty: i.difficulty || '', note: i.note || '',
      }));
      setItems(list); setOrigNums(list.map(i => i.item_number));
      setLoading(false);
    })();
  }, [open, reportId]);

  const upd = (idx: number, patch: Partial<Item>) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const addRow = () => setItems(prev => [...prev, { item_number: (prev.at(-1)?.item_number || 0) + 1, points: '', unit_name: '', question_type: '', difficulty: '', note: '' }]);
  const makeRows = () => {
    const n = Math.min(60, Math.max(0, parseInt(bulkCount) || 0));
    if (!n) return;
    setItems(prev => {
      const have = new Set(prev.map(p => p.item_number));
      const add: Item[] = [];
      for (let k = 1; k <= n; k++) if (!have.has(k)) add.push({ item_number: k, points: '', unit_name: '', question_type: '', difficulty: '', note: '' });
      return [...prev, ...add].sort((a, b) => a.item_number - b.item_number);
    });
  };

  const [aiBusy, setAiBusy] = useState(false);
  async function autoFill() {
    if (!reportId) return;
    if ((items.length || head.overall_review) && !confirm('올린 자료를 읽어 내용을 다시 정리합니다. 지금 칸의 내용이 바뀝니다. 계속할까요?')) return;
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('summarize-exam-paper', { body: { report_id: reportId } });
      if (error || data?.error) {
        let msg = data?.error || error?.message;
        try { msg = (await (error as any)?.context?.json())?.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const r = data.result || {};
      setHead(h => ({
        ...h,
        exam_difficulty: EXAM_DIFF.includes(r.exam_difficulty) ? r.exam_difficulty : h.exam_difficulty,
        avg_score: r.avg_score != null ? String(r.avg_score) : h.avg_score,
        overall_review: r.overall_review || h.overall_review,
        focus_summary: r.focus_summary || h.focus_summary,
        tricky_points: r.tricky_points || h.tricky_points,
      }));
      if (Array.isArray(r.items) && r.items.length) {
        const seen = new Set<number>();
        const list: Item[] = r.items.map((i: any) => ({
          item_number: parseInt(i.item_number) || 0, points: i.points != null ? String(i.points) : '',
          unit_name: i.unit_name || '', question_type: i.question_type || '',
          difficulty: ITEM_DIFF.includes(i.difficulty) ? i.difficulty : '', note: i.note || '',
        })).filter((i: Item) => i.item_number > 0 && !seen.has(i.item_number) && seen.add(i.item_number))
          .sort((a: Item, b: Item) => a.item_number - b.item_number);
        setItems(list);
      }
      toast.success('자료를 읽어 정리했어요. 확인 후 저장을 눌러 주세요.');
    } catch (e: any) { toast.error('자동 정리 실패: ' + (e?.message || e)); } finally { setAiBusy(false); }
  }

  async function save() {
    if (!reportId) return;
    const nums = items.map(i => i.item_number);
    if (nums.some(n => !Number.isInteger(n) || n < 1)) return toast.error('문항 번호를 확인해 주세요');
    if (new Set(nums).size !== nums.length) return toast.error('같은 문항 번호가 두 번 있습니다');
    setSaving(true);
    try {
      const db = supabase as any;
      const avg = head.avg_score.trim() ? Number(head.avg_score) : null;
      const { error } = await db.from('exam_analysis_reports').update({
        exam_difficulty: head.exam_difficulty || null, avg_score: avg != null && !isNaN(avg) ? avg : null,
        grade_cutoffs: head.grade_cutoffs.trim() || null,
        overall_review: head.overall_review.trim() || null, focus_summary: head.focus_summary.trim() || null,
        tricky_points: head.tricky_points.trim() || null, updated_at: new Date().toISOString(),
      }).eq('id', reportId);
      if (error) throw error;
      const removed = origNums.filter(n => !nums.includes(n));
      if (removed.length) {
        const { error: dErr } = await db.from('exam_analysis_items').delete().eq('report_id', reportId).in('item_number', removed);
        if (dErr) throw dErr;
      }
      if (items.length) {
        const rows = items.map((it, i) => ({
          report_id: reportId, item_number: it.item_number, sort_order: i,
          points: it.points.trim() ? Number(it.points) : null, unit_name: it.unit_name.trim() || null,
          question_type: it.question_type.trim() || null, difficulty: it.difficulty || null, note: it.note.trim() || null,
        }));
        const { error: uErr } = await db.from('exam_analysis_items').upsert(rows, { onConflict: 'report_id,item_number' });
        if (uErr) throw uErr;
      }
      toast.success('분석 내용을 저장했습니다');
      onSaved(); onOpenChange(false);
    } catch (e: any) { toast.error('저장 실패: ' + (e?.message || e)); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title} · 분석 정리</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground flex-1">올린 자료(교사용 분석지 우선, 시험지·해설지)를 읽어 아래 칸을 자동으로 채웁니다.</span>
              <Button size="sm" onClick={() => void autoFill()} disabled={aiBusy}>
                {aiBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                {aiBusy ? '읽는 중…' : '자료 읽어서 정리하기'}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">전체 난이도</Label>
                <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={head.exam_difficulty}
                  onChange={e => setHead(h => ({ ...h, exam_difficulty: e.target.value }))}>
                  <option value="">선택 안 함</option>
                  {EXAM_DIFF.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="paper-average" className="text-xs">학교 평균</Label>
                <Input id="paper-average" type="number" value={head.avg_score} onChange={e => setHead(h => ({ ...h, avg_score: e.target.value }))} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor="paper-grade-cutoffs" className="text-xs">등급컷 (선택)</Label>
                <Input id="paper-grade-cutoffs" placeholder="예: 1등급 90 / 2등급 80" value={head.grade_cutoffs} onChange={e => setHead(h => ({ ...h, grade_cutoffs: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">출제 경향 총평</Label>
              <Textarea rows={3} value={head.overall_review} onChange={e => setHead(h => ({ ...h, overall_review: e.target.value }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">어떤 부분 위주로 출제됐는지</Label>
                <Textarea rows={3} placeholder="예: 이차함수 그래프 해석 비중 큼, 교과서 예제 변형 다수" value={head.focus_summary} onChange={e => setHead(h => ({ ...h, focus_summary: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">까다로운 포인트</Label>
                <Textarea rows={3} placeholder="예: 서술형 2번 조건 해석, 21번 계산량" value={head.tricky_points} onChange={e => setHead(h => ({ ...h, tricky_points: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">문항별 분석 ({items.length}문항)</span>
                <span className="flex-1" />
                <Input className="h-8 w-20" type="number" placeholder="문항 수" value={bulkCount} onChange={e => setBulkCount(e.target.value)} />
                <Button size="sm" variant="outline" className="h-8" onClick={makeRows}>칸 만들기</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={addRow}><Plus className="w-3.5 h-3.5 mr-1" />한 줄</Button>
              </div>
              <div className="text-[11px] text-muted-foreground">학생이 틀린 문항 번호와 연결되어 개별 피드백에 반영됩니다.</div>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="p-1.5 w-14">번호</th><th className="p-1.5 w-14">배점</th><th className="p-1.5 w-32">단원</th>
                      <th className="p-1.5 w-24">유형</th><th className="p-1.5 w-24">난도</th><th className="p-1.5">까다로운 이유·출제 포인트</th><th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1"><Input className="h-7 text-xs" type="number" value={it.item_number} onChange={e => upd(idx, { item_number: parseInt(e.target.value) || 0 })} /></td>
                        <td className="p-1"><Input className="h-7 text-xs" type="number" value={it.points} onChange={e => upd(idx, { points: e.target.value })} /></td>
                        <td className="p-1"><Input className="h-7 text-xs" value={it.unit_name} onChange={e => upd(idx, { unit_name: e.target.value })} /></td>
                        <td className="p-1"><Input className="h-7 text-xs" placeholder="객관식/서술형" value={it.question_type} onChange={e => upd(idx, { question_type: e.target.value })} /></td>
                        <td className="p-1">
                          <select className="w-full h-7 rounded-md border bg-background px-1 text-xs" value={it.difficulty} onChange={e => upd(idx, { difficulty: e.target.value })}>
                            <option value="">-</option>
                            {ITEM_DIFF.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </td>
                        <td className="p-1"><Input className="h-7 text-xs" value={it.note} onChange={e => upd(idx, { note: e.target.value })} /></td>
                        <td className="p-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">문항 수를 넣고 "칸 만들기"를 누르세요.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          <Button onClick={() => void save()} disabled={saving || loading}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
