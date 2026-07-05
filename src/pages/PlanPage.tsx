// LESSON-PLAN-CORE-V1: 수업 계획 — 설계 목록 + 새 설계 위저드
import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { DesignWizard } from '@/components/plan/DesignWizard';
import { fetchDesigns, ROLE_LABELS, DAY_LABELS, SessionRole } from '@/components/plan/planApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { NotebookPen, Plus, CalendarClock, Play, Sparkles, Users } from 'lucide-react';
import { IntensiveModal } from '@/components/plan/IntensiveModal';
import { CoTeacherModal } from '@/components/plan/CoTeacherModal';
import { fetchIntensives, fetchCoTeachers, PlanIntensive, PlanCoTeacher } from '@/components/plan/planApi';

function PlanHome() {
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [intensiveDesignId, setIntensiveDesignId] = useState<string | null>(null);
  const [coTeacherDesign, setCoTeacherDesign] = useState<{ id: string; teacher_id: string | null } | null>(null);
  const [extMap, setExtMap] = useState<Record<string, { intensives: PlanIntensive[]; coTeachers: PlanCoTeacher[] }>>({});

  async function load() {
    setLoading(true);
    try {
      const list = await fetchDesigns();
      setDesigns(list);
      const map: Record<string, { intensives: PlanIntensive[]; coTeachers: PlanCoTeacher[] }> = {};
      await Promise.all(list.map(async (d: any) => {
        const [ints, cos] = await Promise.all([fetchIntensives(d.id), fetchCoTeachers(d.id)]);
        map[d.id] = { intensives: ints, coTeachers: cos };
      }));
      setExtMap(map);
    } catch { setDesigns([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (wizardOpen) {
    return (
      <DesignWizard
        onDone={() => { setWizardOpen(false); load(); }}
        onCancel={() => setWizardOpen(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <NotebookPen className="w-5 h-5" />수업 계획
        </h1>
        <span className="text-sm text-muted-foreground">설계 한 번이면 매 수업이 자동으로 준비됩니다</span>
        <Button className="ml-auto" onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />새 수업 설계
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-36 w-full" />)}
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
        <div className="grid gap-3 md:grid-cols-2">
          {designs.map(d => {
            const rhythmEntries = Object.entries(d.rhythm || {}) as [string, SessionRole][];
            return (
              <Card key={d.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{d.title || d.plan_tracks?.title}</span>
                    <Badge variant="secondary">{d.plan_tracks?.subject}</Badge>
                    {d.teaching_mode === 'abc' && <Badge variant="outline">A/B/C 분화</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    트랙: {d.plan_tracks?.title}{d.plan_tracks?.textbook ? ` (${d.plan_tracks.textbook})` : ''}
                  </p>
                  <p className="text-sm flex items-center gap-1.5 flex-wrap">
                    <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
                    {rhythmEntries.map(([day, role]) =>
                      `${DAY_LABELS[Number(day)]} ${ROLE_LABELS[role] || role}`).join(' · ')}
                    {d.target_date && <span className="text-muted-foreground">· ~{d.target_date}</span>}
                  </p>
                  {(extMap[d.id]?.intensives?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {extMap[d.id].intensives.map(it => (
                        <Badge key={it.id} variant="outline" className="border-primary/50 text-primary">
                          <Sparkles className="w-3 h-3 mr-1" />{it.label} · {it.added_sessions}회 ({it.start_date}~{it.end_date})
                        </Badge>
                      ))}
                    </div>
                  )}
                  {(extMap[d.id]?.coTeachers?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {extMap[d.id].coTeachers.map(c => (
                        <Badge key={c.id} variant="outline">
                          <Users className="w-3 h-3 mr-1" />{c.teacher_name} ({c.start_date}~{c.end_date})
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" onClick={() => setIntensiveDesignId(d.id)}>
                      <Sparkles className="w-3.5 h-3.5 mr-1" />특강 추가
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCoTeacherDesign({ id: d.id, teacher_id: d.teacher_id })}>
                      <Users className="w-3.5 h-3.5 mr-1" />공동 선생님
                    </Button>
                    <Button asChild size="sm" className="ml-auto">
                      <Link to={`/plan/${d.id}/today`}>
                        <Play className="w-4 h-4 mr-1" />오늘 수업 열기
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {intensiveDesignId && (
        <IntensiveModal
          open={!!intensiveDesignId}
          designId={intensiveDesignId}
          onClose={() => setIntensiveDesignId(null)}
          onDone={load}
        />
      )}
      {coTeacherDesign && (
        <CoTeacherModal
          open={!!coTeacherDesign}
          designId={coTeacherDesign.id}
          defaultTeacherId={coTeacherDesign.teacher_id}
          onClose={() => setCoTeacherDesign(null)}
          onDone={load}
        />
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
