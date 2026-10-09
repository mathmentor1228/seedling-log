// EXAM-HUB-A: 내신대비 통합 화면 `/exam` — 메뉴 3개(보드·자료실·추이)를 사이클 기준 한 장으로.
// 설계·단계: vault 19 — 내신대비 통합 개편안 (2026-10-09).
// A-2(직관성): 맨 위 "오늘" 줄(가장 가까운 시험 D-day + 확인 필요 할 일) · 빈 배지 숨김 · 탭에 건수·설명.
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
import { AlertTriangle, Bell, CalendarClock, ClipboardCheck, FileBarChart2, GraduationCap, Loader2, RefreshCw, Search, Users } from 'lucide-react';
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
const SCOPE_ALERT_DAYS = 21;

const TAB_HELP: Record<Tab, string> = {
  info: '과목별 시험일·범위·교과서·수행평가. 학교 공지에서 AI가 읽어 초안으로 채우고, 원장이 확인해 확정합니다.',
  prep: '이 시험을 위한 특강 편성. 선생님별 내 학생 명단과 회차.',
  results: '시험 후 학생별 점수·변동·시험지. 값이 안 올라온 학생은 "미입력"으로 표시됩니다.',
  papers: '학교×과목 시험지 분석: 원본 PDF·문항 난도·카드뉴스·티칭 메모.',
  principal: '원장 전용: 성적 하락 TOP · 분석지 미작성 · 채점 밀린 교사.',
};

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
      const newPosts = data.posts.filter(p => p.status === 'new' && normalizeSchool(p.school_name) === normalizeSchool(c.school_name)).length;
      return { cycle: c, key, subs, cycleSubjects, rows, reports, targets, mine, st, expected, done, missing, scoped, newPosts };
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
      const rank = (s: ReturnType<typeof ddayState>) => (s.kind === 'during' ? 0 : s.kind === 'before' ? 1 : s.kind === 'after' ? 2 : 3);
      const ra = rank(a.st), rb = rank(b.st);
      if (ra !== rb) return ra - rb;
      if (a.st.kind === 'before' && b.st.kind === 'before') return a.st.days - b.st.days;
      if (a.st.kind === 'after' && b.st.kind === 'after') return a.st.days - b.st.days;
      return a.cycle.school_name.localeCompare(b.cycle.school_name, 'ko');
    });
  }, [cycleCards, query, allCycles, isTeacher, showPast, today]);

  // ── "오늘" 줄: 가장 가까운 시험 + 확인 필요 할 일 ──
  const todayLine = useMemo(() => {
    const live = visibleCards.filter(cc => cc.st.kind === 'during');
    const next = visibleCards.filter(cc => cc.st.kind === 'before').slice(0, 2);
    const todos: { label: string; cycleId: string; tab: Tab; tone: 'warn' | 'info' }[] = [];
    for (const cc of visibleCards) {
      const c = cc.cycle;
      const soon = cc.st.kind === 'during' || (cc.st.kind === 'before' && cc.st.days <= SCOPE_ALERT_DAYS);
      if (c.status === 'draft' && (soon || cc.st.kind === 'unknown')) todos.push({ label: `${c.school_name} ${gradeLabel(c)} 일정 초안 확정`, cycleId: c.id, tab: 'info', tone: 'warn' });
      if (soon && cc.subs.length > 0 && cc.scoped < cc.subs.length) todos.push({ label: `${c.school_name} ${gradeLabel(c)} 범위 미입력 ${cc.subs.length - cc.scoped}과목`, cycleId: c.id, tab: 'info', tone: 'warn' });
      if (soon && cc.subs.length === 0) todos.push({ label: `${c.school_name} ${gradeLabel(c)} 과목 정보 없음`, cycleId: c.id, tab: 'info', tone: 'warn' });
      if (cc.st.kind === 'after' && cc.missing > 0) todos.push({ label: `${c.school_name} ${gradeLabel(c)} 점수 미입력 ${cc.missing}명`, cycleId: c.id, tab: 'results', tone: 'warn' });
      if (cc.newPosts > 0) todos.push({ label: `${c.school_name} 학교 공지 새 글 ${cc.newPosts}`, cycleId: c.id, tab: 'info', tone: 'info' });
    }
    // 같은 학교 공지는 한 번만
    const seen = new Set<string>();
    const dedup = todos.filter(t => { const k = t.label; if (seen.has(k)) return false; seen.add(k); return true; });
    return { live, next, todos: dedup.slice(0, 6) };
  }, [visibleCards]);

  useEffect(() => {
    if (data.loading) return;
    if (selectedId && data.cycles.some(c => c.id === selectedId)) return;
    const first = visibleCards[0]?.cycle.id;
    if (first) { const p = new URLSearchParams(params); p.set('cycle', first); setParams(p, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loading, selectedId, visibleCards.length]);

  const selected = useMemo(() => cycleCards.find(cc => cc.cycle.id === selectedId) || null, [cycleCards, selectedId]);

  function select(c: Cycle, t?: Tab) { const p = new URLSearchParams(params); p.set('cycle', c.id); if (t) p.set('tab', t); setParams(p); }
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

  const Chip = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'muted' }) => (
    <span className={cn('rounded px-1.5 py-0.5 text-[11px]',
      tone === 'ok' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
        : tone === 'warn' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-muted text-muted-foreground')}>{children}</span>
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="w-5 h-5" />내신대비</h1>
        <span className="flex-1" />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="학교·학생·과목·연도" className="h-8 pl-7 w-[200px] text-xs" />
        </div>
        {isTeacher && <label className="flex items-center gap-1.5 text-xs"><Switch checked={allCycles} onCheckedChange={setAllCycles} />전체 학교</label>}
        <label className="flex items-center gap-1.5 text-xs"><Switch checked={showPast} onCheckedChange={setShowPast} />지난 시험</label>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={data.reload} title="새로고침"><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>

      {/* 오늘 줄 */}
      {!data.loading && visibleCards.length > 0 && (
        <div className="rounded-lg border bg-card p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
            {todayLine.live.map(cc => (
              <button key={cc.cycle.id} onClick={() => select(cc.cycle)} className="text-left">
                <span className="text-2xl font-bold text-destructive leading-none">시험 중</span>
                <span className="ml-2 text-sm font-medium">{cc.cycle.school_name} {gradeLabel(cc.cycle)} · {cc.cycle.exam_type}</span>
              </button>
            ))}
            {todayLine.live.length === 0 && todayLine.next.map((cc, i) => (
              <button key={cc.cycle.id} onClick={() => select(cc.cycle)} className="text-left">
                <span className={cn('font-bold leading-none', i === 0 ? 'text-2xl' : 'text-lg text-muted-foreground', i === 0 && cc.st.kind === 'before' && cc.st.days <= 7 && 'text-destructive')}>{ddayLabel(cc.st)}</span>
                <span className={cn('ml-2 font-medium', i === 0 ? 'text-sm' : 'text-xs text-muted-foreground')}>{cc.cycle.school_name} {gradeLabel(cc.cycle)} · {cc.cycle.exam_type}{cc.cycle.start_date ? ` (${cc.cycle.start_date.slice(5).replace('-', '/')}~)` : ''}</span>
              </button>
            ))}
            {todayLine.live.length === 0 && todayLine.next.length === 0 && (
              <span className="text-sm text-muted-foreground">다가오는 시험이 없습니다. 최근 끝난 시험의 결과를 정리할 때입니다.</span>
            )}
          </div>
          <div className="md:ml-auto flex flex-wrap gap-1.5">
            {todayLine.todos.length === 0 ? (
              <Chip tone="ok">확인할 것 없음</Chip>
            ) : todayLine.todos.map((t, i) => (
              <button key={i} onClick={() => { const c = data.cycles.find(x => x.id === t.cycleId); if (c) select(c, t.tab); }}
                className={cn('rounded-full border px-2.5 py-1 text-xs inline-flex items-center gap-1 hover:bg-accent',
                  t.tone === 'warn' ? 'border-amber-300 text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30' : 'border-primary/40 text-primary bg-primary/5')}>
                {t.tone === 'warn' ? <AlertTriangle className="w-3 h-3" /> : <Bell className="w-3 h-3" />}{t.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
            const after = cc.st.kind === 'after';
            return (
              <button key={c.id} onClick={() => select(c)}
                className={cn('shrink-0 w-[230px] rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                  active && 'border-primary ring-1 ring-primary bg-primary/5')}>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm truncate">{c.school_name} {gradeLabel(c)}</span>
                  <span className="flex-1" />
                  <Badge variant={urgent ? 'destructive' : after ? 'outline' : 'secondary'} className="text-[11px] shrink-0">{ddayLabel(cc.st)}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.semester} {c.exam_type}{c.start_date ? ` · ${c.start_date.slice(5).replace('-', '/')}` : ''}
                  {c.status !== 'confirmed' && <span className="ml-1 text-amber-700">· 초안</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 min-h-[20px]">
                  {cc.subs.length > 0 && <Chip tone={cc.scoped === cc.subs.length ? 'ok' : !after ? 'warn' : 'muted'}>범위 {cc.scoped}/{cc.subs.length}</Chip>}
                  {cc.subs.length === 0 && !after && <Chip tone="warn">과목 정보 없음</Chip>}
                  {after && cc.expected > 0 && <Chip tone={cc.done === cc.expected ? 'ok' : 'muted'}>점수 {cc.done}/{cc.expected}</Chip>}
                  {after && cc.missing > 0 && <Chip tone="warn">미입력 {cc.missing}</Chip>}
                  {after && (cc.reports.length > 0 || cc.subs.length > 0) && <Chip tone={cc.reports.length >= Math.max(cc.subs.length, 1) ? 'ok' : 'muted'}>분석 {cc.reports.length}/{Math.max(cc.subs.length, cc.reports.length)}</Chip>}
                  {cc.newPosts > 0 && <Chip tone="muted">공지 {cc.newPosts}</Chip>}
                  {!after && cc.targets.length > 0 && <Chip tone="muted">학생 {cc.targets.length}</Chip>}
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
              <TabsTrigger value="info" className="text-xs">시험 정보<span className="ml-1 text-muted-foreground">{selected.subs.length > 0 ? `${selected.scoped}/${selected.subs.length}` : ''}</span>{selected.newPosts > 0 && <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5">{selected.newPosts}</span>}</TabsTrigger>
              <TabsTrigger value="prep" className="text-xs">특강</TabsTrigger>
              <TabsTrigger value="results" className="text-xs">학생 결과<span className="ml-1 text-muted-foreground">{selected.expected > 0 ? `${selected.done}/${selected.expected}` : ''}</span>{selected.missing > 0 && selected.st.kind === 'after' && <span className="ml-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5">{selected.missing}</span>}</TabsTrigger>
              <TabsTrigger value="papers" className="text-xs"><FileBarChart2 className="w-3.5 h-3.5 mr-1" />시험지 분석<span className="ml-1 text-muted-foreground">{selected.subs.length > 0 || selected.reports.length > 0 ? `${selected.reports.length}/${Math.max(selected.subs.length, selected.reports.length)}` : ''}</span></TabsTrigger>
              {isAdmin && <TabsTrigger value="principal" className="text-xs">원장 디렉션</TabsTrigger>}
            </TabsList>
            <p className="mt-2 text-xs text-muted-foreground">{TAB_HELP[tab]}</p>

            <TabsContent value="info" className="mt-3">
              <ExamInfoTab cycle={selected.cycle} subjects={selected.subs} textbooks={data.textbooks} archives={data.archives} posts={data.posts}
                canEdit={isAdmin || isTeacher} isAdmin={isAdmin} onChanged={data.reload} />
            </TabsContent>
            <TabsContent value="prep" className="mt-3">
              <div className="mb-2 text-xs text-muted-foreground">특강 편성은 당분간 기존 화면을 그대로 씁니다. 선생님 시간 잠금·선착순 예약(E단계)에서 이 사이클 기준으로 교체됩니다.</div>
              <Suspense fallback={<div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중</div>}>
                <ExamPrepScheduleManager />
              </Suspense>
            </TabsContent>
            <TabsContent value="results" className="mt-3">
              <StudentResultsTab rows={selected.rows} examLabel={`${selected.key.year} ${selected.cycle.semester} ${selected.cycle.exam_type}`}
                isTeacher={isTeacher} currentUserId={user?.id ?? null} />
            </TabsContent>
            <TabsContent value="papers" className="mt-3">
              <PaperAnalysisTab cycle={selected.cycle} reports={selected.reports} subjects={selected.cycleSubjects}
                deepByReport={data.deepByReport} itemCountByReport={data.itemCountByReport} />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="principal" className="mt-3">
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
