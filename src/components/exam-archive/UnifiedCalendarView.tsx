import { useMemo, useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar as CalendarIcon, List, School as SchoolIcon } from 'lucide-react';
import { differenceInDays, format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, getDay, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTodayKST, cn } from '@/lib/utils';
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS, type Schedule } from './types';
import {
  classifyCompositeSubject,
  classifyFromTitle,
  SUBJECT_CATEGORY_LABELS,
  SUBJECT_CATEGORY_PRIORITY,
  SUBJECT_CATEGORY_COLORS,
  type SubjectCategory,
} from '@/lib/subjectCategory';
import { ScheduleNotesDialog } from './ScheduleNotesDialog';
import { FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

function categoryOf(s: Schedule): SubjectCategory {
  const fromSubject = s.subject ? classifyCompositeSubject(s.subject) : 'other';
  if (fromSubject !== 'other') return fromSubject;
  return classifyFromTitle(s.title);
}

// Priority sort: math > english > korean > science > others
function sortByCategory(a: Schedule, b: Schedule) {
  return SUBJECT_CATEGORY_PRIORITY[categoryOf(a)] - SUBJECT_CATEGORY_PRIORITY[categoryOf(b)];
}

const SUBJECT_CATS: SubjectCategory[] = ['math', 'english', 'korean', 'science', 'other'];


interface Props {
  schedules: Schedule[];
}

// Deterministic color per school
const PALETTE = [
  'hsl(0 70% 55%)', 'hsl(30 80% 55%)', 'hsl(45 85% 50%)',
  'hsl(140 55% 45%)', 'hsl(190 70% 45%)', 'hsl(220 70% 55%)',
  'hsl(260 60% 60%)', 'hsl(300 55% 55%)', 'hsl(340 70% 55%)',
  'hsl(15 65% 50%)', 'hsl(170 60% 40%)', 'hsl(240 60% 60%)',
];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function ddayBadge(daysLeft: number) {
  if (daysLeft === 0) return { label: 'D-Day', cls: 'bg-destructive text-destructive-foreground' };
  if (daysLeft > 0) {
    if (daysLeft <= 7) return { label: `D-${daysLeft}`, cls: 'bg-destructive/90 text-destructive-foreground' };
    if (daysLeft <= 14) return { label: `D-${daysLeft}`, cls: 'bg-orange-500 text-white' };
    if (daysLeft <= 30) return { label: `D-${daysLeft}`, cls: 'bg-amber-500 text-white' };
    return { label: `D-${daysLeft}`, cls: 'bg-blue-500/80 text-white' };
  }
  return { label: `D+${Math.abs(daysLeft)}`, cls: 'bg-muted text-muted-foreground' };
}

export function UnifiedCalendarView({ schedules }: Props) {
  const today = parseISO(getTodayKST());
  const schools = useMemo(
    () => Array.from(new Set(schedules.map(s => s.school_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [schedules]
  );
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(schools));
  const [enabledCats, setEnabledCats] = useState<Set<SubjectCategory>>(() => new Set(SUBJECT_CATS));
  const [cursor, setCursor] = useState(today);
  const [autoJumped, setAutoJumped] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const openSchedule = (s: Schedule) => { setSelectedSchedule(s); setDialogOpen(true); };

  // sync enabled when schools list grows
  useMemo(() => {
    if (schools.some(s => !enabled.has(s)) && enabled.size === 0) {
      setEnabled(new Set(schools));
    }
  }, [schools, enabled]);

  const filtered = useMemo(
    () => schedules.filter(s => {
      if (!s.start_date) return false;
      if (!enabled.has(s.school_name)) return false;
      // Subject filter applies only to exam entries; 학사일정/행사 등은 항상 표시
      if (s.schedule_type === 'exam') {
        return enabledCats.has(categoryOf(s));
      }
      return true;
    }),
    [schedules, enabled, enabledCats]
  );

  // group by date for month view (priority sort within each day)
  const byDate = useMemo(() => {
    const m = new Map<string, Schedule[]>();
    for (const s of filtered) {
      if (!s.start_date) continue;
      const start = parseISO(s.start_date);
      const end = s.end_date ? parseISO(s.end_date) : start;
      let d = start;
      let guard = 0;
      while (d <= end && guard < 40) {
        const key = format(d, 'yyyy-MM-dd');
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(s);
        d = addDays(d, 1);
        guard++;
      }
    }
    for (const arr of m.values()) arr.sort(sortByCategory);
    return m;
  }, [filtered]);

  // Upcoming timeline (today and future, sorted by date then category priority)
  const upcoming = useMemo(() => {
    const todayStr = getTodayKST();
    return filtered
      .filter(s => (s.start_date || '') >= todayStr)
      .sort((a, b) => {
        const d = (a.start_date || '').localeCompare(b.start_date || '');
        if (d !== 0) return d;
        return sortByCategory(a, b);
      })
      .slice(0, 60);
  }, [filtered]);

  // Auto-jump cursor to the month of the nearest event when current month has none
  useEffect(() => {
    if (autoJumped || filtered.length === 0) return;
    const monthKey = format(cursor, 'yyyy-MM');
    const hasInMonth = filtered.some(s => s.start_date && s.start_date.startsWith(monthKey));
    if (hasInMonth) return;
    const todayStr = getTodayKST();
    const future = filtered.filter(s => s.start_date && s.start_date >= todayStr)
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    const target = future[0] || [...filtered]
      .filter(s => s.start_date)
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0];
    if (target?.start_date) {
      setCursor(parseISO(target.start_date));
      setAutoJumped(true);
    }
  }, [filtered, cursor, autoJumped]);

  // Build month grid
  const monthGrid = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const startWeekday = getDay(first); // 0=Sun
    const cells: { date: Date | null; inMonth: boolean }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: addDays(first, i - startWeekday), inMonth: false });
    const daysInMonth = last.getDate();
    for (let i = 0; i < daysInMonth; i++) cells.push({ date: addDays(first, i), inMonth: true });
    while (cells.length % 7 !== 0) cells.push({ date: addDays(last, cells.length - startWeekday - daysInMonth + 1), inMonth: false });
    return cells;
  }, [cursor]);

  const toggle = (s: string) => {
    const next = new Set(enabled);
    if (next.has(s)) next.delete(s); else next.add(s);
    setEnabled(next);
  };
  const toggleAll = () => {
    if (enabled.size === schools.length) setEnabled(new Set());
    else setEnabled(new Set(schools));
  };
  const toggleCat = (c: SubjectCategory) => {
    const next = new Set(enabledCats);
    if (next.has(c)) next.delete(c); else next.add(c);
    setEnabledCats(next);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">통합 학사일정</h3>
          <Badge variant="outline" className="text-[10px]">{filtered.length}건</Badge>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <SchoolIcon className="w-3.5 h-3.5" /> 학교 필터 ({enabled.size}/{schools.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-medium">학교 표시</span>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={toggleAll}>
                {enabled.size === schools.length ? '전체 해제' : '전체 선택'}
              </Button>
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-1 pr-2">
                {schools.map(s => (
                  <label key={s} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/60 cursor-pointer">
                    <Checkbox checked={enabled.has(s)} onCheckedChange={() => toggle(s)} />
                    <span className="w-2 h-2 rounded-full" style={{ background: colorFor(s) }} />
                    <span className="text-xs">{s}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Subject category filter chips (시험 과목 우선순위) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground mr-1">과목 필터:</span>
        {SUBJECT_CATS.map((c) => {
          const active = enabledCats.has(c);
          return (
            <button
              key={c}
              onClick={() => toggleCat(c)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border transition',
                active ? SUBJECT_CATEGORY_COLORS[c] : 'bg-muted/30 text-muted-foreground border-transparent opacity-60'
              )}
            >
              {SUBJECT_CATEGORY_LABELS[c]}
            </button>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] ml-auto"
          onClick={() => setEnabledCats(enabledCats.size === SUBJECT_CATS.length ? new Set() : new Set(SUBJECT_CATS))}
        >
          {enabledCats.size === SUBJECT_CATS.length ? '전체 해제' : '전체 선택'}
        </Button>
      </div>


      <Tabs defaultValue="month">
        <TabsList className="h-8">
          <TabsTrigger value="month" className="text-xs gap-1.5 h-7"><CalendarIcon className="w-3.5 h-3.5" /> 월별</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs gap-1.5 h-7"><List className="w-3.5 h-3.5" /> 타임라인</TabsTrigger>
        </TabsList>

        <TabsContent value="month" className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCursor(subMonths(cursor, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold">{format(cursor, 'yyyy년 M월', { locale: ko })}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-muted-foreground mb-1">
            {['일','월','화','수','목','금','토'].map(d => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((cell, i) => {
              if (!cell.date) return <div key={i} />;
              const key = format(cell.date, 'yyyy-MM-dd');
              const items = byDate.get(key) || [];
              const isToday = isSameDay(cell.date, today);
              return (
                <Popover key={i}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        'min-h-[68px] rounded-md p-1 text-left border transition hover:border-primary/50',
                        cell.inMonth ? 'bg-card' : 'bg-muted/30 text-muted-foreground/50',
                        isToday && 'border-primary bg-primary/5',
                      )}
                    >
                      <div className={cn('text-[10px] font-semibold mb-0.5', isToday && 'text-primary')}>
                        {format(cell.date, 'd')}
                      </div>
                      <div className="space-y-0.5">
                        {items.slice(0, 3).map((it, idx) => (
                          <div
                            key={idx}
                            className="truncate text-[9px] px-1 py-px rounded text-white"
                            style={{ background: colorFor(it.school_name) }}
                            title={`${it.school_name} · ${it.title}`}
                          >
                            {it.title}
                          </div>
                        ))}
                        {items.length > 3 && (
                          <div className="text-[9px] text-muted-foreground">+{items.length - 3}</div>
                        )}
                      </div>
                    </button>
                  </PopoverTrigger>
                  {items.length > 0 && (
                    <PopoverContent className="w-72 p-3">
                      <div className="text-xs font-semibold mb-2">
                        {format(cell.date, 'yyyy년 M월 d일 (E)', { locale: ko })}
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {items.map((it, idx) => {
                          const cat = categoryOf(it);
                          return (
                          <button
                            key={idx}
                            onClick={() => openSchedule(it)}
                            className="w-full flex items-start gap-2 text-xs p-1.5 rounded bg-muted/40 hover:bg-muted text-left transition"
                          >
                            <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: colorFor(it.school_name) }} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate flex items-center gap-1">
                                {it.title}
                                {Array.isArray((it as any).notes) && (it as any).notes.length > 0 && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 gap-0.5">
                                    <FileText className="w-2.5 h-2.5" />{(it as any).notes.length}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                                <span>{it.school_name}</span>
                                <span>·</span>
                                <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4', SCHEDULE_TYPE_COLORS[it.schedule_type])}>
                                  {SCHEDULE_TYPE_LABELS[it.schedule_type] || it.schedule_type}
                                </Badge>
                                {it.schedule_type === 'exam' && (
                                  <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4', SUBJECT_CATEGORY_COLORS[cat])}>
                                    {SUBJECT_CATEGORY_LABELS[cat]}
                                  </Badge>
                                )}
                                {it.subject && <span className="truncate">· {it.subject}</span>}
                              </div>
                            </div>
                          </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  )}
                </Popover>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-3">
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">다가오는 일정이 없습니다</p>
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <div className="space-y-1.5">
                {upcoming.map((s, idx) => {
                  const d = parseISO(s.start_date!);
                  const days = differenceInDays(d, today);
                  const dd = ddayBadge(days);
                  const cat = categoryOf(s);
                  return (
                    <button
                      key={`${s.id}-${idx}`}
                      onClick={() => openSchedule(s)}
                      className="w-full flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/40 transition text-left"
                    >
                      <Badge className={cn('shrink-0 font-bold text-[10px] px-1.5', dd.cls)}>{dd.label}</Badge>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(s.school_name) }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate flex items-center gap-1">
                          {s.title}
                          {Array.isArray((s as any).notes) && (s as any).notes.length > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 gap-0.5">
                              <FileText className="w-2.5 h-2.5" />{(s as any).notes.length}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(d, 'M월 d일 (E)', { locale: ko })} · {s.school_name}
                          {s.subject && ` · ${s.subject}`}
                          {s.end_date && s.end_date !== s.start_date && ` ~ ${format(parseISO(s.end_date), 'M월 d일', { locale: ko })}`}
                        </div>
                      </div>
                      {s.schedule_type === 'exam' && (
                        <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4 shrink-0', SUBJECT_CATEGORY_COLORS[cat])}>
                          {SUBJECT_CATEGORY_LABELS[cat]}
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4 shrink-0', SCHEDULE_TYPE_COLORS[s.schedule_type])}>
                        {SCHEDULE_TYPE_LABELS[s.schedule_type] || s.schedule_type}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      <ScheduleNotesDialog
        schedule={selectedSchedule}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Card>
  );
}
