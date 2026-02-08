import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
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

  return (
    <div className="flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {greeting} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {format(dateObj, 'M월 d일')} ({dayNames[dayOfWeek]})
          {role === 'admin' && ' · 학원 전체 현황'}
          {role === 'teacher' && ' · 나의 수업 현황'}
        </p>
      </div>
      <div className="text-right text-sm text-muted-foreground hidden sm:block">
        {today}
      </div>
    </div>
  );
}
