// 특강 추가 모달 — 기간·추가 시수·리듬·대상 학생 설정
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { createIntensive, fetchDesignStudents, SessionRole, DAY_LABELS, ROLE_LABELS } from './planApi';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles } from 'lucide-react';

type Props = { open: boolean; onClose: () => void; designId: string; onDone: () => void };

export function IntensiveModal({ open, onClose, designId, onDone }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [label, setLabel] = useState('여름방학 특강');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [addedSessions, setAddedSessions] = useState<number>(8);
  const [rhythm, setRhythm] = useState<Record<string, SessionRole>>({ '1': 'progress', '3': 'progress', '5': 'progress' });
  const [scope, setScope] = useState<'all' | 'subset'>('all');
  const [note, setNote] = useState('');
  const [students, setStudents] = useState<{ student_id: string; name?: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const rows = await fetchDesignStudents(designId);
      const ids = rows.map(r => r.student_id);
      if (ids.length) {
        const { data } = await (supabase as any).from('students').select('id, name').in('id', ids);
        const nameMap = new Map<string, string>((data || []).map((s: any) => [s.id, s.name]));
        setStudents(rows.map(r => ({ student_id: r.student_id, name: nameMap.get(r.student_id) })));
      } else setStudents([]);
    })();
  }, [open, designId]);

  function toggleDay(d: number) {
    setRhythm(prev => {
      const next = { ...prev };
      if (next[String(d)]) delete next[String(d)];
      else next[String(d)] = 'progress';
      return next;
    });
  }

  async function handleSave() {
    if (!label.trim() || !startDate || !endDate) {
      toast({ title: '입력 확인', description: '라벨과 기간은 필수입니다', variant: 'destructive' }); return;
    }
    if (startDate > endDate) {
      toast({ title: '입력 확인', description: '종료일이 시작일보다 앞섭니다', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await createIntensive({
        design_id: designId, label: label.trim(),
        start_date: startDate, end_date: endDate,
        added_sessions: addedSessions, rhythm, scope,
        student_ids: scope === 'subset' ? Array.from(picked) : undefined,
        note: note.trim() || undefined,
        created_by: user?.id,
      });
      toast({ title: '특강 추가 완료', description: `${label} — 세션이 스케줄에 반영되었습니다` });
      onDone(); onClose();
    } catch (e: any) {
      toast({ title: '오류', description: e.message || '저장 실패', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" />특강 추가</DialogTitle>
          <DialogDescription>기존 설계 위에 방학특강처럼 추가 시수를 얹습니다. 원래 스케줄은 그대로 유지됩니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>라벨</Label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="여름방학 특강" /></div>
            <div className="space-y-1"><Label>추가 시수</Label><Input type="number" min={1} value={addedSessions} onChange={e => setAddedSessions(Number(e.target.value) || 0)} /></div>
            <div className="space-y-1"><Label>시작일</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>종료일</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          </div>

          <div className="space-y-2">
            <Label>특강 요일 리듬</Label>
            <div className="flex flex-wrap gap-2">
              {[0,1,2,3,4,5,6].map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 rounded-md text-sm border ${rhythm[String(d)] ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
            {Object.keys(rhythm).length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(rhythm).sort(([a],[b]) => Number(a)-Number(b)).map(([d, role]) => (
                  <div key={d} className="flex items-center gap-1.5 text-xs">
                    <span className="w-5 text-center">{DAY_LABELS[Number(d)]}</span>
                    <Select value={role} onValueChange={(v) => setRhythm(prev => ({ ...prev, [d]: v as SessionRole }))}>
                      <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['progress','progress_quiz','test_day'] as SessionRole[]).map(r =>
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>대상</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={scope === 'all' ? 'default' : 'outline'} onClick={() => setScope('all')}>그룹 전체</Button>
              <Button type="button" size="sm" variant={scope === 'subset' ? 'default' : 'outline'} onClick={() => setScope('subset')}>일부 학생만</Button>
            </div>
            {scope === 'subset' && (
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md max-h-40 overflow-y-auto">
                {students.length === 0 && <span className="text-xs text-muted-foreground">설계에 등록된 학생이 없습니다</span>}
                {students.map(s => (
                  <Badge key={s.student_id}
                    variant={picked.has(s.student_id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setPicked(p => {
                      const n = new Set(p);
                      if (n.has(s.student_id)) n.delete(s.student_id); else n.add(s.student_id);
                      return n;
                    })}>
                    {s.name || s.student_id.slice(0,6)}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1"><Label>메모</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder="예: 심화 개념 위주" /></div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}특강 만들기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
