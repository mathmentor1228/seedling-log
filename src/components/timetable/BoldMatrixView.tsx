import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users,
  Clock,
  Building2,
  GripVertical,
  ArrowRight,
  AlertTriangle,
  Activity,
  Flame,
  Layers,
  X as XIcon,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

/**
 * BoldMatrixView
 *  - Dark dashboard-style classroom × time matrix view.
 *  - Drop-in alternate to TimetableMatrixView. Same Props.
 *  - Adds: KPI strip, density-aware blocks with student chips,
 *    occupancy bars per column, slide-in detail panel.
 */

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

interface Props {
  scheduleRows: ScheduleRow[];
  classrooms: Classroom[];
  selectedDay: number;
  onDayChange: (day: number) => void;
  mode: 'timeline' | 'congestion';
  onDataChange: () => void;
}

interface MatrixColumn {
  id: string;
  label: string;
  subLabel: string;
  capacity?: number;
}

// Subject accent colors (dark-mode friendly oklch-ish via Tailwind)
const SUBJECT_ACCENT: Record<string, { ring: string; chip: string; bar: string }> = {
  '수학': {
    ring: 'border-l-sky-400 shadow-[inset_3px_0_0_theme(colors.sky.400)]',
    chip: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30',
    bar: 'bg-sky-400',
  },
  '영어': {
    ring: 'border-l-emerald-400 shadow-[inset_3px_0_0_theme(colors.emerald.400)]',
    chip: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30',
    bar: 'bg-emerald-400',
  },
  '국어': {
    ring: 'border-l-violet-400 shadow-[inset_3px_0_0_theme(colors.violet.400)]',
    chip: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30',
    bar: 'bg-violet-400',
  },
  '과학': {
    ring: 'border-l-orange-400 shadow-[inset_3px_0_0_theme(colors.orange.400)]',
    chip: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/30',
    bar: 'bg-orange-400',
  },
};

const getAccent = (subject: string) =>
  SUBJECT_ACCENT[subject] || {
    ring: 'border-l-slate-400 shadow-[inset_3px_0_0_theme(colors.slate.400)]',
    chip: 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/30',
    bar: 'bg-slate-400',
  };

// Convert "HH:MM" -> minutes since midnight
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function BoldMatrixView({
  scheduleRows,
  classrooms,
  selectedDay,
  onDayChange,
  mode,
  onDataChange,
}: Props) {
  const { toast } = useToast();
  const [detailRow, setDetailRow] = useState<ScheduleRow | null>(null);
  const [dragItem, setDragItem] = useState<ScheduleRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ columnId: string; timeSlot: string } | null>(
    null
  );
  const [moving, setMoving] = useState(false);

  // Filter rows for the selected day, exclude exam-prep prefixed entries
  const dayRows = useMemo(
    () =>
      scheduleRows.filter(
        (r) => r.dayOfWeek === selectedDay && !r.scheduleId.startsWith('exam-')
      ),
    [scheduleRows, selectedDay]
  );

  const hasClassroomAssignments = useMemo(
    () => dayRows.some((r) => r.classroomId),
    [dayRows]
  );

  // Build columns: classroom-first, fall back to teacher
  const columns: MatrixColumn[] = useMemo(() => {
    if (hasClassroomAssignments) {
      const usedIds = new Set(dayRows.map((r) => r.classroomId).filter(Boolean));
      const hasUnassigned = dayRows.some((r) => !r.classroomId);
      const cols: MatrixColumn[] = classrooms
        .filter((c) => usedIds.has(c.id) || classrooms.length <= 12)
        .map((c) => ({
          id: c.id,
          label: c.name,
          subLabel: `${c.manager_name} · 정원 ${c.capacity}`,
          capacity: c.capacity,
        }));
      if (hasUnassigned) {
        cols.push({ id: '__unassigned__', label: '미배정', subLabel: '강의실 미지정' });
      }
      return cols;
    }
    const teacherMap = new Map<
      string,
      { name: string; classroomName?: string; capacity?: number }
    >();
    dayRows.forEach((r) => {
      if (!teacherMap.has(r.teacherId)) {
        const room = r.classroomId ? classrooms.find((c) => c.id === r.classroomId) : null;
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
  }, [dayRows, classrooms, hasClassroomAssignments]);

  // Time slots from data
  const timeSlots = useMemo(() => {
    const slotSet = new Set<string>();
    dayRows.forEach((r) => {
      slotSet.add(`${r.startTime.slice(0, 5)}-${r.endTime.slice(0, 5)}`);
    });
    return Array.from(slotSet).sort();
  }, [dayRows]);

  const getCellRows = useCallback(
    (columnId: string, timeSlot: string) => {
      const [start, end] = timeSlot.split('-');
      if (hasClassroomAssignments) {
        if (columnId === '__unassigned__') {
          return dayRows.filter(
            (r) =>
              !r.classroomId &&
              r.startTime.slice(0, 5) === start &&
              r.endTime.slice(0, 5) === end
          );
        }
        return dayRows.filter(
          (r) =>
            r.classroomId === columnId &&
            r.startTime.slice(0, 5) === start &&
            r.endTime.slice(0, 5) === end
        );
      }
      return dayRows.filter(
        (r) =>
          r.teacherId === columnId &&
          r.startTime.slice(0, 5) === start &&
          r.endTime.slice(0, 5) === end
      );
    },
    [dayRows, hasClassroomAssignments]
  );

  const getOccupancy = useCallback(
    (columnId: string, timeSlot: string) => {
      const [start, end] = timeSlot.split('-');
      const col = columns.find((c) => c.id === columnId);
      const maxCap = col?.capacity || 0;
      let overlapping: ScheduleRow[];
      if (hasClassroomAssignments) {
        if (columnId === '__unassigned__') {
          overlapping = dayRows.filter(
            (r) =>
              !r.classroomId &&
              r.startTime.slice(0, 5) < end &&
              start < r.endTime.slice(0, 5)
          );
        } else {
          overlapping = dayRows.filter(
            (r) =>
              r.classroomId === columnId &&
              r.startTime.slice(0, 5) < end &&
              start < r.endTime.slice(0, 5)
          );
        }
      } else {
        overlapping = dayRows.filter(
          (r) =>
            r.teacherId === columnId &&
            r.startTime.slice(0, 5) < end &&
            start < r.endTime.slice(0, 5)
        );
      }
      const current = overlapping.reduce((sum, r) => sum + r.students.length, 0);
      return { current, max: maxCap, ratio: maxCap > 0 ? current / maxCap : 0 };
    },
    [dayRows, columns, hasClassroomAssignments]
  );

  // Per-column daily totals (for header occupancy bar)
  const columnTotals = useMemo(() => {
    const map = new Map<string, { peak: number; classes: number; max: number }>();
    columns.forEach((col) => {
      const colRows =
        col.id === '__unassigned__'
          ? dayRows.filter((r) => !r.classroomId)
          : hasClassroomAssignments
            ? dayRows.filter((r) => r.classroomId === col.id)
            : dayRows.filter((r) => r.teacherId === col.id);
      const peak = colRows.reduce((m, r) => Math.max(m, r.students.length), 0);
      map.set(col.id, { peak, classes: colRows.length, max: col.capacity || 0 });
    });
    return map;
  }, [columns, dayRows, hasClassroomAssignments]);

  // KPI numbers for the strip above the matrix
  const kpis = useMemo(() => {
    const totalClasses = dayRows.length;
    const totalSeated = dayRows.reduce((s, r) => s + r.students.length, 0);
    const totalCap = columns.reduce((s, c) => s + (c.capacity || 0), 0);
    const overs = dayRows.filter((r) => {
      const room = classrooms.find((c) => c.id === r.classroomId);
      return room && r.students.length > room.capacity;
    }).length;
    // Peak hour: max sum(students) across overlapping rows
    let peakLabel = '–';
    let peakLoad = 0;
    timeSlots.forEach((slot) => {
      const [s, e] = slot.split('-');
      const overlapping = dayRows.filter(
        (r) => r.startTime.slice(0, 5) < e && s < r.endTime.slice(0, 5)
      );
      const load = overlapping.reduce((sum, r) => sum + r.students.length, 0);
      if (load > peakLoad) {
        peakLoad = load;
        peakLabel = `${s}–${e}`;
      }
    });
    return { totalClasses, totalSeated, totalCap, overs, peakLabel, peakLoad };
  }, [dayRows, columns, classrooms, timeSlots]);

  // Drag handlers (parity with TimetableMatrixView)
  const handleDragStart = (e: React.DragEvent, row: ScheduleRow) => {
    setDragItem(row);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.scheduleId);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent, columnId: string, timeSlot: string) => {
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
      toast({
        title: '오류',
        description: err.message || '이동에 실패했습니다',
        variant: 'destructive',
      });
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
        <DaySelector
          days={DAYS_OF_WEEK}
          selectedDay={selectedDay}
          onDayChange={onDayChange}
          today={today}
        />
        <div className="rounded-xl border border-border/40 bg-muted/10 py-16 text-center text-sm text-muted-foreground">
          {DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.label}요일에 등록된 수업이 없습니다
        </div>
      </div>
    );
  }

  const getTargetLabel = () => {
    if (!moveTarget) return '';
    const col = columns.find((c) => c.id === moveTarget.columnId);
    return col?.label || '';
  };

  return (
    <div className="space-y-4">
      {/* ── KPI strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KPI
          icon={<Layers className="h-3.5 w-3.5" />}
          label="오늘 수업"
          value={kpis.totalClasses}
          unit="개"
        />
        <KPI
          icon={<Users className="h-3.5 w-3.5" />}
          label="배정 인원"
          value={kpis.totalSeated}
          unit={`/ ${kpis.totalCap || '–'}`}
          ratio={kpis.totalCap ? kpis.totalSeated / kpis.totalCap : 0}
        />
        <KPI
          icon={<Flame className="h-3.5 w-3.5" />}
          label="피크 시간"
          value={kpis.peakLabel}
          unit={`${kpis.peakLoad}명`}
          mono
        />
        <KPI
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="정원 초과"
          value={kpis.overs}
          unit="건"
          danger={kpis.overs > 0}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DaySelector
          days={DAYS_OF_WEEK}
          selectedDay={selectedDay}
          onDayChange={onDayChange}
          today={today}
        />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          <span>드래그로 이동 · 클릭해 편집</span>
        </div>
      </div>

      {dayRows.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-muted/10 py-16 text-center text-sm text-muted-foreground">
          이 요일에 등록된 수업이 없습니다
        </div>
      ) : (
        <ContinuousTimeGrid
          columns={columns}
          dayRows={dayRows}
          classrooms={classrooms}
          columnTotals={columnTotals}
          mode={mode}
          dragItem={dragItem}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          hasClassroomAssignments={hasClassroomAssignments}
          onSelect={setDetailRow}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">혼잡도</span>
        <Swatch color="bg-sky-400" label="여유" />
        <Swatch color="bg-emerald-400" label="적정" />
        <Swatch color="bg-amber-400" label="주의" />
        <Swatch color="bg-rose-500" label="초과" />
      </div>

      {/* ── Detail dialog ────────────────────────────────────── */}
      <Dialog
        open={!!detailRow}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {detailRow && (
                <span
                  className={cn(
                    'rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider',
                    getAccent(detailRow.subject).chip
                  )}
                >
                  {detailRow.subject}
                </span>
              )}
              {detailRow?.className}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="시간" value={`${detailRow.startTime.slice(0, 5)}–${detailRow.endTime.slice(0, 5)}`} mono />
                <Stat label="담당" value={detailRow.teacherName} />
                <Stat
                  label="강의실"
                  value={detailRow.classroomName || '미배정'}
                />
                <Stat
                  label="정원"
                  value={`${detailRow.students.length}/${
                    classrooms.find((c) => c.id === detailRow.classroomId)?.capacity ?? '–'
                  }`}
                  mono
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-foreground">
                    학생 ({detailRow.students.length})
                  </div>
                  <div className="inline-flex rounded-md border border-border/60 bg-muted/40 p-0.5 text-[10px]">
                    <button className="rounded-sm bg-primary/15 px-2 py-0.5 font-semibold text-primary">
                      개별
                    </button>
                    <button className="rounded-sm px-2 py-0.5 font-semibold text-muted-foreground hover:text-foreground">
                      그룹
                    </button>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="학생 검색해 추가…"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" variant="secondary" className="h-8 px-3">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {detailRow.groupNames && detailRow.groupNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    <span>그룹:</span>
                    {detailRow.groupNames.map((gn, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-border/60 bg-muted/30 px-1.5 py-px"
                      >
                        {gn}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {detailRow.students.length === 0 ? (
                    <div className="text-xs italic text-muted-foreground">
                      배정된 학생이 없습니다
                    </div>
                  ) : (
                    detailRow.students.map((st) => (
                      <span
                        key={st.id}
                        className="group inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs ring-1 ring-border/50"
                      >
                        {st.name}
                        <button className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100">
                          <XIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border/40 pt-3">
                <Button size="sm" variant="outline">
                  복제
                </Button>
                <Button size="sm" variant="outline">
                  강의실 변경
                </Button>
                <Button size="sm">저장</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Move confirmation dialog ─────────────────────────── */}
      <Dialog
        open={!!moveTarget && !!dragItem}
        onOpenChange={(open) => {
          if (!open) {
            setMoveTarget(null);
            setDragItem(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">수업 이동 확인</DialogTitle>
          </DialogHeader>
          {dragItem && moveTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <div className="flex-1 rounded-md bg-muted/40 p-2 text-center">
                  <div className="font-medium">{dragItem.className}</div>
                  <div className="text-xs text-muted-foreground">
                    {dragItem.classroomName || dragItem.teacherName} ·{' '}
                    {dragItem.startTime.slice(0, 5)}-{dragItem.endTime.slice(0, 5)}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 rounded-md border border-primary/30 bg-primary/10 p-2 text-center">
                  <div className="font-medium">{getTargetLabel()}</div>
                  <div className="text-xs text-muted-foreground">{moveTarget.timeSlot}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                이 수업에 배정된 모든 학생의 시간표가 함께 변경됩니다.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMoveTarget(null);
                    setDragItem(null);
                  }}
                >
                  취소
                </Button>
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

// ───── small helpers ───────────────────────────────────────────────────────

function DaySelector({
  days,
  selectedDay,
  onDayChange,
  today,
}: {
  days: { value: number; label: string }[];
  selectedDay: number;
  onDayChange: (d: number) => void;
  today: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d) => (
        <button
          key={d.value}
          onClick={() => onDayChange(d.value)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            selectedDay === d.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : d.value === today
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {d.label}
          {d.value === today && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  unit,
  ratio,
  mono,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  ratio?: number;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/40 bg-card/70 p-2.5',
        danger && 'border-rose-400/40 bg-rose-500/5'
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-xl font-bold tabular-nums',
            mono && 'font-mono',
            danger && 'text-rose-400'
          )}
        >
          {value}
        </span>
        {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
      </div>
      {ratio !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
          <div
            className={cn(
              'h-full transition-all',
              ratio > 1
                ? 'bg-rose-500'
                : ratio > 0.8
                  ? 'bg-amber-400'
                  : ratio > 0.5
                    ? 'bg-emerald-400'
                    : 'bg-sky-400'
            )}
            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/30 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold', mono && 'font-mono')}>{value}</div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}

// ───── Continuous time-axis grid (Google Calendar style) ──────────────────

const HOUR_HEIGHT = 80; // px per hour
const DEFAULT_START_HOUR = 14;
const DEFAULT_END_HOUR = 23;

interface GridProps {
  columns: MatrixColumn[];
  dayRows: ScheduleRow[];
  classrooms: Classroom[];
  columnTotals: Map<string, { peak: number; classes: number; max: number }>;
  mode: 'timeline' | 'congestion';
  dragItem: ScheduleRow | null;
  hasClassroomAssignments: boolean;
  onDragStart: (e: React.DragEvent, row: ScheduleRow) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, columnId: string, timeSlot: string) => void;
  onSelect: (row: ScheduleRow) => void;
}

function ContinuousTimeGrid({
  columns,
  dayRows,
  classrooms,
  columnTotals,
  mode,
  dragItem,
  hasClassroomAssignments,
  onDragStart,
  onDragOver,
  onDrop,
  onSelect,
}: GridProps) {
  // Compute hour range from data
  const { startHour, endHour } = useMemo(() => {
    if (dayRows.length === 0) return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    let minStart = Infinity;
    let maxEnd = -Infinity;
    dayRows.forEach((r) => {
      minStart = Math.min(minStart, toMin(r.startTime.slice(0, 5)));
      maxEnd = Math.max(maxEnd, toMin(r.endTime.slice(0, 5)));
    });
    const sH = Math.min(DEFAULT_START_HOUR, Math.floor(minStart / 60));
    const eH = Math.max(DEFAULT_END_HOUR, Math.ceil(maxEnd / 60));
    return { startHour: sH, endHour: eH };
  }, [dayRows]);

  const totalHours = endHour - startHour;
  const totalHeight = totalHours * HOUR_HEIGHT;
  const hours = useMemo(
    () => Array.from({ length: totalHours + 1 }, (_, i) => startHour + i),
    [startHour, totalHours]
  );
  const halfHours = useMemo(
    () => Array.from({ length: totalHours }, (_, i) => i),
    [totalHours]
  );

  // Current time indicator (only if within range)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const gridStartMin = startHour * 60;
  const gridEndMin = endHour * 60;
  const showNowLine = nowMin >= gridStartMin && nowMin <= gridEndMin;
  const nowTop = ((nowMin - gridStartMin) / 60) * HOUR_HEIGHT;

  // Build per-column classes with overlap layout
  const columnBlocks = useMemo(() => {
    const map = new Map<string, Array<ScheduleRow & { _lane: number; _lanes: number }>>();
    columns.forEach((col) => {
      const colRows = dayRows.filter((r) => {
        if (col.id === '__unassigned__') return !r.classroomId;
        return hasClassroomAssignments ? r.classroomId === col.id : r.teacherId === col.id;
      });
      // Sort by start
      const sorted = [...colRows].sort(
        (a, b) => toMin(a.startTime.slice(0, 5)) - toMin(b.startTime.slice(0, 5))
      );
      // Lane assignment via greedy
      const laneEnd: number[] = [];
      const assigned = sorted.map((r) => {
        const s = toMin(r.startTime.slice(0, 5));
        const e = toMin(r.endTime.slice(0, 5));
        let lane = laneEnd.findIndex((end) => end <= s);
        if (lane === -1) {
          lane = laneEnd.length;
          laneEnd.push(e);
        } else {
          laneEnd[lane] = e;
        }
        return { ...r, _lane: lane, _lanes: 0 };
      });
      // Compute lane count per overlap cluster
      const lanes = laneEnd.length || 1;
      assigned.forEach((a) => (a._lanes = lanes));
      map.set(col.id, assigned);
    });
    return map;
  }, [columns, dayRows, hasClassroomAssignments]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card/50">
      <div
        className="grid min-w-[960px]"
        style={{
          gridTemplateColumns: `90px repeat(${columns.length}, minmax(180px, 1fr))`,
        }}
      >
        {/* Header row: time corner + classroom headers */}
        <div className="sticky top-0 left-0 z-30 border-b border-r border-border/40 bg-muted/40 px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="mr-1 inline h-3.5 w-3.5" /> 시간
        </div>
        {columns.map((col) => {
          const total = columnTotals.get(col.id);
          const peak = total?.peak || 0;
          const max = col.capacity || 0;
          const ratio = max > 0 ? Math.min(peak / max, 1.4) : 0;
          return (
            <div
              key={`h-${col.id}`}
              className="border-b border-r border-border/40 bg-muted/20 px-3 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{col.label}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {peak}/{max || '–'}
                </div>
              </div>
              {col.subLabel && (
                <div className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground">
                  {col.subLabel}
                </div>
              )}
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/60">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    ratio > 1
                      ? 'bg-rose-500'
                      : ratio > 0.8
                        ? 'bg-amber-400'
                        : ratio > 0.5
                          ? 'bg-emerald-400'
                          : 'bg-sky-400'
                  )}
                  style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                />
              </div>
            </div>
          );
        })}

        {/* Time labels column */}
        <div
          className="sticky left-0 z-20 border-r border-border/40 bg-card"
          style={{ height: totalHeight }}
        >
          <div className="relative h-full">
            {hours.slice(0, -1).map((h, i) => (
              <div
                key={h}
                className="absolute left-0 right-0 px-2 pt-1 text-right font-mono text-[11px] font-semibold text-muted-foreground"
                style={{ top: i * HOUR_HEIGHT }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {/* Classroom columns */}
        {columns.map((col) => {
          const blocks = columnBlocks.get(col.id) || [];
          return (
            <div
              key={`c-${col.id}`}
              className="relative border-r border-border/40"
              style={{ height: totalHeight }}
              onDragOver={onDragOver}
              onDrop={(e) => {
                // snap to nearest 30-min slot for the dropped class
                if (!dragItem) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const minutesFromStart = Math.max(
                  0,
                  Math.round((y / HOUR_HEIGHT) * 60 / 30) * 30
                );
                const newStartMin = gridStartMin + minutesFromStart;
                const dur =
                  toMin(dragItem.endTime.slice(0, 5)) - toMin(dragItem.startTime.slice(0, 5));
                const newEndMin = newStartMin + dur;
                const fmt = (m: number) =>
                  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
                onDrop(e, col.id, `${fmt(newStartMin)}-${fmt(newEndMin)}`);
              }}
            >
              {/* Hour grid lines */}
              {hours.map((_, i) => (
                <div
                  key={`hl-${i}`}
                  className="pointer-events-none absolute left-0 right-0 border-t border-border/40"
                  style={{ top: i * HOUR_HEIGHT }}
                />
              ))}
              {/* Half-hour dashed lines */}
              {halfHours.map((i) => (
                <div
                  key={`hh-${i}`}
                  className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-border/20"
                  style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                />
              ))}
              {/* Now line */}
              {showNowLine && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-rose-500"
                  style={{ top: nowTop }}
                >
                  <span className="absolute -top-1.5 -left-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
                </div>
              )}
              {/* Class blocks */}
              {blocks.map((row) => {
                const accent = getAccent(row.subject);
                const sMin = toMin(row.startTime.slice(0, 5));
                const eMin = toMin(row.endTime.slice(0, 5));
                const top = ((sMin - gridStartMin) / 60) * HOUR_HEIGHT;
                const height = Math.max(28, ((eMin - sMin) / 60) * HOUR_HEIGHT - 2);
                const widthPct = 100 / row._lanes;
                const leftPct = widthPct * row._lane;
                const room = row.classroomId
                  ? classrooms.find((c) => c.id === row.classroomId)
                  : null;
                const isOver = !!room && row.students.length > room.capacity;
                const dense = height < 60;
                return (
                  <button
                    key={row.scheduleId}
                    draggable
                    onDragStart={(e) => onDragStart(e, row)}
                    onClick={() => onSelect(row)}
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                    className={cn(
                      'group absolute z-[1] flex flex-col gap-1 overflow-hidden rounded-md border-l-[3px] bg-card/95 px-2 py-1.5 text-left shadow-sm transition-all',
                      'hover:z-[2] hover:shadow-md hover:ring-1 hover:ring-primary/40',
                      accent.ring,
                      isOver && 'bg-rose-500/10 ring-1 ring-rose-400/40'
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className={cn(
                          'whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          accent.chip
                        )}
                      >
                        {row.subject}
                      </span>
                      <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                        {row.startTime.slice(0, 5)}–{row.endTime.slice(0, 5)}
                      </span>
                      <span
                        className={cn(
                          'ml-auto whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
                          isOver
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'bg-muted/60 text-muted-foreground'
                        )}
                      >
                        {row.students.length}/{room?.capacity ?? '–'}
                      </span>
                    </div>
                    {!dense && (
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            accent.chip
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', accent.bar)} />
                          {row.teacherName}
                        </span>
                        {row.students.slice(0, height > 100 ? 6 : 3).map((st) => (
                          <span
                            key={st.id}
                            className="whitespace-nowrap rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-foreground/80 ring-1 ring-border/50"
                          >
                            {st.name}
                          </span>
                        ))}
                        {row.students.length > (height > 100 ? 6 : 3) && (
                          <span className="px-1 font-mono text-[10px] font-bold text-primary">
                            +{row.students.length - (height > 100 ? 6 : 3)}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
