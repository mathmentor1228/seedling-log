import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock } from 'lucide-react';

interface OverdueEntry {
  key: string;          // studentId_room_slotStart
  studentId: string;
  studentName: string;
  roomLabel: string;
  slotStart: string;    // "HH:MM"
  minutesLate: number;
  teacherName?: string;
}

const ROOM_LABELS: Record<string, string> = {
  room10: '10강',
  glass: '유리문',
};

const ROOM_IDS = ['room10', 'glass'];
const LATE_THRESHOLD_MIN = 15;
const POLL_INTERVAL_MS = 60_000;
const SESSION_KEY = 'attendanceAlertDismissed_v1';

function getDayOfWeekKo(d: Date) {
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

function parseSlotToMinutes(slot: string) {
  // "HH:MM" or "HH:MM:SS"
  const [h, m] = slot.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date: string; keys: string[] };
    const today = new Date().toISOString().split('T')[0];
    if (parsed.date !== today) return new Set();
    return new Set(parsed.keys);
  } catch {
    return new Set();
  }
}

function saveDismissed(keys: Set<string>) {
  const today = new Date().toISOString().split('T')[0];
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ date: today, keys: Array.from(keys) }));
}

export function AttendanceAlertWatcher() {
  const { user, role } = useAuth();
  const [entries, setEntries] = useState<OverdueEntry[]>([]);
  const [open, setOpen] = useState(false);
  const dismissedRef = useRef<Set<string>>(loadDismissed());

  const check = useCallback(async () => {
    if (!user || (role !== 'admin' && role !== 'teacher')) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayOfWeek = getDayOfWeekKo(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Teacher: restrict to own students
    let myStudentIds: Set<string> | null = null;
    if (role === 'teacher') {
      const { data: classes } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', user.id);
      const classIds = (classes ?? []).map((c) => c.id);
      if (classIds.length === 0) {
        myStudentIds = new Set();
      } else {
        const { data: cs } = await supabase
          .from('class_students')
          .select('student_id')
          .in('class_id', classIds);
        myStudentIds = new Set((cs ?? []).map((r) => r.student_id));
      }
    }

    // Today's room assignments (fixed by day + ad-hoc by date)
    const { data: assigned } = await supabase
      .from('room_assignments')
      .select('student_ids, student_names, room, slot_start, teacher_id')
      .in('room', ROOM_IDS)
      .or(
        `and(is_fixed.eq.true,day.eq.${dayOfWeek}),and(is_fixed.eq.false,assigned_date.eq.${today})`
      );

    // Today's check-ins
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('student_id, room_id, checked_in_at')
      .in('room_id', ROOM_IDS)
      .eq('date', today);

    const checkedIn = new Set(
      (logs ?? [])
        .filter((l) => l.checked_in_at)
        .map((l) => `${l.student_id}_${l.room_id}`)
    );

    // Collect overdue
    const overdue: OverdueEntry[] = [];
    const seen = new Set<string>();
    const teacherIdsToLookup = new Set<string>();

    (assigned ?? []).forEach((a) => {
      const slot = a.slot_start as string | null;
      if (!slot) return;
      const slotMin = parseSlotToMinutes(slot);
      if (slotMin == null) return;
      const minutesLate = nowMinutes - slotMin;
      if (minutesLate < LATE_THRESHOLD_MIN) return;
      // Skip very stale (>4 hours past) to avoid spamming on long-past slots
      if (minutesLate > 240) return;

      const ids = (a.student_ids ?? []) as string[];
      const names = (a.student_names ?? []) as string[];
      ids.forEach((id, i) => {
        if (myStudentIds && !myStudentIds.has(id)) return;
        const key = `${id}_${a.room}_${slot}`;
        if (seen.has(key)) return;
        if (checkedIn.has(`${id}_${a.room}`)) return;
        seen.add(key);
        if (a.teacher_id) teacherIdsToLookup.add(a.teacher_id);
        overdue.push({
          key,
          studentId: id,
          studentName: names[i] ?? '이름없음',
          roomLabel: ROOM_LABELS[a.room] ?? a.room,
          slotStart: slot.slice(0, 5),
          minutesLate,
        });
      });
    });

    // Resolve teacher names for admin display
    if (role === 'admin' && teacherIdsToLookup.size > 0 && overdue.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(teacherIdsToLookup));
      const nameMap: Record<string, string> = {};
      (profiles ?? []).forEach((p) => {
        nameMap[p.id] = p.full_name || '선생님';
      });
      // attach via re-derive (need teacher_id per entry — fetch again from assigned)
      const teacherByKey = new Map<string, string>();
      (assigned ?? []).forEach((a) => {
        if (!a.teacher_id || !a.slot_start) return;
        const ids = (a.student_ids ?? []) as string[];
        ids.forEach((id) => {
          teacherByKey.set(`${id}_${a.room}_${a.slot_start}`, a.teacher_id as string);
        });
      });
      overdue.forEach((o) => {
        const tId = teacherByKey.get(o.key);
        if (tId) o.teacherName = nameMap[tId];
      });
    }

    // Filter out dismissed
    const fresh = overdue.filter((o) => !dismissedRef.current.has(o.key));
    setEntries(overdue); // show full current list when opened
    if (fresh.length > 0) {
      setOpen(true);
    }
  }, [user, role]);

  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'teacher')) return;
    check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, role, check]);

  const dismissAll = () => {
    entries.forEach((e) => dismissedRef.current.add(e.key));
    saveDismissed(dismissedRef.current);
    setOpen(false);
  };

  if (entries.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismissAll(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            미출석 알림 — 출석 확인 요망
          </DialogTitle>
          <DialogDescription>
            수업 시작 후 {LATE_THRESHOLD_MIN}분이 지났는데 출석 체크가 되지 않은 학생입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto space-y-2 py-2">
          {entries.map((e) => (
            <div
              key={e.key}
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">
                    {e.studentName}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({e.roomLabel})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {e.slotStart} 수업 · 미출석 · 출석 확인 요망
                  </div>
                  {e.teacherName && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      담당: {e.teacherName} 선생님
                    </div>
                  )}
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-destructive/15 text-destructive text-[11px] font-bold px-2 py-1">
                  <Clock className="w-3 h-3" />
                  {e.minutesLate}분 경과
                </span>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={dismissAll}>
            확인했습니다
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
