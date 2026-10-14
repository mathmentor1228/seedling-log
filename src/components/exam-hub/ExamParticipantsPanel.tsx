// EXAM-PARTICIPANTS-V2: 응시 확인 패널 — 학생 단위 + 과목별 응시 확인.
//  - 위쪽(confirm): 애매한 학생을 사이클별로 모아 응시/미응시 확정
//  - 사이클 상세(manage): 대상 학생 전체 목록. 학생마다 수강 과목 칩을 눌러 과목별로 응시/미응시 전환
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserCheck, UserX, Undo2, HelpCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Cycle, Participant, StudentRow } from './examHubUtils';
import { gradeLabel } from './examHubUtils';

export type ParticipantCell = {
  student: StudentRow;
  cycle: Cycle;
  row: Participant | null;          // 저장된 결정 (없으면 응시로 간주)
  reasons: string[];                // 애매한 이유 (비어 있으면 명확)
  subjects?: string[];              // 수강 과목
};

type Setter = (cycleId: string, studentId: string, status: 'taking' | 'not_taking' | null, reason?: string | null) => Promise<string | null>;
type SubjectSetter = (cycleId: string, studentId: string, notTakingSubjects: string[]) => Promise<string | null>;

/** 과목 칩: 누르면 해당 과목 응시 ↔ 미응시 */
function SubjectChips({ cell, onSetSubjects }: { cell: ParticipantCell; onSetSubjects?: SubjectSetter }) {
  const [busy, setBusy] = useState<string | null>(null);
  const subjects = cell.subjects || [];
  if (cell.row?.status === 'not_taking') return null;
  if (subjects.length === 0) return <span className="text-[11px] text-muted-foreground">수강 과목 없음</span>;
  const off = new Set(cell.row?.not_taking_subjects || []);
  const toggle = async (sub: string) => {
    if (!onSetSubjects) return;
    const next = new Set(off);
    if (next.has(sub)) next.delete(sub); else next.add(sub);
    setBusy(sub);
    const err = await onSetSubjects(cell.cycle.id, cell.student.id, [...next]);
    setBusy(null);
    if (err) toast.error(err);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {subjects.map(sub => {
        const isOff = off.has(sub);
        return (
          <button key={sub} type="button" disabled={!!busy || !onSetSubjects} onClick={() => toggle(sub)}
            title={isOff ? `${sub}: 미응시 → 눌러서 응시로` : `${sub}: 응시 → 눌러서 미응시로`}
            className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors inline-flex items-center gap-0.5',
              isOff ? 'border-border bg-muted text-muted-foreground line-through' : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20')}>
            {busy === sub && <Loader2 className="w-3 h-3 animate-spin" />}{sub}
          </button>
        );
      })}
    </div>
  );
}

function StatusButtons({ cell, onSet, compact }: { cell: ParticipantCell; onSet: Setter; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const status = cell.row?.status ?? null;
  const run = async (st: 'taking' | 'not_taking' | null) => {
    setBusy(true);
    const err = await onSet(cell.cycle.id, cell.student.id, st, st === 'not_taking' ? (reason.trim() || null) : null);
    setBusy(false);
    if (err) toast.error(err);
  };
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {status === 'not_taking' ? (
        <>
          <Badge variant="secondary">전체 미응시{cell.row?.reason ? ` · ${cell.row.reason}` : ''}</Badge>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run(null)} title="응시로 되돌리기"><Undo2 className="w-3 h-3 mr-1" />되돌림</Button>
        </>
      ) : (
        <>
          {status === 'taking' && compact && <Badge variant="outline" className="text-[11px] border-primary/40 text-primary">확정</Badge>}
          {status !== 'taking' && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run('taking')}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3 mr-1" />}응시
            </Button>
          )}
          {!compact && <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="미응시 사유(선택)" className="h-7 w-[130px] text-xs" />}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" disabled={busy} onClick={() => run('not_taking')} title="이 학생은 이번 시험 전체 미응시">
            <UserX className="w-3 h-3 mr-1" />전체 미응시
          </Button>
        </>
      )}
    </div>
  );
}

/** 상단: 애매한 학생 확인 */
export function ParticipantsConfirmPanel({ cells, onSet, onSetSubjects, onSelectCycle }: { cells: ParticipantCell[]; onSet: Setter; onSetSubjects?: SubjectSetter; onSelectCycle: (c: Cycle) => void }) {
  if (cells.length === 0) return null;
  const byCycle = new Map<string, ParticipantCell[]>();
  for (const c of cells) (byCycle.get(c.cycle.id) || byCycle.set(c.cycle.id, []).get(c.cycle.id))!.push(c);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <HelpCircle className="w-4 h-4 shrink-0" />
        <span>이번 시험을 보는지 애매한 학생입니다. <b className="text-foreground">과목 칩</b>을 눌러 안 보는 과목만 빼고 <b className="text-foreground">응시</b>로 확정하세요. 시험 자체를 안 보면 <b className="text-foreground">전체 미응시</b>.</span>
      </div>
      {[...byCycle.entries()].map(([cid, list]) => (
        <div key={cid} className="rounded-md bg-background border">
          <button type="button" className="w-full text-left px-3 py-2 border-b text-sm font-semibold hover:bg-accent/50" onClick={() => onSelectCycle(list[0].cycle)}>
            {list[0].cycle.school_name} {gradeLabel(list[0].cycle)} <span className="font-normal text-muted-foreground">· {list[0].cycle.semester} {list[0].cycle.exam_type} · {list.length}명</span>
          </button>
          <div className="divide-y">
            {list.map(cell => (
              <div key={cell.student.id} className="grid gap-2 px-3 py-2 md:grid-cols-[90px_1fr_auto] md:items-center">
                <div>
                  <div className="text-sm font-medium">{cell.student.name}</div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">{cell.reasons.join(' · ')}</div>
                </div>
                <SubjectChips cell={cell} onSetSubjects={onSetSubjects} />
                <StatusButtons cell={cell} onSet={onSet} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 사이클 상세: 대상 학생 전체 관리 (과목별) */
export function ParticipantsManageList({ cells, onSet, onSetSubjects }: { cells: ParticipantCell[]; onSet: Setter; onSetSubjects?: SubjectSetter }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirm' | 'partial' | 'not'>('all');
  const not = cells.filter(c => c.row?.status === 'not_taking');
  const partial = cells.filter(c => c.row?.status !== 'not_taking' && (c.row?.not_taking_subjects?.length || 0) > 0);
  const confirm = cells.filter(c => c.row === null && c.reasons.length > 0);
  const subjectCounts = useMemo(() => {
    const m = new Map<string, { on: number; off: number }>();
    cells.forEach(c => {
      if (c.row?.status === 'not_taking') return;
      const off = new Set(c.row?.not_taking_subjects || []);
      (c.subjects || []).forEach(s => { const v = m.get(s) || { on: 0, off: 0 }; if (off.has(s)) v.off++; else v.on++; m.set(s, v); });
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [cells]);
  const shown = (filter === 'not' ? not : filter === 'partial' ? partial : filter === 'confirm' ? confirm : cells)
    .filter(c => !q.trim() || c.student.name.includes(q.trim()));
  const F = ({ k, label, n }: { k: typeof filter; label: string; n: number }) => (
    <button type="button" onClick={() => setFilter(k)}
      className={cn('rounded-full border px-2.5 py-1 text-xs', filter === k ? 'bg-foreground text-background border-foreground' : 'hover:bg-accent')}>{label} {n}</button>
  );
  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">과목별 응시 확인</span>
        <span className="text-xs text-muted-foreground">과목 칩을 누르면 그 과목만 미응시(줄 그어짐)로 바뀌고, 해당 과목 특강·결과표에서 빠집니다.</span>
      </div>
      {subjectCounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {subjectCounts.map(([s, v]) => (
            <span key={s} className="rounded-md bg-muted px-2 py-1 text-xs"><b>{s}</b> 응시 {v.on}{v.off > 0 && <span className="text-muted-foreground"> · 미응시 {v.off}</span>}</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <F k="all" label="전체" n={cells.length} />
        {confirm.length > 0 && <F k="confirm" label="확인 필요" n={confirm.length} />}
        <F k="partial" label="일부 과목 미응시" n={partial.length} />
        <F k="not" label="전체 미응시" n={not.length} />
        <span className="flex-1" />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="학생 이름" className="h-8 pl-7 w-[150px] text-xs" />
        </div>
      </div>
      <div className="divide-y rounded-md border">
        {shown.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">해당하는 학생이 없습니다.</div>}
        {shown.map(cell => (
          <div key={cell.student.id} className={cn('grid gap-2 px-3 py-2 md:grid-cols-[100px_1fr_auto] md:items-center', cell.row?.status === 'not_taking' && 'bg-muted/40')}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{cell.student.name}</span>
              {cell.reasons.length > 0 && cell.row === null && <span className="text-[10px] rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-1" title={cell.reasons.join(' · ')}>확인</span>}
            </div>
            <SubjectChips cell={cell} onSetSubjects={onSetSubjects} />
            <StatusButtons cell={cell} onSet={onSet} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
