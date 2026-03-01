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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sidebar-background via-sidebar-background to-sidebar-accent p-6 sm:p-8 shadow-lg">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3 blur-2xl" />
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/3 rounded-full translate-y-1/2 -translate-x-1/4 blur-xl" />
      
      <div className="relative flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
        <div>
          <p className="text-sidebar-foreground/60 text-xs font-medium tracking-widest uppercase mb-1">
            {format(dateObj, 'yyyy년 M월 d일')} ({dayNames[dayOfWeek]})
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-sidebar-foreground tracking-tight">
            {greeting} 👋
          </h1>
          {roleLabel && (
            <p className="text-sidebar-foreground/70 mt-1 text-sm">
              {roleLabel} 대시보드
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sidebar-foreground/80 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-medium">
          <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
          오늘 {format(dateObj, 'M/d')} ({dayNames[dayOfWeek]})
        </div>
      </div>
    </div>
  );
}
