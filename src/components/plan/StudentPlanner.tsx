// PLANNER-PRINT-V1: 학생 월간 플래너 (인쇄용) — 학생별 한 장
// 날짜별 오늘 할 것 / 숙제 / 체킹받을 곳 / 확인(T)란. 계획·페이스·큐에서 자동 조립.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Printer, Undo2, Check } from 'lucide-react';
import { PlanGoal, DAY_LABELS, ROLE_LABELS, SessionRole, markPlannerPrinted } from './planApi';

const db = supabase as any;
const TYPE_COLORS: Record<string, string> = { A: '#6D28D9', B: '#0369A1', C: '#B45309' };

type Stu = { id: string; name: string; grade: string | null; type: 'A' | 'B' | 'C' | null };
type PlannerDay = { date: string; dow: number; role: SessionRole; goals: string[]; isIntensive: boolean };

export function StudentPlanner() {
  const { designId } = useParams<{ designId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [design, setDesign] = useState<any>(null);
  const [goals, setGoals] = useState<PlanGoal[]>([]);
  const [students, setStudents] = useState<Stu[]>([]);
  const [advancedGoalIds, setAdvancedGoalIds] = useState<Set<string>>(new Set());
  const [queueByStudent, setQueueByStudent] = useState<Record<string, { title: string; date?: string }[]>>({});
  const [homeworkByStudent, setHomeworkByStudent] = useState<Record<string, string[]>>({});

  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const periodDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const periodMonth = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;

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
        const [gRes, stuRes, pgRes, qRes] = await Promise.all([
          db.from('plan_goals').select('*').eq('track_id', d.track_id).order('order_index'),
          supabase.from('students').select('id, name, grade')
            .in('id', ((psRes.data || []) as any[]).map((r: any) => r.student_id)),
          db.from('plan_goal_progress').select('goal_id, status').eq('design_id', designId),
          db.from('plan_queue').select('student_id, title, kind, status').eq('design_id', designId).eq('status', 'open'),
        ]);
        setGoals(gRes.data || []);
        const typeMap = new Map(((psRes.data || []) as any[]).map((r: any) => [r.student_id, r.student_type]));
        setStudents(((stuRes.data || []) as any[])
          .map((s: any) => ({ id: s.id, name: s.name, grade: s.grade, type: typeMap.get(s.id) || null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')));
        setAdvancedGoalIds(new Set(((pgRes.data || []) as any[])
          .filter(r => ['advanced', 'partial', 'verified_ok', 'verified_weak'].includes(r.status))
          .map(r => r.goal_id)));
        const qMap: Record<string, { title: string }[]> = {};
        ((qRes.data || []) as any[]).forEach(r => { (qMap[r.student_id] ||= []).push({ title: r.title }); });
        setQueueByStudent(qMap);
        // 최근 배정 숙제 (homework_assignments) — 있으면 학생별 최근 것
        const sids = ((psRes.data || []) as any[]).map((r: any) => r.student_id);
        if (sids.length) {
          const { data: hw } = await supabase.from('homework_assignments')
            .select('student_id, content, assigned_date')
            .in('student_id', sids).order('assigned_date', { ascending: false }).limit(60);
          const hwMap: Record<string, string[]> = {};
          ((hw || []) as any[]).forEach((r: any) => {
            if ((hwMap[r.student_id] ||= []).length < 3 && r.content) hwMap[r.student_id].push(r.content);
          });
          setHomeworkByStudent(hwMap);
        }
      } catch (e: any) {
        toast.error(`불러오기 실패: ${e.message || e}`);
      } finally { setLoading(false); }
    })();
  }, [designId]);

  // 이 달의 수업일(리듬 요일) — 각 날짜에 '앞으로 나갈 목표'를 순서대로 배분
  const days = useMemo<PlannerDay[]>(() => {
    if (!design) return [];
    const rhythm = design.rhythm || {};
    const y = periodDate.getFullYear(), m = periodDate.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    // 앞으로 나갈 목표 풀 (아직 안 나간 것)
    const remaining = goals.filter(g => !advancedGoalIds.has(g.id));
    let ptr = 0;
    const perDay = 1; // 플래너는 하루 1목표 기준으로 표기(대략치)
    const out: PlannerDay[] = [];
    for (let dd = 1; dd <= lastDay; dd++) {
      const date = new Date(y, m, dd);
      const dow = date.getDay();
      const role = rhythm[String(dow)] as SessionRole | undefined;
      if (!role) continue;
      const dayGoals: string[] = [];
      if (role !== 'test_day') {
        for (let k = 0; k < perDay && ptr < remaining.length; k++) {
          const g = remaining[ptr++];
          dayGoals.push(`${g.title}${g.pages ? ` (${g.pages})` : ''}`);
        }
      }
      out.push({
        date: `${String(m + 1).padStart(2, '0')}/${String(dd).padStart(2, '0')}`,
        dow, role, goals: dayGoals, isIntensive: false,
      });
    }
    return out;
  }, [design, goals, advancedGoalIds, periodDate]);

  async function handlePrint() {
    window.print();
    if (user && designId) {
      try {
        await markPlannerPrinted(designId, periodMonth, design?.updated_at || null, user.id);
        toast.success('플래너 출력 기록됨 — 재출력 알람이 해제됩니다');
      } catch { /* 무시 */ }
    }
  }

  if (loading || !design) {
    return <div className="max-w-4xl mx-auto space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* 화면 전용 툴바 (인쇄 시 숨김) */}
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate('/plan')}>
          <Undo2 className="w-4 h-4 mr-1" />목록
        </Button>
        <h1 className="text-lg font-bold">{design.title} — 학생 플래너</h1>
        <Select value={String(monthOffset)} onValueChange={v => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-32 h-8 ml-2"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">이번 달</SelectItem>
            <SelectItem value="1">다음 달</SelectItem>
            <SelectItem value="-1">지난 달</SelectItem>
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-1" />{students.length}명 인쇄
        </Button>
      </div>

      {/* 학생별 한 장 (인쇄 시 페이지 분리) */}
      {students.map(s => (
        <div key={s.id} className="planner-sheet bg-white border rounded-xl p-6 mb-6 print:border-0 print:mb-0 print:rounded-none">
          <div className="flex items-start justify-between border-b-2 border-foreground pb-2 mb-3">
            <div>
              <p className="text-lg font-extrabold">
                {periodMonth.slice(5)}월 학습 플래너 — {s.name}
                {s.type && <span className="ml-2 text-xs font-bold" style={{ color: TYPE_COLORS[s.type] }}>{s.type}형</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {design.plan_tracks?.subject} · {design.plan_tracks?.title}
                {design.target_date && ` · 목표 ${design.target_date}까지`}
              </p>
            </div>
            <div className="w-12 h-12 border border-foreground rounded flex items-center justify-center text-[8px] text-center text-muted-foreground">QR<br/>학생</div>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="border p-1.5 w-16">날짜</th>
                <th className="border p-1.5 text-left">오늘 할 것</th>
                <th className="border p-1.5 text-left w-40">숙제</th>
                <th className="border p-1.5 w-28">체킹받을 곳</th>
                <th className="border p-1.5 w-12">확인(T)</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const hw = homeworkByStudent[s.id] || [];
                const q = queueByStudent[s.id] || [];
                const checkNote = d.role === 'test_day' ? '테스트·재시험'
                  : (design.check_methods || []).includes('quiz') ? '쪽지시험' : '과제 검사';
                return (
                  <tr key={i}>
                    <td className="border p-1.5 text-center font-bold whitespace-nowrap">
                      {d.date}<span className="text-muted-foreground">({DAY_LABELS[d.dow]})</span>
                    </td>
                    <td className="border p-1.5">
                      {d.role === 'test_day'
                        ? <span className="font-semibold">복습·재시험 (밀린 것 정리)</span>
                        : d.goals.length ? d.goals.join(' · ')
                        : <span className="text-muted-foreground">진도 완료 — 복습</span>}
                      {i === 0 && q.length > 0 && (
                        <span className="block text-[10px] text-red-600 mt-0.5">⚠ {q.map(x => x.title).join(' / ')}</span>
                      )}
                    </td>
                    <td className="border p-1.5">{i === 0 && hw.length ? hw[0] : ''}</td>
                    <td className="border p-1.5 text-center">{checkNote}</td>
                    <td className="border p-1.5"></td>
                  </tr>
                );
              })}
              {days.length === 0 && (
                <tr><td colSpan={5} className="border p-4 text-center text-muted-foreground">이 달에 수업 요일이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-2 print:hidden">
            칸 출처: 오늘 할 것=계획·페이스 / 숙제=최근 배정분 / 체킹=확인 규칙. 계획이 바뀌면 다시 인쇄하세요.
          </p>
        </div>
      ))}

      {students.length === 0 && (
        <div className="text-center text-muted-foreground py-16">
          <Check className="w-6 h-6 mx-auto mb-2" />이 반에 학생이 없습니다.
        </div>
      )}

      <style>{`
        @media print {
          .planner-sheet { page-break-after: always; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
