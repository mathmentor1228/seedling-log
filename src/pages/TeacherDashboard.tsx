import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { cn, getTodayKST } from '@/lib/utils';
import Dashboard from './Dashboard';
import { TeacherAttendanceView } from '@/components/TeacherAttendanceView';
import { PrepLectureProposalsWidget } from '@/components/exam-prep/PrepLectureProposalsWidget';
import { WeeklySummaryWidget } from '@/components/lessons/WeeklySummaryWidget';
import { TeacherTodayBoard } from '@/components/teacher/TeacherTodayBoard';
import { ChevronDown, ChevronRight } from 'lucide-react';

function formatKoreanDay(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString('ko-KR', { weekday: 'long' });
}

/* ------------------------------------------------------------------ */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="text-right hidden sm:block">
      <p className="text-[10px] text-muted-foreground">{now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
      <p className="text-xs font-mono font-bold text-foreground tabular-nums">{now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
const TEACHER_TABS = ['📋 출결 현황', '📊 수업 관리'] as const;

function TeacherSideBySide() {
  const [mobileTab, setMobileTab] = useState<number>(0);
  const [showLegacyWidgets, setShowLegacyWidgets] = useState(false);

  return (
    <div className="space-y-3">
      {/* TEACHER-TODAY-V1: 오늘 업무 중심 상단 */}
      <TeacherTodayBoard />

      <button
        onClick={() => setShowLegacyWidgets((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showLegacyWidgets ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        내신특강 제안 · 주간 요약 위젯
      </button>
      {showLegacyWidgets && (
        <div className="space-y-3">
          <PrepLectureProposalsWidget />
          <WeeklySummaryWidget />
        </div>
      )}
      <div className="flex lg:hidden justify-center gap-2">
        {TEACHER_TABS.map((label, i) => (
          <button
            key={i}
            onClick={() => setMobileTab(i)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
              mobileTab === i
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className={cn("lg:w-[40%] min-w-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto", mobileTab !== 0 && "hidden lg:block")}>
          <Card className="border-primary/20">
            <div className="flex items-center justify-between p-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <h2 className="text-sm font-bold text-foreground">오늘 실시간 출결</h2>
                <span className="text-[10px] text-muted-foreground">
                  {getTodayKST().replace(/-/g, '.')} ({formatKoreanDay(getTodayKST())})
                </span>
              </div>
              <LiveClock />
            </div>
            <CardContent className="pt-0 px-3 pb-4">
              <TeacherAttendanceView />
            </CardContent>
          </Card>
        </div>

        <div className={cn("lg:w-[60%] min-w-0", mobileTab !== 1 && "hidden lg:block")}>
          <Dashboard />
        </div>
      </div>
    </div>
  );
}

export default function TeacherDashboard() {
  return (
    <ProtectedRoute allowedRoles={['teacher']}>
      <TeacherSideBySide />
    </ProtectedRoute>
  );
}
