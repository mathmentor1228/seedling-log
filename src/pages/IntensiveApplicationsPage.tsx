// INTENSIVE-APPLY-V2: 여름방학 특강 신청 현황 + 학생 연결 + 수업료 합산
import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ClipboardList, RefreshCw, Copy, MessageSquareText, Trash2, Link2, CheckCircle2, Receipt } from 'lucide-react';
import { format } from 'date-fns';

const db = supabase as any;

type Application = {
  id: string; child_name: string; grade: string;
  expectations: string[]; wishes: string | null; created_at: string;
  student_id: string | null; fee: number;
  billed_month: string | null; billed_at: string | null;
};

type Student = { id: string; name: string; school: string | null; grade: string | null };

function IntensiveApplications() {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<Application[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const now = new Date();
  const [billingMonth, setBillingMonth] = useState(format(now, 'yyyy-MM'));

  const months = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i - 1, 1);
    return format(d, 'yyyy-MM');
  }), []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: appsData, error: e1 }, { data: sData, error: e2 }] = await Promise.all([
        db.from('intensive_applications').select('*').order('created_at', { ascending: false }),
        db.from('students').select('id, name, school, grade').order('name'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setApps((appsData || []) as Application[]);
      setStudents((sData || []) as Student[]);
    } catch (e: any) {
      toast.error(`불러오기 실패: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function getLink() { return `${window.location.origin}/summer-intensive`; }
  function copyLink() { navigator.clipboard.writeText(getLink()); toast.success('신청서 링크를 복사했어요'); }
  function copyMessage() {
    const msg = `[더멘토학원] 2026 여름특강 안내
현 고1·고2 대상 원장님 직강 여름특강입니다. 2학기 진도를 방학 중에 미리 끝내고 갑니다.

• 대상: 고1·고2
• 횟수: 총 8회 (회당 120분)
• 특강료: 25만원 (8월 수강료에 합산 결제, 별도 결제 없음)
• 일정: 학생별 개별 안내 예정

자세한 안내 확인과 신청서 제출은 아래 링크에서 해주세요.
${getLink()}

- 더멘토학원 -`;
    navigator.clipboard.writeText(msg);
    toast.success('학부모 문자 양식을 복사했어요');
  }

  async function remove(a: Application) {
    if (!window.confirm(`${a.child_name} 학생 신청을 삭제할까요?`)) return;
    try {
      const { error } = await db.from('intensive_applications').delete().eq('id', a.id);
      if (error) throw error;
      setApps(prev => prev.filter(x => x.id !== a.id));
      toast.success('삭제했어요');
    } catch (e: any) { toast.error(`삭제 실패: ${e.message || e}`); }
  }

  // 학생 자동 매칭 (동명이인은 미매칭 처리 — 관리자가 직접 선택)
  const suggestStudentId = (name: string): string | null => {
    const matches = students.filter(s => s.name === name);
    return matches.length === 1 ? matches[0].id : null;
  };

  async function linkStudent(app: Application, studentId: string | null) {
    try {
      const { error } = await db.from('intensive_applications')
        .update({ student_id: studentId }).eq('id', app.id);
      if (error) throw error;
      setApps(prev => prev.map(x => x.id === app.id ? { ...x, student_id: studentId } : x));
    } catch (e: any) { toast.error(`연결 실패: ${e.message || e}`); }
  }

  async function updateFee(app: Application, fee: number) {
    try {
      const { error } = await db.from('intensive_applications')
        .update({ fee }).eq('id', app.id);
      if (error) throw error;
      setApps(prev => prev.map(x => x.id === app.id ? { ...x, fee } : x));
    } catch (e: any) { toast.error(`저장 실패: ${e.message || e}`); }
  }

  // 개별 학생 청구에 특강료 반영
  async function applyToBilling(app: Application) {
    if (!app.student_id) { toast.error('먼저 학생을 연결해주세요'); return; }
    try {
      // 해당 학생의 해당월 billing_schedules 존재 여부 확인
      const { data: rows, error: fetchErr } = await db
        .from('billing_schedules')
        .select('id, base_amount, discount_amount, extra_amount, extra_memo')
        .eq('student_id', app.student_id)
        .eq('billing_month', billingMonth);
      if (fetchErr) throw fetchErr;

      if (!rows || rows.length === 0) {
        toast.error(`${billingMonth} 청구가 아직 없습니다. 수강료 관리 → 청구설정에서 자동 청구 생성을 먼저 해주세요.`);
        return;
      }

      // 첫 번째 청구건에 특강료 합산 (대개 학생당 1건)
      const target = rows[0];
      const newExtra = Number(target.extra_amount || 0) + Number(app.fee || 0);
      const memo = target.extra_memo
        ? `${target.extra_memo} + 여름특강료 ${Number(app.fee).toLocaleString()}원`
        : `여름특강료 ${Number(app.fee).toLocaleString()}원`;
      const newFinal = Number(target.base_amount) - Number(target.discount_amount || 0) + newExtra;

      const { error: upErr } = await db.from('billing_schedules').update({
        extra_amount: newExtra,
        extra_memo: memo,
        final_amount: newFinal,
      }).eq('id', target.id);
      if (upErr) throw upErr;

      const { error: markErr } = await db.from('intensive_applications').update({
        billed_month: billingMonth,
        billed_at: new Date().toISOString(),
      }).eq('id', app.id);
      if (markErr) throw markErr;

      setApps(prev => prev.map(x => x.id === app.id
        ? { ...x, billed_month: billingMonth, billed_at: new Date().toISOString() } : x));
      toast.success(`${app.child_name} — ${billingMonth} 수강료에 ${Number(app.fee).toLocaleString()}원 합산 완료`);
    } catch (e: any) { toast.error(`합산 실패: ${e.message || e}`); }
  }

  async function unapply(app: Application) {
    if (!app.student_id || !app.billed_month) return;
    if (!window.confirm(`${app.child_name} — ${app.billed_month} 특강료 합산을 취소할까요?`)) return;
    try {
      const { data: rows } = await db.from('billing_schedules')
        .select('id, base_amount, discount_amount, extra_amount')
        .eq('student_id', app.student_id).eq('billing_month', app.billed_month);
      const target = rows?.[0];
      if (target) {
        const newExtra = Math.max(0, Number(target.extra_amount || 0) - Number(app.fee || 0));
        const newFinal = Number(target.base_amount) - Number(target.discount_amount || 0) + newExtra;
        await db.from('billing_schedules').update({
          extra_amount: newExtra,
          extra_memo: newExtra > 0 ? null : null,
          final_amount: newFinal,
        }).eq('id', target.id);
      }
      await db.from('intensive_applications').update({
        billed_month: null, billed_at: null,
      }).eq('id', app.id);
      setApps(prev => prev.map(x => x.id === app.id ? { ...x, billed_month: null, billed_at: null } : x));
      toast.success('합산 취소 완료');
    } catch (e: any) { toast.error(`취소 실패: ${e.message || e}`); }
  }

  async function bulkApply() {
    const targets = apps.filter(a => a.student_id && !a.billed_month);
    if (targets.length === 0) { toast.info('합산 대상이 없습니다 (학생 미연결 또는 이미 합산됨)'); return; }
    if (!window.confirm(`${targets.length}건을 ${billingMonth} 수강료에 합산할까요?`)) return;
    for (const a of targets) await applyToBilling(a);
  }

  const totalFee = apps.filter(a => a.billed_month).reduce((s, a) => s + Number(a.fee || 0), 0);
  const linkedCount = apps.filter(a => a.student_id).length;
  const billedCount = apps.filter(a => a.billed_month).length;

  if (loading) {
    return <div className="space-y-3 p-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-56 w-full" /></div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />여름방학 특강 신청 현황
        </h1>
        <Badge className="text-[11px]">{apps.length}건</Badge>
        <Badge variant="outline" className="text-[11px]">학생연결 {linkedCount}/{apps.length}</Badge>
        <Badge variant="outline" className="text-[11px]">수강료합산 {billedCount}건</Badge>
        {totalFee > 0 && <Badge variant="secondary" className="text-[11px]">합산 총액 {totalFee.toLocaleString()}원</Badge>}
        <div className="ml-auto flex flex-wrap gap-2 items-center">
          <Select value={billingMonth} onValueChange={setBillingMonth}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{m.replace('-','년 ')}월</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" onClick={bulkApply} className="gap-1.5"><Receipt className="w-3.5 h-3.5" />전체 수강료 합산</Button>
          <Button size="sm" onClick={copyMessage}><MessageSquareText className="w-3.5 h-3.5 mr-1" />문자양식</Button>
          <Button variant="outline" size="sm" onClick={copyLink}><Copy className="w-3.5 h-3.5 mr-1" />링크복사</Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
        학생 연결 → 특강료 확인 → <b>{billingMonth}</b> 수강료 합산 순서로 진행하세요. 합산은 해당월 청구가 이미 생성되어 있어야 반영됩니다.
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg px-4 py-8 text-center">
          아직 접수된 신청이 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {apps.map(a => {
            const suggested = a.student_id || suggestStudentId(a.child_name);
            const linked = !!a.student_id;
            const billed = !!a.billed_month;
            return (
              <Card key={a.id} className={billed ? 'border-emerald-500/60' : ''}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{a.child_name}</span>
                    <Badge variant="secondary" className="text-[11px]">{a.grade}</Badge>
                    {billed && (
                      <Badge className="text-[11px] bg-emerald-600 gap-1"><CheckCircle2 className="w-3 h-3" />{a.billed_month} 합산완료</Badge>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(a.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button className="text-muted-foreground hover:text-destructive transition" title="삭제" onClick={() => remove(a)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div className="flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <Select value={a.student_id || suggested || 'none'}
                        onValueChange={(v) => linkStudent(a, v === 'none' ? null : v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="학생 연결" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— 미연결 —</SelectItem>
                          {students.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}{s.school ? ` (${s.school})` : ''}{s.grade ? ` ${s.grade}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground shrink-0">특강료</span>
                      <Input type="number" defaultValue={a.fee} onBlur={e => {
                        const v = Number(e.target.value) || 0;
                        if (v !== a.fee) updateFee(a, v);
                      }} className="h-8 text-xs" />
                      <span className="text-[11px] text-muted-foreground">원</span>
                    </div>
                  </div>

                  {a.expectations.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {a.expectations.map(e => (
                        <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                      ))}
                    </div>
                  )}
                  {a.wishes && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">"{a.wishes}"</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    {billed ? (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => unapply(a)}>
                        {a.billed_month} 합산 취소
                      </Button>
                    ) : (
                      <Button size="sm" className="w-full gap-1.5" disabled={!linked} onClick={() => applyToBilling(a)}>
                        <Receipt className="w-3.5 h-3.5" />{billingMonth} 수강료에 합산
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function IntensiveApplicationsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
        <IntensiveApplications />
    </ProtectedRoute>
  );
}
