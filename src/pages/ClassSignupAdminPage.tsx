// CLASS-SIGNUP-V1: 선착순 수강신청 개설·관리 (관리자/강사)
// CLASS-SIGNUP-V2: 확정 시 해당 날짜 수업일지 자동 생성
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CalendarPlus, CheckCircle2, Copy, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { safeUpsertLessonRecord } from '@/lib/lessonRecordUpsert';

const db = supabase as any;

const SUBJECTS = ['수학', '영어', '국어', '과학'] as const;

interface Entry {
  id: string; student_name: string; grade: string | null; phone: string | null; memo: string | null; created_at: string;
  student_id: string | null; confirmed_at: string | null; lesson_record_id: string | null;
}
interface Slot { id: string; event_id: string; slot_date: string; start_time: string; end_time: string | null; capacity: number; note: string | null; confirmed_at: string | null; entries: Entry[]; }
interface EventRow { id: string; title: string; description: string | null; share_token: string; is_open: boolean; created_at: string; subject: string | null; teacher_id: string | null; slots: Slot[]; }

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');
const NONE = '__none__';

function ClassSignupAdmin() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState<string>('수학');
  const [teacherId, setTeacherId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [slotDraft, setSlotDraft] = useState<Record<string, { date: string; start: string; end: string; capacity: string; note: string }>>({});

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    setMeId(user?.id ?? null);
    setTeacherId(prev => prev || user?.id || '');
    const [st, pf] = await Promise.all([
      supabase.from('students').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    setStudents(st.data || []);
    setTeachers((pf.data || []).map((p: any) => ({ id: p.id, name: p.full_name })));
    load(st.data || []);
  }

  async function load(studentList?: { id: string; name: string }[]) {
    setLoading(true);
    const roster = studentList || students;
    const { data: evs, error } = await db
      .from('signup_events')
      .select('id, title, description, share_token, is_open, created_at, subject, teacher_id')
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
    // 이름 자동 매칭 (수동 선택이 없는 항목만)
    setMatches(prev => {
      const next = { ...prev };
      for (const en of entries) {
        if (next[en.id]) continue;
        if (en.student_id) { next[en.id] = en.student_id; continue; }
        const nm = (en.student_name || '').trim();
        const hit = roster.filter(s => s.name === nm || s.name.replace(/_[A-Z]$/, '') === nm);
        if (hit.length === 1) next[en.id] = hit[0].id;
      }
      return next;
    });

    setEvents((evs || []).map((e: any) => ({
      ...e,
      slots: slots.filter(s => s.event_id === e.id).map(s => ({ ...s, entries: entries.filter(en => en.slot_id === s.id) })),
    })));
    setLoading(false);
  }

  async function createEvent() {
    if (title.trim().length < 2) return;
    setCreating(true);
    const { error } = await db.from('signup_events').insert({
      title: title.trim(), description: description.trim() || null, created_by: meId,
      subject, teacher_id: teacherId || meId,
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

  // CLASS-SIGNUP-V2: 확정 → 신청 학생의 해당 날짜 수업일지(임시저장) 생성
  async function confirmSlot(ev: EventRow, slot: Slot) {
    const targets = slot.entries.filter(en => !en.confirmed_at);
    if (targets.length === 0) { toast.info('이미 모두 확정되었습니다.'); return; }
    const unmatched = targets.filter(en => !matches[en.id]);
    if (unmatched.length > 0) {
      toast.error(`재원생 연결이 안 된 신청자가 있습니다: ${unmatched.map(u => u.student_name).join(', ')}`);
      return;
    }
    const tId = ev.teacher_id || meId;
    if (!tId) { toast.error('담당 선생님을 지정해주세요.'); return; }

    setConfirming(slot.id);
    let ok = 0;
    for (const en of targets) {
      const studentId = matches[en.id];
      const res = await safeUpsertLessonRecord({
        student_id: studentId,
        teacher_id: tId,
        subject: (ev.subject || '수학') as any,
        lesson_date: slot.slot_date,
        lesson_range: ev.title,
        homework_status: 'none_assigned',
        lesson_types: ['선착순수강신청'],
        submitted: false,
        // SIGNUP-ATT-V1: 대시보드 출결 슬롯에서 시간을 파싱할 수 있도록 표준 표기 포함
        notes: [`[선착순 수강신청] ${ev.title} [신청 시간: ${hhmm(slot.start_time)}]`, slot.note, en.memo].filter(Boolean).join(' · '),
      });
      if (res.error) { console.error(res.error); continue; }
      await db.from('signup_entries').update({
        student_id: studentId, confirmed_at: new Date().toISOString(), lesson_record_id: res.id || null,
      }).eq('id', en.id);
      ok++;
    }
    await db.from('signup_slots').update({ confirmed_at: new Date().toISOString() }).eq('id', slot.id);
    setConfirming(null);
    toast.success(`${ok}명 확정 · ${slot.slot_date} 수업일지를 만들었습니다.`);
    load();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/class-signup?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('신청 링크를 복사했습니다.');
  }

  async function updateEventMeta(ev: EventRow, patch: Record<string, any>) {
    const { error } = await db.from('signup_events').update(patch).eq('id', ev.id);
    if (error) { toast.error('변경 실패: ' + error.message); return; }
    load();
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><CalendarPlus className="w-5 h-5" /> 선착순 수강신청</h1>
        <p className="text-sm text-muted-foreground mt-1">날짜·시간과 정원을 만들고 링크를 보내면 학생이 직접 신청합니다. 학생 화면에는 남은 자리 수만 보이고 명단은 보이지 않습니다. <b>확정</b>을 누르면 신청 학생의 해당 날짜 수업일지가 자동으로 만들어집니다.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">새 수강신청 개설</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="t">제목</Label>
            <Input id="t" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 9월 내신대비 특강 신청" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">과목</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">담당 선생님</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Select value={ev.subject || ''} onValueChange={v => updateEventMeta(ev, { subject: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="과목 선택" /></SelectTrigger>
                  <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={ev.teacher_id || ''} onValueChange={v => updateEventMeta(ev, { teacher_id: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="담당 선생님" /></SelectTrigger>
                  <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => copyLink(ev.share_token)}><Copy className="w-3 h-3 mr-1" />신청 링크 복사</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeEvent(ev.id)}><Trash2 className="w-3 h-3 mr-1" />삭제</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {ev.slots.map(slot => {
                const pending = slot.entries.filter(en => !en.confirmed_at).length;
                return (
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
                    <div className="space-y-1.5">
                      {slot.entries.map((en, i) => (
                        <div key={en.id} className="flex items-center gap-2 text-xs">
                          <span className="w-4 text-muted-foreground">{i + 1}</span>
                          <span className="font-medium">{en.student_name}</span>
                          <span className="text-muted-foreground">{en.grade ? `(${en.grade})` : ''} {en.phone}{en.memo ? ` · ${en.memo}` : ''}</span>
                          <div className="ml-auto flex items-center gap-2">
                            {en.confirmed_at ? (
                              <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />확정 · 일지 생성</Badge>
                            ) : (
                              <Select value={matches[en.id] || NONE} onValueChange={v => setMatches(p => ({ ...p, [en.id]: v === NONE ? '' : v }))}>
                                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="재원생 연결" /></SelectTrigger>
                                <SelectContent className="max-h-64">
                                  <SelectItem value={NONE}>연결 안 함</SelectItem>
                                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {slot.entries.length > 0 && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {slot.confirmed_at ? `확정됨 · 미확정 ${pending}명` : '확정하면 이 날짜로 수업일지가 임시저장됩니다.'}
                      </span>
                      <Button size="sm" disabled={pending === 0 || confirming === slot.id} onClick={() => confirmSlot(ev, slot)}>
                        {confirming === slot.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                        확정 ({pending}명)
                      </Button>
                    </div>
                  )}
                </div>
                );
              })}

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
