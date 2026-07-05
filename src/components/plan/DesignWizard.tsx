// LESSON-PLAN-CORE-V1: 수업 설계 위저드 — 6문답 (목업 v11)
// Q0 반 선택 → Q1 트랙(목표+페이지) → Q2 수업 방향(판서/ABC/개별) → Q3 확인 룰셋
// → Q4 미달 관리 → Q5 리듬·끝점·기한(페이스 자동)
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Sparkles, Flag } from 'lucide-react';
import {
  PlanTrack, PlanGoal, GoalInput, TeachingMode, StudentType, SessionRole,
  fetchTracks, fetchGoals, createTrackWithGoals, createDesign,
  DAY_LABELS, ROLE_LABELS, countProgressSessions,
} from './planApi';

type ClassOption = {
  id: string; name: string; subject: string; teacher_id: string | null;
  teacher_name?: string;
};
type StudentRow = { id: string; name: string; grade: string | null };

const TYPE_META: Record<StudentType, { label: string; color: string; bg: string; placeholder: string }> = {
  A: { label: 'A — 심화', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-300', placeholder: '예: 서술형·응용까지, 막힐 때만 개입' },
  B: { label: 'B — 표준', color: 'text-sky-700', bg: 'bg-sky-50 border-sky-300', placeholder: '예: 개념 확인 후 유형 문제, 오답 즉시 교정' },
  C: { label: 'C — 개념 보강', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300', placeholder: '예: 개념 재설명 먼저, 기본 문제로 성공 경험' },
};

const CHECK_METHOD_OPTIONS = [
  { key: 'quiz', label: '쪽지시험', desc: '수업 시작 10분, 지난 진도' },
  { key: 'homework', label: '과제 검사', desc: '풀이 과정 확인' },
  { key: 'oral', label: '구두 질문', desc: '개념 설명시키기' },
  { key: 'unit_test', label: '단원 마무리 테스트', desc: '단원 끝날 때' },
];

export function DesignWizard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { user, role } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Q0 반 — 'existing' 기존 반 선택 / 'compose' 학생 골라 즉석 구성
  const [rosterMode, setRosterMode] = useState<'existing' | 'compose'>('existing');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);

  // Compose 모드 전용
  const [poolStudents, setPoolStudents] = useState<StudentRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [studentFilter, setStudentFilter] = useState('');
  const [composeSubject, setComposeSubject] = useState<string>('');
  const [composeGroupName, setComposeGroupName] = useState<string>('');
  const [composeDays, setComposeDays] = useState<number[]>([]);


  // Q1 트랙
  const [tracks, setTracks] = useState<PlanTrack[]>([]);
  const [trackChoice, setTrackChoice] = useState<'new' | string>('new');
  const [trackTitle, setTrackTitle] = useState('');
  const [textbook, setTextbook] = useState('');
  const [goals, setGoals] = useState<GoalInput[]>([{ title: '', pages: '' }]);
  const [existingGoals, setExistingGoals] = useState<PlanGoal[]>([]);

  // Q2 방향
  const [mode, setMode] = useState<TeachingMode>('lecture');
  const [concepts, setConcepts] = useState<Record<StudentType, string>>({ A: '', B: '', C: '' });
  const [studentTypes, setStudentTypes] = useState<Record<string, StudentType>>({});
  const [angleMode, setAngleMode] = useState<'manual' | 'ai' | 'off'>('manual');

  // Q3 룰셋
  const [methods, setMethods] = useState<string[]>(['quiz', 'homework']);
  const [cycle, setCycle] = useState('every_plus_unit');
  const [cutline, setCutline] = useState(70);
  const [cutlines, setCutlines] = useState<Record<StudentType, number>>({ A: 80, B: 70, C: 60 });

  // Q4 미달 관리
  const [failAction, setFailAction] = useState<'retest' | 'clinic' | 'homework'>('retest');
  const [escalateAfter, setEscalateAfter] = useState(2);

  // Q5 리듬·기한
  const [rhythm, setRhythm] = useState<Record<string, SessionRole>>({});
  const [endGoalIdx, setEndGoalIdx] = useState<number>(-1); // goals 배열 index (신규) 또는 existingGoals index
  const [targetDate, setTargetDate] = useState('');

  const selectedClass = classes.find(c => c.id === classId) || null;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('classes')
        .select('id, name, subject, teacher_id, profiles:teacher_id(full_name)')
        .order('name');
      let list: ClassOption[] = ((data || []) as any[]).map(c => ({
        id: c.id, name: c.name, subject: c.subject, teacher_id: c.teacher_id,
        teacher_name: c.profiles?.full_name,
      }));
      if (role === 'teacher' && user?.id) list = list.filter(c => c.teacher_id === user.id);
      setClasses(list);
    })();
  }, [role, user?.id]);

  // 반 선택 → 학생·시간표·트랙 로드
  useEffect(() => {
    if (!classId || !selectedClass) return;
    (async () => {
      const [csRes, schRes] = await Promise.all([
        supabase.from('class_students')
          .select('student_id, students(id, name, grade)')
          .eq('class_id', classId),
        supabase.from('class_schedules')
          .select('day_of_week').eq('class_id', classId).eq('is_active', true),
      ]);
      const studs = ((csRes.data || []) as any[])
        .map(r => r.students).filter(Boolean)
        .map((s: any) => ({ id: s.id, name: s.name, grade: s.grade }));
      studs.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setStudents(studs);
      const days = Array.from(new Set(((schRes.data || []) as any[]).map(r => r.day_of_week))).sort();
      setScheduleDays(days);
      setRhythm(Object.fromEntries(days.map(d => [String(d), 'progress' as SessionRole])));
      // 유형 기본값 B
      setStudentTypes(Object.fromEntries(studs.map(s => [s.id, 'B' as StudentType])));
      try { setTracks(await fetchTracks(selectedClass.subject)); } catch { /* 무시 */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // Compose 모드 진입 시 담당 학생 풀 로드
  useEffect(() => {
    if (rosterMode !== 'compose' || !user?.id) return;
    if (poolStudents.length > 0) return;
    (async () => {
      setPoolLoading(true);
      try {
        let ids: string[] | null = null;
        if (role === 'teacher') {
          const [linkRes, sstRes] = await Promise.all([
            supabase.from('teacher_student_links').select('student_id').eq('teacher_id', user.id),
            supabase.from('student_subject_teachers').select('student_id').eq('teacher_id', user.id),
          ]);
          const set = new Set<string>();
          ((linkRes.data || []) as any[]).forEach(r => r.student_id && set.add(r.student_id));
          ((sstRes.data || []) as any[]).forEach(r => r.student_id && set.add(r.student_id));
          ids = Array.from(set);
        }
        let q = supabase.from('students').select('id, name, grade').order('name');
        if (ids !== null) {
          if (ids.length === 0) { setPoolStudents([]); setPoolLoading(false); return; }
          q = q.in('id', ids);
        }
        const { data } = await q;
        setPoolStudents(((data || []) as any[]).map(s => ({ id: s.id, name: s.name, grade: s.grade })));
      } finally { setPoolLoading(false); }
    })();
  }, [rosterMode, user?.id, role, poolStudents.length]);

  // Compose: 선택한 학생/요일/과목 → students·scheduleDays·rhythm·트랙에 반영
  useEffect(() => {
    if (rosterMode !== 'compose') return;
    const studs = poolStudents
      .filter(s => pickedIds.includes(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    setStudents(studs);
    setStudentTypes(prev => {
      const next: Record<string, StudentType> = {};
      studs.forEach(s => { next[s.id] = prev[s.id] || 'B'; });
      return next;
    });
  }, [rosterMode, pickedIds, poolStudents]);

  useEffect(() => {
    if (rosterMode !== 'compose') return;
    const days = [...composeDays].sort();
    setScheduleDays(days);
    setRhythm(prev => {
      const next: Record<string, SessionRole> = {};
      days.forEach(d => { next[String(d)] = prev[String(d)] || 'progress'; });
      return next;
    });
  }, [rosterMode, composeDays]);

  useEffect(() => {
    if (rosterMode !== 'compose' || !composeSubject) return;
    fetchTracks(composeSubject).then(setTracks).catch(() => setTracks([]));
  }, [rosterMode, composeSubject]);



  useEffect(() => {
    if (trackChoice === 'new') { setExistingGoals([]); return; }
    fetchGoals(trackChoice).then(setExistingGoals).catch(() => setExistingGoals([]));
  }, [trackChoice]);

  const effectiveGoals: { title: string; pages: string }[] = trackChoice === 'new'
    ? goals.filter(g => g.title.trim())
    : existingGoals.map(g => ({ title: g.title, pages: g.pages || '' }));

  const progressSessionCount = useMemo(
    () => countProgressSessions(rhythm, targetDate || null),
    [rhythm, targetDate]
  );
  const remainGoalCount = endGoalIdx >= 0 ? endGoalIdx + 1 : effectiveGoals.length;
  const pacePerSession = progressSessionCount > 0 ? remainGoalCount / progressSessionCount : null;
  const paceTight = pacePerSession != null && pacePerSession > 1.6;

  function cycleStudentType(id: string) {
    const order: Record<StudentType, StudentType> = { A: 'B', B: 'C', C: 'A' };
    setStudentTypes(p => ({ ...p, [id]: order[p[id] || 'B'] }));
  }

  function goalLinesPaste(text: string) {
    // "제목 | p.10-17" 또는 "제목 p.10-17" 형식 줄단위 붙여넣기
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    const parsed = lines.map(l => {
      const m = l.match(/^(.+?)[\s|]+(p\.?\s*[\d~\-–,.\s]+)$/i);
      return m ? { title: m[1].replace(/\|$/, '').trim(), pages: m[2].trim() } : { title: l, pages: '' };
    });
    setGoals(parsed);
    toast.success(`${parsed.length}개 목표를 붙여넣었어요 — 페이지를 확인해주세요`);
    return true;
  }

  const STEPS = ['반 선택', '무엇을', '어떻게', '확인은', '미달 관리', '리듬·기한'];

  // Compose 모드용 파생값
  const composeSubjectResolved = rosterMode === 'compose' ? composeSubject : (selectedClass?.subject || '');
  const composeReady = rosterMode === 'compose'
    && pickedIds.length > 0
    && !!composeSubject
    && composeDays.length > 0;

  function canNext(): boolean {
    switch (step) {
      case 0:
        return rosterMode === 'existing'
          ? !!classId && students.length > 0
          : composeReady;
      case 1: return trackChoice !== 'new'
        ? existingGoals.length > 0
        : goals.filter(g => g.title.trim()).length > 0 && !!trackTitle.trim();
      case 2: return mode !== 'abc' || (['A', 'B', 'C'] as StudentType[]).some(t => concepts[t].trim());
      case 3: return methods.length > 0;
      default: return true;
    }
  }

  async function save() {
    if (!user) return;
    if (rosterMode === 'existing' && !selectedClass) return;
    if (rosterMode === 'compose' && !composeReady) { toast.error('학생·과목·요일을 채워주세요.'); return; }
    if (!targetDate) { toast.error('기한을 정해주세요.'); return; }
    if (endGoalIdx < 0) { toast.error('끝점 목표를 선택해주세요.'); return; }
    const subject = rosterMode === 'existing' ? selectedClass!.subject : composeSubject;
    const contextName = rosterMode === 'existing'
      ? selectedClass!.name
      : (composeGroupName.trim() || `내 그룹 (${students.length}명)`);
    const teacherIdForDesign = rosterMode === 'existing'
      ? (selectedClass!.teacher_id || user.id)
      : user.id;
    const classIdForDesign = rosterMode === 'existing' ? classId : null;
    setSaving(true);
    try {
      // 1) 트랙 확보
      let trackId: string; let goalRows: PlanGoal[];
      if (trackChoice === 'new') {
        const created = await createTrackWithGoals(
          trackTitle.trim(), subject, textbook, goals.filter(g => g.title.trim()), user.id);
        trackId = created.track.id; goalRows = created.goals;
      } else {
        trackId = trackChoice; goalRows = existingGoals;
      }
      const endGoal = goalRows[endGoalIdx];
      // 2) 설계 저장
      const designId = await createDesign({
        track_id: trackId,
        class_id: classIdForDesign,
        teacher_id: teacherIdForDesign,
        title: `${contextName} — ${trackTitle || tracks.find(t => t.id === trackChoice)?.title || ''}`.trim(),
        teaching_mode: mode,
        type_concepts: mode === 'abc' ? concepts : {},
        angle_mode: mode === 'abc' ? angleMode : 'off',
        check_methods: methods,
        check_cycle: cycle,
        cutline_default: cutline,
        cutline_by_type: mode === 'abc' ? cutlines : {},
        fail_action: failAction,
        escalate_after: escalateAfter,
        rhythm,
        end_goal_id: endGoal?.id || null,
        target_date: targetDate,
      }, students.map(s => ({
        student_id: s.id,
        student_type: mode === 'abc' ? (studentTypes[s.id] || 'B') : null,
      })));
      toast.success('수업 설계 저장 완료 — 이제 매 수업이 자동으로 준비됩니다.');
      onDone();
      void designId;
      void composeSubjectResolved;
    } catch (e: any) {
      toast.error(`저장 실패: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 진행 표시 */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              ${i === step ? 'bg-primary text-primary-foreground'
                : i < step ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs truncate ${i === step ? 'font-bold' : 'text-muted-foreground'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* ── Q0 반 선택 ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">어느 반의 수업을 설계할까요?</h2>
                <p className="text-sm text-muted-foreground">학생·시간표는 반에서 자동으로 가져옵니다.</p>
              </div>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="반 선택" /></SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.subject}{c.teacher_name ? ` · ${c.teacher_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classId && (
                <div className="rounded-lg bg-muted/40 p-4 text-sm space-y-1">
                  <p><b>학생 {students.length}명</b> — {students.map(s => s.name).join(', ') || '없음'}</p>
                  <p className="text-muted-foreground">
                    수업 요일: {scheduleDays.length > 0 ? scheduleDays.map(d => DAY_LABELS[d]).join(' · ') : '시간표 미등록 (Q5에서 수동 지정 불가 — 시간표에 등록해주세요)'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Q1 트랙 ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Q1. 이번 시즌, 어디까지 갈까요?</h2>
                <p className="text-sm text-muted-foreground">목표 목록을 만드세요 — 페이지까지 적어야 수업지·플래너가 정확해집니다.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant={trackChoice === 'new' ? 'default' : 'outline'} size="sm" onClick={() => setTrackChoice('new')}>
                  <Plus className="w-4 h-4 mr-1" />새 트랙 만들기
                </Button>
                {tracks.map(t => (
                  <Button key={t.id} variant={trackChoice === t.id ? 'default' : 'outline'} size="sm" onClick={() => setTrackChoice(t.id)}>
                    {t.title}
                  </Button>
                ))}
              </div>

              {trackChoice === 'new' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="트랙 이름 (예: 중3-2 수학 선행)" value={trackTitle} onChange={e => setTrackTitle(e.target.value)} />
                    <Input placeholder="교재 (예: 개념원리)" value={textbook} onChange={e => setTextbook(e.target.value)} />
                  </div>
                  <div className="rounded-lg border divide-y">
                    {goals.map((g, i) => (
                      <div key={i} className="flex items-center gap-2 p-2">
                        <span className="w-6 text-right text-xs font-bold text-muted-foreground shrink-0">{i + 1}</span>
                        <Input
                          className="flex-1 h-8" placeholder="목표 (예: 원과 현 — 수직이등분선)"
                          value={g.title}
                          onChange={e => setGoals(p => p.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x))}
                          onPaste={e => {
                            const text = e.clipboardData.getData('text');
                            if (text.includes('\n') && goalLinesPaste(text)) e.preventDefault();
                          }}
                        />
                        <Input
                          className="w-28 h-8" placeholder="p.52–58"
                          value={g.pages}
                          onChange={e => setGoals(p => p.map((x, xi) => xi === i ? { ...x, pages: e.target.value } : x))}
                        />
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0"
                          onClick={() => setGoals(p => p.length > 1 ? p.filter((_, xi) => xi !== i) : p)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setGoals(p => [...p, { title: '', pages: '' }])}>
                      <Plus className="w-4 h-4 mr-1" />목표 추가
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toast.info('교재 목차 AI 추출은 다음 업데이트에서 연결됩니다 — 지금은 여러 줄 복사해서 첫 칸에 붙여넣기 하세요 ("제목 | p.10-17" 형식)')}>
                      <Sparkles className="w-4 h-4 mr-1" />목차에서 AI 생성
                    </Button>
                    <span className="text-xs text-muted-foreground self-center">💡 목록을 통째로 복사해 첫 칸에 붙여넣으면 자동으로 나뉩니다</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                  {existingGoals.map(g => (
                    <div key={g.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <span className="w-6 text-right text-xs font-bold text-muted-foreground">{g.order_index}</span>
                      <span>{g.title}</span>
                      <span className="text-xs text-muted-foreground">{g.pages}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Q2 수업 방향 ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Q2. 이 반, 어떤 방식으로 이끌까요?</h2>
                <p className="text-sm text-muted-foreground">아이들 수준 차이를 떠올려보세요 — 이 선택이 매 수업 화면을 만듭니다.</p>
              </div>
              <div className="grid gap-2">
                {([
                  { key: 'lecture', icon: '🖊', title: '판서식 일괄', desc: '전원 같은 진도, 같은 깊이 — 수준이 고른 반' },
                  { key: 'abc', icon: '🔀', title: '컨셉 분화 (A/B/C형)', desc: '같은 목차, 학생마다 다른 각도와 깊이' },
                  { key: 'indiv', icon: '👤', title: '개별 진도', desc: '학생마다 다른 위치 — 1:1·소수 정예' },
                ] as const).map(o => (
                  <button key={o.key}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition
                      ${mode === (o.key === 'indiv' ? 'individual' : o.key) ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                    onClick={() => setMode(o.key === 'indiv' ? 'individual' : o.key as TeachingMode)}>
                    <span className="text-2xl">{o.icon}</span>
                    <span><span className="font-bold">{o.title}</span><br />
                      <span className="text-sm text-muted-foreground">{o.desc}</span></span>
                  </button>
                ))}
              </div>
              {mode === 'abc' && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-medium">각 유형의 컨셉을 한 줄로 — 그리고 학생을 배정하세요 (이름 클릭 = 유형 순환)</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(['A', 'B', 'C'] as StudentType[]).map(t => (
                      <div key={t} className={`rounded-lg border p-3 ${TYPE_META[t].bg}`}>
                        <p className={`text-xs font-bold mb-1 ${TYPE_META[t].color}`}>{TYPE_META[t].label}</p>
                        <Input className="h-8 bg-white/70 text-sm" placeholder={TYPE_META[t].placeholder}
                          value={concepts[t]} onChange={e => setConcepts(p => ({ ...p, [t]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {students.map(s => {
                      const t = studentTypes[s.id] || 'B';
                      return (
                        <button key={s.id} onClick={() => cycleStudentType(s.id)}
                          className={`rounded-full border px-3.5 py-1.5 text-sm font-bold ${TYPE_META[t].bg} ${TYPE_META[t].color}`}>
                          {s.name} · {t}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">목표별 유형 각도 작성:</span>
                    <Select value={angleMode} onValueChange={v => setAngleMode(v as any)}>
                      <SelectTrigger className="w-52 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">내가 직접 쓴다</SelectItem>
                        <SelectItem value="ai">AI 초안 받고 고친다</SelectItem>
                        <SelectItem value="off">각도 표시 안 함</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Q3 확인 룰셋 ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Q3. "배웠다"를 무엇으로 확인할까요?</h2>
                <p className="text-sm text-muted-foreground">확인 없는 진도는 흘러갑니다 — 방법과 커트라인을 정하면 매 수업 자동으로 깔립니다.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHECK_METHOD_OPTIONS.map(m => (
                  <label key={m.key} className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer
                    ${methods.includes(m.key) ? 'border-primary bg-primary/5' : ''}`}>
                    <Checkbox checked={methods.includes(m.key)}
                      onCheckedChange={c => setMethods(p => c ? [...p, m.key] : p.filter(x => x !== m.key))} />
                    <span className="text-sm"><b>{m.label}</b><br />
                      <span className="text-muted-foreground text-xs">{m.desc}</span></span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>주기</span>
                <Select value={cycle} onValueChange={setCycle}>
                  <SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="every">매 수업 시작 10분</SelectItem>
                    <SelectItem value="every_plus_unit">매 수업 + 단원 마무리 테스트</SelectItem>
                    <SelectItem value="weekly">주 1회 몰아서</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>커트라인</span>
                <Input type="number" className="w-20 h-9 text-center font-bold" value={cutline}
                  onChange={e => setCutline(Number(e.target.value) || 0)} />점
                {mode === 'abc' && (
                  <span className="flex items-center gap-2 ml-2">
                    <span className="text-muted-foreground">유형별:</span>
                    {(['A', 'B', 'C'] as StudentType[]).map(t => (
                      <span key={t} className="flex items-center gap-1">
                        <b className={TYPE_META[t].color}>{t}</b>
                        <Input type="number" className="w-16 h-8 text-center" value={cutlines[t]}
                          onChange={e => setCutlines(p => ({ ...p, [t]: Number(e.target.value) || 0 }))} />
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Q4 미달 관리 ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Q4. 커트라인에 못 미치면 어떻게 관리할까요?</h2>
                <p className="text-sm text-muted-foreground">미달은 사라지지 않고 할 일로 이어집니다.</p>
              </div>
              <div className="grid gap-2">
                {([
                  { key: 'retest', icon: '🔁', title: '재시험', desc: '다음 수업 시작 때 다시 (자동 등록)' },
                  { key: 'clinic', icon: '🏥', title: '클리닉 재학습', desc: '조교에게 인계 — 정규수업 외 시간' },
                  { key: 'homework', icon: '📝', title: '과제 보완', desc: '보완 과제 확인 후 통과 처리' },
                ] as const).map(o => (
                  <button key={o.key}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition
                      ${failAction === o.key ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                    onClick={() => setFailAction(o.key)}>
                    <span className="text-2xl">{o.icon}</span>
                    <span><span className="font-bold">{o.title}</span><br />
                      <span className="text-sm text-muted-foreground">{o.desc}</span></span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm border-t pt-4">
                <Select value={String(escalateAfter)} onValueChange={v => setEscalateAfter(Number(v))}>
                  <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2회</SelectItem>
                    <SelectItem value="3">3회</SelectItem>
                  </SelectContent>
                </Select>
                <span>연속 미달이면 <b className="text-destructive">'추가관리 필요' 알림</b></span>
                <span className="text-xs text-muted-foreground">→ 원장 화면에 올라갑니다</span>
              </div>
            </div>
          )}

          {/* ── Q5 리듬·끝점·기한 ── */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Q5. 어떤 리듬으로, 언제까지?</h2>
                <p className="text-sm text-muted-foreground">회차 역할과 기한만 정하면 회당 분량은 자동입니다.</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-4 space-y-2">
                <p className="text-xs font-bold text-muted-foreground">회차별 역할 (시간표 연동 · 주 {scheduleDays.length}회)</p>
                <div className="flex flex-wrap gap-3">
                  {scheduleDays.map(d => (
                    <div key={d} className="flex items-center gap-2">
                      <b>{DAY_LABELS[d]}</b>
                      <Select value={rhythm[String(d)] || 'progress'}
                        onValueChange={v => setRhythm(p => ({ ...p, [String(d)]: v as SessionRole }))}>
                        <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(ROLE_LABELS) as [SessionRole, string][]).map(([k, l]) => (
                            <SelectItem key={k} value={k}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {scheduleDays.length === 0 && <p className="text-sm text-destructive">시간표에 이 반의 수업 요일이 없습니다 — 시간표 등록 후 다시 오세요.</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>끝점</span>
                <Select value={endGoalIdx >= 0 ? String(endGoalIdx) : ''} onValueChange={v => setEndGoalIdx(Number(v))}>
                  <SelectTrigger className="w-72 h-9"><SelectValue placeholder="여기까지 간다 — 목표 선택" /></SelectTrigger>
                  <SelectContent>
                    {effectiveGoals.map((g, i) => (
                      <SelectItem key={i} value={String(i)}>{i + 1}. {g.title} {g.pages}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>기한</span>
                <Input type="date" className="w-44 h-9" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
              </div>
              <div className={`rounded-xl p-5 ${paceTight ? 'bg-amber-50 border border-amber-300' : 'bg-primary/5'}`}>
                <p className={`text-3xl font-extrabold tabular-nums ${paceTight ? 'text-amber-700' : 'text-primary'}`}>
                  {pacePerSession != null && progressSessionCount > 0 ? pacePerSession.toFixed(1) + '개' : '—'}
                </p>
                <p className="text-sm font-medium text-muted-foreground">수업 1회당 나갈 목표 (자동 계산 · 밀리면 자동 재분배)</p>
                {pacePerSession != null && progressSessionCount > 0 && (
                  <p className="text-sm mt-1.5">
                    목표 <b>{remainGoalCount}개</b> ÷ 진도 회차 <b>{progressSessionCount}회</b>
                    {Object.values(rhythm).includes('test_day') && ' (테스트 데이 제외)'}
                    {paceTight && <b className="text-amber-700"> — ⚠ 빡빡해요. 기한·리듬·끝점 중 하나를 조정해보세요.</b>}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-muted/40 p-4 text-sm space-y-1">
                <p className="font-bold flex items-center gap-1"><Flag className="w-4 h-4" />설계 완성 — 이제 자동으로 준비되는 것</p>
                <p>· 매 수업 "오늘 나갈 것 + 확인 체크"가 깔린 수업 화면{mode === 'abc' && ' (학생별 A/B/C 각도 포함)'}</p>
                <p>· 미달 → {failAction === 'retest' ? '재시험' : failAction === 'clinic' ? '조교 클리닉' : '보완 과제'} 자동 등록 · {escalateAfter}회 연속이면 원장 알림</p>
                <p>· 테스트 데이는 확인·재시험 중심 화면으로 자동 전환</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 네비게이션 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onCancel}>취소</Button>
        <div className="flex-1" />
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(s => s - 1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />이전
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext()} onClick={() => setStep(s => s + 1)}>
            다음<ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button disabled={saving || !targetDate || endGoalIdx < 0} onClick={save}>
            <Check className="w-4 h-4 mr-1" />{saving ? '저장 중…' : '설계 저장'}
          </Button>
        )}
      </div>
    </div>
  );
}
