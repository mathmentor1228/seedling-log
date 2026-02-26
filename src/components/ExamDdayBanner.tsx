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
    
    // Fetch exam events starting within 30 days from today (or currently ongoing)
    const thirtyDaysLater = new Date(kstNow);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const futureStr = `${thirtyDaysLater.getFullYear()}-${String(thirtyDaysLater.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysLater.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('academy_events')
      .select('id, title, start_at, end_at')
      .eq('category', 'exam')
      .lte('start_at', futureStr + 'T23:59:59')
      .order('start_at');

    if (error || !data) return;

    // Filter: only exams that haven't fully ended yet
    const filtered = data.filter((e: any) => {
      const endDate = e.end_at || e.start_at;
      const endStr = endDate.split('T')[0];
      return endStr >= todayStr;
    });

    // If schoolFilter is set, only show exams whose title contains the school name
    const finalExams = schoolFilter
      ? filtered.filter((e: any) => e.title.includes(schoolFilter))
      : filtered;

    setExams(finalExams);
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
