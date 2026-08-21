import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/card';
import { cn, getTodayKST } from '@/lib/utils';
import Dashboard from './Dashboard';
import { TeacherAttendanceView } from '@/components/TeacherAttendanceView';
import { PrepLectureProposalsWidget } from '@/components/exam-prep/PrepLectureProposalsWidget';
import { WeeklySummaryWidget } from '@/components/lessons/WeeklySummaryWidget';
import { TeacherTodayBoard } from '@/components/teacher/TeacherTodayBoard';
import { TeamNotesBoard } from '@/components/TeamNotesBoard';
import { AcademyCalendar } from '@/components/AcademyCalendar';
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
const TEACHER_TABS = ['📋 출결 현황', '📊 수업 기록 조회'] as const;

function TeacherSideBySide() {
  const [mobileTab, setMobileTab] = useState<number>(0);
  const [showSecondary, setShowSecondary] = useState(false);

  return (
    <div className="space-y-3">
      {/* TEACHER-PRIORITY-V1: 1) 선택한 수업일 마감 */}
      <TeacherTodayBoard />

      {/* 2) 오늘 실시간 출결 + 수업 기록 */}
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

      {/* 3) 보조 업무 (기본 접힘) */}
      <div className="pt-1">
        <button
          onClick={() => setShowSecondary((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={showSecondary}
        >
          {showSecondary ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          메모 · 일정 보기 (내신특강 제안 · 주간 요약 포함)
        </button>
        {showSecondary && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <TeamNotesBoard />
              <AcademyCalendar />
            </div>
            <PrepLectureProposalsWidget />
            <WeeklySummaryWidget />
          </div>
        )}
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
