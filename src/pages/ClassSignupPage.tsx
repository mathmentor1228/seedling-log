// CLASS-SIGNUP-V1: 공개 선착순 수강신청 페이지 (/class-signup?token=...)
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CalendarClock, CheckCircle2, Loader2, Users } from 'lucide-react';

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string | null;
  capacity: number;
  note: string | null;
  taken: number;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DAYS[dt.getDay()]})`;
}
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');

export default function ClassSignupPage() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<{ title: string; description: string | null; is_open: boolean } | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [phone, setPhone] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Slot | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('class-signup', { body: { action: 'get', token } });
    if (error || !data || data.error) setNotFound(true);
    else { setEvent(data.event); setSlots(data.slots || []); }
    setLoading(false);
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('class-signup', {
      body: { action: 'apply', token, slot_id: selected, student_name: name.trim(), grade: grade.trim(), phone: phone.trim(), memo: memo.trim() },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error(data?.error || '신청에 실패했습니다. 다시 시도해주세요.');
      if (data?.slots) setSlots(data.slots);
      else load();
      return;
    }
    setSlots(data.slots || []);
    setDone(slots.find(s => s.id === selected) || null);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md"><CardContent className="py-10 text-center text-muted-foreground">
          신청 링크가 올바르지 않거나 종료되었습니다.
        </CardContent></Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md"><CardContent className="py-10 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
          <h2 className="text-xl font-bold">신청이 완료됐습니다</h2>
          <p className="text-sm text-muted-foreground">
            {name} 학생 · {formatDate(done.slot_date)} {hhmm(done.start_time)}
            {done.end_time ? `–${hhmm(done.end_time)}` : ''}
          </p>
        </CardContent></Card>
      </div>
    );
  }

  const canSubmit = !!selected && name.trim().length >= 2 && phone.replace(/[^0-9]/g, '').length >= 10 && !submitting;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">{event?.title}</h1>
          {event?.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.description}</p>}
          {!event?.is_open && <Badge variant="destructive">신청 마감</Badge>}
        </header>

        <section className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium"><CalendarClock className="w-4 h-4" /> 시간대 선택</Label>
          {slots.length === 0 && <p className="text-sm text-muted-foreground">아직 열린 시간대가 없습니다.</p>}
          {slots.map(slot => {
            const full = slot.taken >= slot.capacity;
            const active = selected === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                disabled={full || !event?.is_open}
                onClick={() => setSelected(slot.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  full ? 'opacity-50 border-border' : active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">
                    {formatDate(slot.slot_date)} {hhmm(slot.start_time)}{slot.end_time ? `–${hhmm(slot.end_time)}` : ''}
                  </span>
                  <Badge variant={full ? 'destructive' : 'secondary'} className="text-xs shrink-0">
                    <Users className="w-3 h-3 mr-1" />
                    {full ? '마감' : `${slot.taken}/${slot.capacity}명`}
                  </Badge>
                </div>
                {slot.note && <p className="text-xs text-muted-foreground mt-1">{slot.note}</p>}
              </button>
            );
          })}
        </section>

        {event?.is_open && (
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="name">학생 이름</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="grade">학년</Label>
                <Input id="grade" value={grade} onChange={e => setGrade(e.target.value)} placeholder="고1" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">연락처</Label>
              <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="01012345678" inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="memo">전달사항 (선택)</Label>
              <Textarea id="memo" value={memo} onChange={e => setMemo(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" disabled={!canSubmit} onClick={submit}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              신청하기
            </Button>
            <p className="text-xs text-muted-foreground text-center">신청자 명단은 공개되지 않습니다. 남은 자리 수만 표시됩니다.</p>
          </section>
        )}
      </div>
    </div>
  );
}
