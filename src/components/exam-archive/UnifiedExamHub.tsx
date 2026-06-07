import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, CalendarDays, ClipboardList, ArrowRight, BookOpen } from 'lucide-react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getTodayKST, cn } from '@/lib/utils';
import type { Schedule, SchoolInfo } from './types';
import { UnifiedCalendarView } from './UnifiedCalendarView';
import { UnifiedUploadHub } from './UnifiedUploadHub';
import { ExamMaterialsBrowser } from './ExamMaterialsBrowser';

interface Props {
  schools: SchoolInfo[];
  schedules: Schedule[];
  archives: any[];
  onSelectSchool: (name: string) => void;
  onRefetch: () => void;
}

export function UnifiedExamHub({ schools, schedules, archives, onSelectSchool, onRefetch }: Props) {
  const today = parseISO(getTodayKST());
  const knownSchools = useMemo(() => schools.map(s => s.name), [schools]);

  const recentArchives = useMemo(
    () => [...archives].sort((a, b) =>
      (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')
    ).slice(0, 8),
    [archives]
  );

  const upcomingExamSchools = useMemo(
    () => schools
      .filter(s => s.nextExam && s.nextExam.daysLeft >= 0)
      .sort((a, b) => (a.nextExam!.daysLeft - b.nextExam!.daysLeft))
      .slice(0, 6),
    [schools]
  );

  return (
    <div className="space-y-4 p-4">
      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">등록 학교</div>
          <div className="text-xl font-bold">{schools.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">전체 일정</div>
          <div className="text-xl font-bold">{schedules.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">다가오는 시험</div>
          <div className="text-xl font-bold">{upcomingExamSchools.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">시험 자료</div>
          <div className="text-xl font-bold">{archives.length}</div>
        </Card>
      </div>

      {/* Upload hub */}
      <UnifiedUploadHub knownSchools={knownSchools} onComplete={onRefetch} />

      {/* Calendar */}
      <UnifiedCalendarView schedules={schedules} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming exam schools */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" /> 다가오는 시험 학교
          </h3>
          {upcomingExamSchools.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">예정된 시험이 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {upcomingExamSchools.map(s => {
                const d = s.nextExam!.daysLeft;
                return (
                  <button
                    key={s.name}
                    onClick={() => onSelectSchool(s.name)}
                    className="w-full flex items-center gap-2 p-2 rounded border bg-card hover:bg-muted/50 transition text-left"
                  >
                    <Badge className={cn(
                      'text-[10px] font-bold shrink-0',
                      d <= 7 ? 'bg-destructive text-destructive-foreground' :
                      d <= 14 ? 'bg-orange-500 text-white' :
                      d <= 30 ? 'bg-amber-500 text-white' : 'bg-blue-500/80 text-white'
                    )}>
                      {d === 0 ? 'D-Day' : `D-${d}`}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{s.nextExam!.title}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent archives */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" /> 최근 등록된 시험 자료
          </h3>
          {recentArchives.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">등록된 자료가 없습니다</p>
          ) : (
            <ScrollArea className="h-[220px]">
              <div className="space-y-1.5 pr-3">
                {recentArchives.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onSelectSchool(a.school_name)}
                    className="w-full flex items-start gap-2 p-2 rounded border bg-card hover:bg-muted/50 transition text-left"
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">
                        {a.school_name} · {a.subject} {a.exam_type}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {a.semester} · {a.exam_date_start ? format(parseISO(a.exam_date_start), 'M월 d일', { locale: ko }) : '날짜 미정'}
                      </div>
                    </div>
                    {a.status && <Badge variant="outline" className="text-[9px] shrink-0">{a.status}</Badge>}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>
      </div>
    </div>
  );
}
