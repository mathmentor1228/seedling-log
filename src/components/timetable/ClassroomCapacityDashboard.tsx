import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, Building2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Classroom {
  id: string;
  name: string;
  manager_name: string;
  capacity: number;
}

interface ScheduleSlot {
  scheduleId: string;
  classroomId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  studentCount: number;
}

interface ClassroomCapacityDashboardProps {
  classrooms: Classroom[];
  slots: ScheduleSlot[];
  selectedDay: number; // current day of week filter
}

const DAYS_LABEL: Record<number, string> = {
  0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토',
};

export function ClassroomCapacityDashboard({ classrooms, slots, selectedDay }: ClassroomCapacityDashboardProps) {
  // Filter slots for selected day
  const daySlots = useMemo(() => {
    return slots.filter(s => s.dayOfWeek === selectedDay);
  }, [slots, selectedDay]);

  // Get unique time blocks for the day
  const timeBlocks = useMemo(() => {
    const blocks = new Map<string, { start: string; end: string }>();
    daySlots.forEach(s => {
      const key = `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`;
      if (!blocks.has(key)) blocks.set(key, { start: s.startTime.slice(0, 5), end: s.endTime.slice(0, 5) });
    });
    return Array.from(blocks.values()).sort((a, b) => a.start.localeCompare(b.start));
  }, [daySlots]);

  // For each classroom + time block, compute student count
  const roomOccupancy = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}; // roomId -> timeKey -> count
    daySlots.forEach(s => {
      if (!s.classroomId) return;
      const timeKey = `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`;
      if (!map[s.classroomId]) map[s.classroomId] = {};
      map[s.classroomId][timeKey] = (map[s.classroomId][timeKey] || 0) + s.studentCount;
    });
    return map;
  }, [daySlots]);

  // Total current occupancy (max across rooms at any time)
  const totalCurrentStudents = useMemo(() => {
    let maxTotal = 0;
    timeBlocks.forEach(tb => {
      const timeKey = `${tb.start}-${tb.end}`;
      let total = 0;
      classrooms.forEach(room => {
        total += roomOccupancy[room.id]?.[timeKey] || 0;
      });
      maxTotal = Math.max(maxTotal, total);
    });
    return maxTotal;
  }, [timeBlocks, classrooms, roomOccupancy]);

  const totalCapacity = useMemo(() => classrooms.reduce((sum, r) => sum + r.capacity, 0), [classrooms]);

  // Per-room peak occupancy for the day
  const roomPeaks = useMemo(() => {
    const peaks: Record<string, number> = {};
    classrooms.forEach(room => {
      let peak = 0;
      timeBlocks.forEach(tb => {
        const timeKey = `${tb.start}-${tb.end}`;
        peak = Math.max(peak, roomOccupancy[room.id]?.[timeKey] || 0);
      });
      peaks[room.id] = peak;
    });
    return peaks;
  }, [classrooms, timeBlocks, roomOccupancy]);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {DAYS_LABEL[selectedDay]}요일 현황
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-primary">{totalCurrentStudents}</span>
          <span className="text-xs text-muted-foreground">/ {totalCapacity}명</span>
        </div>
        {totalCurrentStudents > totalCapacity && (
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertTriangle className="w-3 h-3" />
            정원 초과
          </Badge>
        )}
      </div>

      {/* Room cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {classrooms.map(room => {
          const peak = roomPeaks[room.id] || 0;
          const pct = room.capacity > 0 ? Math.round((peak / room.capacity) * 100) : 0;
          const isOver = peak > room.capacity;
          const isHigh = pct >= 80 && !isOver;

          return (
            <div
              key={room.id}
              className={cn(
                'p-2.5 rounded-lg border transition-colors',
                isOver ? 'border-destructive/50 bg-destructive/5' :
                isHigh ? 'border-warning/50 bg-warning/5' :
                'border-border bg-card'
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold truncate">{room.name}</span>
                {isOver && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
              </div>
              <div className="text-[10px] text-muted-foreground mb-1 truncate">
                {room.manager_name}
              </div>
              <Progress
                value={Math.min(pct, 100)}
                className={cn(
                  'h-1.5',
                  isOver ? '[&>div]:bg-destructive' :
                  isHigh ? '[&>div]:bg-warning' :
                  '[&>div]:bg-primary'
                )}
              />
              <div className="flex items-center justify-between mt-1">
                <span className={cn(
                  'text-xs font-bold',
                  isOver ? 'text-destructive' : isHigh ? 'text-warning' : 'text-foreground'
                )}>
                  {peak}/{room.capacity}
                </span>
                <span className={cn(
                  'text-[10px]',
                  isOver ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
