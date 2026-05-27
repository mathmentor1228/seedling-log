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
import { AlertTriangle, Clock, Check, X, BellRing } from 'lucide-react';
import { toast } from 'sonner';

interface OverdueEntry {
  key: string;          // studentId_room_slotStart
  studentId: string;
  studentName: string;
  roomLabel: string;
  roomId: string;
  slotStart: string;    // "HH:MM"
  minutesLate: number;
  teacherName?: string;
  teacherId?: string;
  escalated?: boolean;
}

const ROOM_LABELS: Record<string, string> = {
  room10: '10강',
  glass: '유리문',
};

const ROOM_IDS = ['room10', 'glass'];
// Show popup at scheduled start (0), then again at 5min and 10min after if still unmarked.
const ALERT_TIERS_MIN = [0, 5, 10];
const POLL_INTERVAL_MS = 60_000;
const SNOOZE_KEY = 'attendanceAlertSnoozeV2';
const ESCALATED_KEY = 'attendanceAlertEscalatedV1';

function getDayOfWeekKo(d: Date) {
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

function parseSlotToMinutes(slot: string) {
  const [h, m] = slot.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Snooze: map of entryKey -> epoch ms until which the popup should not auto-open
function loadDayMap(key: string): Map<string, number> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as { date: string; items: Record<string, number> };
    const today = new Date().toISOString().split('T')[0];
    if (parsed.date !== today) return new Map();
    return new Map(Object.entries(parsed.items));
  } catch {
    return new Map();
  }
}
function saveDayMap(key: string, m: Map<string, number>) {
  const today = new Date().toISOString().split('T')[0];
  sessionStorage.setItem(
    key,
    JSON.stringify({ date: today, items: Object.fromEntries(m.entries()) })
  );
}

export function AttendanceAlertWatcher() {
  const { user, role } = useAuth();
  const [entries, setEntries] = useState<OverdueEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const snoozeRef = useRef<Map<string, number>>(loadDayMap(SNOOZE_KEY));
  const escalatedRef = useRef<Map<string, number>>(loadDayMap(ESCALATED_KEY));

  const setBusy = (key: string, v: boolean) => {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (v) next.add(key); else next.delete(key);
      return next;
    });
  };

  const check = useCallback(async () => {
    if (!user || (role !== 'admin' && role !== 'teacher')) return;

    const now = new Date();
    if (now.getHours() >= 22) {
      setEntries([]);
      setOpen(false);
      return;
    }
    const today = now.toISOString().split('T')[0];
    const dayOfWeek = getDayOfWeekKo(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

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

    // Exclude withdrawn/inactive students from popup
    const { data: activeStudents } = await supabase
      .from('students')
      .select('id')
      .in('enrollment_status', ['재학', '재등원']);
    const activeStudentIds = new Set((activeStudents ?? []).map((s) => s.id));

    const { data: assigned } = await supabase
      .from('room_assignments')
      .select('student_ids, student_names, room, slot_start, teacher_id')
      .in('room', ROOM_IDS)
      .or(
        `and(is_fixed.eq.true,day.eq.${dayOfWeek}),and(is_fixed.eq.false,assigned_date.eq.${today})`
      );

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

    const absentIds = new Set<string>();
    const { data: attRows } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('att_date', today);
    (attRows ?? []).forEach((r: any) => {
      if (r.status && r.status !== 'present') absentIds.add(r.student_id);
    });
    const { data: lessonRows } = await supabase
      .from('lesson_records')
      .select('student_id, attendance_status, lesson_types')
      .eq('lesson_date', today);
    const ABSENCE_TAGS = ['결석', '인정결석', '무단결석', '보충불가', '지각', '조퇴'];
    (lessonRows ?? []).forEach((r: any) => {
      const tags: string[] = r.attendance_status ?? [];
      const lt: string[] = r.lesson_types ?? [];
      if (lt.includes('휴강')) { absentIds.add(r.student_id); return; }
      if (tags.some((t) => ABSENCE_TAGS.includes(t))) absentIds.add(r.student_id);
    });

    const overdue: OverdueEntry[] = [];
    const seen = new Set<string>();
    const teacherIdsToLookup = new Set<string>();

    (assigned ?? []).forEach((a) => {
      const slot = a.slot_start as string | null;
      if (!slot) return;
      const slotMin = parseSlotToMinutes(slot);
      if (slotMin == null) return;
      const minutesLate = nowMinutes - slotMin;
      // alert from scheduled time; stop after 4 hours stale
      if (minutesLate < ALERT_TIERS_MIN[0]) return;
      if (minutesLate > 240) return;

      const ids = (a.student_ids ?? []) as string[];
      const names = (a.student_names ?? []) as string[];
      ids.forEach((id, i) => {
        if (myStudentIds && !myStudentIds.has(id)) return;
        if (absentIds.has(id)) return;
        if (checkedIn.has(`${id}_${a.room}`)) return;
        const key = `${id}_${a.room}_${slot}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (a.teacher_id) teacherIdsToLookup.add(a.teacher_id);
        overdue.push({
          key,
          studentId: id,
          studentName: names[i] ?? '이름없음',
          roomLabel: ROOM_LABELS[a.room] ?? a.room,
          roomId: a.room,
          slotStart: slot.slice(0, 5),
          minutesLate,
          teacherId: a.teacher_id ?? undefined,
          escalated: escalatedRef.current.has(key),
        });
      });
    });

    if (role === 'admin' && teacherIdsToLookup.size > 0 && overdue.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(teacherIdsToLookup));
      const nameMap: Record<string, string> = {};
      (profiles ?? []).forEach((p) => {
        nameMap[p.id] = p.full_name || '선생님';
      });
      overdue.forEach((o) => {
        if (o.teacherId) o.teacherName = nameMap[o.teacherId];
      });
    }

    // Auto-open: only if any entry has crossed a new tier that isn't snoozed
    const nowEpoch = Date.now();
    const shouldOpen = overdue.some((o) => {
      const snoozeUntil = snoozeRef.current.get(o.key) ?? 0;
      if (snoozeUntil > nowEpoch) return false;
      // entry is past a tier boundary (0/5/10) → open
      return ALERT_TIERS_MIN.some((t) => o.minutesLate >= t);
    });

    setEntries(overdue);
    if (overdue.length === 0) {
      setOpen(false);
    } else if (shouldOpen) {
      setOpen(true);
    }
  }, [user, role]);

  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'teacher')) return;
    check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, role, check]);

  // Admin: listen for escalation notifications and surface as toast popups
  useEffect(() => {
    if (!user || role !== 'admin') return;
    const channel = supabase
      .channel(`attendance-escalation-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'teacher_notifications',
          filter: `teacher_id=eq.${user.id}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row?.notification_type !== 'attendance_escalation') return;
          toast.warning(row.title || '출석 미확인 알림', {
            description: row.message || '',
            duration: 15000,
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role]);

  // Snooze popup for 5 minutes (re-emerges at next tier)
  const snoozeFor = (key: string, minutes: number) => {
    snoozeRef.current.set(key, Date.now() + minutes * 60_000);
    saveDayMap(SNOOZE_KEY, snoozeRef.current);
  };
  const snoozeAllUntilEndOfDay = () => {
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    entries.forEach((e) => snoozeRef.current.set(e.key, eod.getTime()));
    saveDayMap(SNOOZE_KEY, snoozeRef.current);
  };

  const handleClose = () => {
    // Snooze everything 5 min so it pops again at next tier
    entries.forEach((e) => {
      const cur = snoozeRef.current.get(e.key) ?? 0;
      const next = Date.now() + 5 * 60_000;
      if (next > cur) snoozeRef.current.set(e.key, next);
    });
    saveDayMap(SNOOZE_KEY, snoozeRef.current);
    setOpen(false);
  };

  const handleCheckIn = async (e: OverdueEntry) => {
    if (!user) return;
    setBusy(e.key, true);
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const { data: existing } = await supabase
        .from('attendance_logs')
        .select('id')
        .eq('student_id', e.studentId)
        .eq('date', today)
        .eq('room_id', e.roomId)
        .maybeSingle();
      if (existing) {
        await supabase.from('attendance_logs')
          .update({ checked_in_at: now.toISOString(), checked_out_at: null })
          .eq('id', existing.id);
      } else {
        await supabase.from('attendance_logs').insert({
          student_id: e.studentId,
          room_id: e.roomId,
          date: today,
          checked_in_at: now.toISOString(),
          recorded_by: user.id,
        });
      }
      toast.success(`${e.studentName} 출석 처리되었습니다`);
      setEntries((prev) => prev.filter((x) => x.key !== e.key));
      await check();
    } catch (err) {
      console.error(err);
      toast.error('출석 처리 실패');
    } finally {
      setBusy(e.key, false);
    }
  };

  const handleMarkAbsent = async (e: OverdueEntry) => {
    setBusy(e.key, true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('attendance').upsert({
        student_id: e.studentId,
        att_date: today,
        status: 'absent',
      }, { onConflict: 'student_id,att_date' });
      toast.success(`${e.studentName} 결석 처리되었습니다`);
      setEntries((prev) => prev.filter((x) => x.key !== e.key));
      await check();
    } catch (err) {
      console.error(err);
      toast.error('결석 처리 실패 — 권한이 없을 수 있습니다');
    } finally {
      setBusy(e.key, false);
    }
  };

  const handleEscalate = async (e: OverdueEntry) => {
    setBusy(e.key, true);
    try {
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      const adminIds = (admins ?? []).map((r: any) => r.user_id);
      if (adminIds.length === 0) {
        toast.error('원장 계정을 찾을 수 없습니다');
        return;
      }
      const rows = adminIds.map((adminId: string) => ({
        teacher_id: adminId,
        student_id: e.studentId,
        notification_type: 'attendance_escalation',
        title: `출석 미확인: ${e.studentName} (${e.roomLabel})`,
        message: `${e.slotStart} 수업 · ${e.minutesLate}분 경과 — 출석 확인 요망`,
        metadata: {
          student_id: e.studentId,
          room: e.roomId,
          slot_start: e.slotStart,
          minutes_late: e.minutesLate,
          reported_by: user?.id,
        },
      }));
      const { error } = await supabase.from('teacher_notifications').insert(rows);
      if (error) throw error;
      escalatedRef.current.set(e.key, Date.now());
      saveDayMap(ESCALATED_KEY, escalatedRef.current);
      setEntries((prev) => prev.map((x) => x.key === e.key ? { ...x, escalated: true } : x));
      toast.success('원장님께 알림을 보냈습니다');
    } catch (err) {
      console.error(err);
      toast.error('알림 전송 실패');
    } finally {
      setBusy(e.key, false);
    }
  };

  if (entries.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            미출석 알림 — 출석 확인 요망
          </DialogTitle>
          <DialogDescription>
            수업 시작 후 출석 체크가 되지 않은 학생입니다. 바로 처리하거나 5분 후 다시 알려드립니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
          {entries.map((e) => {
            const busy = busyKeys.has(e.key);
            const canEscalate = role === 'teacher' && e.minutesLate >= 10 && !e.escalated;
            return (
              <div
                key={e.key}
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-2"
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
                      {e.slotStart} 수업 · 미출석
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
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => handleCheckIn(e)}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> 출석
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => handleMarkAbsent(e)}
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> 결석
                  </Button>
                  {canEscalate && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => handleEscalate(e)}
                    >
                      <BellRing className="w-3.5 h-3.5 mr-1" /> 원장님께 알림
                    </Button>
                  )}
                  {e.escalated && (
                    <span className="inline-flex items-center text-[11px] text-muted-foreground px-1.5">
                      ✓ 원장님께 알림 전송됨
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose}>
            5분 후 다시 알림
          </Button>
          <Button variant="outline" onClick={() => { snoozeAllUntilEndOfDay(); setOpen(false); }}>
            오늘 그만 보기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
