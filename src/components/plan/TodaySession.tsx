// LESSON-PLAN-CORE-V1: 수업 당일 3단계 화면 — 설계가 만들어주는 오늘 수업
// 1. 수업 시작(포스트잇·출결·쪽지 채점·과제) → 2. 진도(다 나감/일부/미루기) → 3. 마무리(요약·메모·저장)
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowRight, Check, TrendingDown, TrendingUp, StickyNote, Save,
  CircleDashed, AlertTriangle, UserX, Undo2,
} from 'lucide-react';
import { PlanGoal, SessionRole, ROLE_LABELS, countProgressSessions } from './planApi';

const db = supabase as any;

type Design = any;
type StudentInfo = { id: string; name: string; grade: string | null; type: 'A' | 'B' | 'C' | null };
type ProgressRow = { student_id: string; goal_id: string; status: string; partial_upto: string | null };
type CheckRow = { student_id: string; goal_id: string | null; score: number | null; passed: boolean | null; method: string; created_at: string };
type QueueRow = { id: string; student_id: string; kind: string; title: string; assignee: string };

const ERROR_TYPES = [
  { key: 'concept', label: '개념 이해' },
  { key: 'mistake', label: '단순 실수' },
  { key: 'time', label: '시간 부족' },
] as const;

const TYPE_COLORS: Record<string, string> = { A: 'text-violet-700', B: 'text-sky-700', C: 'text-amber-700' };

export function TodaySession() {
  const { designId } = useParams<{ designId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [design, setDesign] = useState<Design | null>(null);
  const [goals, setGoals] = useState<PlanGoal[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [recentChecks, setRecentChecks] = useState<CheckRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [memo, setMemo] = useState<{ id: string; content: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // 특강·투트랙 (INTENSIVE-COTEACH-V1)
  const [sessionMeta, setSessionMeta] = useState<{ intensive_id: string | null; assigned_teacher_id: string | null }>({ intensive_id: null, assigned_teacher_id: null });
  const [intensiveExtra, setIntensiveExtra] = useState(0); // 기한 내 남은 특강 회차 (정규 요일과 안 겹치는 것)
  const [coTeachers, setCoTeachers] = useState<{ teacher_id: string; name: string; start_date: string; end_date: string }[]>([]);
  const [mainTeacherName, setMainTeacherName] = useState('');

  const [step, setStep] = useState(1);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [quizScores, setQuizScores] = useState<Record<string, string>>({});
  const [quizSaved, setQuizSaved] = useState<Record<string, { score: number; passed: boolean }>>({});
  const [errorPick, setErrorPick] = useState<Record<string, string>>({});
  const [goalStates, setGoalStates] = useState<Record<string, { state: 'done' | 'partial' | 'defer' | null; upto: string }>>({});
  const [note, setNote] = useState('');
  const [nextMemo, setNextMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedDone, setSavedDone] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!designId) return;
    (async () => {
      setLoading(true);
      try {
        const [dRes, psRes] = await Promise.all([
          db.from('plan_designs').select('*, plan_tracks(title, subject, textbook)').eq('id', designId).single(),
          db.from('plan_students').select('*').eq('design_id', designId),
        ]);
        if (dRes.error) throw dRes.error;
        const d = dRes.data;
        setDesign(d);

        const [gRes, stuRes, pgRes, ckRes, qRes, memoRes] = await Promise.all([
          db.from('plan_goals').select('*').eq('track_id', d.track_id).order('order_index'),
          supabase.from('students').select('id, name, grade')
            .in('id', ((psRes.data || []) as any[]).map((r: any) => r.student_id)),
          db.from('plan_goal_progress').select('student_id, goal_id, status, partial_upto').eq('design_id', designId),
          db.from('plan_checks').select('student_id, goal_id, score, passed, method, created_at')
            .eq('design_id', designId).order('created_at', { ascending: false }).limit(200),
          db.from('plan_queue').select('id, student_id, kind, title, assignee').eq('design_id', designId).eq('status', 'open'),
          db.from('plan_teacher_memos').select('id, content').eq('design_id', designId).eq('shown', false)
            .order('created_at', { ascending: false }).limit(1),
        ]);
        setGoals(gRes.data || []);
        const typeMap = new Map(((psRes.data || []) as any[]).map((r: any) => [r.student_id, r.student_type]));
        const studs: StudentInfo[] = ((stuRes.data || []) as any[])
          .map((s: any) => ({ id: s.id, name: s.name, grade: s.grade, type: typeMap.get(s.id) || null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        setStudents(studs);
        setProgress(pgRes.data || []);
        setRecentChecks(ckRes.data || []);
        setQueue(qRes.data || []);
        if ((memoRes.data || []).length > 0) setMemo(memoRes.data[0]);

        // 오늘 세션 확보 (있으면 재사용 — 특강으로 미리 생성된 세션 포함)
        const role: SessionRole = (d.rhythm || {})[String(new Date().getDay())] || 'progress';
        const { data: existing } = await db.from('plan_sessions')
          .select('id, note, intensive_id, assigned_teacher_id')
          .eq('design_id', designId).eq('session_date', todayStr).maybeSingle();
        if (existing) {
          setSessionId(existing.id); setNote(existing.note || '');
          setSessionMeta({ intensive_id: existing.intensive_id || null, assigned_teacher_id: existing.assigned_teacher_id || null });
        } else {
          const { data: created, error } = await db.from('plan_sessions')
            .insert({ design_id: designId, session_date: todayStr, role }).select().single();
          if (error) throw error;
          setSessionId(created.id);
        }

        // 특강: 기한 내 남은 특강 회차 → 페이스 분모에 합산 (정규 요일과 겹치지 않는 날만)
        const progressDays = Object.entries(d.rhythm || {})
          .filter(([, r]) => r !== 'test_day').map(([k]) => Number(k));
        const { data: futureIntensive } = await db.from('plan_sessions')
          .select('session_date').eq('design_id', designId)
          .not('intensive_id', 'is', null)
          .gt('session_date', todayStr)
          .lte('session_date', d.target_date || '9999-12-31');
        setIntensiveExtra(((futureIntensive || []) as any[])
          .filter(r => !progressDays.includes(new Date(r.session_date + 'T12:00:00').getDay())).length);

        // 투트랙: 공동 선생님 + 이름
        const { data: cos } = await db.from('plan_co_teachers')
          .select('teacher_id, start_date, end_date').eq('design_id', designId).eq('status', 'active');
        const teacherIds = Array.from(new Set([d.teacher_id, ...((cos || []) as any[]).map((c: any) => c.teacher_id)]));
        const { data: profs } = await db.from('profiles').select('id, full_name').in('id', teacherIds);
        const nameOf = new Map(((profs || []) as any[]).map((p: any) => [p.id, p.full_name]));
        setMainTeacherName(nameOf.get(d.teacher_id) || '담당');
        setCoTeachers(((cos || []) as any[]).map((c: any) => ({
          teacher_id: c.teacher_id, name: nameOf.get(c.teacher_id) || '공동T',
          start_date: c.start_date, end_date: c.end_date,
        })));
      } catch (e: any) {
        toast.error(`불러오기 실패: ${e.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  // ── 계산: 끝점까지의 목표, 그룹 현재 위치, 오늘 분량 ──
  const endIdx = useMemo(() => {
    const i = goals.findIndex(g => g.id === design?.end_goal_id);
    return i >= 0 ? i : goals.length - 1;
  }, [goals, design]);
  const trackGoals = useMemo(() => goals.slice(0, endIdx + 1), [goals, endIdx]);

  const advancedSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of progress) {
      if (['advanced', 'partial', 'verified_ok', 'verified_weak'].includes(p.status)) s.add(p.goal_id);
    }
    return s;
  }, [progress]);

  const groupPosIdx = useMemo(() => {
    let idx = -1;
    trackGoals.forEach((g, i) => { if (advancedSet.has(g.id)) idx = i; });
    return idx;
  }, [trackGoals, advancedSet]);

  // 직전 목표가 '일부'였으면 이어서
  const partialCarry = useMemo(() => {
    if (groupPosIdx < 0) return null;
    const g = trackGoals[groupPosIdx];
    const rows = progress.filter(p => p.goal_id === g.id && p.status === 'partial' && p.partial_upto);
    return rows.length > 0 ? { goal: g, upto: rows[0].partial_upto! } : null;
  }, [groupPosIdx, trackGoals, progress]);

  const remainCount = trackGoals.length - 1 - groupPosIdx + (partialCarry ? 0.5 : 0);
  const remainSessions = useMemo(
    () => (design ? countProgressSessions(design.rhythm || {}, design.target_date) + intensiveExtra : 0),
    [design, intensiveExtra]
  );
  const pace = remainSessions > 0 ? remainCount / remainSessions : null;
  const todayCount = pace != null ? Math.max(1, Math.round(pace)) : 1;

  const todayGoals = useMemo(() => {
    const list: { goal: PlanGoal; continueFrom?: string }[] = [];
    if (partialCarry) list.push({ goal: partialCarry.goal, continueFrom: partialCarry.upto });
    let i = groupPosIdx + 1;
    while (list.length < todayCount + (partialCarry ? 1 : 0) && i < trackGoals.length) {
      list.push({ goal: trackGoals[i] });
      i++;
    }
    return list;
  }, [partialCarry, groupPosIdx, trackGoals, todayCount]);

  // 쪽지시험 대상 = 마지막으로 나간, 아직 확인 안 된 목표
  const quizTarget = useMemo(() => {
    if (groupPosIdx < 0) return null;
    for (let i = groupPosIdx; i >= 0 && i > groupPosIdx - 2; i--) {
      const g = trackGoals[i];
      const verified = progress.some(p => p.goal_id === g.id && p.status.startsWith('verified'));
      if (!verified) return g;
    }
    return trackGoals[groupPosIdx];
  }, [groupPosIdx, trackGoals, progress]);

  const isTestDay = design && ((design.rhythm || {})[String(new Date().getDay())] === 'test_day');
  const hasQuiz = (design?.check_methods || []).includes('quiz');

  function cutlineFor(stu: StudentInfo): number {
    if (design?.teaching_mode === 'abc' && stu.type && design?.cutline_by_type?.[stu.type] != null) {
      return Number(design.cutline_by_type[stu.type]);
    }
    return Number(design?.cutline_default ?? 70);
  }

  // 학생별 최근 쪽지 이력 (내용 라벨 포함) + 신호등
  function recentFor(stu: StudentInfo) {
    const rows = recentChecks
      .filter(c => c.student_id === stu.id && c.method === 'quiz' && c.score != null)
      .slice(0, 3).reverse();
    const goalTitle = (gid: string | null) =>
      goals.find(g => g.id === gid)?.title.split('—')[0].trim().slice(0, 8) || '';
    const fails = recentChecks
      .filter(c => c.student_id === stu.id && c.method === 'quiz' && c.passed != null)
      .slice(0, Number(design?.escalate_after ?? 2));
    const redSignal = fails.length >= Number(design?.escalate_after ?? 2) && fails.every(f => f.passed === false);
    return { rows, goalTitle, redSignal };
  }

  async function gradeQuiz(stu: StudentInfo) {
    const raw = quizScores[stu.id];
    if (!raw?.trim() || !quizTarget || !sessionId) return;
    const score = Number(raw);
    if (Number.isNaN(score) || score < 0 || score > 100) { toast.error('0~100 점수를 입력해주세요'); return; }
    const cut = cutlineFor(stu);
    const passed = score >= cut;
    try {
      const { data: check, error } = await db.from('plan_checks').insert({
        design_id: designId, session_id: sessionId, student_id: stu.id,
        goal_id: quizTarget.id, method: 'quiz', score, cutline: cut, passed,
        error_type: passed ? null : (errorPick[stu.id] || null),
      }).select().single();
      if (error) throw error;
      setQuizSaved(p => ({ ...p, [stu.id]: { score, passed } }));
      setRecentChecks(p => [{ student_id: stu.id, goal_id: quizTarget.id, score, passed, method: 'quiz', created_at: new Date().toISOString() }, ...p]);

      if (!passed) {
        // 룰셋의 1차 처리 → 큐 자동 등록
        const kindMap: Record<string, string> = { retest: 'retest', clinic: 'relearn', homework: 'relearn' };
        const titleMap: Record<string, string> = {
          retest: `재시험 — ${quizTarget.title} (${score}/${cut})`,
          clinic: `클리닉 재학습 — ${quizTarget.title}`,
          homework: `보완 과제 — ${quizTarget.title}`,
        };
        const { data: q } = await db.from('plan_queue').insert({
          design_id: designId, student_id: stu.id, goal_id: quizTarget.id,
          source_check_id: check.id, kind: kindMap[design.fail_action] || 'retest',
          title: titleMap[design.fail_action] || `재시험 — ${quizTarget.title}`,
          assignee: design.fail_action === 'clinic' ? 'assistant' : 'teacher',
        }).select().single();
        if (q) setQueue(p => [...p, q]);

        // 연속 미달 → 플래그
        const prevFails = recentChecks
          .filter(c => c.student_id === stu.id && c.method === 'quiz' && c.passed != null)
          .slice(0, Number(design.escalate_after) - 1);
        const consecutive = prevFails.length >= Number(design.escalate_after) - 1
          && prevFails.every(f => f.passed === false);
        if (consecutive) {
          await db.from('plan_flags').insert({
            design_id: designId, student_id: stu.id, kind: 'level', level: 'principal',
            message: `${stu.name} — 쪽지시험 ${design.escalate_after}회 연속 미달 (최근: ${quizTarget.title} ${score}/${cut}점)`,
          });
          toast.warning(`⚠ ${stu.name} ${design.escalate_after}회 연속 미달 — 추가관리 알림이 원장에게 갑니다`);
        } else {
          toast(`${stu.name} 미달 (${score}/${cut}) → ${titleMap[design.fail_action]?.split(' — ')[0]} 자동 등록`);
        }
      } else {
        toast.success(`${stu.name} 통과 (${score}/${cut})`);
      }
    } catch (e: any) {
      toast.error(`채점 저장 실패: ${e.message || e}`);
    }
  }

  async function setGoalState(goalId: string, state: 'done' | 'partial' | 'defer', upto?: string) {
    if (!sessionId) return;
    const presentIds = students.filter(s => !absent.has(s.id)).map(s => s.id);
    const absentIds = students.filter(s => absent.has(s.id)).map(s => s.id);
    const statusMap = { done: 'advanced', partial: 'partial', defer: 'deferred' } as const;
    try {
      const rows = [
        ...presentIds.map(sid => ({
          design_id: designId, student_id: sid, goal_id: goalId,
          status: statusMap[state], partial_upto: state === 'partial' ? (upto || null) : null,
          session_id: sessionId, advanced_at: state !== 'defer' ? new Date().toISOString() : null,
        })),
        ...absentIds.map(sid => ({
          design_id: designId, student_id: sid, goal_id: goalId,
          status: 'skipped_absent', session_id: sessionId,
        })),
      ];
      const { error } = await db.from('plan_goal_progress')
        .upsert(rows, { onConflict: 'design_id,student_id,goal_id' });
      if (error) throw error;
      setGoalStates(p => ({ ...p, [goalId]: { state, upto: upto || '' } }));
      // 로컬 progress 갱신
      setProgress(prev => {
        const rest = prev.filter(p => p.goal_id !== goalId);
        return [...rest, ...rows.map(r => ({
          student_id: r.student_id, goal_id: r.goal_id, status: r.status, partial_upto: (r as any).partial_upto || null,
        }))];
      });
      if (state === 'done') toast.success(`진도 기록 — ${presentIds.length}명 반영${absentIds.length ? ` (결석 ${absentIds.length}명 스킵 표시)` : ''}`);
      if (state === 'partial') toast.success(`${upto}까지 기록 — 다음 수업에 "이어서"로 자동 표기`);
      if (state === 'defer') toast(`미루기 — 남은 수업에 자동 재분배`);
    } catch (e: any) {
      toast.error(`진도 저장 실패: ${e.message || e}`);
    }
  }

  async function resolveQueueItem(q: QueueRow) {
    try {
      await db.from('plan_queue').update({ status: 'done', resolved_at: new Date().toISOString() }).eq('id', q.id);
      setQueue(p => p.filter(x => x.id !== q.id));
      toast.success('처리 완료');
    } catch (e: any) { toast.error(e.message || String(e)); }
  }

  async function saveDay() {
    if (!sessionId) return;
    setSaving(true);
    try {
      await db.from('plan_sessions').update({
        note: note.trim() || null, status: 'saved', saved_at: new Date().toISOString(),
      }).eq('id', sessionId);
      if (memo) await db.from('plan_teacher_memos').update({ shown: true }).eq('id', memo.id);
      if (nextMemo.trim()) {
        await db.from('plan_teacher_memos').insert({
          design_id: designId, session_id: sessionId, content: nextMemo.trim(),
        });
      }
      setSavedDone(true);
      toast.success('오늘 기록 저장 완료' + (nextMemo.trim() ? ' — 📌 메모는 다음 수업에서 다시 만나요' : ''));
    } catch (e: any) {
      toast.error(`저장 실패: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !design) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <Skeleton className="h-10 w-80" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stepDefs = [
    { n: 1, t: '수업 시작', s: '출결 · 확인' },
    { n: 2, t: isTestDay ? '테스트·복습' : '진도', s: isTestDay ? '밀린 확인 소화' : `오늘 ${todayGoals.length}개` },
    { n: 3, t: '마무리', s: '메모 · 저장' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="text-xs">오늘 수업</Badge>
        <h1 className="text-lg font-bold">{design.title}</h1>
        <span className="text-sm text-muted-foreground">
          {todayStr.slice(5).replace('-', '/')} · {ROLE_LABELS[((design.rhythm || {})[String(new Date().getDay())] || 'progress') as SessionRole]}
          {pace != null && ` · 회당 ${pace.toFixed(1)}개 페이스`}
          {intensiveExtra > 0 && ` (특강 +${intensiveExtra}회 반영)`}
        </span>
        {sessionMeta.intensive_id && (
          <Badge variant="outline" className="border-primary/60 text-primary text-[11px]">✨ 특강 회차</Badge>
        )}
        {coTeachers.length > 0 && (
          <select
            className="h-7 rounded-md border bg-background px-2 text-xs font-medium"
            value={sessionMeta.assigned_teacher_id || design.teacher_id}
            onChange={async e => {
              const tid = e.target.value;
              try {
                await db.from('plan_sessions').update({ assigned_teacher_id: tid === design.teacher_id ? null : tid }).eq('id', sessionId);
                setSessionMeta(p => ({ ...p, assigned_teacher_id: tid === design.teacher_id ? null : tid }));
                toast.success('오늘 수업 담당이 지정됐어요');
              } catch (err: any) { toast.error(err.message || String(err)); }
            }}
            title="오늘 수업 담당 선생님"
          >
            <option value={design.teacher_id}>오늘 담당: {mainTeacherName}</option>
            {coTeachers
              .filter(c => c.start_date <= todayStr && c.end_date >= todayStr)
              .map(c => <option key={c.teacher_id} value={c.teacher_id}>오늘 담당: {c.name} (공동)</option>)}
          </select>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => navigate('/plan')}>
          <Undo2 className="w-4 h-4 mr-1" />목록
        </Button>
      </div>

      {/* 3단계 스테퍼 */}
      <div className="grid grid-cols-3 gap-2">
        {stepDefs.map(sd => (
          <button key={sd.n}
            className={`rounded-xl border-2 p-3 text-left transition
              ${step === sd.n ? 'border-primary bg-primary/5' : sd.n < step ? 'border-green-300 bg-green-50' : 'border-border'}`}
            onClick={() => setStep(sd.n)}>
            <p className={`font-extrabold text-sm ${step === sd.n ? 'text-primary' : sd.n < step ? 'text-green-700' : 'text-muted-foreground'}`}>
              {sd.n < step ? '✓ ' : `${sd.n}. `}{sd.t}
            </p>
            <p className="text-xs text-muted-foreground">{sd.s}</p>
          </button>
        ))}
      </div>

      {/* ═══ 1단계: 수업 시작 ═══ */}
      {step === 1 && (
        <div className="space-y-3">
          {memo && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm flex gap-2">
              <StickyNote className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <span><b className="text-yellow-800">지난 수업의 나:</b> {memo.content}</span>
            </div>
          )}

          <Card><CardContent className="p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground">출결 — 이름을 누르면 결석 처리 (오늘 진도에서 자동 스킵 표시)</p>
            <div className="flex flex-wrap gap-2">
              {students.map(s => (
                <button key={s.id}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition
                    ${absent.has(s.id) ? 'border-red-300 bg-red-50 text-red-600' : 'border-green-300 bg-green-50 text-green-700'}`}
                  onClick={() => setAbsent(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                  {absent.has(s.id) && <UserX className="w-3.5 h-3.5 inline mr-1" />}
                  {s.name}{s.type && <span className={`ml-1 text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                </button>
              ))}
            </div>
          </CardContent></Card>

          {hasQuiz && quizTarget && (
            <Card><CardContent className="p-4 space-y-3">
              <p className="text-xs font-bold text-muted-foreground">
                쪽지시험 — <span className="text-foreground">{quizTarget.title}</span> {quizTarget.pages}
                <Badge variant="secondary" className="ml-2 text-[10px]">룰셋 자동</Badge>
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {students.filter(s => !absent.has(s.id)).map(s => {
                  const saved = quizSaved[s.id];
                  const rec = recentFor(s);
                  const cut = cutlineFor(s);
                  return (
                    <div key={s.id} className={`rounded-xl border-2 p-3 space-y-1.5
                      ${saved ? (saved.passed ? 'border-green-300 bg-green-50/50' : 'border-red-300 bg-red-50/50') : 'border-border'}`}>
                      <p className="font-bold text-sm flex items-center gap-1">
                        {s.name}
                        {s.type && <span className={`text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                        {rec.redSignal && <span title="학습 신호 주의">🔴</span>}
                      </p>
                      {rec.rows.length > 0 && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {rec.rows.map((r, i) => `${rec.goalTitle(r.goal_id)} ${r.score}`).join(' · ')}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">커트라인 {cut}점</p>
                      {saved ? (
                        <p className={`text-sm font-extrabold ${saved.passed ? 'text-green-700' : 'text-red-600'}`}>
                          {saved.score}점 — {saved.passed ? '통과' : '미달'}
                        </p>
                      ) : (
                        <>
                          <div className="flex gap-1.5">
                            <Input type="number" placeholder="점수" className="h-8 text-center font-bold"
                              value={quizScores[s.id] ?? ''}
                              onChange={e => setQuizScores(p => ({ ...p, [s.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') gradeQuiz(s); }} />
                            <Button size="sm" className="h-8" onClick={() => gradeQuiz(s)}
                              disabled={!(quizScores[s.id] ?? '').trim()}>기록</Button>
                          </div>
                          {Number(quizScores[s.id]) < cutlineFor(s) && (quizScores[s.id] ?? '').trim() !== '' && (
                            <div className="flex gap-1">
                              {ERROR_TYPES.map(et => (
                                <button key={et.key}
                                  className={`text-[10px] font-bold rounded-full border px-2 py-0.5
                                    ${errorPick[s.id] === et.key ? 'bg-amber-100 border-amber-400 text-amber-800' : 'text-muted-foreground'}`}
                                  onClick={() => setErrorPick(p => ({ ...p, [s.id]: et.key }))}>
                                  {et.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>
          )}

          {queue.length > 0 && (
            <Card><CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground">밀린 할 일 {queue.length}건 — 오늘 처리했으면 체크</p>
              {queue.map(q => {
                const stu = students.find(s => s.id === q.student_id);
                return (
                  <div key={q.id} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2">
                    <b>{stu?.name}</b>
                    <span className="flex-1 truncate">{q.title}</span>
                    <Badge variant="outline" className="text-[10px]">{q.assignee === 'assistant' ? '조교' : '교사'}</Badge>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => resolveQueueItem(q)}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </CardContent></Card>
          )}

          <Button className="w-full" onClick={() => setStep(2)}>
            시작 체크 끝 — {isTestDay ? '테스트·복습으로' : '진도 나가기'} <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ═══ 2단계: 진도 (테스트 데이면 확인 중심 안내) ═══ */}
      {step === 2 && (
        <div className="space-y-3">
          {isTestDay ? (
            <Card><CardContent className="p-5 text-sm space-y-2">
              <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-amber-600" />오늘은 테스트·복습 데이</p>
              <p className="text-muted-foreground">진도 대신 1단계의 밀린 할 일(재시험·재학습)을 소화하는 날입니다. 단원 마무리 테스트 결과는 1단계 쪽지시험 칸에 기록하세요.</p>
            </CardContent></Card>
          ) : todayGoals.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              🎉 끝점까지 모든 목표를 나갔습니다 — 확인·복습만 남았어요.
            </CardContent></Card>
          ) : (
            todayGoals.map(({ goal, continueFrom }) => {
              const st = goalStates[goal.id];
              return (
                <Card key={goal.id} className={
                  st?.state === 'done' ? 'border-green-300 bg-green-50/40'
                    : st?.state === 'partial' ? 'border-amber-300 bg-amber-50/40'
                      : st?.state === 'defer' ? 'opacity-60' : ''}>
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-extrabold">{goal.order_index}. {goal.title}</span>
                      <span className="text-xs text-muted-foreground">{goal.pages}</span>
                      {continueFrom && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                          지난 시간 {continueFrom}까지 — 이어서
                        </Badge>
                      )}
                      {st?.state && (
                        <span className={`ml-auto text-xs font-bold
                          ${st.state === 'done' ? 'text-green-700' : st.state === 'partial' ? 'text-amber-700' : 'text-muted-foreground'}`}>
                          {st.state === 'done' ? '완료' : st.state === 'partial' ? `일부 ~${st.upto}` : '미룸'}
                        </span>
                      )}
                    </div>
                    {design.teaching_mode === 'abc' && design.angle_mode !== 'off' && (
                      <p className="text-xs text-muted-foreground">
                        {(['A', 'B', 'C'] as const).filter(t => design.type_concepts?.[t]).map(t => (
                          <span key={t} className="mr-3"><b className={TYPE_COLORS[t]}>{t}</b> {design.type_concepts[t]}</span>
                        ))}
                      </p>
                    )}
                    {!st?.state && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => setGoalState(goal.id, 'done')}>
                          <Check className="w-4 h-4 mr-1" />다 나감
                        </Button>
                        <span className="flex items-center gap-1">
                          <Input placeholder="p.55" className="h-8 w-20 text-center text-sm" id={`upto-${goal.id}`} />
                          <Button size="sm" variant="outline" onClick={() => {
                            const v = (document.getElementById(`upto-${goal.id}`) as HTMLInputElement)?.value?.trim();
                            if (!v) { toast.error('어디까지 나갔는지 적어주세요 (예: p.55)'); return; }
                            setGoalState(goal.id, 'partial', v.startsWith('p') ? v : `p.${v}`);
                          }}>◐ 일부만</Button>
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setGoalState(goal.id, 'defer')}>→ 미루기</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
          <Button className="w-full" onClick={() => setStep(3)}>
            {isTestDay ? '복습 끝' : '진도 기록 끝'} — 마무리 <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ═══ 3단계: 마무리 ═══ */}
      {step === 3 && (
        <div className="space-y-3">
          <Card><CardContent className="p-4 space-y-2 text-sm">
            <p className="text-xs font-bold text-muted-foreground">오늘 자동으로 기록된 것</p>
            <p>· 출석 {students.length - absent.size}명{absent.size > 0 && ` / 결석 ${absent.size}명 (진도 스킵 표시)`}</p>
            <p>· 쪽지시험 {Object.keys(quizSaved).length}명 기록
              {Object.values(quizSaved).filter(v => !v.passed).length > 0 &&
                ` — 미달 ${Object.values(quizSaved).filter(v => !v.passed).length}명 자동 큐 등록`}</p>
            <p>· 진도: {Object.entries(goalStates).length === 0 ? '기록 없음'
              : Object.entries(goalStates).map(([gid, st]) => {
                const g = goals.find(x => x.id === gid);
                return `${g?.order_index}. ${st.state === 'done' ? '완료' : st.state === 'partial' ? `일부(~${st.upto})` : '미룸'}`;
              }).join(' · ')}</p>
          </CardContent></Card>

          <Card><CardContent className="p-4 space-y-3">
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1.5">특이사항 — 필요할 때만</p>
              <Input placeholder="예: 민준이 서술 1문항 성공 — 다음 주 A형 승급 검토"
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1.5">📌 다음 수업의 나에게 — 까먹기 전에</p>
              <Input placeholder="예: 원주각 들어가기 전에 중심각 복습 문제 준비"
                value={nextMemo} onChange={e => setNextMemo(e.target.value)} />
            </div>
            <Button className="w-full" disabled={saving} onClick={saveDay}>
              <Save className="w-4 h-4 mr-1" />{saving ? '저장 중…' : '오늘 기록 저장'}
            </Button>
            {savedDone && (
              <p className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-3 py-2">
                ✓ 저장 완료 — 이 기록이 곧 수업일지입니다. 따로 쓸 것 없음.
              </p>
            )}
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
