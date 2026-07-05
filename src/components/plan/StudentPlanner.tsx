// PLANNER-PRINT-V2: 학생 월간 플래너 — 새싹 정원 컨셉 달력 (A4 가로 1인 1페이지)
// 커리큘럼 시작일 지정 · 매일 채우면 새싹이 자라는 애착 디자인 · 인쇄는 '출력 확인'으로만 기록.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, Undo2, Check, Sprout, CheckCircle2 } from 'lucide-react';
import { PlanGoal, SessionRole, markPlannerPrinted } from './planApi';

const db = supabase as any;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const TYPE_LABEL: Record<string, string> = { A: '심화', B: '표준', C: '개념' };

type Stu = { id: string; name: string; grade: string | null; type: 'A' | 'B' | 'C' | null };
type Cell = {
  day: number | null;        // null = 빈 칸(월 정렬용)
  dow: number;
  inRange: boolean;          // 시작일 이후인지
  lesson: boolean;           // 수업일(리듬)인지
  role?: SessionRole;
  goal?: string;             // 그날 할 것
  isToday: boolean;
};

export function StudentPlanner() {
  const { designId } = useParams<{ designId: string }>();
  const navigate = useNavigate();
  const { user, fullName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [design, setDesign] = useState<any>(null);
  const [goals, setGoals] = useState<PlanGoal[]>([]);
  const [students, setStudents] = useState<Stu[]>([]);
  const [advancedGoalIds, setAdvancedGoalIds] = useState<Set<string>>(new Set());
  const [queueByStudent, setQueueByStudent] = useState<Record<string, string[]>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [printRecord, setPrintRecord] = useState<{ by: string; at: string } | null>(null);

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const [monthOffset, setMonthOffset] = useState(0);
  const periodDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const periodMonth = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;

  // 커리큘럼 시작일 — 기기별로 기억(localStorage)
  const startKey = `plan_start::${designId}`;
  const [startDate, setStartDate] = useState<string>('');
  useEffect(() => {
    const saved = designId ? localStorage.getItem(startKey) : null;
    setStartDate(saved || new Date().toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);
  function updateStart(v: string) {
    setStartDate(v);
    if (designId) localStorage.setItem(startKey, v);
  }

  useEffect(() => {
    if (!designId) return;
    (async () => {
      setLoading(true);
      try {
        const [dRes, psRes] = await Promise.all([
          db.from('plan_designs').select('*, plan_tracks(title, subject, textbook)').eq('id', designId).single(),
          db.from('plan_students').select('student_id, student_type').eq('design_id', designId),
        ]);
        const d = dRes.data; setDesign(d);
        const sidList = ((psRes.data || []) as any[]).map((r: any) => r.student_id);
        const [gRes, stuRes, pgRes, qRes] = await Promise.all([
          db.from('plan_goals').select('*').eq('track_id', d.track_id).order('order_index'),
          sidList.length ? supabase.from('students').select('id, name, grade').in('id', sidList) : Promise.resolve({ data: [] }),
          db.from('plan_goal_progress').select('goal_id, status').eq('design_id', designId),
          db.from('plan_queue').select('student_id, title').eq('design_id', designId).eq('status', 'open'),
        ]);
        setGoals(gRes.data || []);
        const typeMap = new Map(((psRes.data || []) as any[]).map((r: any) => [r.student_id, r.student_type]));
        setStudents(((stuRes.data || []) as any[])
          .map((s: any) => ({ id: s.id, name: s.name, grade: s.grade, type: typeMap.get(s.id) || null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')));
        setAdvancedGoalIds(new Set(((pgRes.data || []) as any[])
          .filter(r => ['advanced', 'partial', 'verified_ok', 'verified_weak'].includes(r.status)).map(r => r.goal_id)));
        const qMap: Record<string, string[]> = {};
        ((qRes.data || []) as any[]).forEach(r => { (qMap[r.student_id] ||= []).push(r.title); });
        setQueueByStudent(qMap);
      } catch (e: any) {
        toast.error(`불러오기 실패: ${e.message || e}`);
      } finally { setLoading(false); }
    })();
  }, [designId]);

  // 달력 셀 만들기: 이 달 전체를 주 단위 그리드로. 시작일 이후 수업일에 목표를 순서대로 배분.
  const cells = useMemo<Cell[]>(() => {
    if (!design) return [];
    const rhythm = design.rhythm || {};
    const y = periodDate.getFullYear(), m = periodDate.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(y, m, 1);
    const remaining = goals.filter(g => !advancedGoalIds.has(g.id));
    let ptr = 0;
    const out: Cell[] = [];
    for (let i = 0; i < firstDow; i++) out.push({ day: null, dow: i, inRange: false, lesson: false, isToday: false });
    for (let dd = 1; dd <= lastDay; dd++) {
      const date = new Date(y, m, dd);
      const dow = date.getDay();
      const lesson = rhythm[String(dow)] != null;
      const role = rhythm[String(dow)] as SessionRole | undefined;
      const inRange = date >= new Date(start.getFullYear(), start.getMonth(), start.getDate());
      let goal: string | undefined;
      if (lesson && inRange && role !== 'test_day' && ptr < remaining.length) {
        const g = remaining[ptr++];
        goal = `${g.title}${g.pages ? ` ${g.pages}` : ''}`;
      } else if (lesson && inRange && role === 'test_day') {
        goal = '복습·다시보기';
      }
      out.push({
        day: dd, dow, inRange, lesson, role, goal,
        isToday: `${y}-${m}-${dd}` === todayKey,
      });
    }
    return out;
  }, [design, goals, advancedGoalIds, periodDate, startDate, todayKey]);

  const lessonCount = cells.filter(c => c.lesson && c.inRange).length;

  function handlePrint() {
    window.print();
    setTimeout(() => setConfirmOpen(true), 400);
  }
  async function confirmPrinted() {
    if (!user || !designId) return;
    try {
      await markPlannerPrinted(designId, periodMonth, design?.updated_at || null, user.id);
      const stamp = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      setPrintRecord({ by: fullName || '선생님', at: stamp });
      setConfirmOpen(false);
      toast.success('출력 완료로 기록됐어요 — 재출력 알람 해제');
    } catch (e: any) { toast.error(`기록 실패: ${e.message || e}`); }
  }

  if (loading || !design) {
    return <div className="max-w-5xl mx-auto space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-[28rem] w-full" /></div>;
  }

  const monthNo = periodDate.getMonth() + 1;

  return (
    <div className="max-w-5xl mx-auto">
      {/* 화면 툴바 (인쇄 시 숨김) */}
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate('/plan')}>
          <Undo2 className="w-4 h-4 mr-1" />목록
        </Button>
        <h1 className="text-lg font-bold flex items-center gap-1.5">
          <Sprout className="w-5 h-5 text-emerald-600" />{design.title} — 학생 플래너
        </h1>
        <div className="flex items-center gap-1.5 ml-2 text-sm">
          <span className="text-muted-foreground">커리큘럼 시작일</span>
          <Input type="date" value={startDate} onChange={e => updateStart(e.target.value)} className="h-8 w-40" />
        </div>
        <Select value={String(monthOffset)} onValueChange={v => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">이번 달</SelectItem>
            <SelectItem value="1">다음 달</SelectItem>
            <SelectItem value="-1">지난 달</SelectItem>
          </SelectContent>
        </Select>
        {printRecord && (
          <span className="text-xs text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />{printRecord.by} · {printRecord.at} 출력확인
          </span>
        )}
        <Button className="ml-auto" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-1" />{students.length}명 인쇄
        </Button>
      </div>

      {/* 학생별 한 장 = 정원 달력 */}
      {students.map((s, si) => (
        <div key={s.id} className="planner-sheet">
          {/* 머리글 밴드 */}
          <div className="pl-head">
            <div className="pl-head-left">
              <p className="pl-eyebrow">🌱 {monthNo}월 학습 정원</p>
              <h2 className="pl-name">{s.name}<span className="pl-name-tail">의 한 달</span></h2>
              <p className="pl-sub">
                {design.plan_tracks?.subject} · {design.plan_tracks?.title}
                {s.type && ` · ${TYPE_LABEL[s.type]}반`}
              </p>
            </div>
            <div className="pl-head-right">
              <p className="pl-goal-label">이달의 목표</p>
              <p className="pl-goal-text">{design.target_date ? `${design.target_date}까지` : '한 걸음씩'} 꾸준히 🌳</p>
              <div className="pl-sprouts">
                {Array.from({ length: Math.min(lessonCount, 12) }).map((_, i) => <span key={i}>🌱</span>)}
              </div>
            </div>
          </div>

          {/* 달력 */}
          <div className="pl-cal">
            {WEEK.map((w, i) => (
              <div key={w} className={`pl-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>
            ))}
            {cells.map((c, i) => (
              <div key={i} className={`pl-cell ${!c.day ? 'empty' : ''} ${c.lesson && c.inRange ? 'lesson' : ''} ${c.day && !c.inRange ? 'before' : ''} ${c.isToday ? 'today' : ''}`}>
                {c.day && (
                  <>
                    <div className="pl-cell-top">
                      <span className={`pl-date ${c.dow === 0 ? 'sun' : c.dow === 6 ? 'sat' : ''}`}>{c.day}</span>
                      {c.lesson && c.inRange && <span className="pl-stamp" title="완료하면 색칠·스티커" />}
                    </div>
                    {c.lesson && c.inRange && (
                      <div className="pl-cell-body">
                        <p className="pl-todo">{c.goal || '복습'}</p>
                        <p className="pl-check">✓ 숙제 · 체크</p>
                      </div>
                    )}
                    {c.day && !c.inRange && <span className="pl-wait">시작 전</span>}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* 아래: 응원 + 이번 달 나의 할 일 */}
          <div className="pl-foot">
            <div className="pl-foot-note">
              <b>💌 선생님 한마디</b>
              <span className="pl-foot-line" />
            </div>
            <div className="pl-foot-mine">
              <b>🎯 이번 주 내 다짐</b>
              <span className="pl-foot-line" />
            </div>
          </div>
          {si === students.length - 1 && (
            <p className="pl-tip print:hidden">색칠할 수 있는 동그라미(●)는 그날 할 일을 다 하면 스티커를 붙이거나 색칠하는 칸이에요.</p>
          )}
        </div>
      ))}

      {students.length === 0 && (
        <div className="text-center text-muted-foreground py-16"><Sprout className="w-6 h-6 mx-auto mb-2" />이 반에 학생이 없습니다.</div>
      )}

      {/* 인쇄 완료 확인 — 취소 시 기록 안 함 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>인쇄가 완료됐나요?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            실제로 출력하셨을 때만 눌러주세요. 누가·언제 출력했는지 기록으로 남고, 이 반의 재출력 알람이 해제됩니다.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>아직요 / 취소</Button>
            <Button className="flex-1" onClick={confirmPrinted}>
              <Check className="w-4 h-4 mr-1" />네, 출력 완료로 기록
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .planner-sheet {
          background: #FBF7EF; color: #3A3230;
          border: 1px solid #E7DFCE; border-radius: 20px;
          padding: 22px 24px; margin-bottom: 22px;
        }
        .pl-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
          border-bottom: 3px dotted #CBB994; padding-bottom: 12px; margin-bottom: 14px; }
        .pl-eyebrow { font-size: 12px; font-weight: 800; color: #6BAF73; letter-spacing: .04em; }
        .pl-name { font-size: 30px; font-weight: 900; letter-spacing: -.02em; line-height: 1; margin-top: 2px; }
        .pl-name-tail { font-size: 18px; font-weight: 700; color: #8B7B63; margin-left: 4px; }
        .pl-sub { font-size: 12px; color: #8B7B63; margin-top: 4px; }
        .pl-head-right { text-align: right; }
        .pl-goal-label { font-size: 11px; font-weight: 800; color: #C98A5A; }
        .pl-goal-text { font-size: 14px; font-weight: 800; }
        .pl-sprouts { font-size: 13px; letter-spacing: 1px; margin-top: 3px; }

        .pl-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .pl-dow { text-align: center; font-size: 12px; font-weight: 800; color: #8B7B63; padding: 2px 0; }
        .pl-dow.sun { color: #D98668; } .pl-dow.sat { color: #6FA8C7; }
        .pl-cell { min-height: 78px; border-radius: 14px; padding: 6px 8px; background: #FFFDF8;
          border: 1.5px solid #EDE4D2; display: flex; flex-direction: column; }
        .pl-cell.empty { background: transparent; border: 0; }
        .pl-cell.before { background: #F4EFE4; opacity: .6; }
        .pl-cell.lesson { background: #EAF5EA; border-color: #B9DDBB; }
        .pl-cell.today { outline: 2.5px solid #6BAF73; outline-offset: 1px; }
        .pl-cell-top { display: flex; justify-content: space-between; align-items: center; }
        .pl-date { font-size: 13px; font-weight: 800; color: #6B5D48; }
        .pl-date.sun { color: #D98668; } .pl-date.sat { color: #6FA8C7; }
        .pl-stamp { width: 16px; height: 16px; border-radius: 50%; border: 2px dashed #8FBF93; display: inline-block; }
        .pl-cell-body { margin-top: 3px; flex: 1; }
        .pl-todo { font-size: 11px; font-weight: 700; line-height: 1.25; color: #3A3230;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .pl-check { font-size: 9px; color: #7FA982; margin-top: 3px; font-weight: 700; }
        .pl-wait { font-size: 10px; color: #B4A88E; margin-top: 4px; }

        .pl-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
        .pl-foot-note, .pl-foot-mine { background: #FFFDF8; border: 1.5px solid #EDE4D2; border-radius: 14px;
          padding: 10px 12px; font-size: 12px; }
        .pl-foot-note b, .pl-foot-mine b { display: block; margin-bottom: 8px; }
        .pl-foot-line { display: block; border-bottom: 1.5px dotted #CBB994; height: 20px; }
        .pl-tip { font-size: 11px; color: #8B7B63; margin-top: 8px; }

        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: white; }
          .planner-sheet { page-break-after: always; border: 0; border-radius: 0;
            background: #FBF7EF; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
          .pl-cell, .pl-cell.lesson, .pl-cell.before, .pl-foot-note, .pl-foot-mine {
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
