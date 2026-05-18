import { format } from 'date-fns';
import { getTodayKST } from '@/lib/utils';

interface DashboardHeaderProps {
  userName?: string;
  role: string;
}

export function DashboardHeader({ userName, role }: DashboardHeaderProps) {
  const today = getTodayKST();
  const dateObj = new Date(today + 'T00:00:00');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = dateObj.getDay();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return '좋은 아침이에요';
    if (hour < 18) return '좋은 오후에요';
    return '수고하셨어요';
  })();

  const roleLabel = role === 'admin' ? '학원장' : role === 'teacher' ? '선생님' : '';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/15 p-4 sm:p-5">
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.2em] uppercase mb-1">
            {format(dateObj, 'yyyy.MM.dd')} · {dayNames[dayOfWeek]}요일
          </p>
          <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
            {greeting} <span className="inline-block">👋</span>
          </h1>
          {roleLabel && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {roleLabel} 대시보드
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-foreground/80 bg-card/60 backdrop-blur px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-border">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          오늘 {format(dateObj, 'M/d')} ({dayNames[dayOfWeek]})
        </div>
      </div>
    </div>
  );
}
