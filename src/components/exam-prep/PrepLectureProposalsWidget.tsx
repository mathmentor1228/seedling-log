import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Loader2, Sparkles, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Proposal {
  id: string;
  school_name: string;
  grade_year: number | null;
  subject: string;
  teacher_id: string | null;
  student_ids: string[];
  exam_title: string | null;
  exam_date: string;
  target_date: string;
  status: 'pending' | 'confirmed' | 'dismissed' | 'needs_teacher';
  selected_start_time: string | null;
  selected_end_time: string | null;
}

interface Classroom { id: string; name: string }

interface BusyInterval { start: string; end: string }

const WEEKDAYS = ['일','월','화','수','목','금','토'];
function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getMonth()+1}/${dt.getDate()} (${WEEKDAYS[dt.getDay()]})`;
}
function dayOfWeek(d: string) {
  return new Date(d + 'T00:00:00').getDay();
}
function toMin(t: string) { const [h,m] = t.split(':').map(Number); return h*60 + (m||0); }
function toTime(min: number) { const h = String(Math.floor(min/60)).padStart(2,'0'); const m = String(min%60).padStart(2,'0'); return `${h}:${m}`; }

const DAY_START = 9 * 60;   // 09:00
const DAY_END = 22 * 60;    // 22:00
const SLOT_LEN = 60;         // 60-minute default slot suggestions

export function PrepLectureProposalsWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busyByDate, setBusyByDate] = useState<Record<string, BusyInterval[]>>({});
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [openProposal, setOpenProposal] = useState<Proposal | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: props }, { data: rooms }] = await Promise.all([
        supabase
          .from('prep_lecture_proposals' as any)
          .select('*')
          .eq('teacher_id', user.id)
          .in('status', ['pending'])
          .order('target_date', { ascending: true }),
        supabase.from('classrooms').select('id, name').eq('is_active', true).order('sort_order'),
      ]);
      const list = (props ?? []) as unknown as Proposal[];
      setProposals(list);
      setClassrooms((rooms ?? []) as Classroom[]);

      // load busy intervals for each target_date
      const dates = Array.from(new Set(list.map(p => p.target_date)));
      const busy: Record<string, BusyInterval[]> = {};
      for (const d of dates) busy[d] = await loadBusyForDate(d);
      setBusyByDate(busy);

      // load student names
      const sids = Array.from(new Set(list.flatMap(p => p.student_ids)));
      if (sids.length > 0) {
        const { data: sdata } = await supabase.from('students').select('id, name').in('id', sids);
        const map: Record<string, string> = {};
        (sdata ?? []).forEach(s => { map[s.id] = s.name; });
        setStudentNames(map);
      }
    } finally { setLoading(false); }
  }

  async function loadBusyForDate(date: string): Promise<BusyInterval[]> {
    if (!user) return [];
    const dow = dayOfWeek(date);
    const intervals: BusyInterval[] = [];
    // regular class schedules
    const { data: cs } = await supabase
      .from('class_schedules')
      .select('start_time, end_time, inactive_until')
      .eq('teacher_id', user.id).eq('is_active', true).eq('day_of_week', dow);
    (cs ?? []).forEach(c => {
      if (!c.inactive_until || c.inactive_until < date) {
        intervals.push({ start: String(c.start_time).slice(0,5), end: String(c.end_time).slice(0,5) });
      }
    });
    // exam prep sessions (existing)
    const { data: eps } = await supabase
      .from('exam_prep_sessions')
      .select('start_time, end_time, course_id, exam_prep_courses!inner(teacher_id)')
      .eq('schedule_date', date)
      .eq('exam_prep_courses.teacher_id', user.id);
    (eps ?? []).forEach((e: any) => {
      intervals.push({ start: String(e.start_time).slice(0,5), end: String(e.end_time).slice(0,5) });
    });
    return intervals;
  }

  function emptySlots(date: string): { start: string; end: string }[] {
    const busy = (busyByDate[date] ?? []).map(b => ({ s: toMin(b.start), e: toMin(b.end) }))
      .sort((a,b) => a.s - b.s);
    // merge
    const merged: { s: number; e: number }[] = [];
    for (const b of busy) {
      const last = merged[merged.length - 1];
      if (last && b.s <= last.e) last.e = Math.max(last.e, b.e);
      else merged.push({ ...b });
    }
    const free: { s: number; e: number }[] = [];
    let cur = DAY_START;
    for (const m of merged) {
      if (m.s > cur) free.push({ s: cur, e: Math.min(m.s, DAY_END) });
      cur = Math.max(cur, m.e);
    }
    if (cur < DAY_END) free.push({ s: cur, e: DAY_END });

    const slots: { start: string; end: string }[] = [];
    for (const f of free) {
      let s = f.s;
      while (s + SLOT_LEN <= f.e) {
        slots.push({ start: toTime(s), end: toTime(s + SLOT_LEN) });
        s += 30;
        if (slots.length > 30) break;
      }
    }
    return slots;
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('auto-generate-prep-lectures');
      if (error) throw error;
      toast({ title: '직전특강 후보 갱신 완료' });
      await load();
    } catch (e: any) {
      toast({ title: '갱신 실패', description: String(e?.message ?? e), variant: 'destructive' });
    } finally { setGenerating(false); }
  }

  if (loading) {
    return (
      <Card><CardContent className="py-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  return (
    <Card className="border-amber-400/40 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            직전특강 제안 ({proposals.length})
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="ml-1 text-xs">스캔</span>
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">시험 D-14 이내 자동 생성 · 시험 전날 잡을 직전특강</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {proposals.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">현재 잡을 직전특강 제안이 없습니다</p>
        ) : proposals.map(p => (
          <ProposalCard
            key={p.id}
            proposal={p}
            slots={emptySlots(p.target_date)}
            studentNames={studentNames}
            onPick={() => setOpenProposal(p)}
          />
        ))}
      </CardContent>

      {openProposal && (
        <ConfirmDialog
          proposal={openProposal}
          classrooms={classrooms}
          slots={emptySlots(openProposal.target_date)}
          studentNames={studentNames}
          onClose={() => setOpenProposal(null)}
          onDone={() => { setOpenProposal(null); load(); }}
        />
      )}
    </Card>
  );
}

function ProposalCard({ proposal, slots, studentNames, onPick }: {
  proposal: Proposal;
  slots: { start: string; end: string }[];
  studentNames: Record<string, string>;
  onPick: () => void;
}) {
  const names = proposal.student_ids.map(id => studentNames[id]).filter(Boolean).slice(0, 5);
  return (
    <div className="bg-card rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="default" className="text-[10px] bg-amber-600 hover:bg-amber-600">{proposal.subject}</Badge>
            <span className="text-sm font-semibold truncate">{proposal.school_name}{proposal.grade_year ? ` ${proposal.grade_year}학년` : ''}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{proposal.exam_title}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground">시험 {fmtDate(proposal.exam_date)}</p>
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 justify-end">
            <Calendar className="w-3 h-3" /> 직전 {fmtDate(proposal.target_date)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Users className="w-3 h-3" />
        <span>{proposal.student_ids.length}명</span>
        {names.length > 0 && <span className="truncate">· {names.join(', ')}{proposal.student_ids.length > names.length ? '…' : ''}</span>}
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
          <Clock className="w-3 h-3" /> 빈 시간대 ({slots.length === 0 ? '없음' : `${slots.length}개`})
        </p>
        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
          {slots.slice(0, 12).map((s, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted">
              {s.start}-{s.end}
            </span>
          ))}
          {slots.length === 0 && (
            <span className="text-[10px] text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> 정규수업으로 가득 참
            </span>
          )}
        </div>
      </div>

      <Button size="sm" className="w-full" onClick={onPick}>시간 선택 / 확정</Button>
    </div>
  );
}

function ConfirmDialog({ proposal, classrooms, slots, studentNames, onClose, onDone }: {
  proposal: Proposal;
  classrooms: Classroom[];
  slots: { start: string; end: string }[];
  studentNames: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [start, setStart] = useState(slots[0]?.start ?? '19:00');
  const [end, setEnd] = useState(slots[0]?.end ?? '20:00');
  const [classroomId, setClassroomId] = useState<string>('');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('confirm-prep-lecture', {
        body: {
          proposal_id: proposal.id,
          start_time: start,
          end_time: end,
          classroom_id: classroomId || null,
          notify_students: notify,
        },
      });
      if (error) throw error;
      toast({ title: '직전특강이 확정되었습니다', description: notify ? '학생·학부모에게 공지되었습니다' : '내부 일정으로만 등록되었습니다' });
      onDone();
    } catch (e: any) {
      toast({ title: '확정 실패', description: String(e?.message ?? e), variant: 'destructive' });
    } finally { setSaving(false); }
  }

  const names = proposal.student_ids.map(id => studentNames[id]).filter(Boolean);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>직전특강 확정</DialogTitle>
          <DialogDescription>
            {proposal.school_name}{proposal.grade_year ? ` ${proposal.grade_year}학년` : ''} {proposal.subject} · {fmtDate(proposal.target_date)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">빈 슬롯 빠른 선택</Label>
            <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
              {slots.length === 0 && <span className="text-xs text-muted-foreground">빈 시간이 없습니다 - 직접 입력하세요</span>}
              {slots.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setStart(s.start); setEnd(s.end); }}
                  className={cn(
                    'px-2 py-1 rounded text-[11px] font-mono border',
                    start === s.start && end === s.end ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-accent',
                  )}
                >
                  {s.start}-{s.end}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">시작</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">종료</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">강의실 (선택)</Label>
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger><SelectValue placeholder="미지정" /></SelectTrigger>
              <SelectContent>
                {classrooms.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-muted/30 p-2">
            <p className="text-[11px] text-muted-foreground mb-1">대상 {proposal.student_ids.length}명</p>
            <p className="text-xs">{names.join(', ')}</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} />
            <span className="text-sm">학생 / 학부모에게 즉시 공지</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={submit} disabled={saving || !start || !end}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '확정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
