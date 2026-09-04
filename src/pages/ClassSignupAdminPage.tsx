// CLASS-SIGNUP-V1: 선착순 수강신청 개설·관리 (관리자/강사)
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { CalendarPlus, Copy, Loader2, Plus, Trash2, Users } from 'lucide-react';

const db = supabase as any;

interface Entry { id: string; student_name: string; grade: string | null; phone: string | null; memo: string | null; created_at: string; }
interface Slot { id: string; event_id: string; slot_date: string; start_time: string; end_time: string | null; capacity: number; note: string | null; entries: Entry[]; }
interface EventRow { id: string; title: string; description: string | null; share_token: string; is_open: boolean; created_at: string; slots: Slot[]; }

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');

function ClassSignupAdmin() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [slotDraft, setSlotDraft] = useState<Record<string, { date: string; start: string; end: string; capacity: string; note: string }>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: evs, error } = await db
      .from('signup_events')
      .select('id, title, description, share_token, is_open, created_at')
      .order('created_at', { ascending: false });
    if (error) { toast.error('목록을 불러오지 못했습니다.'); setLoading(false); return; }

    const ids = (evs || []).map((e: any) => e.id);
    let slots: any[] = [];
    let entries: any[] = [];
    if (ids.length) {
      const { data: sl } = await db.from('signup_slots').select('*').in('event_id', ids).eq('is_active', true).order('slot_date').order('start_time');
      slots = sl || [];
      const slotIds = slots.map(s => s.id);
      if (slotIds.length) {
        const { data: en } = await db.from('signup_entries').select('*').in('slot_id', slotIds).order('created_at');
        entries = en || [];
      }
    }
    setEvents((evs || []).map((e: any) => ({
      ...e,
      slots: slots.filter(s => s.event_id === e.id).map(s => ({ ...s, entries: entries.filter(en => en.slot_id === s.id) })),
    })));
    setLoading(false);
  }

  async function createEvent() {
    if (title.trim().length < 2) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from('signup_events').insert({
      title: title.trim(), description: description.trim() || null, created_by: user?.id ?? null,
    });
    setCreating(false);
    if (error) { toast.error('개설 실패: ' + error.message); return; }
    setTitle(''); setDescription('');
    toast.success('수강신청을 개설했습니다.');
    load();
  }

  async function addSlot(eventId: string) {
    const d = slotDraft[eventId];
    if (!d?.date || !d?.start) { toast.error('날짜와 시작 시간을 입력해주세요.'); return; }
    const { error } = await db.from('signup_slots').insert({
      event_id: eventId,
      slot_date: d.date,
      start_time: d.start,
      end_time: d.end || null,
      capacity: Math.max(1, parseInt(d.capacity || '1', 10) || 1),
      note: d.note?.trim() || null,
    });
    if (error) { toast.error('시간대 추가 실패: ' + error.message); return; }
    setSlotDraft(prev => ({ ...prev, [eventId]: { date: d.date, start: '', end: '', capacity: d.capacity, note: '' } }));
    load();
  }

  async function removeSlot(id: string) {
    if (!confirm('이 시간대와 신청 내역을 삭제할까요?')) return;
    const { error } = await db.from('signup_slots').delete().eq('id', id);
    if (error) { toast.error('삭제 실패: ' + error.message); return; }
    load();
  }

  async function toggleOpen(ev: EventRow) {
    const { error } = await db.from('signup_events').update({ is_open: !ev.is_open }).eq('id', ev.id);
    if (error) { toast.error('변경 실패'); return; }
    load();
  }

  async function removeEvent(id: string) {
    if (!confirm('이 수강신청 전체를 삭제할까요? 신청 내역도 함께 삭제됩니다.')) return;
    const { error } = await db.from('signup_events').delete().eq('id', id);
    if (error) { toast.error('삭제 실패: ' + error.message); return; }
    load();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/class-signup?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('신청 링크를 복사했습니다.');
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><CalendarPlus className="w-5 h-5" /> 선착순 수강신청</h1>
        <p className="text-sm text-muted-foreground mt-1">날짜·시간과 정원을 만들고 링크를 보내면 학생이 직접 신청합니다. 학생 화면에는 남은 자리 수만 보이고 명단은 보이지 않습니다.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">새 수강신청 개설</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="t">제목</Label>
            <Input id="t" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 9월 내신대비 특강 신청" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="d">안내문 (선택)</Label>
            <Textarea id="d" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <Button onClick={createEvent} disabled={creating || title.trim().length < 2}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}개설하기
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 개설된 수강신청이 없습니다.</p>
      ) : events.map(ev => {
        const draft = slotDraft[ev.id] || { date: '', start: '', end: '', capacity: '5', note: '' };
        return (
          <Card key={ev.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{ev.title}</CardTitle>
                  {ev.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{ev.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{ev.is_open ? '모집중' : '마감'}</span>
                  <Switch checked={ev.is_open} onCheckedChange={() => toggleOpen(ev)} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => copyLink(ev.share_token)}><Copy className="w-3 h-3 mr-1" />신청 링크 복사</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeEvent(ev.id)}><Trash2 className="w-3 h-3 mr-1" />삭제</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {ev.slots.map(slot => (
                <div key={slot.id} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{slot.slot_date} {hhmm(slot.start_time)}{slot.end_time ? `–${hhmm(slot.end_time)}` : ''}</div>
                      {slot.note && <div className="text-xs text-muted-foreground">{slot.note}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={slot.entries.length >= slot.capacity ? 'destructive' : 'secondary'} className="text-xs">
                        <Users className="w-3 h-3 mr-1" />{slot.entries.length}/{slot.capacity}명
                      </Badge>
                      <Button size="icon" variant="ghost" onClick={() => removeSlot(slot.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  {slot.entries.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-1 pl-1">
                      {slot.entries.map((en, i) => (
                        <li key={en.id}>{i + 1}. {en.student_name}{en.grade ? ` (${en.grade})` : ''} · {en.phone}{en.memo ? ` · ${en.memo}` : ''}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end pt-1">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">날짜</Label>
                  <Input type="date" value={draft.date} onChange={e => setSlotDraft(p => ({ ...p, [ev.id]: { ...draft, date: e.target.value } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">시작</Label>
                  <Input type="time" value={draft.start} onChange={e => setSlotDraft(p => ({ ...p, [ev.id]: { ...draft, start: e.target.value } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">종료</Label>
                  <Input type="time" value={draft.end} onChange={e => setSlotDraft(p => ({ ...p, [ev.id]: { ...draft, end: e.target.value } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">정원</Label>
                  <Input type="number" min={1} value={draft.capacity} onChange={e => setSlotDraft(p => ({ ...p, [ev.id]: { ...draft, capacity: e.target.value } }))} />
                </div>
                <Button onClick={() => addSlot(ev.id)}><Plus className="w-4 h-4 mr-1" />추가</Button>
                <div className="col-span-2 md:col-span-6 space-y-1">
                  <Label className="text-xs">세부설명 (선택 · 예: 고2만 신청 가능)</Label>
                  <Input value={draft.note} onChange={e => setSlotDraft(p => ({ ...p, [ev.id]: { ...draft, note: e.target.value } }))} placeholder="학년 제한, 준비물 등" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function ClassSignupAdminPage() {
  return <ProtectedRoute><ClassSignupAdmin /></ProtectedRoute>;
}
