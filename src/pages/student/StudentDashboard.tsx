// STUDENT-APP-V1: Student main dashboard
import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BookOpen, 
  Star, 
  Calendar, 
  ClipboardCheck,
  ChevronRight,
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  WifiOff,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import StudentWeeklyCalendar from '@/components/student/StudentWeeklyCalendar';
import { ExamDdayBanner } from '@/components/ExamDdayBanner';
import { StudentExamPrepSchedule } from '@/components/student/StudentExamPrepSchedule';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface HomeworkItem {
  id: string;
  content: string;
  subject: string;
  assigned_date: string;
  check_status: string;
}

interface UpcomingClass {
  class_name: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface VocabSchedule {
  id: string;
  test_date: string;
  day_number: number;
  book_name: string;
  schedule_type: string;
  test_time: string | null;
}

interface VocabResult {
  id: string;
  test_date: string;
  day_number: number;
  book_name: string;
  score_percent: number | null;
  passed: boolean;
  total_words: number | null;
  correct_words: number | null;
}

interface VocabSetting {
  book_name: string;
  current_day_number: number;
  cutline_percent: number;
  total_days: number | null;
}

interface TestScheduleItem {
  id: string;
  test_date: string;
  test_time: string | null;
  subject: string;
  test_type: string;
  content: string | null;
  notes: string | null;
}

interface SupplementaryLesson {
  id: string;
  lesson_date: string;
  subject: string;
  notes: string | null;
  lesson_range: string;
  submitted: boolean;
  teacher_name: string | null;
}

interface WeeklyReport {
  id: string;
  week_start: string;
  week_end: string;
  total_lessons: number;
  avg_understanding: number | null;
  homework_completion_rate: number | null;
  risk_level: string | null;
  student_message: string | null;
  summary: string | null;
  subject_breakdown: any[] | null;
  generated_at: string;
}

export default function StudentDashboard() {
  const { student } = useStudentAuth();
  const [totalPoints, setTotalPoints] = useState(0);
  const [pendingHomework, setPendingHomework] = useState<HomeworkItem[]>([]);
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [vocabSchedules, setVocabSchedules] = useState<VocabSchedule[]>([]);
  const [vocabResults, setVocabResults] = useState<VocabResult[]>([]);
  const [vocabSetting, setVocabSetting] = useState<VocabSetting | null>(null);
  const [guerrillaAlerts, setGuerrillaAlerts] = useState<VocabSchedule[]>([]);
  const [testSchedules, setTestSchedules] = useState<TestScheduleItem[]>([]);
  const [supplementaryLessons, setSupplementaryLessons] = useState<SupplementaryLesson[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (student?.id) {
      fetchDashboardData();
    }
  }, [student?.id]);

  // Auto-refetch when page becomes visible (sync deleted homework, etc.)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && student?.id) {
        fetchDashboardData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [student?.id]);

  async function fetchDashboardData() {
    if (!student?.id) return;
    
    setIsLoading(true);
    setFetchError(false);
    try {
      const { data, error } = await studentApi.getDashboard();
      
      if (error) {
        console.error('Dashboard fetch error:', error);
        setFetchError(true);
        return;
      }

      if (data) {
        setTotalPoints(data.total_points);
        // Filter out expired, closed, deadline-passed, and '없음' homework
        const filteredHomework = (data.pending_homework || []).filter((hw: any) =>
          hw.check_status === 'unchecked' &&
          !hw.is_expired &&
          !hw.is_submission_closed &&
          !hw.is_deadline_passed &&
          !hw.is_no_homework &&
          hw.content?.trim() !== '없음'
        );
        setPendingHomework(filteredHomework);
        setUpcomingClasses(data.upcoming_classes);
        setVocabSchedules(data.vocab_schedules || []);
        setVocabResults(data.vocab_results || []);
        setVocabSetting(data.vocab_setting || null);
        setGuerrillaAlerts(data.guerrilla_alerts || []);
        setTestSchedules(data.test_schedules || []);
        setSupplementaryLessons(data.supplementary_lessons || []);
      }

      // Fetch weekly reports separately — deduplicate by week_start (keep latest generated_at)
      const { data: reportsData } = await studentApi.getWeeklyReports();
      if (reportsData) {
        const raw = reportsData.reports || [];
        const weekMap = new Map<string, WeeklyReport>();
        for (const r of raw) {
          const existing = weekMap.get(r.week_start);
          if (!existing || new Date(r.generated_at) > new Date(existing.generated_at)) {
            weekMap.set(r.week_start, r);
          }
        }
        setWeeklyReports(Array.from(weekMap.values()).sort((a, b) => b.week_start.localeCompare(a.week_start)));
      }
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }

  const getDayName = (dow: number) => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dow];
  };

  const getSubjectColor = (subject: string) => {
    switch (subject) {
      case '수학': return 'bg-blue-500/10 text-blue-600';
      case '영어': return 'bg-green-500/10 text-green-600';
      case '국어': return 'bg-purple-500/10 text-purple-600';
      case '과학': return 'bg-orange-500/10 text-orange-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-20 animate-fade-in">
        {/* Header skeleton */}
        <div className="text-center pt-2 space-y-2">
          <Skeleton className="h-7 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
        {/* Points card skeleton */}
        <Skeleton className="h-32 w-full rounded-xl" />
        {/* Quick actions skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        {/* Content skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  // Network error state
  if (fetchError && !isLoading) {
    return (
      <div className="space-y-6 pb-20 animate-fade-in">
        <div className="text-center pt-2">
          <h1 className="text-xl font-bold">안녕하세요, {student?.name}님! 👋</h1>
        </div>
        <Card className="border-destructive/30">
          <CardContent className="p-8 text-center space-y-4">
            <WifiOff className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">데이터를 불러올 수 없습니다</p>
              <p className="text-sm text-muted-foreground mt-1">인터넷 연결을 확인해주세요</p>
            </div>
            <Button onClick={fetchDashboardData} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              다시 시도
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Guerrilla / Upcoming Test Alerts */}
      {(() => {
        const guerrillaTestSchedules = testSchedules.filter(ts => ts.test_type === 'guerrilla');
        const allAlerts = [
          ...guerrillaAlerts.map(gt => ({
            id: gt.id,
            test_date: gt.test_date,
            test_time: gt.test_time,
            label: `${gt.book_name} Day ${gt.day_number}`,
          })),
          ...guerrillaTestSchedules.map(ts => ({
            id: ts.id,
            test_date: ts.test_date,
            test_time: ts.test_time,
            label: `[${ts.subject}] ${ts.content || ''}`,
          })),
        ];
        if (allAlerts.length === 0) return null;
        return (
          <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 animate-fade-in">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    시험 예정!
                  </p>
                  {allAlerts.map(a => {
                    const d = new Date(a.test_date + 'T00:00:00');
                    const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`;
                    return (
                      <div key={a.id} className="text-sm text-amber-700 dark:text-amber-400">
                        📌 <span className="font-medium">{dateLabel}</span>
                        {a.test_time && <span> {a.test_time.slice(0, 5)}</span>}
                        {' · '}{a.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Supplementary Lessons (보충수업) Alert */}
      {(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const upcoming = supplementaryLessons.filter(sl => sl.lesson_date >= todayStr);
        if (upcoming.length === 0) return null;
        return (
          <Card className="border-orange-400 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 animate-fade-in">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <p className="font-semibold text-orange-800 dark:text-orange-300">
                    📌 보충수업 예정
                  </p>
                  {upcoming.map(sl => {
                    const d = new Date(sl.lesson_date + 'T00:00:00');
                    const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`;
                    // Extract time from notes if present: [보충 시간: HH:MM]
                    const timeMatch = sl.notes?.match(/\[보충 시간:\s*(\d{1,2}:\d{2})\]/);
                    const timeLabel = timeMatch ? timeMatch[1] : '시간 미정';
                    return (
                      <div key={sl.id} className="text-sm text-orange-700 dark:text-orange-400">
                        <span className="font-medium">{dateLabel}</span>
                        <span className="ml-1">{timeLabel}</span>
                        {' · '}{sl.subject}
                        {sl.lesson_range && <span className="text-xs ml-1">({sl.lesson_range})</span>}
                        {sl.teacher_name && <span className="text-xs text-orange-500 ml-1">- {sl.teacher_name} 선생님</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Header */}
      <div className="text-center pt-2">
        <h1 className="text-xl font-bold">
          안녕하세요, {student?.name}님! 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(new Date(), 'M월 d일 EEEE', { locale: ko })}
        </p>
      </div>

      {/* EXAM-DDAY-V1: Exam D-day countdown (filtered by student's school) */}
      <ExamDdayBanner schoolFilter={student?.school || null} />

      {/* Exam Prep Schedule Confirmation */}
      <StudentExamPrepSchedule />

      {/* Points Card */}
      <Card className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">내 포인트</p>
              <p className="text-3xl font-bold">{totalPoints.toLocaleString()}</p>
            </div>
            <Star className="w-12 h-12 text-white/30" />
          </div>
          <Link to="/student/points">
            <Button 
              variant="secondary" 
              size="sm" 
              className="mt-3 bg-white/20 hover:bg-white/30 text-white border-0"
            >
              포인트 내역 보기
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Weekly Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            이번 주 일정
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StudentWeeklyCalendar
            homework={pendingHomework}
            classes={upcomingClasses}
            vocabSchedules={vocabSchedules}
            testSchedules={testSchedules}
            supplementaryLessons={supplementaryLessons}
          />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/student/homework">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <p className="font-medium text-sm">숙제 제출</p>
              {pendingHomework.length > 0 && (
                <Badge variant="destructive" className="mt-1">
                  {pendingHomework.length}개 대기
                </Badge>
              )}
            </CardContent>
          </Card>
        </Link>
        
        <Link to="/student/schedule">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-2">
                <Calendar className="w-6 h-6 text-secondary-foreground" />
              </div>
              <p className="font-medium text-sm">수업 일정</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Vocab Test Section */}
      {(vocabSchedules.length > 0 || vocabResults.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              영어 단어 시험
              {vocabSetting && (
                <Badge variant="secondary" className="text-[10px] ml-auto font-normal">
                  {vocabSetting.book_name} · 커트라인 {vocabSetting.cutline_percent}%
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vocabSchedules.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">📅 다가오는 시험</p>
                <div className="space-y-1.5">
                  {vocabSchedules.slice(0, 7).map(vs => {
                    const d = new Date(vs.test_date + 'T00:00:00');
                    const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
                    const isGuerrilla = vs.schedule_type === 'guerrilla';
                    const isRetest = vs.schedule_type === 'retest';
                    return (
                      <div key={vs.id} className={`flex items-center justify-between p-2.5 rounded-lg ${isGuerrilla ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800' : 'bg-muted/50'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">{dayLabel}</span>
                          <div>
                            <span className="text-sm">{vs.book_name} Day {vs.day_number}</span>
                            {vs.test_time && (
                              <span className="text-[10px] text-muted-foreground ml-1.5">
                                <Clock className="w-2.5 h-2.5 inline" /> {vs.test_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant={isRetest ? 'destructive' : isGuerrilla ? 'outline' : 'secondary'} 
                          className={`text-[10px] ${isGuerrilla ? 'border-amber-400 text-amber-700 dark:text-amber-400' : ''}`}
                        >
                          {isRetest ? '재시험' : isGuerrilla ? '⚡ 게릴라' : '정규'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {vocabResults.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">📊 최근 결과</p>
                <div className="space-y-1.5">
                  {vocabResults.slice(0, 5).map(vr => (
                    <div key={vr.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        {vr.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                        <span className="text-sm">{vr.book_name} Day {vr.day_number}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {vr.total_words != null && vr.correct_words != null && (
                          <span className="text-xs text-muted-foreground">{vr.correct_words}/{vr.total_words}</span>
                        )}
                        <Badge variant={vr.passed ? 'secondary' : 'destructive'} className="text-[10px] font-mono">
                          {vr.score_percent}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Schedules */}
      {testSchedules.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-5 h-5" />
              다가오는 시험
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {testSchedules.slice(0, 7).map(ts => {
              const d = new Date(ts.test_date + 'T00:00:00');
              const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
              const isGuerrilla = ts.test_type === 'guerrilla';
              return (
                <div key={ts.id} className={`flex items-center justify-between p-2.5 rounded-lg ${isGuerrilla ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800' : 'bg-muted/50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">{dayLabel}</span>
                    <div>
                      <span className="text-sm">{ts.content || ts.subject}</span>
                      {ts.test_time && (
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          <Clock className="w-2.5 h-2.5 inline" /> {ts.test_time.slice(0, 5)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{ts.subject}</Badge>
                    {isGuerrilla && (
                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">
                        ⚡ 게릴라
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {pendingHomework.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              제출할 숙제
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingHomework.map((hw) => (
              <Link 
                key={hw.id} 
                to={`/student/homework/${hw.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge className={getSubjectColor(hw.subject)}>
                    {hw.subject}
                  </Badge>
                  <span className="text-sm line-clamp-1">{hw.content}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            ))}
            
            {pendingHomework.length >= 5 && (
              <Link to="/student/homework">
                <Button variant="ghost" className="w-full mt-2" size="sm">
                  전체 보기
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upcoming Classes */}
      {upcomingClasses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-5 h-5" />
              다가오는 수업
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingClasses.map((cls, idx) => (
              <div 
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {getDayName(cls.day_of_week)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{cls.class_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cls.start_time?.slice(0, 5)} - {cls.end_time?.slice(0, 5)}
                    </p>
                  </div>
                </div>
                <Badge className={getSubjectColor(cls.subject)}>
                  {cls.subject}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Weekly Reports Section */}
      {weeklyReports.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-5 h-5" />
              주간 학습 코멘트
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {weeklyReports.slice(0, 4).map((report) => {
              const weekLabel = `${format(new Date(report.week_start + 'T00:00:00'), 'M/d')}~${format(new Date(report.week_end + 'T00:00:00'), 'M/d')}`;
              const isExpanded = expandedReportId === report.id;
              
              // Parse student_message: remove header line for cleaner display
              const messageLines = (report.student_message || '').split('\n');
              const cleanMessage = messageLines.filter(line => !line.startsWith('[더멘토]')).join('\n').trim();

              return (
                <Collapsible
                  key={report.id}
                  open={isExpanded}
                  onOpenChange={() => setExpandedReportId(isExpanded ? null : report.id)}
                >
                  <CollapsibleTrigger className="w-full text-left">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                          {weekLabel}
                        </span>
                        <span className="text-sm">
                          수업 {report.total_lessons}회
                          {report.avg_understanding != null && (
                            <span className="text-muted-foreground"> · 이해도 {Number(report.avg_understanding).toFixed(1)}</span>
                          )}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-3 mt-1 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {cleanMessage || report.summary || '코멘트가 아직 작성되지 않았습니다.'}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recent Feedback Link */}
      <Link to="/student/feedback">
        <Card className="hover:bg-accent transition-colors cursor-pointer">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">수업 피드백 보기</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
