// EXAM-PARTICIPANTS-V1: 응시 확인 패널.
//  - 위쪽(confirm): 애매한 학생을 사이클별로 모아 응시/미응시 버튼으로 확정 (원장 요청: "애매한 아이들은 위에서 한 번 더 물어보고 컨펌")
//  - 사이클 상세(manage): 대상 학생 전체 목록에서 누구든 미응시로 바꾸거나 되돌림
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserCheck, UserX, Undo2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Cycle, Participant, StudentRow } from './examHubUtils';
import { gradeLabel } from './examHubUtils';

export type ParticipantCell = {
  student: StudentRow;
  cycle: Cycle;
  row: Participant | null;          // 저장된 결정 (없으면 응시로 간주)
  reasons: string[];                // 애매한 이유 (비어 있으면 명확)
};

type Setter = (cycleId: string, studentId: string, status: 'taking' | 'not_taking' | null, reason?: string | null) => Promise<string | null>;

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
          <Badge className="bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200">미응시{cell.row?.reason ? ` · ${cell.row.reason}` : ''}</Badge>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" disabled={busy} onClick={() => run(null)} title="응시로 되돌리기"><Undo2 className="w-3 h-3 mr-0.5" />되돌림</Button>
        </>
      ) : (
        <>
          {status === 'taking' && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">응시 확정</Badge>}
          {status !== 'taking' && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] border-emerald-300 text-emerald-800 hover:bg-emerald-50" disabled={busy} onClick={() => run('taking')}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3 mr-0.5" />}응시
            </Button>
          )}
          {!compact && <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="미응시 사유(선택)" className="h-6 w-[120px] text-[11px]" />}
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] border-slate-300 text-slate-700 hover:bg-slate-100" disabled={busy} onClick={() => run('not_taking')}>
            <UserX className="w-3 h-3 mr-0.5" />미응시
          </Button>
        </>
      )}
    </div>
  );
}

/** 상단: 애매한 학생 확인 */
export function ParticipantsConfirmPanel({ cells, onSet, onSelectCycle }: { cells: ParticipantCell[]; onSet: Setter; onSelectCycle: (c: Cycle) => void }) {
  if (cells.length === 0) return null;
  const byCycle = new Map<string, ParticipantCell[]>();
  for (const c of cells) (byCycle.get(c.cycle.id) || byCycle.set(c.cycle.id, []).get(c.cycle.id))!.push(c);
  return (
    <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-amber-700" />
        <span className="text-sm font-semibold">응시 확인 필요 {cells.length}명</span>
        <span className="text-[11px] text-muted-foreground">이번 시험을 보는지 애매한 학생입니다. 응시로 확정하면 대상에 남고, 미응시면 일정·특강·결과표에서 빠집니다.</span>
      </div>
      {[...byCycle.entries()].map(([cid, list]) => (
        <div key={cid} className="rounded-md bg-background/80 border p-2">
          <button type="button" className="text-xs font-medium hover:underline" onClick={() => onSelectCycle(list[0].cycle)}>
            {list[0].cycle.school_name} {gradeLabel(list[0].cycle)} · {list[0].cycle.semester} {list[0].cycle.exam_type}
          </button>
          <div className="mt-1.5 space-y-1">
            {list.map(cell => (
              <div key={cell.student.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium w-[72px] shrink-0">{cell.student.name}</span>
                <span className="text-[11px] text-muted-foreground flex-1 min-w-[160px]">{cell.reasons.join(' · ')}</span>
                <StatusButtons cell={cell} onSet={onSet} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 사이클 상세: 대상 학생 전체 관리 */
export function ParticipantsManageList({ cells, onSet }: { cells: ParticipantCell[]; onSet: Setter }) {
  const taking = cells.filter(c => c.row?.status !== 'not_taking');
  const not = cells.filter(c => c.row?.status === 'not_taking');
  return (
    <div className="rounded-md border p-3 space-y-2 text-xs">
      <p className="text-muted-foreground">이 학교·학년 재원생 {cells.length}명. 응시 {taking.length} · 미응시 {not.length}. 미응시로 바꾼 학생은 일정·특강·결과표 대상에서 빠집니다(행 없음 = 응시).</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {cells.map(cell => (
          <div key={cell.student.id} className={cn('flex items-center gap-2 rounded border px-2 py-1', cell.row?.status === 'not_taking' && 'opacity-70 bg-muted/40')}>
            <span className="font-medium w-[64px] shrink-0 truncate">{cell.student.name}</span>
            {cell.reasons.length > 0 && cell.row === null && <span className="text-[10px] text-amber-700 truncate" title={cell.reasons.join(' · ')}>확인 필요</span>}
            <span className="flex-1" />
            <StatusButtons cell={cell} onSet={onSet} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
