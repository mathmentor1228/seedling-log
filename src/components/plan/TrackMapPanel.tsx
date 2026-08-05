// TRACK-MAP-V1: 진도 단계에서 전체 목차 + 학생별 현재 위치·개인 페이스를 한눈에 보는 지도 패널
// — 오늘 목표만 잘라 보여주는 기존 화면의 "맥락 부족"을 보완한다.
// 읽기 전용: 기록은 기존 총 도달 페이지·목표별 카드에서, 위치 수정은 위치 조정 모달에서.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Map as MapIcon } from 'lucide-react';
import { PlanGoal } from './planApi';

type StudentLite = { id: string; name: string; type: 'A' | 'B' | 'C' | null };
type ProgressLite = { student_id: string; goal_id: string; status: string; partial_upto: string | null };
type LocalState = { state: 'done' | 'partial' | 'defer' | 'skip'; upto: string };

const TYPE_COLORS: Record<string, string> = { A: 'text-violet-700', B: 'text-sky-700', C: 'text-amber-700' };

const OPEN_KEY = 'plan.trackMap.open';

function pageEnd(pages: string | null): number | null {
  const nums = (pages || '').match(/\d+/g);
  return nums && nums.length > 0 ? Number(nums[nums.length - 1]) : null;
}

export function TrackMapPanel({
  trackGoals, students, progress, perStudent,
  todayStartIdx, todayEndIdx, groupPosIdx, remainSessions, pace,
}: {
  trackGoals: PlanGoal[];
  students: StudentLite[];           // 출석 학생만 넘겨받는다
  progress: ProgressLite[];          // 지난 세션 + 오늘 저장분 전체
  perStudent: Record<string, Record<string, LocalState>>; // 오늘 화면에서 막 누른 상태 (저장 전 포함)
  todayStartIdx: number;
  todayEndIdx: number;
  groupPosIdx: number;
  remainSessions: number;
  pace: number | null;               // 그룹 페이스 (회당 목표 수)
}) {
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(OPEN_KEY) !== '0');
  const listRef = useRef<HTMLDivElement>(null);

  // 학생×목표 유효 상태 — 화면에서 막 누른 값(perStudent)이 저장된 값보다 우선
  const stateOf = useMemo(() => {
    const byGoalStudent = new Map<string, 'done' | 'partial' | 'defer' | 'skip'>();
    const uptoMap = new Map<string, string>();
    for (const p of progress) {
      const k = `${p.goal_id}::${p.student_id}`;
      if (['advanced', 'verified_ok', 'verified_weak'].includes(p.status)) byGoalStudent.set(k, 'done');
      else if (p.status === 'partial') { byGoalStudent.set(k, 'partial'); uptoMap.set(k, p.partial_upto || ''); }
      else if (p.status === 'deferred') byGoalStudent.set(k, 'defer');
      else if (p.status === 'skipped') byGoalStudent.set(k, 'skip');
    }
    for (const [gid, stuMap] of Object.entries(perStudent)) {
      for (const [sid, st] of Object.entries(stuMap)) {
        const k = `${gid}::${sid}`;
        byGoalStudent.set(k, st.state);
        if (st.state === 'partial') uptoMap.set(k, st.upto);
      }
    }
    return (gid: string, sid: string) => {
      const k = `${gid}::${sid}`;
      return { state: byGoalStudent.get(k) ?? null, upto: uptoMap.get(k) || '' };
    };
  }, [progress, perStudent]);

  // 학생별 요약: 현재 위치(마지막 done 목표), 이어가는 일부(◐), 남은 분량, 개인 페이스
  const studentRows = useMemo(() => {
    const lastIdx = trackGoals.length - 1;
    return students.map(s => {
      let posIdx = -1;
      trackGoals.forEach((g, i) => { { const _s = stateOf(g.id, s.id).state; if (_s === 'done' || _s === 'skip') posIdx = i; } });
      const nextGoal = posIdx + 1 <= lastIdx ? trackGoals[posIdx + 1] : null;
      const nextPartial = nextGoal ? stateOf(nextGoal.id, s.id) : { state: null, upto: '' };
      const hasPartial = nextPartial.state === 'partial';
      const remain = Math.max(0, lastIdx - posIdx - (hasPartial ? 0.5 : 0));
      const myPace = remainSessions > 0 ? remain / remainSessions : null;
      return {
        student: s, posIdx,
        posGoal: posIdx >= 0 ? trackGoals[posIdx] : null,
        partialGoal: hasPartial ? nextGoal : null,
        partialUpto: hasPartial ? nextPartial.upto : '',
        remain, myPace,
      };
    });
  }, [students, trackGoals, stateOf, remainSessions]);

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  }, [open]);

  // 목차 리스트를 열 때 오늘 구간이 보이도록 자동 스크롤
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>('[data-today-first="1"]');
    if (el) listRef.current.scrollTop = Math.max(0, el.offsetTop - listRef.current.offsetTop - 72);
  }, [open, todayStartIdx]);

  if (trackGoals.length === 0 || students.length === 0) return null;

  const dotCls = (state: string | null) =>
    state === 'done' ? 'bg-green-100 text-green-800 border-green-300'
      : state === 'partial' ? 'bg-amber-100 text-amber-800 border-amber-300'
        : state === 'skip' ? 'bg-slate-200 text-slate-600 border-slate-400 line-through'
          : state === 'defer' ? 'bg-muted text-muted-foreground border-muted-foreground/30'
            : 'bg-background text-muted-foreground/50 border-muted';

  return (
    <Card>
      <CardContent className={open ? 'p-4 space-y-3' : 'p-0'}>
        <button
          className={`flex items-center gap-2 w-full text-left ${open ? '' : 'px-4 py-3 hover:bg-muted/30 transition rounded-xl'}`}
          onClick={() => setOpen(o => !o)}
          title={open ? '접기' : '전체 목차와 학생별 위치 보기'}>
          <MapIcon className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-extrabold">전체 목차 · 학생별 위치</span>
          <span className="text-[11px] text-muted-foreground">
            {trackGoals.length}개 목표 중 {groupPosIdx + 1}개 완료
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <>
            {/* 학생별 현재 위치 + 개인 페이스 */}
            <div className="space-y-1.5">
              {studentRows.map(({ student: s, posGoal, partialGoal, partialUpto, remain, myPace }) => {
                const tight = myPace != null && pace != null && myPace > pace + 0.05;
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border rounded-lg px-2.5 py-1.5 bg-background text-xs">
                    <span className="font-bold text-sm min-w-[60px]">{s.name}</span>
                    {s.type && <span className={`text-[10px] font-bold ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                    <span className="text-muted-foreground">
                      {partialGoal
                        ? <>진행 중: <b className="text-foreground">{partialGoal.order_index}. {partialGoal.title}</b>{partialUpto && <> (◐ ~{partialUpto})</>}</>
                        : posGoal
                          ? <>여기까지: <b className="text-foreground">{posGoal.order_index}. {posGoal.title}</b>{pageEnd(posGoal.pages) != null && <> · ~p.{pageEnd(posGoal.pages)}</>}</>
                          : <>아직 시작 전</>}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground">남은 {remain}개</span>
                      {myPace != null && (
                        <Badge variant="outline" className={`text-[10px] ${tight
                          ? 'border-amber-400 text-amber-700 bg-amber-50'
                          : 'border-green-300 text-green-700 bg-green-50'}`}>
                          회당 {myPace.toFixed(1)}개 필요{tight ? ' · 빡빡' : ''}
                        </Badge>
                      )}
                    </span>
                  </div>
                );
              })}
              {pace != null && (
                <p className="text-[10px] text-muted-foreground px-1">
                  그룹 기준 회당 {pace.toFixed(1)}개 · 남은 수업 {remainSessions}회 — 개인 페이스가 그룹보다 높으면 그 학생은 보충이 필요해요
                </p>
              )}
            </div>

            {/* 전체 목차 — 오늘 구간 하이라이트, 학생별 상태 점 */}
            <div ref={listRef} className="max-h-72 overflow-y-auto rounded-lg border divide-y">
              {trackGoals.map((g, i) => {
                const isToday = i >= todayStartIdx && i <= todayEndIdx;
                const isPastCursor = i === groupPosIdx;
                return (
                  <div key={g.id}
                    data-today-first={i === todayStartIdx ? '1' : undefined}
                    className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${isToday ? 'bg-primary/10' : i <= groupPosIdx ? 'bg-muted/30' : ''}`}>
                    <span className={`w-6 text-right shrink-0 tabular-nums ${isToday ? 'font-extrabold text-primary' : 'text-muted-foreground'}`}>
                      {g.order_index}.
                    </span>
                    <span className={`truncate ${isToday ? 'font-bold' : ''}`} title={`${g.title}${g.pages ? ` (${g.pages})` : ''}`}>
                      {g.title}
                    </span>
                    {g.pages && <span className="text-[10px] text-muted-foreground shrink-0">{g.pages}</span>}
                    {isToday && <Badge className="text-[9px] px-1 py-0 h-4 shrink-0">오늘</Badge>}
                    {isPastCursor && !isToday && (
                      <span className="text-[9px] text-muted-foreground shrink-0">← 지난 수업까지</span>
                    )}
                    <span className="ml-auto flex items-center gap-0.5 shrink-0">
                      {students.map(s => {
                        const st = stateOf(g.id, s.id);
                        return (
                          <span key={s.id}
                            className={`inline-flex items-center justify-center min-w-[18px] min-h-[18px] rounded-full border text-[9px] font-bold ${dotCls(st.state)}`}
                            title={`${s.name} — ${st.state === 'done' ? '완료' : st.state === 'partial' ? `일부 ~${st.upto || '?'}` : st.state === 'defer' ? '미룸' : '기록 없음'}`}>
                            {s.name.charAt(0)}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              초록=완료 · 노랑=일부 · 회색=미룸 · 흐림=기록 없음 — 위치가 실제와 다르면 상단 "위치 조정"에서 바로잡으세요
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
