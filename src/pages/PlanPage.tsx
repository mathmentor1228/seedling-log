// LESSON-PLAN-CORE-V1: 수업 계획 — 오늘 수업(자동) + 전체 설계 관리
import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DesignWizard } from '@/components/plan/DesignWizard';
import {
  fetchDesigns, fetchIntensives, fetchCoTeachers, fetchRostersFor, fetchTodayIntensiveDesignIds,
  fetchBriefings, fetchPlannerStatus, fetchTrackProgress, fetchTracks, fetchGoals,
  cancelSession, uncancelSession, fetchSessionStatusFor, SessionStatusInfo,
  fetchLessonLogStatusFor, LessonLogStatus,
  ROLE_LABELS, DAY_LABELS, SessionRole, PlanIntensive, PlanCoTeacher, RosterStudent,
  PlanBriefing, PrinterStatus, PlanProgress,
} from '@/components/plan/planApi';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NotebookPen, Plus, CalendarClock, Play, Sparkles, Users, Sun, UserCheck, Check, Printer, ClipboardCheck, UserCog, MapPin, ShieldCheck, CalendarX } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { IntensiveModal } from '@/components/plan/IntensiveModal';
import { CoTeacherModal } from '@/components/plan/CoTeacherModal';
import { RosterManagerModal } from '@/components/plan/RosterManagerModal';
import { ProgressAdjustModal } from '@/components/plan/ProgressAdjustModal';

const TYPE_COLORS: Record<string, string> = { A: 'text-violet-700', B: 'text-sky-700', C: 'text-amber-700' };
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 커리큘럼 진행 위치 — 눈에 띄는 진도 막대
function TrackProgressBar({ p }: { p?: PlanProgress }) {
  if (!p || p.total === 0) return null;
  const pct = Math.round((p.done / p.total) * 100);
  // 학생별 편차: 나간 수의 최대·최소 차이
  const dones = p.perStudent.map(s => s.done);
  const spread = dones.length > 1 ? Math.max(...dones) - Math.min(...dones) : 0;
  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-bold text-emerald-800">
          🌱 {p.done}/{p.total} 목표 · {pct}%
        </span>
        {p.currentTitle && (
          <span className="text-[11px] text-emerald-700 truncate max-w-[55%]" title={p.currentTitle}>
            지금: {p.currentTitle}
          </span>
        )}
      </div>
      <div className="h-2.5 rounded-full bg-emerald-100 overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      {spread >= 2 && (
        <p className="text-[11px] text-amber-700 mt-1">⚠ 학생별 진도 편차 {spread}단원 — 개인별 확인 권장</p>
      )}
    </div>
  );
}

function PlanHome() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTrackOnly, setWizardTrackOnly] = useState(false);
  const [editTrackId, setEditTrackId] = useState<string | null>(null);
  const [trackListOpen, setTrackListOpen] = useState(false);
  const [tracks, setTracks] = useState<any[]>([]);
  const [intensiveDesignId, setIntensiveDesignId] = useState<string | null>(null);
  const [coTeacherDesign, setCoTeacherDesign] = useState<{ id: string; teacher_id: string | null } | null>(null);
  const [rosterDesign, setRosterDesign] = useState<{ id: string; track_id: string; teaching_mode: string; title: string } | null>(null);
  const [adjustDesign, setAdjustDesign] = useState<{ id: string; track_id: string; end_goal_id: string | null; title: string } | null>(null);
  const [extMap, setExtMap] = useState<Record<string, { intensives: PlanIntensive[]; coTeachers: PlanCoTeacher[] }>>({});
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [todayIntensive, setTodayIntensive] = useState<Set<string>>(new Set());
  const [briefings, setBriefings] = useState<Record<string, PlanBriefing>>({});
  const [printStatus, setPrintStatus] = useState<Record<string, PrinterStatus>>({});
  const [progressMap, setProgressMap] = useState<Record<string, PlanProgress>>({});
  // 대상 선택(전체/개인) 다이얼로그
  const [startFor, setStartFor] = useState<{ id: string; title: string; roster: RosterStudent[] } | null>(null);
  const [pickIds, setPickIds] = useState<Set<string>>(new Set());
  // PLAN-CANCEL-V1: 휴강 처리
  const [sessionStatus, setSessionStatus] = useState<Record<string, SessionStatusInfo>>({});
  const [cancelFor, setCancelFor] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  function openStart(d: any) {
    setPickIds(new Set());
    setStartFor({ id: d.id, title: d.title || d.plan_tracks?.title, roster: rosters[d.id] || [] });
  }
  function goStart(individual: boolean) {
    if (!startFor) return;
    const params = new URLSearchParams();
    if (individual && pickIds.size > 0) params.set('only', Array.from(pickIds).join(','));
    if (!isRealToday) params.set('date', selectedDate);
    const qs = params.toString();
    navigate(`/plan/${startFor.id}/today${qs ? `?${qs}` : ''}`);
  }

  // PLAN-CANCEL-V1: 휴강 확정 — 세션 cancelled + 이날 마감 숙제를 다음 수업일로
  async function doCancel() {
    if (!cancelFor) return;
    try {
      const { hwShifted, nextDate } = await cancelSession(cancelFor, todayStr, cancelReason);
      toast.success(`휴강 처리 완료${hwShifted > 0 && nextDate ? ` — 숙제 마감 ${hwShifted}건 → ${nextDate}로 밀림` : ''}`);
      setCancelFor(null);
      setCancelReason('');
      load();
    } catch (e: any) {
      const msg = String(e?.message || e);
      toast.error(msg.includes('constraint') || msg.includes('cancel_reason') || msg.includes('column')
        ? '휴강 기능의 DB 반영이 필요해요 — plan_session_cancel 마이그레이션을 먼저 적용해주세요'
        : `휴강 처리 실패: ${msg}`);
    }
  }

  const realToday = new Date();
  const realTodayStr = realToday.toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(realTodayStr);
  const isRealToday = selectedDate === realTodayStr;
  const now = useMemo(() => new Date(selectedDate + 'T12:00:00'), [selectedDate]);
  const todayStr = selectedDate;
  const todayDow = now.getDay();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  async function load() {
    setLoading(true);
    try {
      const list = await fetchDesigns();
      setDesigns(list);
      const ids = list.map((d: any) => d.id);
      const [rosterMap, intensiveToday, briefMap, printMap, progMap, statusMap] = await Promise.all([
        fetchRostersFor(ids),
        fetchTodayIntensiveDesignIds(todayStr),
        fetchBriefings(ids, todayStr),
        fetchPlannerStatus(list.map((d: any) => ({ id: d.id, updated_at: d.updated_at })), periodMonth),
        fetchTrackProgress(list.map((d: any) => ({ id: d.id, track_id: d.track_id, end_goal_id: d.end_goal_id }))),
        fetchSessionStatusFor(ids, todayStr),
      ]);
      setRosters(rosterMap);
      setTodayIntensive(intensiveToday);
      setBriefings(briefMap);
      setPrintStatus(printMap);
      setProgressMap(progMap);
      setSessionStatus(statusMap);
      const map: Record<string, { intensives: PlanIntensive[]; coTeachers: PlanCoTeacher[] }> = {};
      await Promise.all(list.map(async (d: any) => {
        const [ints, cos] = await Promise.all([fetchIntensives(d.id), fetchCoTeachers(d.id)]);
        map[d.id] = { intensives: ints, coTeachers: cos };
      }));
      setExtMap(map);
    } catch { setDesigns([]); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedDate]);

  // 오늘 수업 = 리듬에 오늘 요일이 있거나(정규) 오늘 특강 세션이 있는 설계
  const { todayDesigns, otherDesigns } = useMemo(() => {
    const today: any[] = [], other: any[] = [];
    for (const d of designs) {
      const regular = Object.keys(d.rhythm || {}).includes(String(todayDow));
      if (regular || todayIntensive.has(d.id)) today.push(d);
      else other.push(d);
    }
    return { todayDesigns: today, otherDesigns: other };
  }, [designs, todayDow, todayIntensive]);

  async function openTrackList() {
    setTrackListOpen(true);
    try {
      const ts = await fetchTracks();
      const withCounts = await Promise.all(ts.map(async (t: any) => {
        const gs = await fetchGoals(t.id).catch(() => []);
        return { ...t, goalCount: gs.length };
      }));
      setTracks(withCounts);
    } catch { setTracks([]); }
  }

  if (wizardOpen) {
    return (
      <DesignWizard
        trackOnly={wizardTrackOnly}
        editTrackId={editTrackId}
        onDone={() => { setWizardOpen(false); setWizardTrackOnly(false); setEditTrackId(null); load(); }}
        onCancel={() => { setWizardOpen(false); setWizardTrackOnly(false); setEditTrackId(null); }}
      />
    );
  }

  function roleToday(d: any): SessionRole | null {
    return (d.rhythm || {})[String(todayDow)] || (todayIntensive.has(d.id) ? 'progress' : null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <NotebookPen className="w-5 h-5" />수업 계획
        </h1>
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${isRealToday ? 'border-primary/30 bg-primary/5' : 'border-amber-400 bg-amber-50'}`}>
          <label className="text-xs font-semibold whitespace-nowrap">📅 기준일</label>
          <input
            type="date"
            value={selectedDate}
            max={realTodayStr}
            onChange={(e) => setSelectedDate(e.target.value || realTodayStr)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {!isRealToday && (
            <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => setSelectedDate(realTodayStr)}>오늘로</Button>
          )}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {now.getMonth() + 1}월 {now.getDate()}일 ({WEEK_KO[todayDow]})
          </span>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          {role === 'admin' && (
            <Button variant="outline" asChild>
              <Link to="/plan/overview">
                <ShieldCheck className="w-4 h-4 mr-1" />원장 보드
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={openTrackList}>
            <NotebookPen className="w-4 h-4 mr-1" />커리큘럼 관리
          </Button>
          <Button variant="outline" onClick={() => { setWizardTrackOnly(true); setEditTrackId(null); setWizardOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />커리큘럼 만들기
          </Button>
          <Button onClick={() => { setWizardTrackOnly(false); setEditTrackId(null); setWizardOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />새 수업 설계
          </Button>
        </div>
      </div>

      {!isRealToday && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>과거 날짜({selectedDate})</b> 기준으로 표시 중 — 놓친 진도·숙제·수업일지를 이어서 기입할 수 있어요.
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : designs.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center space-y-3">
            <p className="text-3xl">📋</p>
            <p className="font-semibold">아직 수업 설계가 없습니다</p>
            <p className="text-sm text-muted-foreground">
              "새 수업 설계"를 누르면 여섯 개의 질문이 나옵니다.<br />
              무엇을 · 어떻게 · 확인은 · 미달 관리 · 리듬 · 기한 — 답하면 설계 끝.
            </p>
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />첫 설계 시작하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 플래너 재출력 알람 */}
          {(() => {
            const need = designs.filter(d => printStatus[d.id] === 'never' || printStatus[d.id] === 'outdated');
            if (need.length === 0) return null;
            return (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex items-center gap-2 mb-1.5">
                  <Printer className="w-4 h-4 shrink-0" />
                  <span className="font-bold">학생 플래너 출력 필요 {need.length}건</span>
                  <span className="text-xs">({now.getMonth() + 1}월 · 계획 수정 반영)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {need.map(d => (
                    <Button key={d.id} asChild size="sm" variant="outline" className="h-7 border-amber-400 text-amber-900">
                      <Link to={`/plan/${d.id}/planner`}>
                        {d.title || d.plan_tracks?.title}
                        <span className="ml-1 text-[10px]">{printStatus[d.id] === 'outdated' ? '계획변경' : '이번달 미출력'}</span>
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ═══ 오늘(또는 선택 날짜) 수업 ═══ */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${isRealToday ? 'bg-amber-100 text-amber-600' : 'bg-amber-200 text-amber-800'}`}>
                <Sun className="w-4.5 h-4.5" />
              </div>
              <h2 className="font-bold">
                {isRealToday ? '오늘 수업' : `${now.getMonth() + 1}월 ${now.getDate()}일(${WEEK_KO[todayDow]}) 수업`}
              </h2>
              {todayDesigns.length > 0 && <Badge className="text-[11px]">{todayDesigns.length}개 반</Badge>}
              {!isRealToday && <span className="text-xs text-amber-700">← 이 날짜의 수업일지를 이어서 기입</span>}
            </div>
            {todayDesigns.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-lg px-4 py-3 bg-muted/20">
                {isRealToday ? '오늘' : `${now.getMonth() + 1}/${now.getDate()}(${WEEK_KO[todayDow]})`} 예정된 수업이 없습니다. 아래 전체 설계에서 아무 반이나 "수업 열기"로 그 날짜 수업을 시작할 수 있어요.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {todayDesigns.map(d => {
                  const roster = rosters[d.id] || [];
                  const role = roleToday(d);
                  return (
                    <Card key={d.id} className="border-primary/40 shadow-sm">
                      <CardContent className="p-5 space-y-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold">{d.title || d.plan_tracks?.title}</span>
                          <Badge variant="secondary">{d.plan_tracks?.subject}</Badge>
                          {todayIntensive.has(d.id) && (
                            <Badge variant="outline" className="border-primary/60 text-primary">
                              <Sparkles className="w-3 h-3 mr-1" />특강
                            </Badge>
                          )}
                          {role && <Badge variant="outline" className="text-[11px]">{ROLE_LABELS[role]}</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {roster.length === 0 ? (
                            <span className="text-xs text-muted-foreground">명단 없음</span>
                          ) : roster.map(s => (
                            <span key={s.id} className="text-sm rounded-full bg-muted px-2.5 py-0.5">
                              {s.name}{s.type && <span className={`ml-1 text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {roster.length}명 · 트랙: {d.plan_tracks?.title}
                        </p>
                        <TrackProgressBar p={progressMap[d.id]} />
                        {(() => {
                          const b = briefings[d.id];
                          if (!b) return null;
                          const items: { label: string; names: string[]; cls: string }[] = [
                            { label: '재시험', names: b.retest, cls: 'text-red-600' },
                            { label: '보충', names: b.makeup, cls: 'text-amber-700' },
                            { label: '미흡', names: b.weak, cls: 'text-amber-700' },
                            { label: '🔁 복습', names: b.review, cls: 'text-violet-700' },
                            { label: '신호 주의', names: b.flagged, cls: 'text-red-600' },
                          ].filter(x => x.names.length > 0);
                          if (items.length === 0) {
                            return (
                              <p className="text-xs text-green-700 bg-green-50 rounded-md px-2.5 py-1.5 flex items-center gap-1">
                                <ClipboardCheck className="w-3.5 h-3.5" />오늘 특별히 확인할 것 없음 — 바로 진행
                              </p>
                            );
                          }
                          return (
                            <div className="text-xs bg-muted/50 rounded-md px-2.5 py-1.5 space-y-0.5">
                              <p className="font-bold flex items-center gap-1 text-muted-foreground">
                                <ClipboardCheck className="w-3.5 h-3.5" />수업 전 확인
                              </p>
                              {items.map(it => (
                                <p key={it.label}>
                                  <span className={`font-bold ${it.cls}`}>{it.label} {it.names.length}</span>
                                  <span className="text-muted-foreground"> — {it.names.join(', ')}</span>
                                </p>
                              ))}
                            </div>
                          );
                        })()}
                        {/* PLAN-CANCEL-V1: 휴강이면 시작 대신 휴강 배너 */}
                        {sessionStatus[d.id]?.status === 'cancelled' ? (
                          <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5 space-y-1.5">
                            <p className="text-sm font-bold text-orange-800 flex items-center gap-1.5">
                              <CalendarX className="w-4 h-4" />오늘 휴강
                              {sessionStatus[d.id]?.cancelReason && (
                                <span className="font-normal text-orange-700">— {sessionStatus[d.id].cancelReason}</span>
                              )}
                            </p>
                            <p className="text-[11px] text-orange-700">
                              진도는 남은 수업에 자동 재분배되고, 오늘 마감 숙제는 다음 수업일로 밀렸어요.
                            </p>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-orange-400 text-orange-800"
                              onClick={async () => {
                                try {
                                  await uncancelSession(d.id, todayStr);
                                  toast.success('휴강을 취소했어요 — 수업을 열 수 있습니다');
                                  load();
                                } catch (e: any) { toast.error(e.message || String(e)); }
                              }}>
                              휴강 취소
                            </Button>
                          </div>
                        ) : (
                        <div className="flex gap-2">
                          <Button asChild className="flex-1">
                            <Link to={`/plan/${d.id}/today${isRealToday ? '' : `?date=${selectedDate}`}`}>
                              <Play className="w-4 h-4 mr-1" />{isRealToday ? '오늘 수업 시작' : `${now.getMonth() + 1}/${now.getDate()} 수업 기입`}
                            </Link>
                          </Button>
                          <Button variant="outline" onClick={() => openStart(d)} title="개인만 골라서 수업">
                            <UserCheck className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" title="명단 관리 (추가·제외)"
                            onClick={() => setRosterDesign({ id: d.id, track_id: d.track_id, teaching_mode: d.teaching_mode, title: d.title || d.plan_tracks?.title })}>
                            <UserCog className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" title="진도 위치 조정 (기록이 실제와 다를 때)"
                            onClick={() => setAdjustDesign({ id: d.id, track_id: d.track_id, end_goal_id: d.end_goal_id || null, title: d.title || d.plan_tracks?.title })}>
                            <MapPin className="w-4 h-4" />
                          </Button>
                          <Button asChild variant="outline" title="학생 플래너 인쇄">
                            <Link to={`/plan/${d.id}/planner`}><Printer className="w-4 h-4" /></Link>
                          </Button>
                          <Button variant="outline" title="휴강 처리 — 사유 기록, 진도·숙제 자동 밀림"
                            className="text-orange-700 border-orange-300 hover:bg-orange-50"
                            onClick={() => { setCancelReason(''); setCancelFor(d); }}>
                            <CalendarX className="w-4 h-4" />
                          </Button>
                        </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* ═══ 전체 수업 설계 ═══ */}
          <section className="space-y-2">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <NotebookPen className="w-4 h-4" />전체 수업 설계
              <span className="text-xs font-normal text-muted-foreground">특강·공동 선생님 관리 / 아무 날이나 수업 열기</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {(otherDesigns.length ? otherDesigns : []).map(d => {
                const rhythmEntries = Object.entries(d.rhythm || {}) as [string, SessionRole][];
                const roster = rosters[d.id] || [];
                return (
                  <Card key={d.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">{d.title || d.plan_tracks?.title}</span>
                        <Badge variant="secondary">{d.plan_tracks?.subject}</Badge>
                        {d.teaching_mode === 'abc' && <Badge variant="outline">A/B/C</Badge>}
                        <span className="text-xs text-muted-foreground ml-auto">{roster.length}명</span>
                      </div>
                      <p className="text-sm flex items-center gap-1.5 flex-wrap text-muted-foreground">
                        <CalendarClock className="w-3.5 h-3.5" />
                        {rhythmEntries.map(([day, role]) => `${DAY_LABELS[Number(day)]} ${ROLE_LABELS[role] || role}`).join(' · ')}
                        {d.target_date && <span>· ~{d.target_date}</span>}
                      </p>
                      <TrackProgressBar p={progressMap[d.id]} />
                      {(extMap[d.id]?.intensives?.length || 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {extMap[d.id].intensives.map(it => (
                            <Badge key={it.id} variant="outline" className="border-primary/50 text-primary text-[11px]">
                              <Sparkles className="w-3 h-3 mr-1" />{it.label} {it.added_sessions}회 ({it.start_date}~{it.end_date})
                            </Badge>
                          ))}
                        </div>
                      )}
                      {(extMap[d.id]?.coTeachers?.length || 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {extMap[d.id].coTeachers.map(c => (
                            <Badge key={c.id} variant="outline" className="text-[11px]">
                              <Users className="w-3 h-3 mr-1" />{c.teacher_name} ({c.start_date}~{c.end_date})
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2 border-t flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setIntensiveDesignId(d.id)}>
                          <Sparkles className="w-3.5 h-3.5 mr-1" />특강
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setCoTeacherDesign({ id: d.id, teacher_id: d.teacher_id })}>
                          <Users className="w-3.5 h-3.5 mr-1" />공동T
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => setRosterDesign({ id: d.id, track_id: d.track_id, teaching_mode: d.teaching_mode, title: d.title || d.plan_tracks?.title })}>
                          <UserCog className="w-3.5 h-3.5 mr-1" />명단
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => setAdjustDesign({ id: d.id, track_id: d.track_id, end_goal_id: d.end_goal_id || null, title: d.title || d.plan_tracks?.title })}>
                          <MapPin className="w-3.5 h-3.5 mr-1" />진도
                        </Button>
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openStart(d)}>
                          <Play className="w-4 h-4 mr-1" />수업 열기
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {otherDesigns.length === 0 && (
                <p className="text-sm text-muted-foreground md:col-span-2">모든 설계가 오늘 수업에 있습니다.</p>
              )}
            </div>
          </section>
        </>
      )}

      {intensiveDesignId && (
        <IntensiveModal open={!!intensiveDesignId} designId={intensiveDesignId}
          onClose={() => setIntensiveDesignId(null)} onDone={load} />
      )}
      {coTeacherDesign && (
        <CoTeacherModal open={!!coTeacherDesign} designId={coTeacherDesign.id}
          defaultTeacherId={coTeacherDesign.teacher_id}
          onClose={() => setCoTeacherDesign(null)} onDone={load} />
      )}
      {rosterDesign && (
        <RosterManagerModal open={!!rosterDesign} designId={rosterDesign.id}
          trackId={rosterDesign.track_id} teachingMode={rosterDesign.teaching_mode}
          title={rosterDesign.title}
          onClose={() => setRosterDesign(null)} onDone={load} />
      )}
      {adjustDesign && (
        <ProgressAdjustModal open={!!adjustDesign} designId={adjustDesign.id}
          trackId={adjustDesign.track_id} endGoalId={adjustDesign.end_goal_id}
          title={adjustDesign.title}
          onOpenChange={o => { if (!o) setAdjustDesign(null); }}
          onChanged={load} />
      )}

      {/* 수업 대상 선택: 전체 그룹 / 개인만 */}
      <Dialog open={!!startFor} onOpenChange={o => !o && setStartFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{startFor?.title} — 누구와 수업할까요?</DialogTitle>
          </DialogHeader>
          <button
            className="w-full rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-left hover:bg-primary/10 transition"
            onClick={() => goStart(false)}>
            <p className="font-bold flex items-center gap-1.5"><Users className="w-4 h-4" />전체 그룹</p>
            <p className="text-sm text-muted-foreground">{startFor?.roster.length}명 전원과 수업</p>
          </button>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />개인만 — 온 학생만 골라서 (보충·개별)
            </p>
            <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
              {(startFor?.roster || []).map(s => {
                const picked = pickIds.has(s.id);
                return (
                  <button key={s.id}
                    className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left ${picked ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                    onClick={() => setPickIds(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                    <span>{s.name}{s.type && <span className={`ml-1 text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}</span>
                    {picked && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
            <Button className="w-full" disabled={pickIds.size === 0} onClick={() => goStart(true)}>
              선택한 {pickIds.size}명과 개인 수업 시작
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PLAN-CANCEL-V1: 휴강 처리 — 사유 입력 */}
      <Dialog open={!!cancelFor} onOpenChange={o => !o && setCancelFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <CalendarX className="w-4 h-4 text-orange-600" />
              {cancelFor?.title || cancelFor?.plan_tracks?.title} — {now.getMonth() + 1}/{now.getDate()} 휴강 처리
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">
              휴강하면 이 날 수업은 기록 없이 닫히고, 남은 목표는 이후 수업에 <b>자동 재분배</b>됩니다.
              오늘 마감이던 숙제는 <b>다음 수업일로 마감이 밀려</b> 숙제검사도 다음 시간에 하게 돼요.
            </p>
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1">휴강 사유</p>
              <Input placeholder="예: 학교 시험 전날 / 원장 지시 / 태풍 휴원"
                value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doCancel(); }} autoFocus />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setCancelFor(null)}>닫기</Button>
              <Button className="flex-1 bg-orange-600 hover:bg-orange-700" onClick={doCancel}>
                휴강 확정
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 커리큘럼 관리 — 트랙 목록 → 수정 */}
      <Dialog open={trackListOpen} onOpenChange={setTrackListOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>커리큘럼 관리</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">만든 커리큘럼(트랙)을 골라 목표·페이지·순서를 실시간으로 수정할 수 있어요.</p>
          <div className="max-h-80 overflow-y-auto rounded-lg border divide-y">
            {tracks.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">아직 만든 커리큘럼이 없습니다.</p>
            ) : tracks.map(t => (
              <button key={t.id}
                className="flex items-center justify-between w-full px-3.5 py-2.5 text-left hover:bg-muted/40"
                onClick={() => { setTrackListOpen(false); setEditTrackId(t.id); setWizardTrackOnly(false); setWizardOpen(true); }}>
                <span>
                  <span className="font-medium text-sm">{t.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t.subject} · 목표 {t.goalCount}개{t.textbook ? ` · ${t.textbook}` : ''}</span>
                </span>
                <span className="text-xs text-primary font-semibold">수정 →</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PlanPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <PlanHome />
    </ProtectedRoute>
  );
}
