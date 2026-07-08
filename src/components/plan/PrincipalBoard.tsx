// PLAN-PRINCIPAL-BOARD-V1: 원장 격차 대시보드
// 철학(§3·§11): 일지를 다 읽지 않아도 "격차 큰 반·아이"만 짚으면 되게.
// 격차 두 종류 — 진도 격차(늦어짐: 페이스·뒤처짐) / 이해 격차(나갔는데 확인 안 됨·미흡)
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Siren, Check, Eye, Play, RefreshCw, ChevronDown, ShieldCheck } from 'lucide-react';
import {
  fetchPrincipalOverview, fetchOpenFlags, updateFlagStatus,
  PrincipalDesignOverview, PlanFlagRow,
} from './planApi';

const TYPE_COLORS: Record<string, string> = { A: 'text-violet-700', B: 'text-sky-700', C: 'text-amber-700' };
const BEHIND_LIMIT = 2; // 뒤처짐 주의 기준(목표 수) — §9 "2회분 밀림"의 근사

// 겹친 진도바 — 연한 바(나간 %) 위에 진한 바(확인된 %). 둘의 간격이 곧 이해 격차.
function GapBar({ advanced, verified }: { advanced: number; verified: number }) {
  const aPct = Math.round(advanced * 100);
  const vPct = Math.round(verified * 100);
  const gap = aPct - vPct;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1 text-[11px]">
        <span className="font-bold text-emerald-800">나간 진도 {aPct}%</span>
        <span className="font-bold text-sky-800">확인된 진도 {vPct}%</span>
        <span className={`font-bold ${gap >= 30 ? 'text-red-600' : gap >= 15 ? 'text-amber-700' : 'text-muted-foreground'}`}>
          격차 {gap}%p
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-emerald-300 rounded-full" style={{ width: `${aPct}%` }} />
        <div className="absolute inset-y-0 left-0 bg-sky-500 rounded-full" style={{ width: `${vPct}%` }} />
      </div>
    </div>
  );
}

// 반 카드의 주의 점수 — 큰 순으로 정렬해 "볼 것"이 위로
function attentionScore(o: PrincipalDesignOverview): number {
  const behindStudents = o.students.filter(s => s.behind >= BEHIND_LIMIT).length;
  return o.weakCount * 3 + behindStudents * 2 + o.unverifiedCount
    + (o.pace != null && o.pace >= 1.5 ? 5 : 0);
}

export function PrincipalBoard() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PrincipalDesignOverview[]>([]);
  const [flags, setFlags] = useState<PlanFlagRow[]>([]);
  const [openStudents, setOpenStudents] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const [ov, fl] = await Promise.all([fetchPrincipalOverview(), fetchOpenFlags()]);
      setOverview(ov);
      setFlags(fl);
    } catch (e: any) {
      toast.error(`불러오기 실패: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const sorted = useMemo(
    () => [...overview].sort((a, b) => attentionScore(b) - attentionScore(a)),
    [overview]
  );

  async function handleFlag(f: PlanFlagRow, status: 'acknowledged' | 'resolved') {
    try {
      await updateFlagStatus(f.id, status);
      if (status === 'resolved') setFlags(p => p.filter(x => x.id !== f.id));
      else setFlags(p => p.map(x => x.id === f.id ? { ...x, status } : x));
      toast.success(status === 'resolved' ? '해결 처리했어요' : '확인 표시했어요');
    } catch (e: any) { toast.error(e.message || String(e)); }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />원장 보드 — 격차 한눈에
        </h1>
        <p className="text-xs text-muted-foreground">
          나간 진도와 확인된 진도의 <b>격차</b>가 큰 반·학생부터 위로 옵니다
        </p>
        <Button variant="outline" size="sm" className="ml-auto" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />새로고침
        </Button>
      </div>

      {/* ═══ 에스컬레이션 — 교사 단계를 지나 원장에게 올라온 알림 ═══ */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <Siren className="w-4 h-4 text-red-600" />추가관리 알림
          {flags.length > 0 && <Badge variant="destructive" className="text-[11px]">{flags.length}</Badge>}
        </h2>
        {flags.length === 0 ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
            ✓ 올라온 알림 없음
          </p>
        ) : (
          <div className="space-y-1.5">
            {flags.map(f => (
              <div key={f.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm
                ${f.status === 'acknowledged' ? 'border-border bg-muted/30' : 'border-red-300 bg-red-50/60'}`}>
                <Badge variant="outline" className="text-[10px]">
                  {f.kind === 'pace' ? '진도 밀림' : '학습 신호'}
                </Badge>
                <span className="flex-1 min-w-[200px]">
                  {f.message}
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {f.design_title} · {f.created_at?.slice(0, 10)}
                  </span>
                </span>
                {f.status === 'open' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleFlag(f, 'acknowledged')}>
                    <Eye className="w-3.5 h-3.5 mr-1" />확인함
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs border-green-400 text-green-700"
                  onClick={() => handleFlag(f, 'resolved')}>
                  <Check className="w-3.5 h-3.5 mr-1" />해결
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ 반별 격차 카드 ═══ */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">반별 진행 상황 {overview.length > 0 && <span className="text-xs font-normal text-muted-foreground">— 주의 필요한 반부터</span>}</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg px-4 py-6 text-center">
            아직 진행 중인 수업 설계가 없습니다.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sorted.map(o => {
              const behindStudents = o.students.filter(s => s.behind >= BEHIND_LIMIT);
              const issueStudents = o.students.filter(s => s.weak > 0 || s.behind >= BEHIND_LIMIT || s.openQueue > 0);
              const calm = o.weakCount === 0 && o.unverifiedCount === 0 && behindStudents.length === 0
                && (o.pace == null || o.pace < 1.5);
              const isOpen = openStudents.has(o.designId);
              return (
                <Card key={o.designId} className={calm ? '' : 'border-amber-300/70'}>
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{o.title}</span>
                      <Badge variant="secondary" className="text-[11px]">{o.subject}</Badge>
                      <span className="text-xs text-muted-foreground">{o.teacherName} · {o.students.length}명</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {o.groupDone}/{o.total} 목표{o.targetDate ? ` · ~${o.targetDate}` : ''}
                      </span>
                    </div>

                    <GapBar advanced={o.advancedRate} verified={o.verifiedRate} />

                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {o.unverifiedCount > 0 && (
                        <Badge variant="outline" className="border-sky-400 text-sky-700 bg-sky-50">
                          미확인 {o.unverifiedCount}건 — 확인 도장 필요
                        </Badge>
                      )}
                      {o.weakCount > 0 && (
                        <Badge variant="outline" className="border-red-400 text-red-600 bg-red-50">
                          미흡 {o.weakCount}건
                        </Badge>
                      )}
                      {(o.queueTeacher + o.queueAssistant) > 0 && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                          밀린 할 일 — 교사 {o.queueTeacher} · 조교 {o.queueAssistant}
                        </Badge>
                      )}
                      {o.pace != null && o.pace >= 1.5 && (
                        <Badge variant="outline" className="border-red-400 text-red-600 bg-red-50">
                          ⚠ 페이스 무리 — 회당 {o.pace.toFixed(1)}개 필요
                        </Badge>
                      )}
                      {behindStudents.length > 0 && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                          뒤처짐 {behindStudents.length}명 — {behindStudents.map(s => s.name).join(', ')}
                        </Badge>
                      )}
                      {calm && (
                        <Badge variant="outline" className="border-green-400 text-green-700 bg-green-50">
                          ✓ 특이사항 없음
                        </Badge>
                      )}
                    </div>

                    {issueStudents.length > 0 && !isOpen && (
                      <p className="text-[11px] text-muted-foreground">
                        주의 학생: {issueStudents.map(s =>
                          `${s.name}(${[s.weak > 0 ? `미흡${s.weak}` : '', s.behind >= BEHIND_LIMIT ? `-${s.behind}목표` : '', s.openQueue > 0 ? `할일${s.openQueue}` : ''].filter(Boolean).join('·')})`
                        ).join(' ')}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1 border-t">
                      <button
                        className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground"
                        onClick={() => setOpenStudents(prev => {
                          const n = new Set(prev);
                          n.has(o.designId) ? n.delete(o.designId) : n.add(o.designId);
                          return n;
                        })}>
                        학생별 상세 <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      <Button asChild size="sm" variant="ghost" className="ml-auto h-7 text-xs">
                        <Link to={`/plan/${o.designId}/today`}><Play className="w-3.5 h-3.5 mr-1" />수업 화면</Link>
                      </Button>
                    </div>

                    {isOpen && (
                      <div className="space-y-1">
                        {o.students.map(s => (
                          <div key={s.studentId} className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs
                            ${s.weak > 0 || s.behind >= BEHIND_LIMIT ? 'border-amber-300 bg-amber-50/50' : 'bg-background'}`}>
                            <b className="min-w-[56px]">{s.name}</b>
                            {s.type && <span className={`text-[10px] font-bold ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                            <span className="text-muted-foreground">나감 {s.done}/{o.total}</span>
                            <span className="text-sky-700">✓이해 {s.verifiedOk}</span>
                            {s.weak > 0 && <span className="text-red-600 font-bold">✗미흡 {s.weak}</span>}
                            {s.unverified > 0 && <span className="text-muted-foreground">미확인 {s.unverified}</span>}
                            {s.behind >= BEHIND_LIMIT && <span className="text-amber-700 font-bold">뒤처짐 -{s.behind}</span>}
                            {s.openQueue > 0 && <span className="text-amber-700">할 일 {s.openQueue}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
