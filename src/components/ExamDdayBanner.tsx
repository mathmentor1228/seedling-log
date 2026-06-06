import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { GraduationCap } from 'lucide-react';

interface ExamEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
}

interface Props {
  /** For student/parent portal: filter by school name */
  schoolFilter?: string | null;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

function getDday(startDate: string): number {
  const now = new Date();
  const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const target = new Date(startDate + 'T00:00:00+09:00');
  const diffMs = target.getTime() - new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate()).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getDdayLabel(dday: number): string {
  if (dday === 0) return 'D-Day';
  if (dday > 0) return `D-${dday}`;
  return `D+${Math.abs(dday)}`;
}

function getDdayColor(dday: number): string {
  if (dday <= 0) return 'bg-red-500 text-white';
  if (dday <= 3) return 'bg-red-500/90 text-white';
  if (dday <= 7) return 'bg-orange-500 text-white';
  if (dday <= 14) return 'bg-amber-500 text-white';
  return 'bg-blue-500/80 text-white';
}

export function ExamDdayBanner({ schoolFilter, compact = false }: Props) {
  const [exams, setExams] = useState<ExamEvent[]>([]);

  useEffect(() => {
    fetchExams();
  }, [schoolFilter]);

  async function fetchExams() {
    const now = new Date();
    const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const todayStr = `${kstNow.getFullYear()}-${String(kstNow.getMonth() + 1).padStart(2, '0')}-${String(kstNow.getDate()).padStart(2, '0')}`;
    
    // 1) Academy events (school-wide)
    const { data: futureEvents } = await supabase
      .from('academy_events')
      .select('id, title, start_at, end_at')
      .eq('category', 'exam')
      .gte('start_at', todayStr)
      .order('start_at');

    const { data: pastEvents } = await supabase
      .from('academy_events')
      .select('id, title, start_at, end_at')
      .eq('category', 'exam')
      .lt('start_at', todayStr)
      .order('start_at');

    const ongoing = (pastEvents || []).filter((e: any) => {
      const endDate = e.end_at || e.start_at;
      return endDate.split('T')[0] >= todayStr;
    });

    const eventList: ExamEvent[] = [...(futureEvents || [])];
    const allIds = new Set(eventList.map((e) => e.id));
    for (const e of ongoing) if (!allIds.has(e.id)) eventList.push(e as ExamEvent);

    // 2) Per-school exam schedules (covers 기말고사/중간고사 entered per school)
    let schoolList: ExamEvent[] = [];
    {
      let q = supabase
        .from('school_schedules')
        .select('id, title, start_date, end_date, school_name')
        .eq('schedule_type', 'exam')
        .not('start_date', 'is', null)
        .gte('start_date', todayStr)
        .order('start_date');
      if (schoolFilter) q = q.eq('school_name', schoolFilter);
      const { data: schoolExams } = await q;
      // Group by (school + base title) to avoid one row per subject
      const grouped = new Map<string, ExamEvent>();
      for (const s of (schoolExams || []) as any[]) {
        // Strip trailing " - <subject>" so "중간고사 - 수학" collapses to "중간고사"
        const baseTitle = String(s.title || '').replace(/\s*[-–]\s*[^-–]+$/, '').trim() || s.title;
        const key = `${s.school_name}|${baseTitle}|${s.start_date}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: `school-${s.id}`,
            title: `${s.school_name} ${baseTitle}`,
            start_at: s.start_date,
            end_at: s.end_date,
          });
        }
      }
      schoolList = Array.from(grouped.values());
    }

    // 3) school_exam_archives — 학교별 기말/중간고사 (과목별 다중행, school+exam_type+date로 dedupe)
    let archiveList: ExamEvent[] = [];
    {
      let q = supabase
        .from('school_exam_archives')
        .select('id, school_name, exam_type, semester, exam_date_start, exam_date_end')
        .not('exam_date_start', 'is', null)
        .gte('exam_date_start', todayStr)
        .order('exam_date_start');
      if (schoolFilter) q = q.eq('school_name', schoolFilter);
      const { data: archives } = await q;
      const grouped = new Map<string, ExamEvent>();
      for (const a of (archives || []) as any[]) {
        const key = `${a.school_name}|${a.exam_type}|${a.exam_date_start}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: `archive-${a.school_name}-${a.exam_type}-${a.exam_date_start}`,
            title: `${a.school_name} ${a.semester ? a.semester + ' ' : ''}${a.exam_type}`,
            start_at: a.exam_date_start,
            end_at: a.exam_date_end,
          });
        }
      }
      archiveList = Array.from(grouped.values());
    }

    // Filter academy events by school name when schoolFilter set
    const filteredEvents = schoolFilter
      ? eventList.filter((e) => e.title.includes(schoolFilter))
      : eventList;

    // Merge + dedupe by (title + start date)
    const merged: ExamEvent[] = [];
    const seen = new Set<string>();
    for (const e of [...filteredEvents, ...schoolList, ...archiveList]) {
      const key = `${e.title}|${e.start_at.split('T')[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }

    // Show nearest upcoming exams (more entries when no school filter for teacher view)
    merged.sort((a, b) => a.start_at.localeCompare(b.start_at));
    setExams(merged.slice(0, schoolFilter ? 4 : 10));
  }

  if (exams.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {exams.map(exam => {
          const startDate = exam.start_at.split('T')[0];
          const dday = getDday(startDate);
          return (
            <div key={exam.id} className="flex items-center gap-1.5">
              <Badge className={`${getDdayColor(dday)} text-xs font-bold px-2 py-0.5 shadow-sm`}>
                {getDdayLabel(dday)}
              </Badge>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">{exam.title}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">시험 일정</span>
      </div>
      <div className="space-y-1.5">
        {exams.map(exam => {
          const startDate = exam.start_at.split('T')[0];
          const dday = getDday(startDate);
          const d = new Date(startDate + 'T00:00:00');
          const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
          
          return (
            <div key={exam.id} className="flex items-center gap-2">
              <Badge className={`${getDdayColor(dday)} text-xs font-bold px-2.5 py-0.5 shadow-sm min-w-[52px] justify-center`}>
                {getDdayLabel(dday)}
              </Badge>
              <span className="text-sm font-medium text-foreground">{exam.title}</span>
              <span className="text-xs text-muted-foreground ml-auto">{dateLabel}~</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Lightweight version for edge function data (no Supabase client needed) */
export function ExamDdayBannerStatic({ exams }: { exams: Array<{ id: string; title: string; start_at: string; end_at: string | null }> }) {
  if (!exams || exams.length === 0) return null;

  return (
    <div className="rounded-xl border bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-5 h-5 text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-800">시험 일정</span>
      </div>
      <div className="space-y-1.5">
        {exams.map(exam => {
          const startDate = exam.start_at.split('T')[0];
          const dday = getDday(startDate);
          const d = new Date(startDate + 'T00:00:00');
          const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;

          return (
            <div key={exam.id} className="flex items-center gap-2">
              <Badge className={`${getDdayColor(dday)} text-xs font-bold px-2.5 py-0.5 shadow-sm min-w-[52px] justify-center`}>
                {getDdayLabel(dday)}
              </Badge>
              <span className="text-sm font-medium">{exam.title}</span>
              <span className="text-xs text-gray-400 ml-auto">{dateLabel}~</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
