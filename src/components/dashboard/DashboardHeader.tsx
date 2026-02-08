import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getTodayKST } from '@/lib/utils';
import { Calendar } from 'lucide-react';

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

  const roleLabel = role === 'admin' ? '학원 전체 현황' : role === 'teacher' ? '나의 수업 현황' : '';

  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-xl p-5 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {greeting} 👋
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {roleLabel && <span className="font-medium text-foreground">{roleLabel}</span>}
          {roleLabel && ' · '}
          {format(dateObj, 'yyyy년 M월 d일')} ({dayNames[dayOfWeek]})
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg">
        <Calendar className="w-4 h-4" />
        <span className="font-medium">{format(dateObj, 'M/d')} ({dayNames[dayOfWeek]})</span>
      </div>
    </div>
  );
}
