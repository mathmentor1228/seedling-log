import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn, getTodayKST } from '@/lib/utils';
import { LogIn, LogOut, AlertTriangle, Users } from 'lucide-react';

const ROOMS = [
  { id: 'room10', label: '10강의실' },
  { id: 'glass', label: '유리문강의실' },
] as const;

const getDayOfWeek = (dateStr: string): string => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });

const getDuration = (inAt: string, outAt: string) => {
  const diff = new Date(outAt).getTime() - new Date(inAt).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

interface AttendanceLog {
  id: string;
  student_id: string;
  student_name: string;
  room_id: string;
  date: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  assignment_id: string | null;
  recorded_by: string | null;
}

interface AssignedStudent {
  id: string;
  name: string;
  grade: string | null;
  assignmentId: string;
  teacherName: string | null;
}

export function AttendanceTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedRoom, setSelectedRoom] = useState<string>('room10');
  const [selectedDate, setSelectedDate] = useState(getTodayKST());
  const [assignedStudents, setAssignedStudents] = useState<AssignedStudent[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [overCapacityModal, setOverCapacityModal] = useState<{
    open: boolean;
    message: string;
    room: string;
  }>({ open: false, message: '', room: '' });

  const fetchCapacities = useCallback(async () => {
    const { data } = await supabase.from('room_capacities').select('*');
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((r: any) => { map[r.room_id] = r.capacity; });
      setCapacities(map);
    }
  }, []);

  const fetchAssignedStudents = useCallback(async () => {
    const dayOfWeek = getDayOfWeek(selectedDate);
    const { data } = await supabase
      .from('room_assignments')
      .select('*')
      .eq('room', selectedRoom)
      .or(
        `and(is_fixed.eq.true,day.eq.${dayOfWeek}),and(is_fixed.eq.false,assigned_date.eq.${selectedDate})`
      );

    if (!data || data.length === 0) {
      setAssignedStudents([]);
      return;
    }

    // Collect all student IDs from assignments
    const allStudentIds: string[] = [];
    const studentAssignmentMap: Record<string, string> = {};
    data.forEach((a: any) => {
      const ids = (a.student_ids || []) as string[];
      ids.forEach((sid: string) => {
        if (!allStudentIds.includes(sid)) allStudentIds.push(sid);
        studentAssignmentMap[sid] = a.id;
      });
    });

    if (allStudentIds.length === 0) {
      setAssignedStudents([]);
      return;
    }

    // Fetch student details
    const { data: students } = await supabase
      .from('students')
      .select('id, name, grade')
      .in('id', allStudentIds);

    // Fetch teacher names via class_students -> classes -> profiles
    const { data: csData } = await supabase
      .from('class_students')
      .select('student_id, classes!inner(teacher_id, subject)')
      .in('student_id', allStudentIds);

    const teacherIds = [...new Set((csData || []).map((c: any) => c.classes?.teacher_id).filter(Boolean))];
    let teacherMap: Record<string, string> = {};
    if (teacherIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds);
      (profiles || []).forEach((p: any) => { teacherMap[p.id] = p.full_name; });
    }

    const studentTeacher: Record<string, string> = {};
    (csData || []).forEach((c: any) => {
      const tid = c.classes?.teacher_id;
      if (tid && teacherMap[tid]) studentTeacher[c.student_id] = teacherMap[tid];
    });

    const result: AssignedStudent[] = (students || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      assignmentId: studentAssignmentMap[s.id] || '',
      teacherName: studentTeacher[s.id] || null,
    }));

    setAssignedStudents(result);
  }, [selectedRoom, selectedDate]);

  const fetchAttendance = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('room_id', selectedRoom)
      .eq('date', selectedDate);
    setAttendance((data as AttendanceLog[]) || []);
  }, [selectedRoom, selectedDate]);

  useEffect(() => {
    fetchCapacities();
  }, [fetchCapacities]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAssignedStudents(), fetchAttendance()]).finally(() => setLoading(false));
  }, [fetchAssignedStudents, fetchAttendance]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('attendance_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        () => fetchAttendance()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAttendance]);

  const currentCount = attendance.filter(a => a.checked_in_at && !a.checked_out_at).length;
  const capacity = capacities[selectedRoom] || 8;
  const isOverCapacity = currentCount >= capacity;

  const getLog = (studentId: string) =>
    attendance.find(a => a.student_id === studentId);

  const handleCheckIn = async (student: AssignedStudent) => {
    if (isOverCapacity) {
      const roomLabel = ROOMS.find(r => r.id === selectedRoom)?.label || selectedRoom;
      setOverCapacityModal({
        open: true,
        message: `${roomLabel}은(는) 만석(${capacity}명)입니다.\n배정 전 원장과 상의해 주세요.`,
        room: roomLabel,
      });
      return;
    }

    const now = new Date().toISOString();
    const existing = getLog(student.id);

    if (existing) {
      await supabase
        .from('attendance_logs')
        .update({ checked_in_at: now } as any)
        .eq('id', existing.id);
    } else {
      await supabase.from('attendance_logs').insert({
        student_id: student.id,
        student_name: student.name,
        room_id: selectedRoom,
        date: selectedDate,
        checked_in_at: now,
        assignment_id: student.assignmentId || null,
        recorded_by: user?.id || null,
      } as any);
    }

    toast({ title: `${student.name} 입실 완료` });
    await fetchAttendance();
  };

  const handleCheckOut = async (logId: string, studentName: string) => {
    await supabase
      .from('attendance_logs')
      .update({ checked_out_at: new Date().toISOString() } as any)
      .eq('id', logId);

    toast({ title: `${studentName} 퇴실 완료` });
    await fetchAttendance();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Room tabs */}
        <div className="flex gap-1.5">
          {ROOMS.map(r => (
            <Button
              key={r.id}
              variant={selectedRoom === r.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedRoom(r.id)}
              className="text-sm"
            >
              {r.label}
            </Button>
          ))}
        </div>

        {/* Date */}
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="w-40 h-9 text-sm"
        />

        {/* Capacity */}
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
          isOverCapacity
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-foreground'
        )}>
          <Users className="w-4 h-4" />
          <span>{currentCount} / {capacity}명</span>
          {isOverCapacity && <AlertTriangle className="w-4 h-4" />}
        </div>
      </div>

      {/* Student Cards Grid */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">불러오는 중...</p>
      ) : assignedStudents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          배정된 학생이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {assignedStudents.map(student => {
            const log = getLog(student.id);
            const checkedIn = !!log?.checked_in_at;
            const checkedOut = !!log?.checked_out_at;

            const status = checkedOut
              ? 'out'
              : checkedIn
                ? 'in'
                : 'none';

            return (
              <Card
                key={student.id}
                className={cn(
                  'transition-opacity',
                  status === 'out' && 'opacity-60'
                )}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[15px] font-medium">{student.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {student.grade || '학년 미입력'}
                        {student.teacherName && ` · ${student.teacherName}T`}
                      </p>
                    </div>

                    {/* Status badge */}
                    {status === 'none' && (
                      <Badge variant="secondary" className="text-[11px]">미입실</Badge>
                    )}
                    {status === 'in' && (
                      <Badge
                        className="text-[11px]"
                        style={{ backgroundColor: '#E1F5EE', color: '#085041', border: '1px solid #1D9E75' }}
                      >
                        입실 {fmt(log!.checked_in_at!)}
                      </Badge>
                    )}
                    {status === 'out' && (
                      <div className="text-right space-y-1">
                        <Badge
                          className="text-[11px]"
                          style={{ backgroundColor: '#FCEBEB', color: '#791F1F', border: '1px solid #E24B4A' }}
                        >
                          퇴실 {fmt(log!.checked_out_at!)}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground">
                          총 {getDuration(log!.checked_in_at!, log!.checked_out_at!)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-2">
                    <Button
                      disabled={status === 'in' || status === 'out'}
                      onClick={() => handleCheckIn(student)}
                      className="flex-1 text-sm"
                      style={
                        status === 'none'
                          ? { backgroundColor: '#E1F5EE', color: '#085041', borderColor: '#1D9E75', border: '1px solid #1D9E75', padding: '10px 18px' }
                          : { padding: '10px 18px', opacity: 0.4 }
                      }
                      variant="outline"
                    >
                      <LogIn className="w-4 h-4 mr-1" />
                      입실 완료
                    </Button>
                    <Button
                      disabled={status !== 'in'}
                      onClick={() => log && handleCheckOut(log.id, student.name)}
                      className="flex-1 text-sm"
                      style={
                        status === 'in'
                          ? { backgroundColor: '#FCEBEB', color: '#791F1F', borderColor: '#E24B4A', border: '1px solid #E24B4A', padding: '10px 18px' }
                          : { padding: '10px 18px', opacity: 0.4 }
                      }
                      variant="outline"
                    >
                      <LogOut className="w-4 h-4 mr-1" />
                      퇴실 완료
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Over-capacity modal */}
      <Dialog open={overCapacityModal.open} onOpenChange={open => setOverCapacityModal(p => ({ ...p, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              만석 경고
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line pt-2">
              {overCapacityModal.message}
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setOverCapacityModal(p => ({ ...p, open: false }))}>
            확인
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
