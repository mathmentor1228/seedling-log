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
  RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

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

export default function StudentDashboard() {
  const { student } = useStudentAuth();
  const [totalPoints, setTotalPoints] = useState(0);
  const [pendingHomework, setPendingHomework] = useState<HomeworkItem[]>([]);
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [vocabSchedules, setVocabSchedules] = useState<VocabSchedule[]>([]);
  const [vocabResults, setVocabResults] = useState<VocabResult[]>([]);
  const [vocabSetting, setVocabSetting] = useState<VocabSetting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (student?.id) {
      fetchDashboardData();
    }
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
        setPendingHomework(data.pending_homework);
        setUpcomingClasses(data.upcoming_classes);
        setVocabSchedules(data.vocab_schedules || []);
        setVocabResults(data.vocab_results || []);
        setVocabSetting(data.vocab_setting || null);
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
      {/* Header */}
      <div className="text-center pt-2">
        <h1 className="text-xl font-bold">
          안녕하세요, {student?.name}님! 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(new Date(), 'M월 d일 EEEE', { locale: ko })}
        </p>
      </div>

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
                  {vocabSchedules.slice(0, 5).map(vs => {
                    const d = new Date(vs.test_date + 'T00:00:00');
                    const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
                    return (
                      <div key={vs.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">{dayLabel}</span>
                          <span className="text-sm">{vs.book_name}</span>
                        </div>
                        <Badge variant={vs.schedule_type === 'retest' ? 'destructive' : vs.schedule_type === 'guerrilla' ? 'outline' : 'secondary'} className="text-[10px]">
                          Day {vs.day_number} {vs.schedule_type === 'retest' ? '재시험' : vs.schedule_type === 'guerrilla' ? '게릴라' : ''}
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

      {/* Pending Homework */}
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
