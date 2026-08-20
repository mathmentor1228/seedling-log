// LESSON-PLAN-CORE-V1: 수업 당일 3단계 화면 — 설계가 만들어주는 오늘 수업
// 1. 수업 시작(포스트잇·출결·쪽지 채점·과제) → 2. 진도(다 나감/일부/미루기) → 3. 마무리(요약·메모·저장)
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toStorageAttendanceStatuses } from '@/lib/attendance';
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
  AlertTriangle, UserX, Undo2, UserPlus, Search, UserCheck, ChevronDown, CalendarX,
} from 'lucide-react';
import { PlanGoal, SessionRole, ROLE_LABELS, countProgressSessions, cancelSession, uncancelSession } from './planApi';
import { ProgressAdjustModal } from './ProgressAdjustModal';
import { TrackMapPanel } from './TrackMapPanel';

const db = supabase as any;

type Design = any;
type StudentInfo = { id: string; name: string; grade: string | null; type: 'A' | 'B' | 'C' | null };
type ProgressRow = {
  student_id: string; goal_id: string; status: string; partial_upto: string | null;
  review_count?: number | null; next_review_date?: string | null;
  session_id?: string | null;
};

// PLAN-REVIEW-SM2-V1: 망각곡선 복습 사다리 — 확인 성공마다 간격이 늘고, 실패하면 3일로 리셋
const REVIEW_LADDER = [3, 7, 14, 30, 60];
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function reviewFields(result: 'ok' | 'weak', prevCount: number | null | undefined, baseDate: string) {
  if (result === 'ok') {
    const count = (prevCount || 0) + 1;
    const interval = REVIEW_LADDER[Math.min(count - 1, REVIEW_LADDER.length - 1)];
    return { review_count: count, review_interval: interval, next_review_date: addDays(baseDate, interval) };
  }
  return { review_count: 0, review_interval: REVIEW_LADDER[0], next_review_date: addDays(baseDate, REVIEW_LADDER[0]) };
}
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
  const [sessionMeta, setSessionMeta] = useState<{ intensive_id: string | null; assigned_teacher_id: string | null; status: string; cancel_reason: string | null }>({ intensive_id: null, assigned_teacher_id: null, status: 'draft', cancel_reason: null });
  // PLAN-CANCEL-V1: 휴강 처리 다이얼로그
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [intensiveExtra, setIntensiveExtra] = useState(0); // 기한 내 남은 특강 회차 (정규 요일과 안 겹치는 것)
  const [coTeachers, setCoTeachers] = useState<{ teacher_id: string; name: string; start_date: string; end_date: string }[]>([]);
  const [mainTeacherName, setMainTeacherName] = useState('');

  const [step, setStep] = useState(1);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  // PLAN-ABSENT-3WAY-V1: 결석 처리 3형 — skip(넘어감)/makeup(보충 큐)/defer(진도 미루기)
  // 기본값: 그룹 수업 → 스킵, 1:1(individual) → 보충. 결석 체크 시 학생별 원탭 변경.
  type AbsentHandling = 'skip' | 'makeup' | 'defer';
  const [absentHandling, setAbsentHandling] = useState<Record<string, AbsentHandling>>({});
  // ATTENDANCE-NORMALIZE-V1: 결석은 인정/무단으로만 저장한다(레거시 '결석' 금지). 기본 인정결석.
  type AbsentKind = '인정결석' | '무단결석';
  const [absentKind, setAbsentKind] = useState<Record<string, AbsentKind>>({});
  const [quizScores, setQuizScores] = useState<Record<string, string>>({});
  const [quizSaved, setQuizSaved] = useState<Record<string, { score: number; passed: boolean; label: string }>>({});
  // PLAN-QUIZ-CONTENT-V1: 시험 내용(선택) — 비우면 quizTarget 목표명으로 기록
  const [quizContent, setQuizContent] = useState('');
  // PLAN-QUIZ-CONTENT-V2: 학생별 시험 내용(선택) — 아이마다 시험 범위가 다를 때
  const [quizContentPerStudent, setQuizContentPerStudent] = useState<Record<string, string>>({});
  const [errorPick, setErrorPick] = useState<Record<string, string>>({});
  const [goalStates, setGoalStates] = useState<Record<string, { state: 'done' | 'partial' | 'defer' | 'skip' | null; upto: string }>>({});
  // 학생별 진도 상태 — goalId → studentId → {state, upto}
  const [perStudent, setPerStudent] = useState<Record<string, Record<string, { state: 'done' | 'partial' | 'defer' | 'skip'; upto: string }>>>({});
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
  // PLAN-UNDERSTANDING-V1: 학생별 이해도(1-5) 수동 입력 — 쪽지시험이 없어도 저장되도록
  const [understandingPerStudent, setUnderstandingPerStudent] = useState<Record<string, number>>({});

  // PLAN-VERIFY-LOOP-V1: 확인 루프 — 지난 진행분에 ✓이해/✗미흡 도장 (이번 세션에서 찍은 것)
  const [verifiedLocal, setVerifiedLocal] = useState<Record<string, 'ok' | 'weak'>>({}); // `${goalId}::${studentId}`

  // BOOK-PROGRESS-LOG-V1: 병행교재(유형/연산 등) — 마무리 단계에서 "오늘 어디까지" 페이지 입력
  type SideBook = { id: string; student_id: string; book_title: string; subject: string; book_role: string; current_page: number; total_pages: number | null };
  const [sideBooks, setSideBooks] = useState<Record<string, SideBook[]>>({});   // student_id → 책 목록
  const [sideBookPages, setSideBookPages] = useState<Record<string, string>>({}); // book_progress_id → 입력값

  useEffect(() => {
    const ids = students.map(s => s.id);
    if (ids.length === 0) return;
    (async () => {
      const { data } = await db.from('student_book_progress')
        .select('id, student_id, book_title, subject, book_role, current_page, total_pages')
        .in('student_id', ids).eq('status', 'active');
      const m: Record<string, SideBook[]> = {};
      for (const b of (data ?? []) as SideBook[]) (m[b.student_id] ||= []).push(b);
      setSideBooks(m);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.length]);
  const [verifyExpanded, setVerifyExpanded] = useState(false);

  // PLAN-POS-ADJUST-V1: 진도 위치 조정 모달 + 조정 후 데이터 재로딩 키
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 목표별 세부 카드 접기/펼치기 — 총 도달 페이지가 주 입력이라 기본 접힘
  const [openGoalCards, setOpenGoalCards] = useState<Set<string>>(new Set());

  // 수업기록 날짜 — 기본은 오늘, 과거로 돌아가서 놓친 기입도 가능
  const [sessionDate, setSessionDate] = useState<string>(() => {
    const q = searchParams.get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return new Date().toISOString().slice(0, 10);
  });
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
          db.from('plan_goal_progress').select('*').eq('design_id', designId),
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
          .select('*')
          .eq('design_id', designId).eq('session_date', todayStr).maybeSingle();
        if (existing) {
          setSessionId(existing.id); setNote(existing.note || '');
          setSessionMeta({
            intensive_id: existing.intensive_id || null,
            assigned_teacher_id: existing.assigned_teacher_id || null,
            status: existing.status || 'draft',
            cancel_reason: existing.cancel_reason ?? null,
          });
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
        // PLAN-LESSON-SYNC-V1: check_status 실제 값은 unchecked|resubmit|checked — 미확인 = checked가 아닌 것.
        // 오래 방치된 숙제가 끝없이 쌓이지 않게 최근 30일로 한정.
        const hwSince = new Date(new Date(todayStr + 'T12:00:00').getTime() - 30 * 86400000)
          .toISOString().slice(0, 10);
        const studentIds = studs.map(s => s.id);
        if (subj && studentIds.length > 0) {
          const { data: hws } = await db.from('homework_assignments')
            .select('id, student_id, content, assigned_date, end_date, check_status, result')
            .in('student_id', studentIds)
            .eq('subject', subj)
            .in('check_status', ['unchecked', 'resubmit'])
            .gte('assigned_date', hwSince)
            // 오늘 막 내준 숙제가 "확인할 숙제"로 되돌아오지 않게 오늘 이전 것만
            .lt('assigned_date', todayStr)
            .order('assigned_date', { ascending: false })
            .limit(300);
          setOpenHws((hws || []) as OpenHw[]);

          // PLAN-HW-BRIDGE-V3: 같은 날짜·같은 과목으로 다른 경로(수업일지 일괄작성 등)에서
          // 이미 내준 숙제가 있으면 "다음 수업 숙제" 칸에 되살려 유기적으로 연결한다.
          const { data: sameDayHw } = await db.from('homework_assignments')
            .select('student_id, content, end_date, created_at')
            .in('student_id', studentIds)
            .eq('subject', subj)
            .eq('assigned_date', sessionDate)
            .order('created_at', { ascending: true })
            .limit(300);
          const perStuHw: Record<string, string> = {};
          let dueFromHw = '';
          for (const h of ((sameDayHw || []) as any[])) {
            if (!h.content) continue;
            perStuHw[h.student_id] = h.content;
            if (!dueFromHw && h.end_date) dueFromHw = h.end_date;
          }
          const contents = Object.values(perStuHw);
          if (contents.length > 0) {
            setNextHwPerStudent(prev => ({ ...perStuHw, ...prev }));
            const uniq = Array.from(new Set(contents));
            if (uniq.length === 1 && contents.length === studentIds.length) {
              setNextHwBulk(prev => prev || uniq[0]);
            }
            if (dueFromHw) setNextHwDue(dueFromHw);
          }
        }

      } catch (e: any) {
        toast.error(`불러오기 실패: ${e.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, sessionDate, reloadKey]);

  // ── 계산: 끝점까지의 목표, 그룹 현재 위치, 오늘 분량 ──
  const endIdx = useMemo(() => {
    const i = goals.findIndex(g => g.id === design?.end_goal_id);
    return i >= 0 ? i : goals.length - 1;
  }, [goals, design]);
  const trackGoals = useMemo(() => goals.slice(0, endIdx + 1), [goals, endIdx]);

  // PLAN-TODAY-REHYDRATE-V1: 오늘 세션에 이미 기록된 진도는 "지난 진도"로 간주하지 않는다.
  // 재진입 시 오늘 기록이 groupPosIdx를 밀어올려 verifyBlocks(지난 진도)로 흘러가지 않도록,
  // 위치 계산은 이전 세션 기록으로만 하고 오늘 세션 기록은 todayGoals에 편집 가능하게 되살린다.
  const pastProgress = useMemo(
    () => progress.filter(p => (p as any).session_id !== sessionId),
    [progress, sessionId]
  );
  const currentSessionGoalIds = useMemo(() => {
    const s = new Set<string>();
    if (!sessionId) return s;
    for (const p of progress) {
      if ((p as any).session_id === sessionId
        && ['advanced', 'partial', 'deferred', 'skipped', 'verified_ok', 'verified_weak'].includes(p.status)) {
        s.add(p.goal_id);
      }
    }
    return s;
  }, [progress, sessionId]);

  const advancedSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of pastProgress) {
      if (['advanced', 'partial', 'skipped', 'verified_ok', 'verified_weak'].includes(p.status)) s.add(p.goal_id);
    }
    return s;
  }, [pastProgress]);

  const groupPosIdx = useMemo(() => {
    let idx = -1;
    trackGoals.forEach((g, i) => { if (advancedSet.has(g.id)) idx = i; });
    return idx;
  }, [trackGoals, advancedSet]);

  // 직전 목표가 '일부'였으면 이어서 (지난 세션 기준)
  const partialCarry = useMemo(() => {
    if (groupPosIdx < 0) return null;
    const g = trackGoals[groupPosIdx];
    const rows = pastProgress.filter(p => p.goal_id === g.id && p.status === 'partial' && p.partial_upto);
    return rows.length > 0 ? { goal: g, upto: rows[0].partial_upto! } : null;
  }, [groupPosIdx, trackGoals, pastProgress]);

  const remainCount = trackGoals.length - 1 - groupPosIdx + (partialCarry ? 0.5 : 0);
  const remainSessions = useMemo(
    () => (design ? countProgressSessions(design.rhythm || {}, design.target_date) + intensiveExtra : 0),
    [design, intensiveExtra]
  );
  const pace = remainSessions > 0 ? remainCount / remainSessions : null;
  const autoTodayCount = pace != null ? Math.max(1, Math.round(pace)) : 1;
  // 진도 페이스 수동 조정 (느리게/빠르게) — null=자동
  const [manualTodayCount, setManualTodayCount] = useState<number | null>(null);
  const remainGoalsAhead = Math.max(1, trackGoals.length - 1 - groupPosIdx);
  const todayCount = Math.max(1, Math.min(manualTodayCount ?? autoTodayCount, remainGoalsAhead));

  const todayGoals = useMemo(() => {
    const list: { goal: PlanGoal; continueFrom?: string }[] = [];
    const seen = new Set<string>();
    if (partialCarry) { list.push({ goal: partialCarry.goal, continueFrom: partialCarry.upto }); seen.add(partialCarry.goal.id); }
    let i = groupPosIdx + 1;
    while (list.length < todayCount + (partialCarry ? 1 : 0) && i < trackGoals.length) {
      list.push({ goal: trackGoals[i] }); seen.add(trackGoals[i].id);
      i++;
    }
    // 오늘 이미 저장된 목표가 위 범위 밖에 있으면 뒤에 이어붙여 편집 가능하게 노출
    for (const g of trackGoals) {
      if (currentSessionGoalIds.has(g.id) && !seen.has(g.id)) {
        list.push({ goal: g }); seen.add(g.id);
      }
    }
    return list;
  }, [partialCarry, groupPosIdx, trackGoals, todayCount, currentSessionGoalIds]);

  // 재진입 시 오늘 세션에 이미 저장된 진도를 UI 상태(goalStates/perStudent)에 되살린다.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId || loading) return;
    if (hydratedFor === sessionId) return;
    const statusToState = (st: string): 'done' | 'partial' | 'defer' | 'skip' | null => {
      if (st === 'advanced' || st === 'verified_ok' || st === 'verified_weak') return 'done';
      if (st === 'partial') return 'partial';
      if (st === 'deferred') return 'defer';
      if (st === 'skipped') return 'skip';
      return null;
    };
    const perStu: Record<string, Record<string, { state: 'done' | 'partial' | 'defer' | 'skip'; upto: string }>> = {};
    const goalCounts: Record<string, Record<'done' | 'partial' | 'defer' | 'skip', { count: number; upto: string }>> = {};
    for (const p of progress) {
      if ((p as any).session_id !== sessionId) continue;
      const st = statusToState(p.status);
      if (!st) continue;
      const upto = p.partial_upto || '';
      perStu[p.goal_id] = perStu[p.goal_id] || {};
      perStu[p.goal_id][p.student_id] = { state: st, upto };
      goalCounts[p.goal_id] = goalCounts[p.goal_id] || { done: { count: 0, upto: '' }, partial: { count: 0, upto: '' }, defer: { count: 0, upto: '' }, skip: { count: 0, upto: '' } };
      goalCounts[p.goal_id][st].count += 1;
      if (st === 'partial' && upto) goalCounts[p.goal_id].partial.upto = upto;
    }
    const goalSt: Record<string, { state: 'done' | 'partial' | 'defer' | 'skip' | null; upto: string }> = {};
    for (const [gid, c] of Object.entries(goalCounts)) {
      const top = (['done', 'partial', 'defer', 'skip'] as const)
        .reduce((a, b) => (c[a].count >= c[b].count ? a : b));
      if (c[top].count > 0) goalSt[gid] = { state: top, upto: c[top].upto };
    }
    if (Object.keys(perStu).length > 0) setPerStudent(prev => ({ ...perStu, ...prev }));
    if (Object.keys(goalSt).length > 0) setGoalStates(prev => ({ ...goalSt, ...prev }));
    setHydratedFor(sessionId);
  }, [sessionId, loading, progress, hydratedFor]);



  const isTestDay = design && ((design.rhythm || {})[String(sessionDay)] === 'test_day');
  const hasQuiz = (design?.check_methods || []).includes('quiz');

  // 쪽지시험 대상 = 마지막으로 나간, 아직 확인 안 된 목표
  // 테스트·복습 데이에는 quiz check_method가 꺼져있어도 단원 마무리 테스트 결과를 기록해야 하므로
  // 진도가 아직 시작 전이어도 첫 목표를 대상으로 폴백한다.
  const quizTarget = useMemo(() => {
    if (groupPosIdx >= 0) {
      for (let i = groupPosIdx; i >= 0 && i > groupPosIdx - 2; i--) {
        const g = trackGoals[i];
        const verified = progress.some(p => p.goal_id === g.id && p.status.startsWith('verified'));
        if (!verified) return g;
      }
      return trackGoals[groupPosIdx];
    }
    // 진도 시작 전: 테스트 데이인 경우에만 첫 목표를 폴백으로 노출
    if (isTestDay && trackGoals.length > 0) return trackGoals[0];
    return null;
  }, [groupPosIdx, trackGoals, progress, isTestDay]);


  // PLAN-VERIFY-LOOP-V1: 확인 대기 목록 — 나갔지만(advanced) 아직 확인 도장 없는 지난 진행분.
  // 오늘 나갈 목표와, 쪽지시험이 다루는 목표는 제외. 학생별로 도장 대상이 다를 수 있어 목표 단위로 묶는다.
  const verifyBlocks = useMemo(() => {
    const todayIds = new Set(todayGoals.map(t => t.goal.id));
    const blocks: { goal: PlanGoal; stus: StudentInfo[] }[] = [];
    for (const g of trackGoals) {
      if (todayIds.has(g.id)) continue;
      if (hasQuiz && quizTarget?.id === g.id) continue;
      const stus = students.filter(s => !absent.has(s.id)
        && progress.some(p => p.goal_id === g.id && p.student_id === s.id && p.status === 'advanced'
          // 이번 세션(오늘)에 방금 찍은 진도는 "지난 진도"가 아니다 — 명단수정 후 재진입 시 밀림 방지
          && p.session_id !== sessionId));
      if (stus.length > 0) blocks.push({ goal: g, stus });
    }
    return blocks;
  }, [trackGoals, todayGoals, students, absent, progress, hasQuiz, quizTarget, sessionId]);

  // PLAN-REVIEW-SM2-V1: 오늘 복습 due — 확인 완료(verified_ok)했지만 복습 예정일이 지난 목표
  const reviewBlocks = useMemo(() => {
    const blocks: { goal: PlanGoal; stus: (StudentInfo & { due: string })[] }[] = [];
    for (const g of trackGoals) {
      const stus = students.filter(s => !absent.has(s.id)).flatMap(s => {
        const p = progress.find(r => r.goal_id === g.id && r.student_id === s.id
          && r.status === 'verified_ok' && r.next_review_date && r.next_review_date <= todayStr);
        return p ? [{ ...s, due: p.next_review_date! }] : [];
      });
      if (stus.length > 0) blocks.push({ goal: g, stus });
    }
    return blocks;
  }, [trackGoals, students, absent, progress, todayStr]);

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
    // 학생별 시험 내용 > 공통 시험 내용 > 목표명 순으로 라벨 결정
    const quizLabel = (quizContentPerStudent[stu.id] || '').trim() || quizContent.trim() || quizTarget.title;
    try {
      const baseCheck = {
        design_id: designId, session_id: sessionId, student_id: stu.id,
        goal_id: quizTarget.id, method: 'quiz', score, cutline: cut, passed,
        error_type: passed ? null : (errorPick[stu.id] || null),
      };
      // content_note는 마이그레이션 전이면 빼고 재시도
      let { data: check, error } = await db.from('plan_checks')
        .insert({ ...baseCheck, content_note: quizLabel === quizTarget.title ? null : quizLabel }).select().single();
      if (error && /column|schema|content_note/i.test(String(error.message))) {
        ({ data: check, error } = await db.from('plan_checks').insert(baseCheck).select().single());
      }
      if (error) throw error;
      setQuizSaved(p => ({ ...p, [stu.id]: { score, passed, label: quizLabel } }));
      setRecentChecks(p => [{ student_id: stu.id, goal_id: quizTarget.id, score, passed, method: 'quiz', created_at: new Date().toISOString() }, ...p]);

      // PLAN-VERIFY-LOOP-V1: 쪽지 결과가 곧 확인 도장 — 나간(advanced) 상태인 목표에 한해.
      // 로컬 progress는 건드리지 않는다 (건드리면 채점 도중 quizTarget이 다음 목표로 밀림).
      const pRow = progress.find(r => r.goal_id === quizTarget.id && r.student_id === stu.id && r.status === 'advanced');
      if (pRow) {
        const base = {
          design_id: designId, student_id: stu.id, goal_id: quizTarget.id,
          status: passed ? 'verified_ok' : 'verified_weak',
          verified_at: new Date().toISOString(), session_id: sessionId,
        };
        // PLAN-REVIEW-SM2-V1: 쪽지 결과로도 복습일 갱신 (마이그레이션 전이면 기본 필드로 폴백)
        const { error: vErr } = await db.from('plan_goal_progress').upsert(
          { ...base, ...reviewFields(passed ? 'ok' : 'weak', pRow.review_count, todayStr) },
          { onConflict: 'design_id,student_id,goal_id' });
        if (vErr && /column|schema/i.test(String(vErr.message))) {
          await db.from('plan_goal_progress').upsert(base, { onConflict: 'design_id,student_id,goal_id' });
        }
        setVerifiedLocal(p => ({ ...p, [`${quizTarget.id}::${stu.id}`]: passed ? 'ok' : 'weak' }));
      }

      if (!passed) {
        // 룰셋의 1차 처리 → 큐 자동 등록
        const kindMap: Record<string, string> = { retest: 'retest', clinic: 'relearn', homework: 'relearn' };
        const titleMap: Record<string, string> = {
          retest: `재시험 — ${quizLabel} (${score}/${cut})`,
          clinic: `클리닉 재학습 — ${quizLabel}`,
          homework: `보완 과제 — ${quizLabel}`,
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
            message: `${stu.name} — 쪽지시험 ${design.escalate_after}회 연속 미달 (최근: ${quizLabel} ${score}/${cut}점)`,
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

  async function setGoalState(goalId: string, state: 'done' | 'partial' | 'defer' | 'skip', upto?: string, onlyStudentIds?: string[]) {
    if (!sessionId) return;
    const targetIds = onlyStudentIds ?? students.filter(s => !absent.has(s.id)).map(s => s.id);
    // PLAN-ABSENT-3WAY-V1: 미루기(defer) 학생은 기록을 안 남긴다 → 목표가 그 학생 풀에 남아 자동 재분배
    const absentIds = onlyStudentIds ? [] : students.filter(s => absent.has(s.id)
      && (absentHandling[s.id] ?? 'skip') !== 'defer').map(s => s.id);
    // PLAN-SKIP-GOAL-V1: 'skip' = 의도적으로 건너뛴(생략) 진도 — 위치는 앞으로 나가되 "안 나간 부분"으로 표시
    const statusMap = { done: 'advanced', partial: 'partial', defer: 'deferred', skip: 'skipped' } as const;
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
      if (state === 'skip') toast(`⤼ 건너뜀 — ${targetIds.length}명, 이 목표는 생략하고 다음 진도로 넘어갑니다`);
    } catch (e: any) {
      toast.error(`진도 저장 실패: ${e.message || e}`);
    }
  }

  // PLAN-UNDO-PROGRESS-V1: 잘못 기입한 진도 취소 — 이번 수업(session)에 기록된 것만 되돌린다
  async function clearGoalState(goalId: string, onlyStudentIds?: string[]) {
    if (!sessionId) return;
    const targetIds = onlyStudentIds ?? students.map(s => s.id);
    try {
      const { error } = await db.from('plan_goal_progress')
        .delete()
        .eq('design_id', designId)
        .eq('goal_id', goalId)
        .eq('session_id', sessionId)
        .in('student_id', targetIds);
      if (error) throw error;
      setPerStudent(prev => {
        const next = { ...prev };
        const cur = { ...(next[goalId] || {}) };
        targetIds.forEach(sid => { delete cur[sid]; });
        next[goalId] = cur;
        return next;
      });
      if (!onlyStudentIds) {
        setGoalStates(p => { const n = { ...p }; delete n[goalId]; return n; });
      }
      setVerifiedLocal(prev => {
        const n = { ...prev };
        targetIds.forEach(sid => { delete n[`${goalId}::${sid}`]; });
        return n;
      });
      const drop = new Set(targetIds.map(sid => `${sid}::${goalId}`));
      setProgress(prev => prev.filter(p => !drop.has(`${p.student_id}::${p.goal_id}`)));
      toast.success(`기록 취소 — ${targetIds.length}명, 이 목표는 미기록 상태로 되돌렸습니다`);
    } catch (e: any) {
      toast.error(`취소 실패: ${e.message || e}`);
    }
  }

  // 이번 수업에 기록한 진도 전체 취소
  async function clearAllProgressToday() {
    if (!sessionId) return;
    if (!confirm('이번 수업에 기록한 진도를 모두 취소할까요? (지난 수업 기록은 유지됩니다)')) return;
    try {
      const { error } = await db.from('plan_goal_progress')
        .delete()
        .eq('design_id', designId)
        .eq('session_id', sessionId);
      if (error) throw error;
      setPerStudent({});
      setGoalStates({});
      setVerifiedLocal({});
      setReachedDrafts({});
      setProgress(pastProgress);
      toast.success('이번 수업 진도 기록을 모두 취소했습니다');
    } catch (e: any) {
      toast.error(`취소 실패: ${e.message || e}`);
    }
  }

  // 학생 1명의 이번 수업 진도 기록 취소
  async function clearStudentProgressToday(studentId: string) {
    if (!sessionId) return;
    const name = students.find(s => s.id === studentId)?.name || '학생';
    if (!confirm(`${name} — 이번 수업에 기록한 진도를 취소할까요?`)) return;
    try {
      const { error } = await db.from('plan_goal_progress')
        .delete()
        .eq('design_id', designId)
        .eq('session_id', sessionId)
        .eq('student_id', studentId);
      if (error) throw error;
      setPerStudent(prev => {
        const next: typeof prev = {};
        Object.entries(prev).forEach(([gid, m]) => {
          const cur = { ...(m as any) };
          delete cur[studentId];
          next[gid] = cur;
        });
        return next;
      });
      setVerifiedLocal(prev => {
        const n = { ...prev };
        Object.keys(n).forEach(k => { if (k.endsWith(`::${studentId}`)) delete n[k]; });
        return n;
      });
      setReachedDrafts(p => ({ ...p, [studentId]: '' }));
      setProgress(prev => [
        ...prev.filter(p => p.student_id !== studentId),
        ...pastProgress.filter(p => p.student_id === studentId),
      ]);
      toast.success(`${name} — 이번 수업 진도 기록을 취소했습니다`);
    } catch (e: any) {
      toast.error(`취소 실패: ${e.message || e}`);
    }
  }



  // ── PAGE-BASED PROGRESS V1 ── 총 도달 페이지 하나로 여러 goal 자동 판단
  function extractPageRange(pages: string | null): { start: number; end: number } | null {
    if (!pages) return null;
    const nums = (pages.match(/\d+/g) || []).map(Number);
    if (nums.length === 0) return null;
    return { start: nums[0], end: nums[nums.length - 1] };
  }
  // 페이지 표기: 범위면 '부터~까지', 단일이면 'p.N', 페이지 없으면 원문
  function formatPages(pages: string | null): string {
    const r = extractPageRange(pages);
    if (!r) return pages || '';
    return r.start === r.end ? `p.${r.start}` : `p.${r.start} 부터 → p.${r.end} 까지`;
  }
  function parsePageInput(raw: string): number | null {
    const nums = (raw || '').match(/\d+/g);
    return nums && nums.length > 0 ? Number(nums[nums.length - 1]) : null;
  }
  // PLAN-SKIP-GOAL-V1: "71~85"처럼 시작 페이지를 같이 적으면, 그 앞 목표들은 "건너뜀"으로 기록
  function parseFromPage(raw: string): number | null {
    const nums = (raw || '').match(/\d+/g);
    return nums && nums.length >= 2 ? Number(nums[0]) : null;
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

  // PLAN-PAGE-PER-STUDENT-V2: 학생마다 위치가 다르다 — 그룹 위치가 아니라 "그 학생의 위치"에서 스캔한다.
  // (이전 버그: 뒤처진 학생은 그룹 시작 목표의 페이지 범위보다 앞이라 즉시 break → 아무 것도 기록되지 않음)
  function studentStartIdx(studentId: string): number {
    let idx = -1;
    trackGoals.forEach((g, i) => {
      const has = pastProgress.some(p =>
        p.goal_id === g.id && p.student_id === studentId &&
        ['advanced', 'partial', 'skipped', 'verified_ok', 'verified_weak'].includes(p.status));
      if (has) idx = i;
    });
    return idx + 1;
  }

  async function applyReachedPage(studentIds: string[], page: number, fromPage?: number | null):
    Promise<{ lastDoneIdx: number; partialIdx: number | null; skipped: number } | null> {
    if (!sessionId || studentIds.length === 0) return null;
    let lastDoneIdx = -1;
    let partialIdx: number | null = null;
    let skipped = 0;

    // 시작 인덱스가 같은 학생끼리 묶어서 처리 (그룹 일괄이어도 각자 위치에서 출발)
    const groupsByStart = new Map<number, string[]>();
    for (const sid of studentIds) {
      const st = Math.min(studentStartIdx(sid), Math.max(todayStartIdx, 0));
      groupsByStart.set(st, [...(groupsByStart.get(st) || []), sid]);
    }

    for (const [startIdx, ids] of groupsByStart) {
      let localDone = startIdx - 1;
      for (let i = startIdx; i < trackGoals.length; i++) {
        const g = trackGoals[i];
        const range = extractPageRange(g.pages);
        if (!range) break;
        // PLAN-SKIP-GOAL-V1: 시작 페이지보다 앞선 목표 = 이번에 안 다룬 부분 → 건너뜀 기록 후 통과
        if (fromPage != null && range.end < fromPage) {
          await setGoalState(g.id, 'skip', undefined, ids);
          skipped += 1;
          localDone = i;
          continue;
        }
        if (page >= range.end) {
          await setGoalState(g.id, 'done', undefined, ids);
          localDone = i;
        } else if (page >= range.start) {
          await setGoalState(g.id, 'partial', `p.${page}`, ids);
          partialIdx = partialIdx == null ? i : Math.max(partialIdx, i);
          break;
        } else {
          break;
        }
      }
      lastDoneIdx = Math.max(lastDoneIdx, localDone);
    }
    return { lastDoneIdx, partialIdx, skipped };
  }


  async function submitReached(scope: 'all' | string, raw: string) {
    const page = parsePageInput(raw);
    const fromPage = parseFromPage(raw);
    if (page == null) { toast.error('페이지 숫자를 적어주세요 (예: 68 또는 p.68, 건너뛰었다면 71~85)'); return; }
    const targetIds = scope === 'all'
      ? students.filter(s => !absent.has(s.id)).map(s => s.id)
      : [scope];
    if (targetIds.length === 0) { toast.error('대상 학생이 없어요'); return; }
    const result = await applyReachedPage(targetIds, page, fromPage);
    if (!result) return;
    // 여유(순항) 계산: 오늘 예정 마지막 goal 인덱스 대비 얼마나 앞섰는지
    const extraGoals = result.lastDoneIdx - todayEndIdx;
    const paceVal = pace ?? 1;
    const extraSessions = extraGoals > 0 && paceVal > 0 ? (extraGoals / paceVal) : 0;
    const label = scope === 'all' ? `${targetIds.length}명` : (students.find(s => s.id === scope)?.name || '학생');
    const skipNote = result.skipped > 0 ? ` (건너뛴 목표 ${result.skipped}개 — 생략 표시)` : '';
    if (extraGoals > 0) {
      toast.success(`🚀 ${label} 순항중 — 계획보다 +${extraGoals}목표 앞섬 (약 ${extraSessions.toFixed(1)}회분 여유)${skipNote}`);
    } else if (result.partialIdx != null && result.partialIdx === todayEndIdx) {
      toast.success(`✓ ${label} 오늘 목표 도달 — p.${page}까지 기록${skipNote}`);
    } else if (result.lastDoneIdx >= todayEndIdx) {
      toast.success(`✓ ${label} 오늘 목표 완료 — p.${page}까지 기록${skipNote}`);
    } else {
      toast(`◐ ${label} p.${page}까지 기록 — 오늘 목표 일부만${skipNote}`);
    }
  }

  // PLAN-VERIFY-LOOP-V1: 확인 도장 — ✓이해/✗미흡. 미흡은 쪽지 미달과 같은 룰셋 라우팅으로 큐 자동 등록.
  async function verifyStudents(goal: PlanGoal, stus: StudentInfo[], result: 'ok' | 'weak') {
    if (!sessionId || stus.length === 0) return;
    const now = new Date().toISOString();
    try {
      const baseRows = stus.map(s => ({
        design_id: designId, student_id: s.id, goal_id: goal.id,
        status: result === 'ok' ? 'verified_ok' : 'verified_weak',
        verified_at: now, session_id: sessionId,
      }));
      // PLAN-REVIEW-SM2-V1: 확인 결과에 따라 다음 복습일 세팅 (마이그레이션 전이면 기본 필드로 폴백)
      const rows = baseRows.map((r, i) => {
        const prev = progress.find(p => p.goal_id === goal.id && p.student_id === stus[i].id);
        return { ...r, ...reviewFields(result, prev?.review_count, todayStr) };
      });
      let { error } = await db.from('plan_goal_progress')
        .upsert(rows, { onConflict: 'design_id,student_id,goal_id' });
      if (error && /column|schema/i.test(String(error.message))) {
        ({ error } = await db.from('plan_goal_progress')
          .upsert(baseRows, { onConflict: 'design_id,student_id,goal_id' }));
      }
      if (error) throw error;
      setVerifiedLocal(prev => {
        const next = { ...prev };
        stus.forEach(s => { next[`${goal.id}::${s.id}`] = result; });
        return next;
      });
      if (result === 'ok') {
        await db.from('plan_checks').insert(stus.map(s => ({
          design_id: designId, session_id: sessionId, student_id: s.id,
          goal_id: goal.id, method: 'oral', passed: true,
        })));
        toast.success(`✓ 이해 확인 — ${goal.title} · ${stus.length}명`);
      } else {
        const kindMap: Record<string, string> = { retest: 'retest', clinic: 'relearn', homework: 'relearn' };
        for (const s of stus) {
          const { data: check } = await db.from('plan_checks').insert({
            design_id: designId, session_id: sessionId, student_id: s.id,
            goal_id: goal.id, method: 'oral', passed: false,
          }).select().single();
          const { data: q } = await db.from('plan_queue').insert({
            design_id: designId, student_id: s.id, goal_id: goal.id,
            source_check_id: check?.id ?? null,
            kind: kindMap[design.fail_action] || 'relearn',
            title: `재학습 — ${goal.title}`,
            assignee: design.fail_action === 'clinic' ? 'assistant' : 'teacher',
          }).select().single();
          if (q) setQueue(p => [...p, q]);
        }
        toast(`✗ 미흡 — ${stus.map(s => s.name).join(', ')} · 재학습 큐 자동 등록 (잘못 눌렀으면 ✓로 다시 찍고 큐에서 체크)`);
      }
    } catch (e: any) {
      toast.error(`확인 저장 실패: ${e.message || e}`);
    }
  }

  // 큐 담당 원탭 전환 — 교사 ↔ 조교 인계
  async function toggleQueueAssignee(q: QueueRow) {
    const next = q.assignee === 'assistant' ? 'teacher' : 'assistant';
    try {
      await db.from('plan_queue').update({ assignee: next }).eq('id', q.id);
      setQueue(p => p.map(x => x.id === q.id ? { ...x, assignee: next } : x));
      toast.success(next === 'assistant' ? '조교에게 인계했어요' : '교사 담당으로 가져왔어요');
    } catch (e: any) { toast.error(e.message || String(e)); }
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
    range: string; nextGoalTitle: string | null; hadProgress: boolean; lastIdx: number;
  } {
    const donePartial: { g: PlanGoal; state: 'done' | 'partial'; upto?: string }[] = [];
    let lastIdx = -1;
    // PLAN-PER-STUDENT-RANGE-V1: 학생마다 시작 위치가 다르다 — 그룹 시작이 아니라 그 학생 위치에서 스캔.
    const scanStart = Math.max(0, Math.min(studentStartIdx(sid), Math.max(todayStartIdx, 0)));
    // 이 학생에게 개별 기록이 하나라도 있으면 그룹(bulk) 상태를 상속하지 않는다.
    // (상속하면 학생별로 다르게 입력한 진도가 모두 같은 값으로 저장되는 버그)
    const hasOwnRecord = trackGoals.some(g =>
      !!perStudent[g.id]?.[sid] ||
      progress.some(r => r.goal_id === g.id && r.student_id === sid &&
        ['advanced', 'partial', 'skipped', 'verified_ok', 'verified_weak'].includes(r.status)));
    for (let i = scanStart; i < trackGoals.length; i++) {
      const g = trackGoals[i];
      const local = perStudent[g.id]?.[sid];
      const p = progress.find(r => r.goal_id === g.id && r.student_id === sid);
      const groupState = hasOwnRecord ? undefined : goalStates[g.id];
      const groupUpto = groupState?.upto || '';
      const state = local?.state
        ?? (p ? (['advanced', 'verified_ok', 'verified_weak'].includes(p.status) ? 'done'
          : p.status === 'partial' ? 'partial' : null) : null)
        ?? (groupState?.state === 'done' ? 'done'
          : groupState?.state === 'partial' ? 'partial' : null);
      if (state === 'done') { donePartial.push({ g, state: 'done' }); lastIdx = i; }
      else if (state === 'partial') {
        donePartial.push({ g, state: 'partial', upto: local?.upto || p?.partial_upto || groupUpto || '' });
        lastIdx = i; break;
      } else if (local?.state === 'skip' || p?.status === 'skipped') {
        // 건너뛴 목표는 범위에 넣지 않고 계속 스캔
        lastIdx = i; continue;
      } else break;
    }
    if (donePartial.length === 0) return { range: '', nextGoalTitle: trackGoals[Math.max(scanStart, 0)]?.title || null, hadProgress: false, lastIdx: -1 };

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
    return { range: `${goalPart}${pagePart}`, nextGoalTitle: nextGoal, hadProgress: true, lastIdx };
  }

  // PLAN-REPORT-BRIDGE-V1: 오늘 계획 데이터 → 수업일지 관찰노트 자동 기록.
  // 주간리포트 AI가 learning_issues_note·test_result_text를 서술 근거로 읽으므로,
  // 확인 도장·쪽지 결과를 여기에 채워야 학부모 리포트에 반영된다.
  function planAutoNote(sid: string): string {
    const parts: string[] = [];
    const sum = summarizeStudentToday(sid);
    if (sum.hadProgress) {
      parts.push(`진도 ${sum.range}`);
      // 페이스 평가 — 오늘 계획 분량 대비 어디까지 갔나
      const extra = sum.lastIdx - todayEndIdx;
      if (extra > 0) parts.push(`계획보다 +${extra}목표 앞서 순항`);
      else if (extra === 0) parts.push('오늘 계획 분량 완료');
      else parts.push(`오늘 계획 대비 ${extra}목표 (남은 수업에 재분배)`);
    }
    // 확인 도장 — 첫 확인과 망각곡선 복습을 구분해 기록
    const reviewKeys = new Set(reviewBlocks.flatMap(b => b.stus.map(s => `${b.goal.id}::${s.id}`)));
    const firstStamps: string[] = [];
    const reviewStamps: string[] = [];
    Object.entries(verifiedLocal)
      .filter(([k]) => k.endsWith(`::${sid}`))
      .forEach(([k, v]) => {
        const g = goals.find(x => x.id === k.split('::')[0]);
        if (!g) return;
        if (reviewKeys.has(k)) reviewStamps.push(`${g.title} ${v === 'ok' ? '기억' : '잊음(재학습 등록)'}`);
        else firstStamps.push(`${g.title} ${v === 'ok' ? '이해 확인' : '미흡(재학습 등록)'}`);
      });
    if (firstStamps.length > 0) parts.push(`확인: ${firstStamps.join(', ')}`);
    if (reviewStamps.length > 0) parts.push(`복습 확인(망각곡선): ${reviewStamps.join(', ')}`);
    return parts.length > 0 ? `📋 수업계획 자동 기록 — ${parts.join(' · ')}` : '';
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

      // PLAN-ABSENT-3WAY-V1: 보충형 결석 → 보충 큐 자동 등록 (같은 제목이 이미 열려 있으면 중복 방지)
      let makeupCount = 0;
      for (const s of students) {
        if (!absent.has(s.id)) continue;
        if ((absentHandling[s.id] ?? 'skip') !== 'makeup') continue;
        const goalPart = todayGoals.length > 0
          ? ` (${todayGoals[0].goal.title}${todayGoals.length > 1 ? ` 외 ${todayGoals.length - 1}개` : ''})`
          : '';
        const title = `보충 — ${todayStr} 결석분${goalPart}`;
        if (queue.some(q => q.student_id === s.id && q.kind === 'makeup' && q.title === title)) continue;
        const { data: q } = await db.from('plan_queue').insert({
          design_id: designId, student_id: s.id, kind: 'makeup',
          title, assignee: 'teacher',
        }).select().single();
        if (q) { setQueue(p => [...p, q]); makeupCount++; }
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

        // LESSON-CLASS-LINK-V1: 설계에 class_id가 비어있으면 오늘 요일·담당교사 기준으로
        // 학생별 소속 클래스를 매핑해 일지에 붙여준다. (없으면 반별 오늘일지에서 학생 누락)
        const studentClassMap = new Map<string, string>();
        try {
          const todayDow = new Date(todayStr + 'T12:00:00').getDay();
          const { data: schedRows } = await db.from('class_schedules')
            .select('class_id, classes(subject)')
            .eq('teacher_id', teacherId)
            .eq('day_of_week', todayDow)
            .eq('is_active', true);
          const candidateIds = Array.from(new Set(((schedRows || []) as any[])
            .filter((r: any) => !subject || !r.classes?.subject || r.classes.subject === subject)
            .map((r: any) => r.class_id).filter(Boolean)));
          if (candidateIds.length > 0 && students.length > 0) {
            const { data: csRows } = await db.from('class_students')
              .select('class_id, student_id')
              .in('class_id', candidateIds as string[])
              .in('student_id', students.map(s => s.id));
            ((csRows || []) as any[]).forEach((r: any) => {
              if (r.student_id && r.class_id && !studentClassMap.has(r.student_id)) {
                studentClassMap.set(r.student_id, r.class_id);
              }
            });
          }
        } catch { /* best-effort mapping */ }

        // 2) 학생별 수업일지 upsert (출결 학생만)
        for (const s of students) {
          const isAbsent = absent.has(s.id);
          const summary = summarizeStudentToday(s.id);
          const hwStatus = isAbsent ? 'none_assigned' : (hwByStudent.get(s.id) || 'none_assigned');
          // PLAN-LESSON-RANGE-V2: 수업내용 = 수업과정(설계 제목) + 그날 배운 챕터명(+페이지)
          const courseTitle = (design.title || '').trim();
          const plannedFallback = (() => {
            if (todayGoals.length === 0) return '';
            const f = todayGoals[0].goal;
            const l = todayGoals[todayGoals.length - 1].goal;
            const titlePart = todayGoals.length === 1
              ? `${f.order_index}. ${f.title}`
              : `${f.order_index}. ${f.title} ~ ${l.order_index}. ${l.title}`;
            const sp = extractPageRange(f.pages)?.start;
            const ep = extractPageRange(l.pages)?.end;
            return `${titlePart}${sp != null && ep != null ? ` · p.${sp}~p.${ep}` : ''}`;
          })();
          const chapterPart = summary.range || plannedFallback;
          const range = isAbsent
            ? (absentKind[s.id] ?? '인정결석')
            : (chapterPart
              ? (courseTitle ? `${courseTitle} · ${chapterPart}` : chapterPart)
              : (courseTitle ? `${courseTitle} 진행` : '수업 진행'));


          const quiz = quizSaved[s.id];
          const quizUnderstanding = quiz ? Math.max(1, Math.min(5, Math.round(quiz.score / 20))) : null;
          // 수동 입력이 우선, 없으면 쪽지시험 점수로 환산
          const understanding = understandingPerStudent[s.id] ?? quizUnderstanding;

          // UNIFY-LESSON-KEY-V1: 일지 통일 키 = (학생, 과목, 날짜) — 교사·경로가 달라도 하나의 일지에 병합.
          // 제출본 우선, 그다음 오래된 것(원본). 다른 입력 경로(수업일지 폼·테스트 입력)가 만든 기록도 찾는다.
          const { data: existingList } = await db.from('lesson_records')
            .select('id, learning_issues_note, submitted, class_id')
            .eq('student_id', s.id)
            .eq('subject', subject)
            .eq('lesson_date', todayStr)
            .order('submitted', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1);
          const existingLR = (existingList || [])[0] || null;

          // PLAN-REPORT-BRIDGE-V1: 교사가 직접 쓴 관찰노트는 보존, 자동 기록 줄만 교체
          const autoNote = isAbsent ? '' : planAutoNote(s.id);
          const manualNote = (existingLR?.learning_issues_note || '')
            .split('\n')
            .filter((l: string) => !l.startsWith('📋 수업계획 자동 기록'))
            .join('\n')
            .trim();
          const mergedNote = [manualNote, autoNote].filter(Boolean).join('\n') || null;

          // UNIFY-LESSON-KEY-V1: 계획 데이터가 채우는 필드만 담는다.
          // notes·understanding은 값이 있을 때만 — 다른 경로의 수기 입력을 null로 지우지 않기.
          const payload: any = {
            student_id: s.id,
            subject,
            lesson_date: todayStr,
            lesson_range: range,
            homework_status: hwStatus,
            next_lesson_goal: summary.nextGoalTitle || null,
            attendance_status: toStorageAttendanceStatuses(
              isAbsent ? [absentKind[s.id] ?? '인정결석'] : ['정상등원']
            ),
            // PLAN-REPORT-BRIDGE-V1: 주간리포트 AI가 읽는 서술 근거 채우기
            learning_issues_note: mergedNote,
            ...(note.trim() ? { notes: note.trim() } : {}),
            // ABSENT-NO-UNDERSTANDING-V1: 결석이면 이해도는 비운다
            ...(isAbsent ? { understanding_score: null } : (understanding != null ? { understanding_score: understanding } : {})),
            ...(quiz && quizTarget ? (() => {
              // PLAN-LESSON-SYNC-V1: 본수업일지 화면은 test_name/test_content를 읽으므로
              // 통일 규칙(LessonRecordForm과 동일)대로 세 필드에 같은 값을 채운다.
              const testName = `${isTestDay && !hasQuiz ? '단원 마무리 테스트' : '쪽지시험'} — ${quiz.label || quizTarget.title}`;
              // PLAN-LESSON-SYNC-V2: test_result enum(pass/fail/none)까지 채워야 일지/통계에서
              // '결과값'이 표시된다. 영어 과목은 english_pass_fail도 함께 동기화.
              const enumResult: 'pass' | 'fail' = quiz.passed ? 'pass' : 'fail';
              return {
                test_name: testName,
                test_content: testName,
                test_title: testName,
                test_result: enumResult,
                test_result_text: `${quiz.score}점 / 커트라인 ${cutlineFor(s)}점 — ${quiz.passed ? '통과'
                  : `미달${errorPick[s.id] ? ` (원인: ${ERROR_TYPES.find(e => e.key === errorPick[s.id])?.label})` : ''}`}`,
                ...(subject === '영어' ? { english_pass_fail: enumResult } : {}),
              };
            })() : {}),
            // PLAN-LESSON-SYNC-V1: 계획 저장 = 그날 일지 확정. 초안으로 남기면
            // 학생 학습일지(submitted=true만 노출)와 각종 집계에서 빠진다.
            submitted: true,
            ...(existingLR?.submitted ? {} : { submitted_at: new Date().toISOString() }),
          };

          const resolvedClassId = design.class_id || studentClassMap.get(s.id) || null;

          let lessonRecordId: string | null = null;
          if (existingLR?.id) {
            // 병합 — 기존 일지의 소유자(teacher_id)는 건드리지 않는다.
            // class_id는 비어 있으면 이번 매핑으로 백필해서 반별 오늘일지에서 보이도록 한다.
            lessonRecordId = existingLR.id;
            const updatePayload: any = { ...payload };
            if (!existingLR.class_id && resolvedClassId) updatePayload.class_id = resolvedClassId;
            const { error: upErr } = await db.from('lesson_records').update(updatePayload).eq('id', existingLR.id);
            if (upErr) throw new Error(`수업일지 갱신 실패(${s.name}): ${upErr.message}`);
          } else {
            const { data: ins, error: insErr } = await db.from('lesson_records')
              .insert({ ...payload, teacher_id: teacherId, class_id: resolvedClassId })
              .select('id').single();
            if (insErr) throw new Error(`수업일지 저장 실패(${s.name}): ${insErr.message}`);
            lessonRecordId = ins?.id || null;
          }
          if (lessonRecordId) lrCount++;

          // 3) 다음 수업 숙제 부여 (결석자 제외)
          if (!isAbsent) {
            const perStu = (nextHwPerStudent[s.id] ?? '').trim();
            const hwContent = perStu || (nextHwBulk ?? '').trim();
            if (hwContent) {
              // PLAN-HW-BRIDGE-V3: 같은 학생·과목·날짜의 숙제는 내용이 달라도 하나로 본다.
              // (수업일지 일괄작성 등 다른 경로에서 만든 숙제를 중복 생성하지 않고 갱신)
              const { data: existingHwList } = await db.from('homework_assignments')
                .select('id, content')
                .eq('student_id', s.id)
                .eq('subject', subject)
                .eq('assigned_date', todayStr)
                .order('created_at', { ascending: true })
                .limit(5);
              const existingHw = ((existingHwList || []) as any[])
                .find(h => h.content === hwContent) || (existingHwList || [])[0] || null;
              if (existingHw?.id) {
                const { error: hwUpErr } = await db.from('homework_assignments').update({
                  content: hwContent,
                  end_date: nextHwDue || null,
                  lesson_record_id: lessonRecordId,
                  homework_type: 'regular',
                  required_submissions: 1,
                }).eq('id', existingHw.id);
                if (hwUpErr) throw new Error(`다음 숙제 갱신 실패(${s.name}): ${hwUpErr.message}`);
              } else {

                const { error: nhErr } = await db.from('homework_assignments').insert({
                  student_id: s.id,
                  subject,
                  lesson_record_id: lessonRecordId,
                  assigned_date: todayStr,
                  end_date: nextHwDue || null,
                  content: hwContent,
                  check_status: 'unchecked',
                  homework_type: 'regular',
                  required_submissions: 1,
                  created_by: user?.id || null,
                });
                if (nhErr) throw new Error(`다음 숙제 등록 실패(${s.name}): ${nhErr.message}`);
                hwNewCount++;
              }
            }
          }
        }
      }

      // BOOK-PROGRESS-LOG-V1: 병행교재 진도 저장 — 책갈피 전진 + 날짜별 이력 기록
      let sideCount = 0;
      for (const [bookId, raw] of Object.entries(sideBookPages)) {
        const to = parseInt(raw, 10);
        if (!raw.trim() || isNaN(to) || to <= 0) continue;
        const entry = Object.entries(sideBooks).find(([, list]) => list.some(b => b.id === bookId));
        if (!entry) continue;
        const [sid, list] = entry;
        if (absent.has(sid)) continue;
        const book = list.find(b => b.id === bookId)!;
        if (to <= book.current_page) continue; // 되돌리기는 책갈피 화면에서 수동으로
        const { error: logErr } = await db.from('student_book_progress_log').insert({
          student_id: sid, book_progress_id: bookId, book_title: book.book_title,
          subject: book.subject, book_role: book.book_role,
          progress_date: todayStr, from_page: book.current_page, to_page: to, source: 'lesson',
        });
        if (logErr) throw new Error(`병행교재 기록 실패(${book.book_title}): ${logErr.message}`);
        await db.from('student_book_progress').update({
          current_page: to, last_source: 'lesson', updated_at: new Date().toISOString(),
        }).eq('id', bookId);
        sideCount++;
      }
      if (sideCount > 0) {
        setSideBooks(prev => {
          const next: Record<string, SideBook[]> = {};
          for (const [sid, list] of Object.entries(prev)) {
            next[sid] = list.map(b => {
              const raw = sideBookPages[b.id];
              const to = parseInt(raw ?? '', 10);
              return !isNaN(to) && to > b.current_page ? { ...b, current_page: to } : b;
            });
          }
          return next;
        });
        setSideBookPages({});
      }

      setSavedDone(true);
      const parts = ['오늘 기록 저장 완료'];
      if (sideCount > 0) parts.push(`병행교재 ${sideCount}건`);
      if (makeupCount > 0) parts.push(`결석 보충 큐 ${makeupCount}건`);
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

  // PLAN-CANCEL-V1: 휴강된 날 — 기록 화면 대신 휴강 안내
  if (sessionMeta.status === 'cancelled') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="rounded-2xl border border-orange-300 bg-orange-50/60 p-5">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className="border-orange-400 text-orange-700 text-[11px]">
              <CalendarX className="w-3 h-3 mr-1" />휴강
            </Badge>
            <Badge variant="secondary" className="text-[11px]">📅 {sessionDate}</Badge>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">{design.title}</h1>
          <p className="text-sm text-orange-800 mt-2 font-medium">
            이 날은 휴강 처리됐습니다{sessionMeta.cancel_reason ? ` — 사유: ${sessionMeta.cancel_reason}` : ''}.
          </p>
          <p className="text-xs text-orange-700 mt-1">
            진도는 남은 수업에 자동 재분배되고, 이날 마감이던 숙제는 다음 수업일로 밀렸어요. 기록할 것 없음.
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => navigate('/plan')}>
              <Undo2 className="w-4 h-4 mr-1" />목록으로
            </Button>
            <Button variant="outline" className="border-orange-400 text-orange-800 hover:bg-orange-100"
              onClick={async () => {
                try {
                  await uncancelSession(designId!, todayStr);
                  setSessionMeta(p => ({ ...p, status: 'draft', cancel_reason: null }));
                  toast.success('휴강을 취소했어요 — 수업을 진행할 수 있습니다');
                } catch (e: any) { toast.error(e.message || String(e)); }
              }}>
              휴강 취소하고 수업 열기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const stepDefs = [
    { n: 1, t: '수업 시작', s: '출결 · 확인' },
    { n: 2, t: isTestDay ? '테스트·복습' : '진도', s: isTestDay ? '밀린 확인 소화' : `오늘 ${todayGoals.length}개` },
    { n: 3, t: '마무리', s: '메모 · 저장' },
  ];

  const todayRole = ((design.rhythm || {})[String(sessionDay)] || 'progress') as SessionRole;
  const sessionDateObj = new Date(sessionDate + 'T12:00:00');

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 헤더 카드 */}
      <div className={`rounded-2xl border bg-gradient-to-br p-5 ${isPastDate ? 'from-amber-500/10 to-transparent border-amber-400/40' : 'from-primary/8 to-transparent'}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge className="text-[11px]">{onlyIds ? '개인 수업' : isPastDate ? '과거 날짜 기입' : '오늘 수업'}</Badge>
              {isPastDate && (
                <Badge variant="outline" className="border-amber-500 text-amber-700 text-[11px]">📅 {sessionDate}</Badge>
              )}
              {sessionMeta.intensive_id && (
                <Badge variant="outline" className="border-primary/60 text-primary text-[11px]">✨ 특강 회차</Badge>
              )}
              <Badge variant="secondary" className="text-[11px]">{ROLE_LABELS[todayRole]}</Badge>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">{design.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sessionDateObj.getMonth() + 1}월 {sessionDateObj.getDate()}일 ({['일','월','화','수','목','금','토'][sessionDay]}) · {students.length}명
              {pace != null && ` · 회당 ${pace.toFixed(1)}개 페이스`}
              {intensiveExtra > 0 && ` (특강 +${intensiveExtra}회)`}
            </p>
            {/* 오늘 할 일 한눈 요약 — 뭐가 몇 건 기다리는지 헤더에서 바로 */}
            {(() => {
              const verifyN = verifyBlocks.reduce((a, b) => a + b.stus.filter(s => !verifiedLocal[`${b.goal.id}::${s.id}`]).length, 0);
              const reviewN = reviewBlocks.reduce((a, b) => a + b.stus.filter(s => !verifiedLocal[`${b.goal.id}::${s.id}`]).length, 0);
              const chips = [
                verifyN > 0 && { label: `🔍 확인 도장 ${verifyN}`, cls: 'bg-sky-50 border-sky-300 text-sky-800' },
                reviewN > 0 && { label: `🔁 복습 ${reviewN}`, cls: 'bg-violet-50 border-violet-300 text-violet-800' },
                queue.length > 0 && { label: `⏳ 밀린 할 일 ${queue.length}`, cls: 'bg-amber-50 border-amber-300 text-amber-800' },
                openHws.length > 0 && { label: `📝 숙제 확인 ${openHws.length}`, cls: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
              ].filter(Boolean) as { label: string; cls: string }[];
              if (chips.length === 0) {
                return <p className="text-[11px] text-green-700 mt-1.5">✓ 시작 전 확인할 것 없음 — 출결 체크 후 바로 진도</p>;
              }
              return (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {chips.map(c => (
                    <span key={c.label} className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${c.cls}`}>{c.label}</span>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${isPastDate ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10' : 'border-primary/30 bg-background'}`}>
              <label className="text-[11px] font-bold text-muted-foreground whitespace-nowrap flex items-center gap-1">
                📅 수업일자
              </label>
              <Input
                type="date"
                className="h-8 w-40 text-sm font-semibold"
                value={sessionDate}
                max={realTodayStr}
                onChange={e => { if (e.target.value) setSessionDate(e.target.value); }}
                title="수업기록 날짜 — 과거 날짜로 돌아가서 놓친 기입 가능"
              />
              {isPastDate && (
                <Button variant="secondary" size="sm" className="h-8 text-[11px]" onClick={() => setSessionDate(realTodayStr)}>
                  오늘로
                </Button>
              )}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-orange-700 hover:text-orange-800 hover:bg-orange-50"
                title="휴강 처리 — 사유 기록, 진도·숙제 자동 밀림"
                onClick={() => { setCancelReason(''); setCancelOpen(true); }}>
                <CalendarX className="w-4 h-4 mr-1" />휴강
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/plan')}>
                <Undo2 className="w-4 h-4 mr-1" />목록
              </Button>
            </div>
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
        {isPastDate && (
          <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-400/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            📅 <b>{sessionDate}</b> 수업 기록을 이어서 작성 중입니다 — 그 날 있었던 진도·쪽지·숙제를 그대로 채워넣으면 수업일지에 반영돼요.
          </div>
        )}
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
                    onClick={() => {
                      const wasAbsent = absent.has(s.id);
                      setAbsent(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; });
                      // PLAN-ABSENT-3WAY-V1: 결석 체크 시 기본 처리형 자동 세팅 (그룹→스킵, 1:1→보충)
                      setAbsentHandling(p => {
                        const n = { ...p };
                        if (wasAbsent) delete n[s.id];
                        else n[s.id] = design?.teaching_mode === 'individual' ? 'makeup' : 'skip';
                        return n;
                      });
                    }}>
                    {absent.has(s.id) && <UserX className="w-3.5 h-3.5 inline mr-1" />}
                    {s.name}
                    {isWalkin && <span className="ml-1 text-[10px]">게릴라</span>}
                    {s.type && <span className={`ml-1 text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                  </button>
                );
              })}
            </div>
            {/* PLAN-ABSENT-3WAY-V1: 결석 학생별 처리 원탭 — 스킵/보충/미루기 */}
            {students.filter(s => absent.has(s.id)).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                <p className="text-[11px] font-bold text-muted-foreground">
                  결석 처리 — 기본값 자동({design?.teaching_mode === 'individual' ? '보충' : '스킵'}) · 이번만 다르게 하려면 탭
                </p>
                {students.filter(s => absent.has(s.id)).map(s => {
                  const cur: AbsentHandling = absentHandling[s.id] ?? (design?.teaching_mode === 'individual' ? 'makeup' : 'skip');
                  const opts: { k: AbsentHandling; label: string; desc: string; cls: string }[] = [
                    { k: 'skip', label: '넘어감', desc: '커리큘럼 그대로 — 구멍만 표시', cls: 'border-muted-foreground/40 bg-muted text-foreground' },
                    { k: 'makeup', label: '보충 잡기', desc: '진도는 계획대로 + 보충 큐 자동 등록', cls: 'border-amber-400 bg-amber-50 text-amber-800' },
                    { k: 'defer', label: '진도 미루기', desc: '이 학생만 남은 수업에 자동 재분배', cls: 'border-sky-400 bg-sky-50 text-sky-800' },
                  ];
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/40 px-2.5 py-1.5">
                      <b className="text-sm min-w-[56px] text-red-600">{s.name}</b>
                      <div className="flex gap-1">
                        {opts.map(o => (
                          <button key={o.k} title={o.desc}
                            className={`text-[11px] font-bold rounded-full border px-2.5 py-0.5 transition
                              ${cur === o.k ? o.cls : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                            onClick={() => setAbsentHandling(p => ({ ...p, [s.id]: o.k }))}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        {(['인정결석', '무단결석'] as const).map(k => (
                          <button key={k}
                            className={`text-[11px] font-bold rounded-full border px-2.5 py-0.5 transition
                              ${(absentKind[s.id] ?? '인정결석') === k
                                ? (k === '인정결석' ? 'border-muted-foreground/40 bg-muted text-foreground' : 'border-red-400 bg-red-50 text-red-700')
                                : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                            onClick={() => setAbsentKind(p => ({ ...p, [s.id]: k }))}>
                            {k}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {opts.find(o => o.k === cur)?.desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {walkinStudents.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                게릴라 {walkinStudents.length}명은 오늘 출결·쪽지에만 반영되고, 이 반 커리큘럼 진도에는 포함되지 않습니다.
              </p>
            )}
          </CardContent></Card>

          {(hasQuiz || isTestDay) && quizTarget && (
            <Card className={isTestDay ? 'border-amber-300/60' : undefined}><CardContent className="p-4 space-y-3">
              <p className="text-xs font-bold text-muted-foreground">
                {isTestDay && !hasQuiz ? '단원 마무리 테스트' : '쪽지시험'} — <span className="text-foreground">{quizContent.trim() || quizTarget.title}</span> {!quizContent.trim() && quizTarget.pages}
                <Badge variant="secondary" className="ml-2 text-[10px]">{isTestDay ? '테스트·복습 데이' : '룰셋 자동'}</Badge>
              </p>
              {/* PLAN-QUIZ-CONTENT-V1: 실제 시험 내용이 목표명과 다르면 여기에 — 기록·재시험·수업일지에 이 내용으로 남는다 */}
              <Input className="h-8 text-xs"
                placeholder={`시험 내용이 다르면 적어주세요 (예: Unit 3~5 단어 40개) — 비우면 "${quizTarget.title}"로 기록`}
                value={quizContent}
                onChange={e => setQuizContent(e.target.value)} />

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
                        (quizContentPerStudent[s.id] || '').trim() ? (
                          <p className="text-[10px] text-muted-foreground truncate">📝 {quizContentPerStudent[s.id]}</p>
                        ) : null
                      ) : (
                        <Input className="h-7 text-[11px]"
                          placeholder={`이 학생 시험 내용 (다를 때만)`}
                          value={quizContentPerStudent[s.id] ?? ''}
                          onChange={e => setQuizContentPerStudent(p => ({ ...p, [s.id]: e.target.value }))} />
                      )}
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

          {/* PLAN-VERIFY-LOOP-V1: ① 지난 진도 확인 — "나갔다 ≠ 배웠다" */}
          {verifyBlocks.length > 0 && (
            <Card><CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground">
                🔍 지난 진도 확인 — 제대로 배웠는지 도장 찍기
                <span className="ml-1 font-normal">(✗미흡은 재학습 큐 자동 등록)</span>
              </p>
              {!verifyExpanded && verifyBlocks.length > 3 && (
                <button className="text-[11px] text-muted-foreground underline underline-offset-2"
                  onClick={() => setVerifyExpanded(true)}>
                  이전 목표 {verifyBlocks.length - 3}개 더 보기
                </button>
              )}
              {(verifyExpanded ? verifyBlocks : verifyBlocks.slice(-3)).map(({ goal, stus }) => {
                const pending = stus.filter(s => !verifiedLocal[`${goal.id}::${s.id}`]);
                return (
                  <div key={goal.id} className="border rounded-lg px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{goal.order_index}. {goal.title}</span>
                      <span className="text-[11px] text-muted-foreground">{formatPages(goal.pages)}</span>
                      {pending.length > 0 && (
                        <Button size="sm" variant="outline"
                          className="ml-auto h-6 text-[10px] border-green-400 text-green-700 hover:bg-green-50"
                          onClick={() => verifyStudents(goal, pending, 'ok')}>
                          남은 {pending.length}명 ✓이해
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stus.map(s => {
                        const v = verifiedLocal[`${goal.id}::${s.id}`];
                        return (
                          <div key={s.id} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs
                            ${v === 'ok' ? 'border-green-300 bg-green-50 text-green-700'
                              : v === 'weak' ? 'border-red-300 bg-red-50 text-red-600' : 'bg-background'}`}>
                            <b>{s.name}</b>
                            {s.type && <span className={`text-[10px] ${TYPE_COLORS[s.type]}`}>{s.type}</span>}
                            {v === 'ok' && <span className="font-bold">✓ 이해</span>}
                            {v === 'weak' && <span className="font-bold">✗ 미흡</span>}
                            {!v && (
                              <>
                                <button className="rounded-full border border-green-300 text-green-700 px-2.5 py-0.5 text-sm font-bold hover:bg-green-100"
                                  onClick={() => verifyStudents(goal, [s], 'ok')} title="이해 확인">✓</button>
                                <button className="rounded-full border border-red-300 text-red-600 px-2.5 py-0.5 text-sm font-bold hover:bg-red-100"
                                  onClick={() => verifyStudents(goal, [s], 'weak')} title="미흡 — 재학습 큐 등록">✗</button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent></Card>
          )}

          {/* PLAN-REVIEW-SM2-V1: 🔁 오늘 복습 확인 — 망각곡선 처방 */}
          {reviewBlocks.length > 0 && (
            <Card className="border-violet-300/60"><CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground">
                🔁 오늘 복습 확인 (망각곡선) — 잊기 전에 다시 도장
                <span className="ml-1 font-normal">(✓기억 → 다음 간격 늘어남 · ✗잊음 → 재학습 큐 + 3일 뒤 다시)</span>
              </p>
              {reviewBlocks.map(({ goal, stus }) => (
                <div key={goal.id} className="border rounded-lg px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{goal.order_index}. {goal.title}</span>
                    <span className="text-[11px] text-muted-foreground">{formatPages(goal.pages)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stus.map(s => {
                      const v = verifiedLocal[`${goal.id}::${s.id}`];
                      return (
                        <div key={s.id} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs
                          ${v === 'ok' ? 'border-green-300 bg-green-50 text-green-700'
                            : v === 'weak' ? 'border-red-300 bg-red-50 text-red-600' : 'border-violet-200 bg-violet-50/40'}`}>
                          <b>{s.name}</b>
                          <span className="text-[10px] text-violet-700">🔁 {s.due.slice(5).replace('-', '/')} due</span>
                          {v === 'ok' && <span className="font-bold">✓ 기억</span>}
                          {v === 'weak' && <span className="font-bold">✗ 잊음</span>}
                          {!v && (
                            <>
                              <button className="rounded-full border border-green-300 text-green-700 px-2.5 py-0.5 text-sm font-bold hover:bg-green-100"
                                onClick={() => verifyStudents(goal, [s], 'ok')} title="기억함 — 복습 간격 늘어남">✓</button>
                              <button className="rounded-full border border-red-300 text-red-600 px-2.5 py-0.5 text-sm font-bold hover:bg-red-100"
                                onClick={() => verifyStudents(goal, [s], 'weak')} title="잊음 — 재학습 큐 + 3일 뒤 재복습">✗</button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent></Card>
          )}

          {queue.length > 0 && (
            <Card><CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground">밀린 할 일 {queue.length}건 — 오늘 처리했으면 체크 · 담당 배지를 누르면 교사↔조교 인계</p>
              {queue.map(q => {
                const stu = students.find(s => s.id === q.student_id);
                return (
                  <div key={q.id} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2">
                    <b>{stu?.name}</b>
                    <span className="flex-1 truncate">{q.title}</span>
                    <Badge variant="outline" className="text-[10px] cursor-pointer select-none hover:bg-muted"
                      title="눌러서 교사 ↔ 조교 인계"
                      onClick={() => toggleQueueAssignee(q)}>
                      {q.assignee === 'assistant' ? '조교' : '교사'}
                    </Badge>
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
            <>
              <Card><CardContent className="p-8 text-center text-sm text-muted-foreground space-y-2">
                <p>🎉 끝점까지 모든 목표를 나갔습니다 — 확인·복습만 남았어요.</p>
                <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                  진도 위치 조정 (기록이 실제와 다르면)
                </Button>
              </CardContent></Card>
              <TrackMapPanel
                trackGoals={trackGoals}
                students={students.filter(s => !absent.has(s.id))}
                progress={progress}
                perStudent={perStudent}
                todayStartIdx={todayStartIdx}
                todayEndIdx={todayEndIdx}
                groupPosIdx={groupPosIdx}
                remainSessions={remainSessions}
                pace={pace}
              />
            </>
          ) : (
            <>
              {/* 오늘 목표 요약 배너 — 어디부터 어디까지 + 페이스 조정 */}
              {(() => {
                const startPage = extractPageRange(todayGoals[0].goal.pages)?.start ?? null;
                const endPage = extractPageRange(todayGoals[todayGoals.length - 1].goal.pages)?.end ?? null;
                const rangeText = startPage != null && endPage != null
                  ? (startPage === endPage ? `p.${startPage}` : `p.${startPage} 부터 → p.${endPage} 까지`)
                  : (todayGoals[0].goal.pages || '') + (todayGoals.length > 1 && todayGoals[todayGoals.length - 1].goal.pages ? ` → ${todayGoals[todayGoals.length - 1].goal.pages}` : '');
                return (
                  <div className="rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[11px] font-bold text-primary/80">🎯 오늘의 목표 ({todayGoals.length}개)</p>
                      {/* 페이스 조정: 느리게 − / + 빠르게 */}
                      <div className="ml-auto flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">분량</span>
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                          disabled={todayCount <= 1}
                          onClick={() => setManualTodayCount(Math.max(1, todayCount - 1))} title="느리게 (분량 줄이기)">−</Button>
                        <span className="text-xs font-bold w-4 text-center">{todayCount}</span>
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                          disabled={todayCount >= remainGoalsAhead}
                          onClick={() => setManualTodayCount(todayCount + 1)} title="빠르게 (분량 늘리기)">+</Button>
                        {manualTodayCount != null && (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                            onClick={() => setManualTodayCount(null)} title="자동 페이스로">자동</Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground"
                          onClick={() => setAdjustOpen(true)}
                          title="진도 위치 조정 — 시작 위치가 실제와 다르면 여기서 바로잡으세요">
                          위치 조정
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm font-extrabold leading-snug">
                      {todayGoals[0].goal.order_index}. {todayGoals[0].goal.title}
                      {todayGoals.length > 1 && <> ~ {todayGoals[todayGoals.length - 1].goal.order_index}. {todayGoals[todayGoals.length - 1].goal.title}</>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <b className="text-foreground">{rangeText}</b>
                      {manualTodayCount != null && <span className="ml-1 text-primary">· 수동 조정됨(자동 {autoTodayCount}개)</span>}
                      {' · '}학생마다 진도가 다르면 아래에서 개별로 기록하세요
                    </p>
                    {/* 무리 페이스 신호 — 기한 대비 분량이 과할 때 */}
                    {pace != null && pace >= 1.5 && (
                      <p className="text-[11px] mt-1.5 rounded-md bg-amber-50 border border-amber-300 text-amber-800 px-2 py-1">
                        ⚠ <b>페이스 무리 신호</b> — 기한까지 남은 수업당 <b>{pace.toFixed(1)}개</b> 목표를 나가야 해요.
                        계획이 빡빡하다면: 특강으로 수업 횟수 추가 · 커리큘럼 수정으로 범위 축소 · 기한 조정을 검토하세요.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* TRACK-MAP-V1: 전체 목차 + 학생별 위치·개인 페이스 지도 — 기록 전에 맥락부터 */}
              <TrackMapPanel
                trackGoals={trackGoals}
                students={students.filter(s => !absent.has(s.id))}
                progress={progress}
                perStudent={perStudent}
                todayStartIdx={todayStartIdx}
                todayEndIdx={todayEndIdx}
                groupPosIdx={groupPosIdx}
                remainSessions={remainSessions}
                pace={pace}
              />

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
                          학생이 실제 나간 마지막 페이지만 적으면 여러 목표에 자동 분배해서 기록해요 · 일부를 건너뛰었다면 <b>71~85</b>처럼 시작~끝을 적으면 앞부분은 "건너뜀"으로 표시
                          {todayEndPage != null && ` · 오늘 목표 끝: p.${todayEndPage}`}
                        </span>
                      </div>

                      {/* 전체 일괄 */}
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2">
                        <span className="text-[11px] font-bold text-muted-foreground mr-1">전체 일괄:</span>
                        <Input
                          placeholder="68 또는 71~85"
                          className="h-7 w-28 text-center text-xs"
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
                                  placeholder="68 / 71~85"
                                  className="h-7 w-24 text-center text-xs"
                                  value={reachedDrafts[s.id] ?? ''}
                                  onChange={e => setReachedDrafts(p => ({ ...p, [s.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') submitReached(s.id, reachedDrafts[s.id] || ''); }}
                                />
                                <Button size="sm" className="h-7 text-xs px-2" onClick={() => submitReached(s.id, reachedDrafts[s.id] || '')}>
                                  기록
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-destructive"
                                  title="이 학생이 이번 수업에 기록한 진도를 취소합니다"
                                  onClick={() => clearStudentProgressToday(s.id)}>
                                  <Undo2 className="w-3.5 h-3.5 mr-1" />취소
                                </Button>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        아래 목표별 카드는 세부 조정이 필요할 때만 쓰세요. 여기서 페이지만 적으면 자동 채워집니다.
                        특정 단원을 통째로 넘겼다면 목표 카드의 <b>⤼ 건너뜀</b> 버튼을 쓰세요.
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
                  if (p.status === 'skipped') return { state: 'skip' as const, upto: '' };
                  return null;
                };
                const bulkKey = `${goal.id}::__all__`;
                // 접힘 요약: 출석 학생들의 상태 집계
                const isOpen = openGoalCards.has(goal.id);
                let cDone = 0, cPartial = 0, cDefer = 0, cSkip = 0;
                presentStudents.forEach(s => {
                  const ss = getStuState(s.id);
                  if (ss?.state === 'done') cDone++;
                  else if (ss?.state === 'partial') cPartial++;
                  else if (ss?.state === 'defer') cDefer++;
                  else if (ss?.state === 'skip') cSkip++;
                });
                return (
                  <Card key={goal.id} className={
                    st?.state === 'done' ? 'border-green-300 bg-green-50/40'
                      : st?.state === 'partial' ? 'border-amber-300 bg-amber-50/40'
                        : st?.state === 'skip' ? 'border-slate-300 bg-slate-50/60 opacity-80'
                          : st?.state === 'defer' ? 'opacity-70' : ''}>
                    <CardContent className={isOpen ? 'p-4 space-y-3' : 'p-0'}>
                      <button
                        className={`flex items-center gap-2 flex-wrap w-full text-left ${isOpen ? '' : 'px-4 py-3 hover:bg-muted/30 transition rounded-xl'}`}
                        onClick={() => setOpenGoalCards(prev => {
                          const n = new Set(prev);
                          n.has(goal.id) ? n.delete(goal.id) : n.add(goal.id);
                          return n;
                        })}
                        title={isOpen ? '접기' : '세부 조정 펼치기'}>
                        <span className="font-extrabold">{goal.order_index}. {goal.title}</span>
                        <span className="text-xs text-muted-foreground">{formatPages(goal.pages)}</span>
                        {continueFrom && (
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                            지난 시간 {continueFrom}까지 — 이어서
                          </Badge>
                        )}
                        <span className="ml-auto flex items-center gap-1.5 shrink-0">
                          {cDone > 0 && (
                            <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 bg-green-50">✓ {cDone}</Badge>
                          )}
                          {cPartial > 0 && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">◐ {cPartial}</Badge>
                          )}
                          {cDefer > 0 && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">→ {cDefer}</Badge>
                          )}
                          {cSkip > 0 && (
                            <Badge variant="outline" className="text-[10px] border-slate-400 text-slate-600 bg-slate-100">⤼ 건너뜀 {cSkip}</Badge>
                          )}
                          {!isOpen && cDone === 0 && cPartial === 0 && cDefer === 0 && cSkip === 0 && (
                            <span className="text-[10px] text-muted-foreground">세부 조정</span>
                          )}
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {isOpen && (
                        <>
                      {design.teaching_mode === 'abc' && design.angle_mode !== 'off' && (
                        <p className="text-xs text-muted-foreground">
                          {(['A', 'B', 'C'] as const).filter(t => design.type_concepts?.[t]).map(t => (
                            <span key={t} className="mr-3"><b className={TYPE_COLORS[t]}>{t}</b> {design.type_concepts[t]}</span>
                          ))}
                        </p>
                      )}

                      {/* 일괄 처리 — 모두 같은 진도일 때 */}
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2">
                        <span className="text-[11px] font-bold text-muted-foreground mr-1">전체 일괄:</span>
                        <Button size="sm" className="h-7 text-xs" onClick={() => setGoalState(goal.id, 'done')}>
                          <Check className="w-3.5 h-3.5 mr-1" />모두 다 나감
                        </Button>
                        <Input
                          placeholder="p.55"
                          className="h-7 w-24 text-center text-xs"
                          value={uptoDrafts[bulkKey] ?? ''}
                          onChange={e => setUptoDrafts(p => ({ ...p, [bulkKey]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                          const v = (uptoDrafts[bulkKey] || '').trim();
                          if (!v) { toast.error('어디까지 나갔는지 적어주세요 (예: p.55)'); return; }
                          setGoalState(goal.id, 'partial', v.startsWith('p') ? v : `p.${v}`);
                        }}>◐ 모두 일부만</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setGoalState(goal.id, 'defer')}>→ 전체 미루기</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                          title="이 목표에 이번 수업으로 기록된 내용을 모두 취소합니다"
                          onClick={() => clearGoalState(goal.id)}>
                          <Undo2 className="w-3.5 h-3.5 mr-1" />기록 취소
                        </Button>

                        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600" title="이 목표는 다루지 않고 넘어갑니다 (진도 위치는 다음으로 이동)"
                          onClick={() => setGoalState(goal.id, 'skip')}>⤼ 전체 건너뜀</Button>
                      </div>

                      {/* 학생별 개별 기록 — 다르면 개별 처리 */}
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
                                      : ss.state === 'skip' ? 'border-slate-400 text-slate-600 bg-slate-100'
                                        : 'border-muted-foreground/40 text-muted-foreground'}`}>
                                  {ss.state === 'done' ? '✓ 다 나감' : ss.state === 'partial' ? `◐ ~${ss.upto}` : ss.state === 'skip' ? '⤼ 건너뜀' : '→ 미룸'}
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
                                <Button size="sm" variant={ss?.state === 'skip' ? 'default' : 'ghost'} className="h-7 text-xs px-2 text-slate-600" title="이 학생은 이 목표를 건너뜁니다"
                                  onClick={() => setGoalState(goal.id, 'skip', undefined, [s.id])}>⤼ 건너뜀</Button>
                                {ss && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-destructive"
                                    title="이 학생의 이 목표 기록을 취소합니다"
                                    onClick={() => clearGoalState(goal.id, [s.id])}>
                                    <Undo2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>

                            </div>
                          );
                        })}
                      </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
          <Button variant="outline" className="w-full text-destructive" onClick={clearAllProgressToday}>
            <Undo2 className="w-4 h-4 mr-1" />이번 수업 진도 기록 전체 취소
          </Button>
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
            <p>· 출석 {effectiveStudents.length - absent.size}명
              {absent.size > 0 && (() => {
                const hOf = (sid: string) => absentHandling[sid] ?? 'skip';
                const abs = students.filter(s => absent.has(s.id));
                const cnt = (k: string) => abs.filter(s => hOf(s.id) === k).length;
                const parts = [
                  cnt('skip') > 0 ? `넘어감 ${cnt('skip')}` : '',
                  cnt('makeup') > 0 ? `보충 ${cnt('makeup')} (저장 시 큐 등록)` : '',
                  cnt('defer') > 0 ? `미루기 ${cnt('defer')} (자동 재분배)` : '',
                ].filter(Boolean).join(' · ');
                return ` / 결석 ${absent.size}명${parts ? ` — ${parts}` : ''}`;
              })()}
              {walkinStudents.length > 0 && ` · 게릴라 ${walkinStudents.length}명 포함`}</p>
            <p>· 쪽지시험 {Object.keys(quizSaved).length}명 기록
              {Object.values(quizSaved).filter(v => !v.passed).length > 0 &&
                ` — 미달 ${Object.values(quizSaved).filter(v => !v.passed).length}명 자동 큐 등록`}</p>
            {Object.keys(verifiedLocal).length > 0 && (
              <p>· 확인 도장 {Object.keys(verifiedLocal).length}건
                — ✓이해 {Object.values(verifiedLocal).filter(v => v === 'ok').length} / ✗미흡 {Object.values(verifiedLocal).filter(v => v === 'weak').length}
                {Object.values(verifiedLocal).some(v => v === 'weak') && ' (미흡은 재학습 큐 등록됨)'}</p>
            )}
            <p>· 진도: {(() => {
              // TODAY-SUMMARY-FIX-V1: 요약은 이번 세션에 저장된 진도(DB) + 이번 화면 기록(로컬)을 합산해서 표시.
              // goalStates만 읽으면 페이지 입력(학생별 기록) 방식이 항상 "기록 없음"으로 나오는 버그가 있었음.
              const byGoal: Record<string, Record<string, { state: 'done' | 'partial' | 'defer' | 'skip'; upto: string }>> = {};
              const put = (gid: string, sid: string, state: 'done' | 'partial' | 'defer' | 'skip', upto: string) => {
                (byGoal[gid] ||= {})[sid] = { state, upto };
              };
              for (const p of progress) {
                if ((p as any).session_id !== sessionId) continue;
                if (['advanced', 'verified_ok', 'verified_weak'].includes(p.status)) put(p.goal_id, p.student_id, 'done', '');
                else if (p.status === 'partial') put(p.goal_id, p.student_id, 'partial', p.partial_upto || '');
                else if (p.status === 'deferred') put(p.goal_id, p.student_id, 'defer', '');
                else if (p.status === 'skipped') put(p.goal_id, p.student_id, 'skip', '');
              }
              for (const [gid, st] of Object.entries(goalStates)) {
                if (st.state) students.filter(s => !absent.has(s.id)).forEach(s => put(gid, s.id, st.state!, st.upto));
              }
              for (const [gid, stuMap] of Object.entries(perStudent)) {
                for (const [sid, st] of Object.entries(stuMap)) {
                  if (st.state) put(gid, sid, st.state, st.upto);
                }
              }
              const entries = Object.entries(byGoal).map(([gid, stuMap]) => {
                const g = goals.find(x => x.id === gid);
                const states = Object.values(stuMap);
                const done = states.filter(s => s.state === 'done').length;
                const partials = states.filter(s => s.state === 'partial');
                const defer = states.filter(s => s.state === 'defer').length;
                const skip = states.filter(s => s.state === 'skip').length;
                const upto = partials.find(p => p.upto)?.upto || '';
                const total = states.length;
                const parts = [
                  done > 0 ? (done === total ? '완료' : `완료 ${done}명`) : '',
                  partials.length > 0 ? `일부${upto ? `(~${upto})` : ''}${partials.length === total ? '' : ` ${partials.length}명`}` : '',
                  defer > 0 ? (defer === total ? '미룸' : `미룸 ${defer}명`) : '',
                  skip > 0 ? (skip === total ? '건너뜀(생략)' : `건너뜀 ${skip}명`) : '',
                ].filter(Boolean).join(', ');
                return { idx: g?.order_index ?? 0, label: parts };
              }).sort((a, b) => a.idx - b.idx);
              return entries.length === 0 ? '기록 없음'
                : entries.map(e => `${e.idx}. ${e.label}`).join(' · ');
            })()}</p>
          </CardContent></Card>

          {/* PLAN-UNDERSTANDING-V1: 학생별 이해도(1-5) 수동 입력 */}
          <Card><CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-muted-foreground">🧠 오늘 이해도 — 1(낮음) ~ 5(높음)</p>
              <span className="text-[10px] text-muted-foreground">쪽지시험이 있으면 자동 반영되지만, 여기서 지정한 값이 우선합니다.</span>
            </div>
            <div className="space-y-1.5">
              {students.filter(s => !absent.has(s.id)).map(s => {
                const quiz = quizSaved[s.id];
                const auto = quiz ? Math.max(1, Math.min(5, Math.round(quiz.score / 20))) : null;
                const cur = understandingPerStudent[s.id] ?? null;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="font-bold text-xs min-w-[60px]">{s.name}</span>
                    <div className="flex gap-1 flex-1">
                      {[1,2,3,4,5].map(n => {
                        const active = cur === n;
                        return (
                          <button key={n} type="button"
                            onClick={() => setUnderstandingPerStudent(p => {
                              const next = { ...p };
                              if (next[s.id] === n) delete next[s.id];
                              else next[s.id] = n;
                              return next;
                            })}
                            className={`h-7 flex-1 rounded-md border text-xs font-bold transition ${active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground hover:bg-muted border-border'}`}>
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    {cur == null && auto != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0">쪽지 자동 {auto}</span>
                    )}
                  </div>
                );
              })}
              {students.filter(s => !absent.has(s.id)).length === 0 && (
                <p className="text-[11px] text-muted-foreground">출결 대상 학생이 없습니다.</p>
              )}
            </div>
          </CardContent></Card>

          {/* BOOK-PROGRESS-LOG-V1: 병행교재 오늘 진도 — 책갈피에 등록된 보조교재의 "오늘 어디까지" */}
          {students.filter(s => !absent.has(s.id) && (sideBooks[s.id] ?? []).length > 0).length > 0 && (
            <Card><CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold text-muted-foreground">📖 병행교재 — 오늘 어디까지 나갔나요?</p>
                <span className="text-[10px] text-muted-foreground">안 나간 책은 비워두세요. 저장 시 책갈피가 전진하고 학부모 안내에 반영됩니다.</span>
              </div>
              <div className="space-y-1.5">
                {students.filter(s => !absent.has(s.id) && (sideBooks[s.id] ?? []).length > 0).map(s => (
                  <div key={s.id} className="space-y-1">
                    {(sideBooks[s.id] ?? []).map((b, i) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <span className="font-bold text-xs min-w-[60px]">{i === 0 ? s.name : ''}</span>
                        <span className="text-xs flex-1 truncate">{b.book_title} <span className="text-muted-foreground">({b.book_role}) · 현재 p.{b.current_page}</span></span>
                        <Input type="number" inputMode="numeric" placeholder={`p.${b.current_page + 1}~`}
                          className="h-7 w-24 text-xs"
                          value={sideBookPages[b.id] ?? ''}
                          onChange={e => setSideBookPages(p => ({ ...p, [b.id]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent></Card>
          )}

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

      {/* PLAN-CANCEL-V1: 휴강 처리 — 사유 입력 */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <CalendarX className="w-4 h-4 text-orange-600" />{design.title} — {sessionDate} 휴강 처리
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">
              휴강하면 이 날 수업은 기록 없이 닫히고, 남은 목표는 이후 수업에 <b>자동 재분배</b>됩니다.
              이날 마감이던 숙제는 <b>다음 수업일로 마감이 밀려</b> 숙제검사도 다음 시간에 하게 돼요.
            </p>
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1">휴강 사유</p>
              <Input placeholder="예: 학교 시험 전날 / 원장 지시 / 태풍 휴원"
                value={cancelReason} onChange={e => setCancelReason(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setCancelOpen(false)}>닫기</Button>
              <Button className="flex-1 bg-orange-600 hover:bg-orange-700"
                onClick={async () => {
                  try {
                    const { hwShifted, nextDate } = await cancelSession(design, todayStr, cancelReason);
                    setSessionMeta(p => ({ ...p, status: 'cancelled', cancel_reason: cancelReason.trim() || null }));
                    setCancelOpen(false);
                    toast.success(`휴강 처리 완료${hwShifted > 0 && nextDate ? ` — 숙제 마감 ${hwShifted}건 → ${nextDate}로 밀림` : ''}`);
                  } catch (e: any) {
                    const msg = String(e?.message || e);
                    toast.error(msg.includes('constraint') || msg.includes('cancel_reason') || msg.includes('column')
                      ? '휴강 기능의 DB 반영이 필요해요 — plan_session_cancel 마이그레이션을 먼저 적용해주세요'
                      : `휴강 처리 실패: ${msg}`);
                  }
                }}>
                휴강 확정
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PLAN-POS-ADJUST-V1: 진도 위치 조정 */}
      <ProgressAdjustModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        designId={designId!}
        trackId={design.track_id}
        endGoalId={design.end_goal_id || null}
        title={design.title}
        onChanged={() => {
          // 로컬 캐시 상태 비우고 서버에서 다시 로딩
          setPerStudent({});
          setGoalStates({});
          setUptoDrafts({});
          setReachedDrafts({});
          setManualTodayCount(null);
          setReloadKey(k => k + 1);
        }}
      />
    </div>
  );
}
