// LESSON-PLAN-CORE-V1: 수업 계획 — 오늘 수업(자동) + 전체 설계 관리
import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { DesignWizard } from '@/components/plan/DesignWizard';
import {
  fetchDesigns, fetchIntensives, fetchCoTeachers, fetchRostersFor, fetchTodayIntensiveDesignIds,
  fetchBriefings, fetchPlannerStatus,
  ROLE_LABELS, DAY_LABELS, SessionRole, PlanIntensive, PlanCoTeacher, RosterStudent,
  PlanBriefing, PrinterStatus,
} from '@/components/plan/planApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NotebookPen, Plus, CalendarClock, Play, Sparkles, Users, Sun, UserCheck, Check, Printer, ClipboardCheck, UserCog } from 'lucide-react';
import { IntensiveModal } from '@/components/plan/IntensiveModal';
import { CoTeacherModal } from '@/components/plan/CoTeacherModal';
import { RosterManagerModal } from '@/components/plan/RosterManagerModal';

const TYPE_COLORS: Record<string, string> = { A: 'text-violet-700', B: 'text-sky-700', C: 'text-amber-700' };
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];

function PlanHome() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTrackOnly, setWizardTrackOnly] = useState(false);
  const [intensiveDesignId, setIntensiveDesignId] = useState<string | null>(null);
  const [coTeacherDesign, setCoTeacherDesign] = useState<{ id: string; teacher_id: string | null } | null>(null);
  const [rosterDesign, setRosterDesign] = useState<{ id: string; track_id: string; teaching_mode: string; title: string } | null>(null);
  const [extMap, setExtMap] = useState<Record<string, { intensives: PlanIntensive[]; coTeachers: PlanCoTeacher[] }>>({});
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [todayIntensive, setTodayIntensive] = useState<Set<string>>(new Set());
  const [briefings, setBriefings] = useState<Record<string, PlanBriefing>>({});
  const [printStatus, setPrintStatus] = useState<Record<string, PrinterStatus>>({});
  // 대상 선택(전체/개인) 다이얼로그
  const [startFor, setStartFor] = useState<{ id: string; title: string; roster: RosterStudent[] } | null>(null);
  const [pickIds, setPickIds] = useState<Set<string>>(new Set());

  function openStart(d: any) {
    setPickIds(new Set());
    setStartFor({ id: d.id, title: d.title || d.plan_tracks?.title, roster: rosters[d.id] || [] });
  }
  function goStart(individual: boolean) {
    if (!startFor) return;
    const only = individual && pickIds.size > 0 ? `?only=${Array.from(pickIds).join(',')}` : '';
    navigate(`/plan/${startFor.id}/today${only}`);
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayDow = now.getDay();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  async function load() {
    setLoading(true);
    try {
      const list = await fetchDesigns();
      setDesigns(list);
      const ids = list.map((d: any) => d.id);
      const [rosterMap, intensiveToday, briefMap, printMap] = await Promise.all([
        fetchRostersFor(ids),
        fetchTodayIntensiveDesignIds(todayStr),
        fetchBriefings(ids),
        fetchPlannerStatus(list.map((d: any) => ({ id: d.id, updated_at: d.updated_at })), periodMonth),
      ]);
      setRosters(rosterMap);
      setTodayIntensive(intensiveToday);
      setBriefings(briefMap);
      setPrintStatus(printMap);
      const map: Record<string, { intensives: PlanIntensive[]; coTeachers: PlanCoTeacher[] }> = {};
      await Promise.all(list.map(async (d: any) => {
        const [ints, cos] = await Promise.all([fetchIntensives(d.id), fetchCoTeachers(d.id)]);
        map[d.id] = { intensives: ints, coTeachers: cos };
      }));
      setExtMap(map);
    } catch { setDesigns([]); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

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

  if (wizardOpen) {
    return (
      <DesignWizard
        trackOnly={wizardTrackOnly}
        onDone={() => { setWizardOpen(false); setWizardTrackOnly(false); load(); }}
        onCancel={() => { setWizardOpen(false); setWizardTrackOnly(false); }}
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
        <span className="text-sm text-muted-foreground">
          {now.getMonth() + 1}월 {now.getDate()}일 ({WEEK_KO[todayDow]}) 기준
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => { setWizardTrackOnly(true); setWizardOpen(true); }}>
            <NotebookPen className="w-4 h-4 mr-1" />커리큘럼만 만들기
          </Button>
          <Button onClick={() => { setWizardTrackOnly(false); setWizardOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />새 수업 설계
          </Button>
        </div>
      </div>

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

          {/* ═══ 오늘 수업 ═══ */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-600">
                <Sun className="w-4.5 h-4.5" />
              </div>
              <h2 className="font-bold">오늘 수업</h2>
              {todayDesigns.length > 0 && <Badge className="text-[11px]">{todayDesigns.length}개 반</Badge>}
            </div>
            {todayDesigns.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-lg px-4 py-3 bg-muted/20">
                오늘({WEEK_KO[todayDow]}) 예정된 수업이 없습니다. 아래 전체 설계에서 아무 반이나 "오늘 수업 열기"로 임시 수업을 시작할 수 있어요.
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
                        {(() => {
                          const b = briefings[d.id];
                          if (!b) return null;
                          const items: { label: string; names: string[]; cls: string }[] = [
                            { label: '재시험', names: b.retest, cls: 'text-red-600' },
                            { label: '보충', names: b.makeup, cls: 'text-amber-700' },
                            { label: '미흡', names: b.weak, cls: 'text-amber-700' },
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
                        <div className="flex gap-2">
                          <Button asChild className="flex-1">
                            <Link to={`/plan/${d.id}/today`}>
                              <Play className="w-4 h-4 mr-1" />오늘 수업 시작
                            </Link>
                          </Button>
                          <Button variant="outline" onClick={() => openStart(d)} title="개인만 골라서 수업">
                            <UserCheck className="w-4 h-4" />
                          </Button>
                          <Button asChild variant="outline" title="학생 플래너 인쇄">
                            <Link to={`/plan/${d.id}/planner`}><Printer className="w-4 h-4" /></Link>
                          </Button>
                        </div>
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
                      <div className="flex gap-2 pt-2 border-t">
                        <Button size="sm" variant="outline" onClick={() => setIntensiveDesignId(d.id)}>
                          <Sparkles className="w-3.5 h-3.5 mr-1" />특강
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setCoTeacherDesign({ id: d.id, teacher_id: d.teacher_id })}>
                          <Users className="w-3.5 h-3.5 mr-1" />공동T
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
    </div>
  );
}

export default function PlanPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <AppLayout>
        <PlanHome />
      </AppLayout>
    </ProtectedRoute>
  );
}
