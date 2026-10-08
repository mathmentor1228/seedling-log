// EXAM-HUB-A: 내신대비 통합 화면 `/exam` — 메뉴 3개(보드·자료실·추이)를 사이클 기준 한 장으로.
// 설계·단계: vault 19 — 내신대비 통합 개편안 (2026-10-09). A단계 = 뼈대 + 시험 정보 + 학생 결과(누락 표시) + 시험지 분석 보기.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CalendarClock, ClipboardCheck, FileBarChart2, GraduationCap, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { normalizeSchool } from '@/components/exam-board/cycleUtils';
import { useExamHubData } from './useExamHubData';
import {
  buildStudentSubjectRows, cycleKey, cycleTitle, ddayLabel, ddayState, gradeLabel, reportInCycle, studentInCycle,
  type Cycle,
} from './examHubUtils';
import { ExamInfoTab } from './ExamInfoTab';
import { StudentResultsTab } from './StudentResultsTab';
import { PaperAnalysisTab } from './PaperAnalysisTab';

const ExamPrepScheduleManager = lazy(() => import('@/components/ExamPrepScheduleManager').then(m => ({ default: m.ExamPrepScheduleManager })));
const PrincipalDirectionBoard = lazy(() => import('@/components/exam-board/PrincipalDirectionBoard').then(m => ({ default: m.PrincipalDirectionBoard })));

const TABS = ['info', 'prep', 'results', 'papers', 'principal'] as const;
type Tab = (typeof TABS)[number];
const PAST_WINDOW_DAYS = 45;

export function ExamHub() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const data = useExamHubData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [allCycles, setAllCycles] = useState(!isTeacher);
  const today = getTodayKST();

  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') || '') ? (params.get('tab') as Tab) : 'info';
  const selectedId = params.get('cycle');

  // 담당 학생이 있는 사이클만 (강사 기본). 원장은 전체.
  const myStudentIds = useMemo(() => {
    if (!user?.id) return new Set<string>();
    const s = new Set<string>();
    data.classInfos.forEach(ci => { if (ci.teacher_id === user.id) s.add(ci.student_id); });
    data.links.forEach(l => { if (l.teacher_id === user.id) s.add(l.student_id); });
    return s;
  }, [data.classInfos, data.links, user?.id]);

  const cycleCards = useMemo(() => {
    return data.cycles.map(c => {
      const key = cycleKey(c);
      const subs = data.subjectsByCycle.get(c.id) || [];
      const cycleSubjects = subs.map(s => s.subject);
      const rows = buildStudentSubjectRows({
        cycle: c, key, students: data.students, classInfos: data.classInfos, links: data.links, teachers: data.teachers,
        results: data.results, cycleSubjects,
      });
      const reports = data.reports.filter(r => reportInCycle(r, c, key));
      const targets = data.students.filter(s => studentInCycle(s, c));
      const mine = targets.some(s => myStudentIds.has(s.id));
      const st = ddayState(c, today);
      const expected = rows.filter(r => r.status !== 'absent').length;
      const done = rows.filter(r => r.status === 'done').length;
      const missing = rows.filter(r => r.status === 'missing' || r.status === 'score_empty').length;
      const scoped = subs.filter(s => !!s.scope).length;
      return { cycle: c, key, subs, cycleSubjects, rows, reports, targets, mine, st, expected, done, missing, scoped };
    });
  }, [data, myStudentIds, today]);

  const visibleCards = useMemo(() => {
    const q = query.trim();
    return cycleCards.filter(cc => {
      const c = cc.cycle;
      if (!allCycles && isTeacher && !cc.mine) return false;
      const end = c.end_date || c.start_date;
      const isPast = !!end && end < today;
      if (!showPast && isPast) {
        const daysAgo = Math.round((new Date(today + 'T00:00:00').getTime() - new Date(end + 'T00:00:00').getTime()) / 86400000);
        if (daysAgo > PAST_WINDOW_DAYS) return false;
      }
      if (q) {
        const hay = [c.school_name, gradeLabel(c), c.semester, c.exam_type, String(c.academic_year), ...cc.cycleSubjects, ...cc.targets.map(s => s.name)].join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // 진행 중 → 다가오는 순 → 최근 종료 순
      const rank = (s: ReturnType<typeof ddayState>) => (s.kind === 'during' ? 0 : s.kind === 'before' ? 1 : s.kind === 'after' ? 2 : 3);
      const ra = rank(a.st), rb = rank(b.st);
      if (ra !== rb) return ra - rb;
      if (a.st.kind === 'before' && b.st.kind === 'before') return a.st.days - b.st.days;
      if (a.st.kind === 'after' && b.st.kind === 'after') return a.st.days - b.st.days;
      return a.cycle.school_name.localeCompare(b.cycle.school_name, 'ko');
    });
  }, [cycleCards, query, allCycles, isTeacher, showPast, today]);

  // 선택 사이클: URL → 없으면 첫 카드
  useEffect(() => {
    if (data.loading) return;
    if (selectedId && data.cycles.some(c => c.id === selectedId)) return;
    const first = visibleCards[0]?.cycle.id;
    if (first) { const p = new URLSearchParams(params); p.set('cycle', first); setParams(p, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loading, selectedId, visibleCards.length]);

  const selected = useMemo(() => cycleCards.find(cc => cc.cycle.id === selectedId) || null, [cycleCards, selectedId]);

  function select(c: Cycle) { const p = new URLSearchParams(params); p.set('cycle', c.id); setParams(p); }
  function setTab(t: string) { const p = new URLSearchParams(params); p.set('tab', t); setParams(p); }

  if (data.error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive" />
          <div><div className="font-medium">내신대비 데이터를 불러오지 못했습니다</div><div className="text-muted-foreground mt-1">{data.error}</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="w-5 h-5" />내신대비</h1>
        <span className="text-xs text-muted-foreground hidden md:inline">시험 정보 · 특강 · 학생 결과 · 시험지 분석을 사이클별로 한 화면에</span>
        <span className="flex-1" />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="학교·학생·과목·연도" className="h-8 pl-7 w-[200px] text-xs" />
        </div>
        {isTeacher && <label className="flex items-center gap-1.5 text-xs"><Switch checked={allCycles} onCheckedChange={setAllCycles} />전체 학교</label>}
        <label className="flex items-center gap-1.5 text-xs"><Switch checked={showPast} onCheckedChange={setShowPast} />지난 시험</label>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={data.reload} title="새로고침"><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>

      {/* 사이클 타임라인 */}
      {data.loading ? (
        <div className="flex gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[92px] w-[230px] rounded-lg" />)}</div>
      ) : visibleCards.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
          {data.cycles.length === 0 ? '등록된 시험 사이클이 없습니다. 학교·시험 일정에서 추가하거나 자동 감시를 실행하세요.' : '조건에 맞는 시험이 없습니다. "지난 시험"이나 "전체 학교"를 켜 보세요.'}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {visibleCards.map(cc => {
            const c = cc.cycle;
            const active = c.id === selectedId;
            const urgent = cc.st.kind === 'during' || (cc.st.kind === 'before' && cc.st.days <= 7);
            return (
              <button key={c.id} onClick={() => select(c)}
                className={cn('shrink-0 w-[230px] rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                  active && 'border-primary ring-1 ring-primary bg-primary/5')}>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm truncate">{c.school_name} {gradeLabel(c)}</span>
                  <span className="flex-1" />
                  <Badge variant={urgent ? 'destructive' : cc.st.kind === 'after' ? 'outline' : 'secondary'} className="text-[11px] shrink-0">{ddayLabel(cc.st)}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.semester} {c.exam_type}{c.status !== 'confirmed' && <span className="ml-1 text-amber-700">· 초안</span>}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className={cn('rounded px-1.5 py-0.5 text-[11px]', cc.scoped === cc.subs.length && cc.subs.length > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-muted text-muted-foreground')}>
                    범위 {cc.scoped}/{cc.subs.length}
                  </span>
                  <span className="rounded px-1.5 py-0.5 text-[11px] bg-muted text-muted-foreground">점수 {cc.done}/{cc.expected}</span>
                  {cc.missing > 0 && cc.st.kind === 'after' && (
                    <span className="rounded px-1.5 py-0.5 text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">누락 {cc.missing}</span>
                  )}
                  <span className="rounded px-1.5 py-0.5 text-[11px] bg-muted text-muted-foreground">분석 {cc.reports.length}/{Math.max(cc.subs.length, cc.reports.length)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 선택 사이클 상세 */}
      {selected && (
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <GraduationCap className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">{cycleTitle(selected.cycle)}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" />대상 {selected.targets.length}명</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{ddayLabel(selected.st)}</span>
          </div>
          <Tabs value={tab} onValueChange={setTab} className="px-4 pb-4">
            <TabsList className="mt-3 h-9">
              <TabsTrigger value="info" className="text-xs">시험 정보</TabsTrigger>
              <TabsTrigger value="prep" className="text-xs">특강</TabsTrigger>
              <TabsTrigger value="results" className="text-xs">학생 결과{selected.missing > 0 && selected.st.kind === 'after' && <span className="ml-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5">{selected.missing}</span>}</TabsTrigger>
              <TabsTrigger value="papers" className="text-xs"><FileBarChart2 className="w-3.5 h-3.5 mr-1" />시험지 분석</TabsTrigger>
              {isAdmin && <TabsTrigger value="principal" className="text-xs">원장 디렉션</TabsTrigger>}
            </TabsList>

            <TabsContent value="info" className="mt-4">
              <ExamInfoTab cycle={selected.cycle} subjects={selected.subs} textbooks={data.textbooks} archives={data.archives}
                canEdit={isAdmin || isTeacher} isAdmin={isAdmin} onChanged={data.reload} />
            </TabsContent>
            <TabsContent value="prep" className="mt-4">
              <div className="mb-2 text-xs text-muted-foreground">
                특강 편성은 당분간 기존 화면을 그대로 씁니다. 선생님 시간 잠금·선착순 예약(E단계)에서 이 사이클 기준으로 교체됩니다.
              </div>
              <Suspense fallback={<div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중</div>}>
                <ExamPrepScheduleManager />
              </Suspense>
            </TabsContent>
            <TabsContent value="results" className="mt-4">
              <StudentResultsTab rows={selected.rows} examLabel={`${selected.key.year} ${selected.cycle.semester} ${selected.cycle.exam_type}`}
                isTeacher={isTeacher} currentUserId={user?.id ?? null} />
            </TabsContent>
            <TabsContent value="papers" className="mt-4">
              <PaperAnalysisTab cycle={selected.cycle} reports={selected.reports} subjects={selected.cycleSubjects}
                deepByReport={data.deepByReport} itemCountByReport={data.itemCountByReport} />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="principal" className="mt-4">
                <Suspense fallback={<div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중</div>}>
                  <PrincipalDirectionBoard />
                </Suspense>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

      {!data.loading && selected && selected.targets.length > 0 && selected.rows.length === 0 && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {normalizeSchool(selected.cycle.school_name)} {gradeLabel(selected.cycle)} 재원생 {selected.targets.length}명 중 수강 과목·담당 선생님이 연결된 학생이 없습니다. 학생 관리에서 담당 선생님을 지정하면 결과 표와 누락 표시가 켜집니다.
        </div>
      )}
    </div>
  );
}
