import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { dueDate } from '@/lib/tuitionLedger';
import { getTodayKST } from '@/lib/utils';
import { firstLessonPaymentDay } from './paymentDay';

interface Change { id: string; old_day: number | null; new_day: number; reason: string; created_at: string }

export function StudentPaymentDaySection({ studentId, currentDay, onSaved }: { studentId: string; currentDay: number | null | undefined; onSaved?: (day: number) => void }) {
  const [day, setDay] = useState<number | null>(currentDay ?? null);
  const [firstDate, setFirstDate] = useState<string | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [editing, setEditing] = useState(false);
  const [newDay, setNewDay] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const [lesson, course, changes] = await Promise.all([
      supabase.from('lesson_records').select('lesson_date').eq('student_id', studentId).order('lesson_date').limit(1),
      supabase.from('student_courses').select('enrollment_date').eq('student_id', studentId).order('enrollment_date').limit(1),
      supabase.from('student_payment_day_changes').select('id,old_day,new_day,reason,created_at').eq('student_id', studentId).order('created_at', { ascending: false }),
    ]);
    setFirstDate(lesson.data?.[0]?.lesson_date || course.data?.[0]?.enrollment_date || null);
    setHistory((changes.data as Change[]) || []);
  }
  useEffect(() => { setDay(currentDay ?? null); setEditing(false); load(); }, [studentId, currentDay]);

  const suggested = firstLessonPaymentDay(firstDate);
  const initialized = history.length > 0;

  async function save(target: number, why: string) {
    if (!(target >= 1 && target <= 31)) { toast({ title: '1~31일 사이로 입력해 주세요', variant: 'destructive' }); return; }
    if (!why.trim()) { toast({ title: '변경 사유를 적어 주세요', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('students').update({ payment_due_day: target }).eq('id', studentId);
      if (error) throw error;
      const { error: logErr } = await supabase.from('student_payment_day_changes').insert({ student_id: studentId, old_day: day, new_day: target, reason: why.trim(), changed_by: auth.user?.id });
      if (logErr) throw logErr;
      // 아직 납부 전(대기)인 이번 달 이후 청구의 납부기한도 함께 맞춤
      const thisMonth = getTodayKST().slice(0, 7);
      const { data: pending } = await supabase.from('billing_schedules').select('id,billing_month').eq('student_id', studentId).eq('status', 'pending').gte('billing_month', thisMonth);
      for (const b of pending || []) {
        await supabase.from('billing_schedules').update({ due_date: dueDate(b.billing_month, target) }).eq('id', b.id).eq('status', 'pending');
      }
      setDay(target); setEditing(false); setReason(''); setNewDay('');
      onSaved?.(target);
      toast({ title: `원비 결제일을 매월 ${target}일로 저장했어요`, description: pending?.length ? `대기 중인 청구 ${pending.length}건의 납부기한도 맞췄어요` : undefined });
      load();
    } catch (e: any) {
      toast({ title: '저장하지 못했어요', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] text-muted-foreground">수업료 결제일</p>
          <p className="text-lg font-semibold">{day ? `매월 ${day}일` : '미설정'}</p>
          <p className="text-[11px] text-muted-foreground">
            첫 수업일: {firstDate || '기록 없음'}{suggested ? ` → 기준 ${suggested}일` : ''}
          </p>
        </div>
        {!editing && <Button size="sm" variant="outline" onClick={() => { setEditing(true); setNewDay(String(day ?? suggested ?? '')); }}>결제일 변경</Button>}
      </div>

      {!initialized && suggested && !editing && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 flex items-center justify-between gap-2">
          <span className="text-xs">첫 수업일 기준으로 아직 설정하지 않았어요.</span>
          <Button size="sm" disabled={saving} onClick={() => save(suggested, `첫 수업일(${firstDate}) 기준 초기 설정`)}>{suggested}일로 설정</Button>
        </div>
      )}

      {editing && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Label className="shrink-0">새 결제일 매월</Label>
            <Input type="number" min={1} max={31} value={newDay} onChange={e => setNewDay(e.target.value)} className="w-20 h-8" />
            <span>일</span>
          </div>
          <div>
            <Label className="text-xs">변경 사유 (필수)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 학부모 요청으로 월급날에 맞춰 25일로 변경" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>취소</Button>
            <Button size="sm" disabled={saving || !reason.trim() || !newDay} onClick={() => save(parseInt(newDay), reason)}>변경 저장</Button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1">변경 이력</p>
          <ul className="space-y-1">
            {history.map(h => (
              <li key={h.id} className="rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                <span className="font-medium">{h.old_day ? `${h.old_day}일 → ` : ''}{h.new_day}일</span>
                <span className="text-muted-foreground ml-2">{format(new Date(h.created_at), 'yyyy-MM-dd')}</span>
                <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{h.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
