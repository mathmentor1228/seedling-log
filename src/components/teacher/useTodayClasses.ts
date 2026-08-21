// TEACHER-TODAY-V1
// 교사 홈 '오늘 수업' 카드용 읽기 전용 로더.
// 어떤 write도 하지 않는다. 기존 테이블만 조회한다.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';

export type ClassCardState = 'before' | 'ongoing' | 'needs_close' | 'closed';

export interface TodayClassCard {
  scheduleId: string;
  classId: string;
  className: string;
  subject: string;
  startTime: string;
  endTime: string;
  classroomName: string | null;
  studentCount: number;
  checkedInCount: number;
  recordedCount: number;
  submittedCount: number;
  state: ClassCardState;
}

export interface TodayClassesData {
  cards: TodayClassCard[];
  missedCount: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function nowHHMM(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return parts;
}

function kstDayOfWeek(dateStr: string): number {
  // dateStr = YYYY-MM-DD (KST 기준 날짜)
  return new Date(`${dateStr}T00:00:00+09:00`).getUTCDay() === 0
    ? new Date(`${dateStr}T12:00:00+09:00`).getUTCDay()
    : new Date(`${dateStr}T12:00:00+09:00`).getUTCDay();
}

export function useTodayClasses(teacherId: string, date?: string): TodayClassesData {
  const targetDate = date || getTodayKST();
  const [cards, setCards] = useState<TodayClassCard[]>([]);
  const [missedCount, setMissedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!teacherId) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const dow = kstDayOfWeek(targetDate);
        const { data: schedules, error: schedErr } = await supabase
          .from('class_schedules')
          .select('id, start_time, end_time, class_id, classes(name, subject), classrooms(name)')
          .eq('teacher_id', teacherId)
          .eq('day_of_week', dow)
          .eq('is_active', true)
          .order('start_time');
        if (schedErr) throw schedErr;

        const rows = schedules || [];
        const classIds = [...new Set(rows.map((r: any) => r.class_id).filter(Boolean))];

        let csRows: { student_id: string; class_id: string }[] = [];
        let studentIds: string[] = [];
        if (classIds.length > 0) {
          const { data: cs } = await supabase
            .from('class_students')
            .select('student_id, class_id')
            .in('class_id', classIds);
          csRows = cs || [];
          studentIds = [...new Set(csRows.map((r) => r.student_id))];
        }

        // 퇴원 학생 제외
        let activeIds = new Set<string>();
        if (studentIds.length > 0) {
          const { data: st } = await supabase
            .from('students')
            .select('id')
            .in('id', studentIds)
            .neq('enrollment_status', '퇴원');
          activeIds = new Set((st || []).map((s: any) => s.id));
        }

        const [logsRes, recRes, missedRes] = await Promise.all([
          studentIds.length > 0
            ? supabase
                .from('attendance_logs')
                .select('student_id, checked_in_at')
                .in('student_id', studentIds)
                .eq('date', targetDate)
            : Promise.resolve({ data: [] as any[] }),
          studentIds.length > 0
            ? supabase
                .from('lesson_records')
                .select('student_id, class_id, submitted, attendance_status')
                .in('student_id', studentIds)
                .eq('lesson_date', targetDate)
            : Promise.resolve({ data: [] as any[] }),
          supabase
            .from('lesson_records')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacherId)
            .eq('submitted', false)
            .lt('lesson_date', targetDate)
            .gte('lesson_date', new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)),
        ]);

        const checkedIn = new Set(
          (logsRes.data || []).filter((l: any) => l.checked_in_at).map((l: any) => l.student_id)
        );
        const recMap = new Map<string, { submitted: boolean }>();
        (recRes.data || []).forEach((r: any) => {
          recMap.set(`${r.student_id}:${r.class_id || 'null'}`, { submitted: !!r.submitted });
        });

        const now = nowHHMM();
        const isToday = targetDate === getTodayKST();

        const built: TodayClassCard[] = rows.map((r: any) => {
          const memberIds = csRows
            .filter((c) => c.class_id === r.class_id)
            .map((c) => c.student_id)
            .filter((id) => activeIds.has(id));
          const startTime = (r.start_time || '').slice(0, 5);
          const endTime = (r.end_time || '').slice(0, 5);
          const recorded = memberIds.filter((id) => recMap.has(`${id}:${r.class_id}`)).length;
          const submitted = memberIds.filter(
            (id) => recMap.get(`${id}:${r.class_id}`)?.submitted
          ).length;

          let state: ClassCardState;
          if (memberIds.length > 0 && submitted >= memberIds.length) state = 'closed';
          else if (!isToday) state = 'needs_close';
          else if (now < startTime) state = 'before';
          else if (now <= endTime) state = 'ongoing';
          else state = 'needs_close';

          return {
            scheduleId: r.id,
            classId: r.class_id,
            className: r.classes?.name || '이름 없는 반',
            subject: r.classes?.subject || '',
            startTime,
            endTime,
            classroomName: r.classrooms?.name || null,
            studentCount: memberIds.length,
            checkedInCount: memberIds.filter((id) => checkedIn.has(id)).length,
            recordedCount: recorded,
            submittedCount: submitted,
            state,
          };
        });

        if (cancelled) return;
        setCards(built);
        setMissedCount((missedRes as any).count || 0);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '불러오기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teacherId, targetDate, tick]);

  return { cards, missedCount, loading, error, reload };
}
