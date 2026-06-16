import { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users, Clock, Building2, GripVertical, ArrowRight, AlertTriangle } from 'lucide-react';
import { cn, formatStudentGrade } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const DAYS_OF_WEEK = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

interface Classroom {
  id: string;
  name: string;
  manager_name: string;
  capacity: number;
}

interface ScheduleRow {
  scheduleId: string;
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  teacherId: string;
  teacherName: string;
  students: { id: string; name: string }[];
  groupNames?: string[];
  classroomId?: string | null;
  classroomName?: string;
}

const SUBJECT_COLORS: Record<string, string> = {
  '수학': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  '영어': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  '국어': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  '과학': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

interface Props {
  scheduleRows: ScheduleRow[];
  classrooms: Classroom[];
  selectedDay: number;
  onDayChange: (day: number) => void;
  mode: 'timeline' | 'congestion';
  onDataChange: () => void;
}

// Column can be a teacher or a classroom
interface MatrixColumn {
  id: string;
  label: string;
  subLabel: string;
  capacity?: number;
}

export function TimetableMatrixView({ scheduleRows, classrooms, selectedDay, onDayChange, mode, onDataChange }: Props) {
  const { toast } = useToast();
  const [detailPopup, setDetailPopup] = useState<ScheduleRow | null>(null);
  const [dragItem, setDragItem] = useState<ScheduleRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ columnId: string; timeSlot: string } | null>(null);
  const [moving, setMoving] = useState(false);

  // Filter rows for selected day
  const dayRows = useMemo(() => 
    scheduleRows.filter(r => r.dayOfWeek === selectedDay && !r.scheduleId.startsWith('exam-')),
    [scheduleRows, selectedDay]
  );

  // Determine if we should use classroom-based or teacher-based columns
  const hasClassroomAssignments = useMemo(() => 
    dayRows.some(r => r.classroomId), [dayRows]
  );

  // Build columns: use classrooms if assigned, otherwise teachers
  const columns: MatrixColumn[] = useMemo(() => {
    if (hasClassroomAssignments) {
      // Classroom-based: show classrooms that have schedules + unassigned column if needed
      const usedIds = new Set(dayRows.map(r => r.classroomId).filter(Boolean));
      const hasUnassigned = dayRows.some(r => !r.classroomId);
      const cols: MatrixColumn[] = classrooms
        .filter(c => usedIds.has(c.id) || classrooms.length <= 12)
        .map(c => ({
          id: c.id,
          label: c.name,
          subLabel: `${c.manager_name} · 정원 ${c.capacity}`,
          capacity: c.capacity,
        }));
      if (hasUnassigned) {
        cols.push({ id: '__unassigned__', label: '미배정', subLabel: '강의실 미지정' });
      }
      return cols;
    } else {
      // Teacher-based columns
      const teacherMap = new Map<string, { name: string; classroomName?: string; capacity?: number }>();
      dayRows.forEach(r => {
        if (!teacherMap.has(r.teacherId)) {
          const room = r.classroomId ? classrooms.find(c => c.id === r.classroomId) : null;
          teacherMap.set(r.teacherId, {
            name: r.teacherName,
            classroomName: room?.name,
            capacity: room?.capacity,
          });
        }
      });
      return Array.from(teacherMap.entries())
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, info]) => ({
          id,
          label: info.name,
          subLabel: info.classroomName || '',
          capacity: info.capacity,
        }));
    }
  }, [dayRows, classrooms, hasClassroomAssignments]);

  // Build unique time slots from data
  const timeSlots = useMemo(() => {
    const slotSet = new Set<string>();
    dayRows.forEach(r => {
      slotSet.add(`${r.startTime.slice(0, 5)}-${r.endTime.slice(0, 5)}`);
    });
    return Array.from(slotSet).sort();
  }, [dayRows]);

  // Get rows for a specific cell
  const getCellRows = useCallback((columnId: string, timeSlot: string) => {
    const [start, end] = timeSlot.split('-');
    if (hasClassroomAssignments) {
      if (columnId === '__unassigned__') {
        return dayRows.filter(r => !r.classroomId && r.startTime.slice(0, 5) === start && r.endTime.slice(0, 5) === end);
      }
      return dayRows.filter(r => r.classroomId === columnId && r.startTime.slice(0, 5) === start && r.endTime.slice(0, 5) === end);
    } else {
      return dayRows.filter(r => r.teacherId === columnId && r.startTime.slice(0, 5) === start && r.endTime.slice(0, 5) === end);
    }
  }, [dayRows, hasClassroomAssignments]);

  // Get occupancy for a column at a time slot
  const getOccupancy = useCallback((columnId: string, timeSlot: string) => {
    const [start, end] = timeSlot.split('-');
    const col = columns.find(c => c.id === columnId);
    const maxCap = col?.capacity || 0;

    let overlapping: ScheduleRow[];
    if (hasClassroomAssignments) {
      if (columnId === '__unassigned__') {
        overlapping = dayRows.filter(r => !r.classroomId && r.startTime.slice(0, 5) < end && start < r.endTime.slice(0, 5));
      } else {
        overlapping = dayRows.filter(r => r.classroomId === columnId && r.startTime.slice(0, 5) < end && start < r.endTime.slice(0, 5));
      }
    } else {
      overlapping = dayRows.filter(r => r.teacherId === columnId && r.startTime.slice(0, 5) < end && start < r.endTime.slice(0, 5));
    }
    const current = overlapping.reduce((sum, r) => sum + r.students.length, 0);
    return { current, max: maxCap, ratio: maxCap > 0 ? current / maxCap : 0 };
  }, [dayRows, columns, hasClassroomAssignments]);

  // Congestion color
  const getCongestionColor = (ratio: number) => {
    if (ratio === 0) return 'bg-muted/30';
    if (ratio <= 0.5) return 'bg-success/15 dark:bg-success/10';
    if (ratio <= 0.8) return 'bg-warning/20 dark:bg-warning/15';
    return 'bg-destructive/20 dark:bg-destructive/15';
  };

  const getCongestionBorder = (ratio: number) => {
    if (ratio === 0) return '';
    if (ratio <= 0.5) return 'border-success/30';
    if (ratio <= 0.8) return 'border-warning/40';
    return 'border-destructive/50';
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, row: ScheduleRow) => {
    setDragItem(row);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.scheduleId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, columnId: string, timeSlot: string) => {
    e.preventDefault();
    if (!dragItem) return;
    setMoveTarget({ columnId, timeSlot });
  };

  const confirmMove = async () => {
    if (!dragItem || !moveTarget) return;
    setMoving(true);
    try {
      const [newStart, newEnd] = moveTarget.timeSlot.split('-');
      const updates: Record<string, any> = { start_time: newStart, end_time: newEnd };

      if (hasClassroomAssignments && moveTarget.columnId !== '__unassigned__') {
        updates.classroom_id = moveTarget.columnId;
      }

      const { error } = await supabase
        .from('class_schedules')
        .update(updates)
        .eq('id', dragItem.scheduleId);
      
      if (error) throw error;
      toast({ title: '이동 완료', description: `${dragItem.className}이(가) 이동되었습니다` });
      onDataChange();
    } catch (err: any) {
      toast({ title: '오류', description: err.message || '이동에 실패했습니다', variant: 'destructive' });
    } finally {
      setMoving(false);
      setDragItem(null);
      setMoveTarget(null);
    }
  };

  const today = new Date().getDay();

  if (columns.length === 0 && dayRows.length === 0) {
    return (
      <div className="space-y-4">
        <DaySelector days={DAYS_OF_WEEK} selectedDay={selectedDay} onDayChange={onDayChange} today={today} />
        <div className="text-center py-12 text-sm text-muted-foreground">
          {DAYS_OF_WEEK.find(d => d.value === selectedDay)?.label}요일에 등록된 수업이 없습니다
        </div>
      </div>
    );
  }

  const getTargetLabel = () => {
    if (!moveTarget) return '';
    const col = columns.find(c => c.id === moveTarget.columnId);
    return col?.label || '';
  };

  return (
    <div className="space-y-4">
      <DaySelector days={DAYS_OF_WEEK} selectedDay={selectedDay} onDayChange={onDayChange} today={today} />

      {timeSlots.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {DAYS_OF_WEEK.find(d => d.value === selectedDay)?.label}요일에 등록된 수업이 없습니다
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="border-r border-b px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[100px] sticky left-0 bg-muted/50 z-10">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  교시
                </th>
                {columns.map(col => (
                  <th key={col.id} className="border-r border-b px-2 py-2.5 text-center text-xs font-semibold min-w-[130px]">
                    <div>{col.label}</div>
                    {col.subLabel && <div className="text-[10px] text-muted-foreground font-normal">{col.subLabel}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map(slot => (
                <tr key={slot} className="hover:bg-muted/20">
                  <td className="border-r border-b px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                    {slot.replace('-', '\n→ ').split('\n').map((t, i) => (
                      <span key={i} className={i === 1 ? 'text-[10px] block' : ''}>{t}</span>
                    ))}
                  </td>
                  {columns.map(col => {
                    const cellRows = getCellRows(col.id, slot);
                    const occ = getOccupancy(col.id, slot);
                    const isCongestion = mode === 'congestion';

                    return (
                      <td
                        key={col.id}
                        className={cn(
                          'border-r border-b px-1.5 py-1.5 align-top transition-colors min-h-[60px]',
                          isCongestion && occ.max > 0 && getCongestionColor(occ.ratio),
                          isCongestion && occ.ratio > 0 && occ.max > 0 && `border ${getCongestionBorder(occ.ratio)}`,
                          dragItem && 'hover:bg-primary/10'
                        )}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, col.id, slot)}
                      >
                        {cellRows.length > 0 ? (
                          <div className="space-y-1">
                            {cellRows.map(row => (
                              <div
                                key={row.scheduleId}
                                draggable
                                onDragStart={(e) => handleDragStart(e, row)}
                                onClick={() => setDetailPopup(row)}
                                className={cn(
                                  'rounded-md p-1.5 cursor-pointer transition-all',
                                  'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
                                  isCongestion ? 'bg-card/80 border border-border/50' : 'bg-muted/60 border border-border/30',
                                  'group'
                                )}
                              >
                                <div className="flex items-center gap-1 mb-0.5">
                                  <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                  <span className={cn('text-[10px] font-semibold px-1.5 py-0 rounded-full', SUBJECT_COLORS[row.subject] || 'bg-muted text-muted-foreground')}>
                                    {row.subject}
                                  </span>
                                </div>
                                <div className="text-xs font-medium truncate pl-4">{row.className}</div>
                                <div className="text-[10px] text-muted-foreground pl-4">
                                  {row.students.length}명
                                  {isCongestion && occ.max > 0 && (
                                    <span className={cn('ml-1 font-bold', occ.ratio > 1 ? 'text-destructive' : occ.ratio > 0.8 ? 'text-warning' : 'text-success')}>
                                      ({occ.current}/{occ.max})
                                      {occ.ratio > 1 && <AlertTriangle className="w-3 h-3 inline ml-0.5" />}
                                    </span>
                                  )}
                                </div>
                                {/* Show student names in timeline mode */}
                                {mode === 'timeline' && row.students.length > 0 && (
                                  <div className="text-[10px] text-muted-foreground pl-4 mt-0.5 leading-tight">
                                    {row.students.slice(0, 4).map(s => s.name).join(', ')}
                                    {row.students.length > 4 && ` 외 ${row.students.length - 4}명`}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={cn(
                            'h-full min-h-[50px] rounded-md flex items-center justify-center',
                            dragItem && 'border-2 border-dashed border-primary/30'
                          )} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Congestion legend */}
      {mode === 'congestion' && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-success/20 border border-success/30" /> 여유 (≤50%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-warning/25 border border-warning/40" /> 보통 (≤80%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-destructive/25 border border-destructive/50" /> 혼잡 (&gt;80%)
          </span>
        </div>
      )}

      {/* Student detail popup */}
      <Dialog open={!!detailPopup} onOpenChange={(open) => { if (!open) setDetailPopup(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" />
              {detailPopup?.className}
            </DialogTitle>
          </DialogHeader>
          {detailPopup && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <Badge variant="outline" className={cn(SUBJECT_COLORS[detailPopup.subject])}>{detailPopup.subject}</Badge>
                <span>{detailPopup.startTime.slice(0, 5)}–{detailPopup.endTime.slice(0, 5)}</span>
                <span>{detailPopup.teacherName}</span>
                {detailPopup.classroomName && (
                  <span><Building2 className="w-3 h-3 inline mr-0.5" />{detailPopup.classroomName}</span>
                )}
              </div>
              {detailPopup.students.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">학생 명단 ({detailPopup.students.length}명)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {detailPopup.students.map(s => (
                      <span key={s.id} className="text-xs bg-muted px-2 py-1 rounded-md">{s.name}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">배정된 학생이 없습니다</p>
              )}
              {detailPopup.groupNames && detailPopup.groupNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detailPopup.groupNames.map((gn, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{gn}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Move confirmation dialog */}
      <Dialog open={!!moveTarget && !!dragItem} onOpenChange={(open) => { if (!open) { setMoveTarget(null); setDragItem(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">수업 이동 확인</DialogTitle>
          </DialogHeader>
          {dragItem && moveTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <div className="flex-1 p-2 rounded-md bg-muted text-center">
                  <div className="font-medium">{dragItem.className}</div>
                  <div className="text-xs text-muted-foreground">
                    {dragItem.classroomName || dragItem.teacherName} · {dragItem.startTime.slice(0, 5)}-{dragItem.endTime.slice(0, 5)}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 p-2 rounded-md bg-primary/10 text-center border border-primary/20">
                  <div className="font-medium">{getTargetLabel()}</div>
                  <div className="text-xs text-muted-foreground">{moveTarget.timeSlot}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                이 수업에 배정된 모든 학생의 시간표가 함께 변경됩니다.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setMoveTarget(null); setDragItem(null); }}>취소</Button>
                <Button size="sm" onClick={confirmMove} disabled={moving}>
                  {moving ? '이동 중...' : '이동 확인'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Extracted day selector component
function DaySelector({ days, selectedDay, onDayChange, today }: { days: { value: number; label: string }[]; selectedDay: number; onDayChange: (d: number) => void; today: number }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {days.map(d => (
        <button
          key={d.value}
          onClick={() => onDayChange(d.value)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
            selectedDay === d.value
              ? 'bg-primary text-primary-foreground'
              : d.value === today
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
