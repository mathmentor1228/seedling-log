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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(222,47%,17%)] via-[hsl(222,47%,20%)] to-[hsl(217,91%,35%)] p-6 sm:p-7 shadow-elevated">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.04] rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
      <div className="absolute bottom-0 left-16 w-40 h-40 bg-white/[0.06] rounded-full translate-y-1/2 blur-2xl" />
      
      <div className="relative flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
        <div>
          <p className="text-white/50 text-[11px] font-semibold tracking-[0.2em] uppercase mb-1.5">
            {format(dateObj, 'yyyy년 M월 d일')} ({dayNames[dayOfWeek]})
          </p>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {greeting} 👋
          </h1>
          {roleLabel && (
            <p className="text-white/60 mt-1 text-sm font-medium">
              {roleLabel} 대시보드
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-white/80 bg-white/[0.1] backdrop-blur-md px-3 py-2 rounded-lg text-xs font-medium border border-white/[0.08]">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          오늘 {format(dateObj, 'M/d')} ({dayNames[dayOfWeek]})
        </div>
      </div>
    </div>
  );
}
