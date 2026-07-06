// LESSON-PLAN-CORE-V1: 수업 당일 3단계 화면 — 설계가 만들어주는 오늘 수업
// 1. 수업 시작(포스트잇·출결·쪽지 채점·과제) → 2. 진도(다 나감/일부/미루기) → 3. 마무리(요약·메모·저장)
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowRight, Check, StickyNote, Save,
  AlertTriangle, UserX, Undo2, UserPlus, Search, UserCheck,
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // 개인만 수업: ?only=id1,id2 → 그 학생들만 대상 (보충·개별 수업)
  const onlyIds = useMemo(() => {
    const raw = searchParams.get('only');
    return raw ? new Set(raw.split(',').filter(Boolean)) : null;
  }, [searchParams]);

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
  // 학생별 진도 상태 — goalId → studentId → {state, upto}
  const [perStudent, setPerStudent] = useState<Record<string, Record<string, { state: 'done' | 'partial' | 'defer'; upto: string }>>>({});
  const [uptoDrafts, setUptoDrafts] = useState<Record<string, string>>({}); // key: `${goalId}::${studentId|__all__}`
  const [note, setNote] = useState('');
  const [nextMemo, setNextMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedDone, setSavedDone] = useState(false);
  // 게릴라(임시 참석) 학생 — 오늘만 명단에 얹기 (WALKIN-V1)
  const [walkinIds, setWalkinIds] = useState<Set<string>>(new Set());
  const [walkinPickerOpen, setWalkinPickerOpen] = useState(false);
  const [walkinPool, setWalkinPool] = useState<StudentInfo[]>([]);
  const [walkinFilter, setWalkinFilter] = useState('');

  // LESSON-HW-BRIDGE-V1: 오늘 세션 → 수업일지·숙제 자동 연동
  const [subject, setSubject] = useState<string>('');
  const [nextSessionDate, setNextSessionDate] = useState<string>('');
  type OpenHw = { id: string; student_id: string; content: string; assigned_date: string; end_date: string | null; check_status: string; result: string | null };
  const [openHws, setOpenHws] = useState<OpenHw[]>([]);
  const [hwChecks, setHwChecks] = useState<Record<string, { result: 'completed' | 'partial' | 'not_done'; note?: string }>>({});
  const [nextHwBulk, setNextHwBulk] = useState<string>('');
  const [nextHwPerStudent, setNextHwPerStudent] = useState<Record<string, string>>({});
  const [nextHwDue, setNextHwDue] = useState<string>('');

  // 수업기록 날짜 — 기본은 오늘, 과거로 돌아가서 놓친 기입도 가능
  const [sessionDate, setSessionDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const todayStr = sessionDate;
  const sessionDay = useMemo(() => new Date(sessionDate + 'T12:00:00').getDay(), [sessionDate]);
  const realTodayStr = new Date().toISOString().slice(0, 10);
  const isPastDate = sessionDate < realTodayStr;

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
        const studsAll: StudentInfo[] = ((stuRes.data || []) as any[])
          .map((s: any) => ({ id: s.id, name: s.name, grade: s.grade, type: typeMap.get(s.id) || null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        // 개인만 수업이면 대상 학생으로 좁힘
        const studs = onlyIds ? studsAll.filter(s => onlyIds.has(s.id)) : studsAll;
        setStudents(studs);
        setProgress(pgRes.data || []);
        setRecentChecks(ckRes.data || []);
        setQueue(qRes.data || []);
        if ((memoRes.data || []).length > 0) setMemo(memoRes.data[0]);

        // 오늘 세션 확보 (있으면 재사용 — 특강으로 미리 생성된 세션 포함)
        const role: SessionRole = (d.rhythm || {})[String(sessionDay)] || 'progress';
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

        // ── LESSON-HW-BRIDGE-V1 ── 과목, 다음 수업일, 오늘 확인해야 할 숙제 ──
        const subj = (d as any).plan_tracks?.subject || '';
        setSubject(subj);
        // 다음 수업일: rhythm에 등록된 요일 중 선택 날짜 이후 최초의 날짜
        const rhythmDays = Object.keys(d.rhythm || {}).map(k => Number(k));
        let nsd = '';
        if (rhythmDays.length > 0) {
          const base = new Date(sessionDate + 'T12:00:00');
          for (let i = 1; i <= 14; i++) {
            const dt = new Date(base); dt.setDate(dt.getDate() + i);
            if (rhythmDays.includes(dt.getDay())) { nsd = dt.toISOString().slice(0, 10); break; }
          }
        }
        setNextHwDue(nsd);
        setNextSessionDate(nsd);

        // 오늘 확인해야 할 숙제: 이 반 학생들 중, 과목 일치 + (마감이 오늘 포함 이전) + 아직 미확인
        const studentIds = studs.map(s => s.id);
        if (subj && studentIds.length > 0) {
          const { data: hws } = await db.from('homework_assignments')
            .select('id, student_id, content, assigned_date, end_date, check_status, result')
            .in('student_id', studentIds)
            .eq('subject', subj)
            .in('check_status', ['pending', 'assigned'])
            .lte('assigned_date', todayStr)
            .order('assigned_date', { ascending: false })
            .limit(300);
          setOpenHws((hws || []) as OpenHw[]);
        }
      } catch (e: any) {
        toast.error(`불러오기 실패: ${e.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, sessionDate]);

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

  // 게릴라 학생을 명단에 합쳐 출결·쪽지에 표시(진도 기록에는 미포함)
  const walkinStudents = useMemo(
    () => walkinPool.filter(s => walkinIds.has(s.id)),
    [walkinPool, walkinIds]
  );
  const effectiveStudents = useMemo(
    () => [...students, ...walkinStudents],
    [students, walkinStudents]
  );

  async function openWalkinPicker() {
    setWalkinPickerOpen(true);
    if (walkinPool.length > 0) return;
    const memberIds = new Set(students.map(s => s.id));
    const { data } = await supabase.from('students')
      .select('id, name, grade').in('enrollment_status', ['재학', '재등원']).order('name');
    setWalkinPool(((data || []) as any[])
      .filter(s => !memberIds.has(s.id))
      .map(s => ({ id: s.id, name: s.name, grade: s.grade, type: null })));
  }

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

  async function setGoalState(goalId: string, state: 'done' | 'partial' | 'defer', upto?: string, onlyStudentIds?: string[]) {
    if (!sessionId) return;
    const targetIds = onlyStudentIds ?? students.filter(s => !absent.has(s.id)).map(s => s.id);
    const absentIds = onlyStudentIds ? [] : students.filter(s => absent.has(s.id)).map(s => s.id);
    const statusMap = { done: 'advanced', partial: 'partial', defer: 'deferred' } as const;
    try {
      const rows = [
        ...targetIds.map(sid => ({
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
      // 학생별 상태 저장 (bulk이면 모두 같은 상태로)
      setPerStudent(prev => {
        const next = { ...prev };
        const cur = { ...(next[goalId] || {}) };
        targetIds.forEach(sid => { cur[sid] = { state, upto: upto || '' }; });
        next[goalId] = cur;
        return next;
      });
      // 전체 대상이면 그룹 상태도 세팅 (헤더 배지 유지)
      if (!onlyStudentIds) {
        setGoalStates(p => ({ ...p, [goalId]: { state, upto: upto || '' } }));
      }
      // 로컬 progress 갱신 — 이번에 건드린 학생만 교체
      setProgress(prev => {
        const touched = new Set(rows.map(r => `${r.student_id}::${r.goal_id}`));
        const rest = prev.filter(p => !touched.has(`${p.student_id}::${p.goal_id}`));
        return [...rest, ...rows.map(r => ({
          student_id: r.student_id, goal_id: r.goal_id, status: r.status, partial_upto: (r as any).partial_upto || null,
        }))];
      });
      if (state === 'done') toast.success(`진도 기록 — ${targetIds.length}명 반영${absentIds.length ? ` (결석 ${absentIds.length}명 스킵 표시)` : ''}`);
      if (state === 'partial') toast.success(`${upto}까지 기록 — ${targetIds.length}명, 다음 수업에 "이어서"로 자동 표기`);
      if (state === 'defer') toast(`미루기 — ${targetIds.length}명, 남은 수업에 자동 재분배`);
    } catch (e: any) {
      toast.error(`진도 저장 실패: ${e.message || e}`);
    }
  }

  // ── PAGE-BASED PROGRESS V1 ── 총 도달 페이지 하나로 여러 goal 자동 판단
  function extractPageRange(pages: string | null): { start: number; end: number } | null {
    if (!pages) return null;
    const nums = (pages.match(/\d+/g) || []).map(Number);
    if (nums.length === 0) return null;
    return { start: nums[0], end: nums[nums.length - 1] };
  }
  function parsePageInput(raw: string): number | null {
    const m = (raw || '').match(/\d+/);
    return m ? Number(m[0]) : null;
  }
  // 오늘 시작 goal 인덱스 = 첫 todayGoal의 trackGoals 내 인덱스
  const todayStartIdx = useMemo(() => {
    if (todayGoals.length === 0) return groupPosIdx + 1;
    const firstId = todayGoals[0].goal.id;
    const i = trackGoals.findIndex(g => g.id === firstId);
    return i >= 0 ? i : groupPosIdx + 1;
  }, [todayGoals, trackGoals, groupPosIdx]);
  const todayEndIdx = useMemo(() => {
    if (todayGoals.length === 0) return todayStartIdx - 1;
    const lastId = todayGoals[todayGoals.length - 1].goal.id;
    const i = trackGoals.findIndex(g => g.id === lastId);
    return i >= 0 ? i : todayStartIdx - 1;
  }, [todayGoals, trackGoals, todayStartIdx]);

  // 학생별 "총 도달 페이지" 입력 초안
  const [reachedDrafts, setReachedDrafts] = useState<Record<string, string>>({}); // studentId | '__all__'

  async function applyReachedPage(studentIds: string[], page: number): Promise<{ lastDoneIdx: number; partialIdx: number | null } | null> {
    if (todayGoals.length === 0 || !sessionId) return null;
    let lastDoneIdx = todayStartIdx - 1;
    let partialIdx: number | null = null;
    // 오늘 시작부터 트랙 끝까지 훑으며 자동 판단
    for (let i = todayStartIdx; i < trackGoals.length; i++) {
      const g = trackGoals[i];
      const range = extractPageRange(g.pages);
      if (!range) break;
      if (page >= range.end) {
        await setGoalState(g.id, 'done', undefined, studentIds);
        lastDoneIdx = i;
      } else if (page >= range.start) {
        await setGoalState(g.id, 'partial', `p.${page}`, studentIds);
        partialIdx = i;
        break;
      } else {
        break;
      }
    }
    return { lastDoneIdx, partialIdx };
  }

  async function submitReached(scope: 'all' | string, raw: string) {
    const page = parsePageInput(raw);
    if (page == null) { toast.error('페이지 숫자를 적어주세요 (예: 68 또는 p.68)'); return; }
    const targetIds = scope === 'all'
      ? students.filter(s => !absent.has(s.id)).map(s => s.id)
      : [scope];
    if (targetIds.length === 0) { toast.error('대상 학생이 없어요'); return; }
    const result = await applyReachedPage(targetIds, page);
    if (!result) return;
    // 여유(순항) 계산: 오늘 예정 마지막 goal 인덱스 대비 얼마나 앞섰는지
    const extraGoals = result.lastDoneIdx - todayEndIdx;
    const paceVal = pace ?? 1;
    const extraSessions = extraGoals > 0 && paceVal > 0 ? (extraGoals / paceVal) : 0;
    const label = scope === 'all' ? `${targetIds.length}명` : (students.find(s => s.id === scope)?.name || '학생');
    if (extraGoals > 0) {
      toast.success(`🚀 ${label} 순항중 — 계획보다 +${extraGoals}목표 앞섬 (약 ${extraSessions.toFixed(1)}회분 여유)`);
    } else if (result.partialIdx != null && result.partialIdx === todayEndIdx) {
      toast.success(`✓ ${label} 오늘 목표 도달 — p.${page}까지 기록`);
    } else if (result.lastDoneIdx >= todayEndIdx) {
      toast.success(`✓ ${label} 오늘 목표 완료 — p.${page}까지 기록`);
    } else {
      toast(`◐ ${label} p.${page}까지 기록 — 오늘 목표 일부만`);
    }
  }

  async function resolveQueueItem(q: QueueRow) {
    try {
      await db.from('plan_queue').update({ status: 'done', resolved_at: new Date().toISOString() }).eq('id', q.id);
      setQueue(p => p.filter(x => x.id !== q.id));
      toast.success('처리 완료');
    } catch (e: any) { toast.error(e.message || String(e)); }
  }

  // 학생별 오늘 진도 요약 (수업일지 lesson_range 생성용)
  function summarizeStudentToday(sid: string): {
    range: string; nextGoalTitle: string | null; hadProgress: boolean;
  } {
    const donePartial: { g: PlanGoal; state: 'done' | 'partial'; upto?: string }[] = [];
    let lastIdx = -1;
    for (let i = todayStartIdx; i < trackGoals.length; i++) {
      const g = trackGoals[i];
      const local = perStudent[g.id]?.[sid];
      const p = progress.find(r => r.goal_id === g.id && r.student_id === sid);
      const state = local?.state
        ?? (p ? (['advanced', 'verified_ok', 'verified_weak'].includes(p.status) ? 'done'
          : p.status === 'partial' ? 'partial' : null) : null);
      if (state === 'done') { donePartial.push({ g, state: 'done' }); lastIdx = i; }
      else if (state === 'partial') {
        donePartial.push({ g, state: 'partial', upto: local?.upto || p?.partial_upto || '' });
        lastIdx = i; break;
      } else break;
    }
    if (donePartial.length === 0) return { range: '', nextGoalTitle: trackGoals[todayStartIdx]?.title || null, hadProgress: false };
    const first = donePartial[0].g;
    const last = donePartial[donePartial.length - 1];
    const startPage = extractPageRange(first.pages)?.start;
    const endPage = last.state === 'partial'
      ? (parsePageInput(last.upto || '') ?? extractPageRange(last.g.pages)?.end)
      : extractPageRange(last.g.pages)?.end;
    const goalPart = donePartial.length === 1
      ? `${first.order_index}. ${first.title}${last.state === 'partial' ? ` (일부 ~${last.upto || `p.${endPage}`})` : ''}`
      : `${first.order_index}. ${first.title} ~ ${last.g.order_index}. ${last.g.title}${last.state === 'partial' ? ` (일부)` : ''}`;
    const pagePart = startPage != null && endPage != null ? ` · p.${startPage}~p.${endPage}` : '';
    const nextGoal = trackGoals[lastIdx + 1]?.title || null;
    return { range: `${goalPart}${pagePart}`, nextGoalTitle: nextGoal, hadProgress: true };
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

      // ── LESSON-HW-BRIDGE-V1 ── 수업일지·숙제 자동 반영 ──
      let lrCount = 0, hwCheckCount = 0, hwNewCount = 0;
      if (subject) {
        const teacherId = sessionMeta.assigned_teacher_id || design.teacher_id;
        // 1) 숙제 확인: hwChecks 반영
        const hwCheckRows = Object.entries(hwChecks);
        for (const [hwId, v] of hwCheckRows) {
          const { error: hwErr } = await db.from('homework_assignments').update({
            check_status: 'checked',
            result: v.result,
            checked_by: user?.id || null,
            checked_at: new Date().toISOString(),
            notes: v.note || null,
          }).eq('id', hwId);
          if (!hwErr) hwCheckCount++;
        }

        // 학생별 숙제 상태 집계
        const hwByStudent = new Map<string, 'completed' | 'partial' | 'not_done' | 'none_assigned'>();
        for (const s of students) {
          if (absent.has(s.id)) continue;
          const hwsForS = openHws.filter(h => h.student_id === s.id);
          if (hwsForS.length === 0) { hwByStudent.set(s.id, 'none_assigned'); continue; }
          const results = hwsForS.map(h => hwChecks[h.id]?.result || (h.result as any) || null);
          if (results.some(r => r === 'not_done')) hwByStudent.set(s.id, 'not_done');
          else if (results.some(r => r === 'partial')) hwByStudent.set(s.id, 'partial');
          else if (results.every(r => r === 'completed')) hwByStudent.set(s.id, 'completed');
          else hwByStudent.set(s.id, 'none_assigned');
        }

        // 2) 학생별 수업일지 upsert (출결 학생만)
        for (const s of students) {
          const isAbsent = absent.has(s.id);
          const summary = summarizeStudentToday(s.id);
          const hwStatus = isAbsent ? 'none_assigned' : (hwByStudent.get(s.id) || 'none_assigned');
          const range = isAbsent
            ? '결석'
            : (summary.range || (design.title ? `${design.title} 진행` : '수업 진행'));

          const quiz = quizSaved[s.id];
          const understanding = quiz ? Math.max(1, Math.min(5, Math.round(quiz.score / 20))) : null;

          // 기존 lesson_record 있는지 확인
          const { data: existingLR } = await db.from('lesson_records')
            .select('id')
            .eq('teacher_id', teacherId)
            .eq('student_id', s.id)
            .eq('subject', subject)
            .eq('lesson_date', todayStr)
            .maybeSingle();

          const payload: any = {
            teacher_id: teacherId,
            student_id: s.id,
            class_id: design.class_id || null,
            subject,
            lesson_date: todayStr,
            lesson_range: range,
            homework_status: hwStatus,
            next_lesson_goal: summary.nextGoalTitle || null,
            notes: note.trim() || null,
            understanding_score: understanding,
            attendance_status: isAbsent ? ['결석'] : ['출석'],
          };

          let lessonRecordId: string | null = null;
          if (existingLR?.id) {
            lessonRecordId = existingLR.id;
            await db.from('lesson_records').update(payload).eq('id', existingLR.id);
          } else {
            const { data: ins } = await db.from('lesson_records').insert(payload).select('id').single();
            lessonRecordId = ins?.id || null;
          }
          if (lessonRecordId) lrCount++;

          // 3) 다음 수업 숙제 부여 (결석자 제외)
          if (!isAbsent) {
            const hwContent = (nextHwPerStudent[s.id] ?? nextHwBulk ?? '').trim();
            if (hwContent) {
              const { error: nhErr } = await db.from('homework_assignments').insert({
                student_id: s.id,
                subject,
                lesson_record_id: lessonRecordId,
                assigned_date: todayStr,
                end_date: nextHwDue || null,
                content: hwContent,
                check_status: 'pending',
                homework_type: 'written',
                required_submissions: 1,
                created_by: user?.id || null,
              });
              if (!nhErr) hwNewCount++;
            }
          }
        }
      }

      setSavedDone(true);
      const parts = ['오늘 기록 저장 완료'];
      if (lrCount > 0) parts.push(`수업일지 ${lrCount}건`);
      if (hwCheckCount > 0) parts.push(`숙제 확인 ${hwCheckCount}건`);
      if (hwNewCount > 0) parts.push(`다음 숙제 ${hwNewCount}건`);
      if (nextMemo.trim()) parts.push('📌 다음 수업 메모');
      toast.success(parts.join(' · '));
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

  const todayRole = ((design.rhythm || {})[String(new Date().getDay())] || 'progress') as SessionRole;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 헤더 카드 */}
      <div className="rounded-2xl border bg-gradient-to-br from-primary/8 to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge className="text-[11px]">{onlyIds ? '개인 수업' : '오늘 수업'}</Badge>
              {sessionMeta.intensive_id && (
                <Badge variant="outline" className="border-primary/60 text-primary text-[11px]">✨ 특강 회차</Badge>
              )}
              <Badge variant="secondary" className="text-[11px]">{ROLE_LABELS[todayRole]}</Badge>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">{design.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date().getMonth() + 1}월 {new Date().getDate()}일 · {students.length}명
              {pace != null && ` · 회당 ${pace.toFixed(1)}개 페이스`}
              {intensiveExtra > 0 && ` (특강 +${intensiveExtra}회)`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/plan')}>
              <Undo2 className="w-4 h-4 mr-1" />목록
            </Button>
            {coTeachers.length > 0 && (
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs font-medium"
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
                <option value={design.teacher_id}>담당: {mainTeacherName}</option>
                {coTeachers
                  .filter(c => c.start_date <= todayStr && c.end_date >= todayStr)
                  .map(c => <option key={c.teacher_id} value={c.teacher_id}>담당: {c.name} (공동)</option>)}
              </select>
            )}
          </div>
        </div>
        {onlyIds && (
          <div className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary flex items-center gap-1.5">
            <UserCheck className="w-4 h-4" />
            개인 수업 — {students.map(s => s.name).join(', ') || '대상 없음'}만 진행합니다. 반 전체 진도에는 영향을 주지 않아요.
          </div>
        )}
      </div>

      {/* 3단계 스테퍼 */}
      <div className="grid grid-cols-3 gap-2">
        {stepDefs.map(sd => (
          <button key={sd.n}
            className={`rounded-xl border-2 p-3 text-left transition
              ${step === sd.n ? 'border-primary bg-primary/5 shadow-sm' : sd.n < step ? 'border-green-300 bg-green-50' : 'border-border hover:border-muted-foreground/30'}`}
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
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-muted-foreground">출결 — 이름을 누르면 결석 처리 (오늘 진도에서 자동 스킵 표시)</p>
              <Button variant="outline" size="sm" className="ml-auto h-7" onClick={openWalkinPicker}>
                <UserPlus className="w-3.5 h-3.5 mr-1" />게릴라 등록
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {effectiveStudents.map(s => {
                const isWalkin = walkinIds.has(s.id);
                return (
                  <button key={s.id}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition
                      ${absent.has(s.id) ? 'border-red-300 bg-red-50 text-red-600'
                        : isWalkin ? 'border-primary/50 bg-primary/5 text-primary'
                        : 'border-green-300 bg-green-50 text-green-700'}`}
                    onClick={() => setAbsent(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                    {absent.has(s.id) && <UserX className="w-3.5 h-3.5 inline mr-1" />}
                    {s.name}
                    {isWalkin && <span className="ml-1 text-[10px]">게릴라</span>}
                    {s.type && <span className={`ml-1 text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                  </button>
                );
              })}
            </div>
            {walkinStudents.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                게릴라 {walkinStudents.length}명은 오늘 출결·쪽지에만 반영되고, 이 반 커리큘럼 진도에는 포함되지 않습니다.
              </p>
            )}
          </CardContent></Card>

          {hasQuiz && quizTarget && (
            <Card><CardContent className="p-4 space-y-3">
              <p className="text-xs font-bold text-muted-foreground">
                쪽지시험 — <span className="text-foreground">{quizTarget.title}</span> {quizTarget.pages}
                <Badge variant="secondary" className="ml-2 text-[10px]">룰셋 자동</Badge>
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {effectiveStudents.filter(s => !absent.has(s.id)).map(s => {
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

          {/* LESSON-HW-BRIDGE-V1: 지난 숙제 확인 */}
          {openHws.length > 0 && (
            <Card><CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground">
                📝 지난 숙제 확인 — {openHws.length}건 (수업일지 숙제란에 자동 반영)
              </p>
              <div className="space-y-1.5">
                {students.filter(s => openHws.some(h => h.student_id === s.id)).map(s => {
                  const mine = openHws.filter(h => h.student_id === s.id);
                  return (
                    <div key={s.id} className="border rounded-lg px-2.5 py-2 bg-background space-y-1">
                      <p className="text-sm font-bold flex items-center gap-1">{s.name}
                        {s.type && <span className={`text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                      </p>
                      {mine.map(h => {
                        const cur = hwChecks[h.id]?.result;
                        return (
                          <div key={h.id} className="flex flex-wrap items-center gap-1.5 pl-1">
                            <span className="text-xs flex-1 min-w-[140px] truncate" title={h.content}>· {h.content}</span>
                            <div className="flex gap-1">
                              {([
                                { k: 'completed', label: '✓ 완료', cls: 'border-green-400 text-green-700 bg-green-50' },
                                { k: 'partial', label: '◐ 일부', cls: 'border-amber-400 text-amber-700 bg-amber-50' },
                                { k: 'not_done', label: '✗ 미제출', cls: 'border-red-400 text-red-700 bg-red-50' },
                              ] as const).map(o => (
                                <button key={o.k}
                                  className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${cur === o.k ? o.cls : 'text-muted-foreground'}`}
                                  onClick={() => setHwChecks(p => ({ ...p, [h.id]: { ...(p[h.id] || { result: 'completed' as const }), result: o.k } }))}>
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
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
            <>
              {/* 오늘 목표 요약 배너 */}
              <div className="rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
                <p className="text-[11px] font-bold text-primary/80 mb-1">🎯 오늘의 목표 ({todayGoals.length}개)</p>
                <p className="text-sm font-extrabold leading-snug">
                  {todayGoals[0].goal.order_index}. {todayGoals[0].goal.title}
                  {todayGoals.length > 1 && <> ~ {todayGoals[todayGoals.length - 1].goal.order_index}. {todayGoals[todayGoals.length - 1].goal.title}</>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {todayGoals[0].goal.pages}
                  {todayGoals.length > 1 && todayGoals[todayGoals.length - 1].goal.pages && ` → ${todayGoals[todayGoals.length - 1].goal.pages}`}
                  {' · '}학생마다 진도가 다르면 아래에서 개별로 기록하세요
                </p>
              </div>

              {/* 🚀 총 도달 페이지 (권장) — 학생별로 실제 나간 페이지만 적으면 자동으로 여러 목표에 나눠 기록 */}
              {(() => {
                const presentStudents = students.filter(s => !absent.has(s.id));
                const todayEndPage = extractPageRange(trackGoals[todayEndIdx]?.pages || null)?.end ?? null;
                const paceVal = pace ?? 1;
                const reachedStateFor = (sid: string): { lastIdx: number; page: number | null } => {
                  let lastIdx = -1;
                  let page: number | null = null;
                  for (let i = todayStartIdx; i < trackGoals.length; i++) {
                    const g = trackGoals[i];
                    const local = perStudent[g.id]?.[sid];
                    const p = progress.find(r => r.goal_id === g.id && r.student_id === sid);
                    const state = local?.state
                      ?? (p ? (['advanced', 'verified_ok', 'verified_weak'].includes(p.status) ? 'done'
                        : p.status === 'partial' ? 'partial' : null) : null);
                    if (state === 'done') { lastIdx = i; }
                    else if (state === 'partial') {
                      const uptoRaw = local?.upto || p?.partial_upto || '';
                      const parsed = parsePageInput(uptoRaw);
                      if (parsed != null) page = parsed;
                      break;
                    } else { break; }
                  }
                  if (page == null && lastIdx >= 0) {
                    page = extractPageRange(trackGoals[lastIdx].pages)?.end ?? null;
                  }
                  return { lastIdx, page };
                };
                return (
                  <Card className="border-primary/30 bg-primary/[0.03]">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-primary">🚀 총 도달 페이지 (권장)</span>
                        <span className="text-[11px] text-muted-foreground">
                          학생이 실제 나간 마지막 페이지만 적으면 여러 목표에 자동 분배해서 기록해요
                          {todayEndPage != null && ` · 오늘 목표 끝: p.${todayEndPage}`}
                        </span>
                      </div>

                      {/* 전체 일괄 */}
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2">
                        <span className="text-[11px] font-bold text-muted-foreground mr-1">전체 일괄:</span>
                        <Input
                          placeholder="예: 68"
                          className="h-7 w-24 text-center text-xs"
                          value={reachedDrafts['__all__'] ?? ''}
                          onChange={e => setReachedDrafts(p => ({ ...p, __all__: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') submitReached('all', reachedDrafts['__all__'] || ''); }}
                        />
                        <Button size="sm" className="h-7 text-xs" onClick={() => submitReached('all', reachedDrafts['__all__'] || '')}>
                          <Check className="w-3.5 h-3.5 mr-1" />자동 기록
                        </Button>
                      </div>

                      {/* 학생별 입력 + 순항 배지 */}
                      <div className="space-y-1.5">
                        {presentStudents.length === 0 && (
                          <p className="text-xs text-muted-foreground italic px-1">출석 학생 없음</p>
                        )}
                        {presentStudents.map(s => {
                          const rs = reachedStateFor(s.id);
                          const extra = rs.lastIdx - todayEndIdx;
                          const extraSess = extra > 0 && paceVal > 0 ? (extra / paceVal) : 0;
                          const behind = rs.lastIdx >= 0 && rs.lastIdx < todayEndIdx;
                          const behindGoals = behind ? (todayEndIdx - rs.lastIdx) : 0;
                          return (
                            <div key={s.id} className="flex flex-wrap items-center gap-1.5 border rounded-lg px-2.5 py-1.5 bg-background">
                              <span className="font-bold text-sm min-w-[60px]">{s.name}</span>
                              {s.type && <span className={`text-[10px] font-bold ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                              {rs.page != null && (
                                <Badge variant="outline" className="text-[10px]">
                                  ~p.{rs.page}
                                </Badge>
                              )}
                              {extra > 0 && (
                                <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-100">
                                  🚀 순항중 +{extra}목표 · 약 {extraSess.toFixed(1)}회 여유
                                </Badge>
                              )}
                              {extra === 0 && rs.lastIdx === todayEndIdx && (
                                <Badge className="text-[10px] bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-100">
                                  ✓ 계획대로
                                </Badge>
                              )}
                              {behind && (
                                <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">
                                  계획보다 -{behindGoals}목표
                                </Badge>
                              )}
                              <div className="ml-auto flex items-center gap-1">
                                <Input
                                  placeholder="p.68"
                                  className="h-7 w-20 text-center text-xs"
                                  value={reachedDrafts[s.id] ?? ''}
                                  onChange={e => setReachedDrafts(p => ({ ...p, [s.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') submitReached(s.id, reachedDrafts[s.id] || ''); }}
                                />
                                <Button size="sm" className="h-7 text-xs px-2" onClick={() => submitReached(s.id, reachedDrafts[s.id] || '')}>
                                  기록
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        아래 목표별 카드는 세부 조정이 필요할 때만 쓰세요. 여기서 페이지만 적으면 자동 채워집니다.
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}



              {todayGoals.map(({ goal, continueFrom }) => {
                const st = goalStates[goal.id];
                const presentStudents = students.filter(s => !absent.has(s.id));
                const getStuState = (sid: string) => {
                  const local = perStudent[goal.id]?.[sid];
                  if (local) return local;
                  const p = progress.find(r => r.goal_id === goal.id && r.student_id === sid);
                  if (!p) return null;
                  if (['advanced', 'verified_ok', 'verified_weak'].includes(p.status)) return { state: 'done' as const, upto: '' };
                  if (p.status === 'partial') return { state: 'partial' as const, upto: p.partial_upto || '' };
                  if (p.status === 'deferred') return { state: 'defer' as const, upto: '' };
                  return null;
                };
                const bulkKey = `${goal.id}::__all__`;
                return (
                  <Card key={goal.id} className={
                    st?.state === 'done' ? 'border-green-300 bg-green-50/40'
                      : st?.state === 'partial' ? 'border-amber-300 bg-amber-50/40'
                        : st?.state === 'defer' ? 'opacity-70' : ''}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-extrabold">{goal.order_index}. {goal.title}</span>
                        <span className="text-xs text-muted-foreground">{goal.pages}</span>
                        {continueFrom && (
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                            지난 시간 {continueFrom}까지 — 이어서
                          </Badge>
                        )}
                      </div>
                      {design.teaching_mode === 'abc' && design.angle_mode !== 'off' && (
                        <p className="text-xs text-muted-foreground">
                          {(['A', 'B', 'C'] as const).filter(t => design.type_concepts?.[t]).map(t => (
                            <span key={t} className="mr-3"><b className={TYPE_COLORS[t]}>{t}</b> {design.type_concepts[t]}</span>
                          ))}
                        </p>
                      )}

                      {/* 일괄 처리 (모두 같은 진도일 때) */}
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2">
                        <span className="text-[11px] font-bold text-muted-foreground mr-1">전체 일괄:</span>
                        <Button size="sm" className="h-7 text-xs" onClick={() => setGoalState(goal.id, 'done')}>
                          <Check className="w-3.5 h-3.5 mr-1" />모두 다 나감
                        </Button>
                        <Input
                          placeholder="p.55"
                          className="h-7 w-20 text-center text-xs"
                          value={uptoDrafts[bulkKey] ?? ''}
                          onChange={e => setUptoDrafts(p => ({ ...p, [bulkKey]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                          const v = (uptoDrafts[bulkKey] || '').trim();
                          if (!v) { toast.error('어디까지 나갔는지 적어주세요 (예: p.55)'); return; }
                          setGoalState(goal.id, 'partial', v.startsWith('p') ? v : `p.${v}`);
                        }}>◐ 모두 일부만</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setGoalState(goal.id, 'defer')}>→ 전체 미루기</Button>
                      </div>

                      {/* 학생별 개별 기록 */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-muted-foreground">학생별 진도 — 다르면 개별로 눌러주세요</p>
                        {presentStudents.length === 0 && (
                          <p className="text-xs text-muted-foreground italic px-1">출석 학생 없음</p>
                        )}
                        {presentStudents.map(s => {
                          const ss = getStuState(s.id);
                          const key = `${goal.id}::${s.id}`;
                          return (
                            <div key={s.id} className="flex flex-wrap items-center gap-1.5 border rounded-lg px-2.5 py-1.5 bg-background">
                              <span className="font-bold text-sm min-w-[60px]">{s.name}</span>
                              {s.type && <span className={`text-[10px] font-bold ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                              {ss && (
                                <Badge variant="outline" className={`text-[10px] ${
                                  ss.state === 'done' ? 'border-green-400 text-green-700 bg-green-50'
                                    : ss.state === 'partial' ? 'border-amber-400 text-amber-700 bg-amber-50'
                                      : 'border-muted-foreground/40 text-muted-foreground'}`}>
                                  {ss.state === 'done' ? '✓ 다 나감' : ss.state === 'partial' ? `◐ ~${ss.upto}` : '→ 미룸'}
                                </Badge>
                              )}
                              <div className="ml-auto flex items-center gap-1">
                                <Button size="sm" variant={ss?.state === 'done' ? 'default' : 'outline'} className="h-7 text-xs px-2" onClick={() => setGoalState(goal.id, 'done', undefined, [s.id])}>
                                  다 나감
                                </Button>
                                <Input
                                  placeholder="p.55"
                                  className="h-7 w-16 text-center text-xs"
                                  value={uptoDrafts[key] ?? ''}
                                  onChange={e => setUptoDrafts(p => ({ ...p, [key]: e.target.value }))}
                                />
                                <Button size="sm" variant={ss?.state === 'partial' ? 'default' : 'outline'} className="h-7 text-xs px-2" onClick={() => {
                                  const v = (uptoDrafts[key] || '').trim();
                                  if (!v) { toast.error(`${s.name} — 어디까지 나갔는지 적어주세요`); return; }
                                  setGoalState(goal.id, 'partial', v.startsWith('p') ? v : `p.${v}`, [s.id]);
                                }}>일부만</Button>
                                <Button size="sm" variant={ss?.state === 'defer' ? 'default' : 'ghost'} className="h-7 text-xs px-2" onClick={() => setGoalState(goal.id, 'defer', undefined, [s.id])}>미룸</Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
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
            <p>· 출석 {effectiveStudents.length - absent.size}명{absent.size > 0 && ` / 결석 ${absent.size}명 (진도 스킵 표시)`}{walkinStudents.length > 0 && ` · 게릴라 ${walkinStudents.length}명 포함`}</p>
            <p>· 쪽지시험 {Object.keys(quizSaved).length}명 기록
              {Object.values(quizSaved).filter(v => !v.passed).length > 0 &&
                ` — 미달 ${Object.values(quizSaved).filter(v => !v.passed).length}명 자동 큐 등록`}</p>
            <p>· 진도: {Object.entries(goalStates).length === 0 ? '기록 없음'
              : Object.entries(goalStates).map(([gid, st]) => {
                const g = goals.find(x => x.id === gid);
                return `${g?.order_index}. ${st.state === 'done' ? '완료' : st.state === 'partial' ? `일부(~${st.upto})` : '미룸'}`;
              }).join(' · ')}</p>
          </CardContent></Card>

          {/* LESSON-HW-BRIDGE-V1: 다음 수업 숙제 부여 */}
          <Card><CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-muted-foreground">📚 다음 수업 숙제 — 저장 시 학생별로 자동 부여</p>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">마감</span>
                <Input type="date" className="h-7 w-36 text-xs" value={nextHwDue}
                  onChange={e => setNextHwDue(e.target.value)} />
              </div>
            </div>
            <Input placeholder="전체 공통 숙제 (예: 워크북 p.30~35 풀이)"
              value={nextHwBulk} onChange={e => setNextHwBulk(e.target.value)} />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">학생별로 다르게 부여 (선택)</summary>
              <div className="mt-2 space-y-1.5">
                {students.filter(s => !absent.has(s.id)).map(s => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span className="font-bold text-xs min-w-[60px]">{s.name}</span>
                    <Input placeholder={nextHwBulk || '(공통 없음)'} className="h-7 text-xs"
                      value={nextHwPerStudent[s.id] ?? ''}
                      onChange={e => setNextHwPerStudent(p => ({ ...p, [s.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </details>
            <p className="text-[10px] text-muted-foreground">
              비워두면 숙제 없이 저장. 학생별 칸이 비면 공통 숙제가 자동 적용됩니다.
            </p>
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

      {/* 게릴라(임시 참석) 학생 선택 */}
      <Dialog open={walkinPickerOpen} onOpenChange={setWalkinPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>게릴라 등록 — 오늘 온 학생 추가</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            원래 이 반 학생이 아니지만 오늘 온 아이를 오늘 수업에만 얹습니다. 출결·쪽지에 반영되고, 반 커리큘럼 진도에는 안 들어갑니다.
          </p>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input placeholder="이름 검색" value={walkinFilter} onChange={e => setWalkinFilter(e.target.value)} className="h-9" />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
            {walkinPool
              .filter(s => !walkinFilter || s.name.includes(walkinFilter))
              .slice(0, 60)
              .map(s => {
                const picked = walkinIds.has(s.id);
                return (
                  <button key={s.id}
                    className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left ${picked ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                    onClick={() => setWalkinIds(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                    <span>{s.name} <span className="text-xs text-muted-foreground">{s.grade}</span></span>
                    {picked && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            {walkinPool.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">불러오는 중…</p>}
          </div>
          <Button onClick={() => setWalkinPickerOpen(false)}>완료 ({walkinIds.size}명 선택)</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
