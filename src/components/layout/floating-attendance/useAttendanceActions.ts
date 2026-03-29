import { supabase } from '@/integrations/supabase/client';

export function useAttendanceActions(
  userId: string | undefined,
  roomCounts: Record<string, number>,
  capacities: Record<string, number>
) {
  const handleCheckIn = async (studentId: string, roomId: string) => {
    const cap = capacities[roomId] ?? 999;
    const currentCount = roomCounts[roomId] ?? 0;
    if (currentCount >= cap) {
      alert('해당 강의실은 만석입니다. 원장과 상의해 주세요.');
      return;
    }
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const { data: existing } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('student_id', studentId)
      .eq('date', today)
      .eq('room_id', roomId)
      .maybeSingle();
    if (existing) {
      await supabase.from('attendance_logs').update({ checked_in_at: now, checked_out_at: null }).eq('id', existing.id);
    } else {
      await supabase.from('attendance_logs').insert({
        student_id: studentId,
        room_id: roomId,
        date: today,
        checked_in_at: now,
        recorded_by: userId!,
      });
    }
  };

  const handleCheckOut = async (logId: string) => {
    await supabase.from('attendance_logs').update({ checked_out_at: new Date().toISOString() }).eq('id', logId);
  };

  const handleCancelCheckIn = async (logId: string) => {
    await supabase.from('attendance_logs').update({ checked_in_at: null, checked_out_at: null }).eq('id', logId);
  };

  const handleCancelCheckOut = async (logId: string) => {
    await supabase.from('attendance_logs').update({ checked_out_at: null }).eq('id', logId);
  };

  return { handleCheckIn, handleCheckOut, handleCancelCheckIn, handleCancelCheckOut };
}
