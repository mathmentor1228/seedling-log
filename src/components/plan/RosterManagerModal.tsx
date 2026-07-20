// PLAN-ROSTER-MID-JOIN-V1: 수업 설계 명단(추가/삭제/시작지점) 관리
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Trash2, Users, Sprout, Search, ArrowRightLeft } from 'lucide-react';
import {
  fetchDesignStudents, fetchGoals, addStudentsToDesign,
  removeStudentFromDesign, updateDesignStudent,
  transferStudentToDesign, fetchTransferTargets,
  PlanGoal, StudentType, AddStudentInput,
} from './planApi';

type Props = { open: boolean; onClose: () => void; onDone?: () => void;
  designId: string; trackId: string; teachingMode: string; title: string };

type Row = {
  student_id: string; name: string; grade: string | null;
  student_type: StudentType | null;
  start_goal_id: string | null;
  joined_at: string | null;
};
type Pool = { id: string; name: string; grade: string | null };

const TYPE_LABEL: Record<string, string> = { A: '심화', B: '표준', C: '개념' };

export function RosterManagerModal({ open, onClose, onDone, designId, trackId, teachingMode, title }: Props) {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [goals, setGoals] = useState<PlanGoal[]>([]);
  const [pool, setPool] = useState<Pool[]>([]);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string>('');
  const [pickedType, setPickedType] = useState<StudentType>('B');
  const [startFromBeginning, setStartFromBeginning] = useState(true);
  const [pickedStartGoal, setPickedStartGoal] = useState<string>('');
  const [joinedAt, setJoinedAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const isABC = teachingMode === 'abc';

  // Transfer state
  const [transferFor, setTransferFor] = useState<Row | null>(null);
  const [transferTargets, setTransferTargets] = useState<Awaited<ReturnType<typeof fetchTransferTargets>>>([]);
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferGoals, setTransferGoals] = useState<PlanGoal[]>([]);
  const [transferFromBeginning, setTransferFromBeginning] = useState(true);
  const [transferStartGoal, setTransferStartGoal] = useState<string>('');
  const [transferJoinedAt, setTransferJoinedAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [transferBusy, setTransferBusy] = useState(false);

  async function openTransfer(r: Row) {
    setTransferFor(r);
    setTransferTargetId('');
    setTransferGoals([]);
    setTransferFromBeginning(true);
    setTransferStartGoal('');
    setTransferJoinedAt(new Date().toISOString().slice(0, 10));
    try {
      const targets = await fetchTransferTargets(designId, user?.id || null, role === 'admin' || role === 'principal');
      setTransferTargets(targets);
    } catch (e: any) { toast.error(`대상 반 불러오기 실패: ${e.message || e}`); }
  }
  async function onPickTarget(targetId: string) {
    setTransferTargetId(targetId);
    setTransferStartGoal('');
    const tgt = transferTargets.find(t => t.id === targetId);
    if (!tgt) { setTransferGoals([]); return; }
    try {
      const gs = await fetchGoals(tgt.track_id);
      setTransferGoals(gs);
    } catch { setTransferGoals([]); }
  }
  async function handleTransfer() {
    if (!transferFor || !transferTargetId) { toast.error('옮길 반을 선택해주세요'); return; }
    if (!transferFromBeginning && !transferStartGoal) { toast.error('시작할 목차를 선택해주세요'); return; }
    setTransferBusy(true);
    try {
      const res = await transferStudentToDesign(designId, transferTargetId, transferFor.student_id, {
        student_type: transferFor.student_type,
        start_goal_id: transferFromBeginning ? null : transferStartGoal,
        joined_at: transferJoinedAt || null,
      });
      toast.success(res.sameTrack
        ? `${transferFor.name} 이동 완료 (기록 이관됨)`
        : `${transferFor.name} 이동 완료 (트랙이 달라 기록은 이전 반에 남습니다)`);
      setTransferFor(null);
      await load();
      onDone?.();
    } catch (e: any) { toast.error(`이동 실패: ${e.message || e}`); }
    finally { setTransferBusy(false); }
  }


  async function load() {
    setLoading(true);
    try {
      const [ps, gs] = await Promise.all([fetchDesignStudents(designId), fetchGoals(trackId)]);
      const sids = ps.map((r: any) => r.student_id);
      const { data: studs } = sids.length
        ? await supabase.from('students').select('id, name, grade').in('id', sids)
        : { data: [] as any[] };
      const nameMap = new Map(((studs || []) as any[]).map((s: any) => [s.id, s]));
      setRows(ps.map((r: any) => {
        const s = nameMap.get(r.student_id);
        return {
          student_id: r.student_id,
          name: s?.name || '(알수없음)', grade: s?.grade || null,
          student_type: r.student_type, start_goal_id: r.start_goal_id,
          joined_at: r.joined_at,
        };
      }).sort((a, b) => a.name.localeCompare(b.name, 'ko')));
      setGoals(gs);
    } catch (e: any) { toast.error(`불러오기 실패: ${e.message || e}`); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, designId, trackId]);

  // 담당 학생 풀 (교사면 담당만, 관리자는 전체)
  useEffect(() => {
    if (!open || !user?.id) return;
    (async () => {
      try {
        let ids: string[] | null = null;
        if (role === 'teacher') {
          const [linkRes, sstRes] = await Promise.all([
            supabase.from('teacher_student_links').select('student_id').eq('teacher_id', user.id),
            supabase.from('student_subject_teachers').select('student_id').eq('teacher_id', user.id),
          ]);
          const set = new Set<string>();
          ((linkRes.data || []) as any[]).forEach(r => r.student_id && set.add(r.student_id));
          ((sstRes.data || []) as any[]).forEach(r => r.student_id && set.add(r.student_id));
          ids = Array.from(set);
        }
        let q = supabase.from('students').select('id, name, grade').order('name');
        if (ids !== null) {
          if (ids.length === 0) { setPool([]); return; }
          q = q.in('id', ids);
        }
        const { data } = await q;
        setPool(((data || []) as any[]).map(s => ({ id: s.id, name: s.name, grade: s.grade })));
      } catch { /* ignore */ }
    })();
  }, [open, user?.id, role]);

  const rowIds = useMemo(() => new Set(rows.map(r => r.student_id)), [rows]);
  const availablePool = useMemo(() =>
    pool.filter(p => !rowIds.has(p.id))
        .filter(p => !query.trim() || p.name.includes(query.trim())),
  [pool, rowIds, query]);

  async function handleRemove(sid: string, name: string) {
    if (!confirm(`${name} 학생을 이 반에서 빼시겠어요? (수업 이력은 유지됩니다)`)) return;
    try {
      await removeStudentFromDesign(designId, sid);
      toast.success(`${name} 제외`);
      setRows(prev => prev.filter(r => r.student_id !== sid));
      onDone?.();
    } catch (e: any) { toast.error(`실패: ${e.message || e}`); }
  }

  async function handlePatch(sid: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => r.student_id === sid ? { ...r, ...patch } : r));
    try {
      await updateDesignStudent(designId, sid, {
        student_type: (patch.student_type ?? undefined) as any,
        start_goal_id: patch.start_goal_id ?? undefined,
        joined_at: patch.joined_at ?? undefined,
      });
    } catch (e: any) { toast.error(`저장 실패: ${e.message || e}`); load(); }
  }

  async function handleAdd() {
    if (!pickedId) { toast.error('학생을 선택해주세요'); return; }
    const payload: AddStudentInput = {
      student_id: pickedId,
      student_type: isABC ? pickedType : null,
      start_goal_id: startFromBeginning ? null : (pickedStartGoal || null),
      joined_at: joinedAt || null,
    };
    if (!startFromBeginning && !pickedStartGoal) {
      toast.error('시작할 목차를 선택해주세요'); return;
    }
    try {
      await addStudentsToDesign(designId, [payload]);
      toast.success('학생 추가 완료');
      setAddOpen(false);
      setPickedId(''); setStartFromBeginning(true); setPickedStartGoal('');
      await load();
      onDone?.();
    } catch (e: any) { toast.error(`추가 실패: ${e.message || e}`); }
  }

  const goalLabel = (id: string | null) => {
    if (!id) return '처음부터';
    const g = goals.find(x => x.id === id);
    return g ? `${g.order_index}. ${g.title}` : '(삭제된 목차)';
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />명단 관리 — {title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">불러오는 중…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">현재 {rows.length}명</p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1" />학생 추가
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg">
                아직 등록된 학생이 없습니다.
              </p>
            ) : (
              <div className="border rounded-lg divide-y">
                {rows.map(r => (
                  <div key={r.student_id} className="p-3 flex items-start gap-2 flex-wrap">
                    <div className="min-w-[110px]">
                      <p className="font-semibold">{r.name}</p>
                      {r.grade && <p className="text-xs text-muted-foreground">{r.grade}</p>}
                    </div>
                    {isABC && (
                      <Select value={r.student_type || 'B'}
                        onValueChange={v => handlePatch(r.student_id, { student_type: v as StudentType })}>
                        <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(['A', 'B', 'C'] as const).map(t => (
                            <SelectItem key={t} value={t}>{t}형 · {TYPE_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex-1 min-w-[180px]">
                      <Select value={r.start_goal_id ?? '__begin__'}
                        onValueChange={v => handlePatch(r.student_id, { start_goal_id: v === '__begin__' ? null : v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="시작 위치" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__begin__">🌱 처음부터</SelectItem>
                          {goals.map(g => (
                            <SelectItem key={g.id} value={g.id}>{g.order_index}. {g.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input type="date" value={r.joined_at ?? ''} className="w-36 h-8"
                      onChange={e => handlePatch(r.student_id, { joined_at: e.target.value || null })}
                      title="합류일" />
                    <Button size="sm" variant="ghost" className="text-red-600"
                      onClick={() => handleRemove(r.student_id, r.name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {r.start_goal_id && (
                      <Badge variant="outline" className="text-[10px] w-full mt-1">
                        중도 합류 · {goalLabel(r.start_goal_id)}부터
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 추가 패널 (Dialog 중첩 금지 — 인라인 확장) */}
        {addOpen && (
          <div className="mt-3 border rounded-lg p-3 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm flex items-center gap-1">
                <UserPlus className="w-4 h-4" />학생 추가
              </p>
              <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>닫기</Button>
            </div>
            <div>
              <label className="text-xs font-semibold">학생</label>
              <div className="relative mt-1">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                <Input placeholder="이름 검색" value={query}
                  onChange={e => setQuery(e.target.value)} className="pl-7 h-8" />
              </div>
              <div className="mt-1 max-h-40 overflow-y-auto border rounded-md bg-background">
                {availablePool.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">추가 가능한 학생이 없습니다.</p>
                ) : availablePool.map(p => (
                  <button key={p.id} type="button"
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${pickedId === p.id ? 'bg-primary/10 font-semibold' : ''}`}
                    onClick={() => setPickedId(p.id)}>
                    {p.name} <span className="text-xs text-muted-foreground">{p.grade}</span>
                  </button>
                ))}
              </div>
            </div>

            {isABC && (
              <div>
                <label className="text-xs font-semibold">유형</label>
                <Select value={pickedType} onValueChange={v => setPickedType(v as StudentType)}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['A', 'B', 'C'] as const).map(t => (
                      <SelectItem key={t} value={t}>{t}형 · {TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold flex items-center gap-1">
                <Sprout className="w-3.5 h-3.5 text-emerald-600" />어디서부터 시작할까요?
              </label>
              <div className="mt-1 space-y-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={startFromBeginning}
                    onChange={() => setStartFromBeginning(true)} />
                  커리큘럼 처음부터
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={!startFromBeginning}
                    onChange={() => setStartFromBeginning(false)} />
                  특정 목차부터
                </label>
                {!startFromBeginning && (
                  <Select value={pickedStartGoal} onValueChange={setPickedStartGoal}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="시작할 목차 선택" /></SelectTrigger>
                    <SelectContent>
                      {goals.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.order_index}. {g.title}{g.pages ? ` (${g.pages})` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold">합류일</label>
              <Input type="date" value={joinedAt} onChange={e => setJoinedAt(e.target.value)}
                className="mt-1 h-8" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>취소</Button>
              <Button className="flex-1" onClick={handleAdd}>추가</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
