// LESSON-PLAN-CORE-V1: 수업 계획 — 오늘 수업(자동) + 전체 설계 관리
import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { DesignWizard } from '@/components/plan/DesignWizard';
import {
  fetchDesigns, fetchIntensives, fetchCoTeachers, fetchRostersFor, fetchTodayIntensiveDesignIds,
  ROLE_LABELS, DAY_LABELS, SessionRole, PlanIntensive, PlanCoTeacher, RosterStudent,
} from '@/components/plan/planApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { NotebookPen, Plus, CalendarClock, Play, Sparkles, Users, Sun } from 'lucide-react';
import { IntensiveModal } from '@/components/plan/IntensiveModal';
import { CoTeacherModal } from '@/components/plan/CoTeacherModal';

const TYPE_COLORS: Record<string, string> = { A: 'text-violet-700', B: 'text-sky-700', C: 'text-amber-700' };
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];

function PlanHome() {
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [intensiveDesignId, setIntensiveDesignId] = useState<string | null>(null);
  const [coTeacherDesign, setCoTeacherDesign] = useState<{ id: string; teacher_id: string | null } | null>(null);
  const [extMap, setExtMap] = useState<Record<string, { intensives: PlanIntensive[]; coTeachers: PlanCoTeacher[] }>>({});
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [todayIntensive, setTodayIntensive] = useState<Set<string>>(new Set());

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayDow = now.getDay();

  async function load() {
    setLoading(true);
    try {
      const list = await fetchDesigns();
      setDesigns(list);
      const ids = list.map((d: any) => d.id);
      const [rosterMap, intensiveToday] = await Promise.all([
        fetchRostersFor(ids),
        fetchTodayIntensiveDesignIds(todayStr),
      ]);
      setRosters(rosterMap);
      setTodayIntensive(intensiveToday);
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
        onDone={() => { setWizardOpen(false); load(); }}
        onCancel={() => setWizardOpen(false)}
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
        <Button className="ml-auto" onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />새 수업 설계
        </Button>
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
          {/* ═══ 오늘 수업 ═══ */}
          <section className="space-y-2">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Sun className="w-4 h-4 text-amber-500" />오늘 수업
              {todayDesigns.length > 0 && <Badge className="text-[11px]">{todayDesigns.length}개 반</Badge>}
            </h2>
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
                        <Button asChild className="w-full">
                          <Link to={`/plan/${d.id}/today`}>
                            <Play className="w-4 h-4 mr-1" />오늘 수업 시작
                          </Link>
                        </Button>
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
                        <Button asChild size="sm" variant="ghost" className="ml-auto">
                          <Link to={`/plan/${d.id}/today`}>
                            <Play className="w-4 h-4 mr-1" />수업 열기
                          </Link>
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
