import { Component, type ErrorInfo, type ReactNode, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, BookOpen, FileText, Compass, AlertTriangle, GraduationCap, ClipboardCheck, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { SCHOOL_LEVEL_LABELS } from './types';
import { useExamArchiveData } from './useExamArchiveData';
import { SchoolSidebar } from './SchoolSidebar';
import { ScheduleTab } from './ScheduleTab';
import { TextbookTab } from './TextbookTab';
import { ArchiveTab } from './ArchiveTab';
import { GuideTab } from './GuideTab';
import { StudentSubmissionsTab } from './StudentSubmissionsTab';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExamReviewPanel } from '@/components/exam-review/ExamReviewPanel';
import { ExamPrepScheduleManager } from '@/components/ExamPrepScheduleManager';
import { CrossCheckTab } from '@/components/naeshin/CrossCheckTab';

const ARCHIVE_TABS = ['overview', 'submissions', 'review', 'cross-check', 'prep'] as const;
type ArchiveTabValue = (typeof ARCHIVE_TABS)[number];

function normalizeTab(value: string | null): ArchiveTabValue {
  if (value && ARCHIVE_TABS.includes(value as ArchiveTabValue)) {
    return value as ArchiveTabValue;
  }
  return 'overview';
}

class ExamArchiveErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ExamArchive Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <p className="text-sm text-muted-foreground">내신 자료실 로딩 중 오류가 발생했습니다.</p>
          <p className="text-xs text-muted-foreground">{this.state.error?.message}</p>
          <Button variant="outline" size="sm" onClick={() => { this.setState({ hasError: false, error: null }); }}>
            다시 시도
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SchoolExamArchiveNew() {
  return (
    <ExamArchiveErrorBoundary>
      <SchoolExamArchiveInner />
    </ExamArchiveErrorBoundary>
  );
}

function SchoolExamArchiveInner() {
  const { user, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    schools,
    schedules,
    textbooks,
    files,
    archives,
    loading,
    selectedSchool,
    setSelectedSchool,
    refetch,
  } = useExamArchiveData();

  const canViewReview = role === 'admin';
  const canViewPrep = role === 'admin' || role === 'teacher';
  const requestedTab = normalizeTab(searchParams.get('tab'));
  const currentTab = requestedTab === 'review' && !canViewReview
    ? 'overview'
    : requestedTab === 'prep' && !canViewPrep
      ? 'overview'
      : requestedTab;
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);

  const selectedSchoolSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.school_name === selectedSchool),
    [schedules, selectedSchool],
  );

  const selectedSchoolTextbooks = useMemo(
    () => textbooks.filter((textbook) => textbook.school_name === selectedSchool),
    [textbooks, selectedSchool],
  );

  const selectedSchoolArchives = useMemo(
    () => archives.filter((archive) => archive.school_name === selectedSchool),
    [archives, selectedSchool],
  );

  const handleTabChange = (value: string) => {
    const nextTab = normalizeTab(value);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextTab === 'overview') {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', nextTab);
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleAddSchool = async (name: string, level: string) => {
    // Add a placeholder schedule so the school shows up
    const { error } = await supabase.from('school_schedules').insert({
      school_name: name,
      schedule_type: 'other',
      title: '학교 등록',
      created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${name} 추가 완료`);
    setSelectedSchool(name);
    refetch();
  };

  const selectedInfo = schools.find(s => s.name === selectedSchool);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">내신 자료실</h1>
          <p className="text-sm text-muted-foreground mt-0.5">학교별 시험 일정, 교과서, 내신 자료를 통합 관리합니다</p>
        </div>
        {selectedInfo && selectedInfo.nextExam && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">{selectedInfo.name}</span>
            <Badge className={cn(
              "text-xs font-bold px-2 py-0.5",
              selectedInfo.nextExam.daysLeft >= 0 && selectedInfo.nextExam.daysLeft <= 14
                ? "bg-destructive text-destructive-foreground"
                : selectedInfo.nextExam.daysLeft >= 0
                ? "bg-orange-500 text-white"
                : "bg-muted text-muted-foreground"
            )}>
              {selectedInfo.nextExam.daysLeft >= 0
                ? selectedInfo.nextExam.daysLeft === 0 ? 'D-Day' : `D-${selectedInfo.nextExam.daysLeft}`
                : `D+${Math.abs(selectedInfo.nextExam.daysLeft)}`}
            </Badge>
            <span className="text-xs font-medium">{selectedInfo.nextExam.title}</span>
          </div>
        )}
      </div>

      <div className="flex h-[calc(100vh-200px)] bg-background rounded-xl border shadow-sm overflow-hidden">
        {/* Left sidebar */}
        <SchoolSidebar
          schools={schools}
          selectedSchool={selectedSchool}
          onSelectSchool={setSelectedSchool}
          onAddSchool={handleAddSchool}
        />

        {/* Right detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedSchool ? (
            <div className="p-6 space-y-5">
              {/* School header */}
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{selectedSchool}</h2>
                {selectedInfo && (
                  <Badge variant="outline" className="text-xs">
                    {SCHOOL_LEVEL_LABELS[selectedInfo.level] || selectedInfo.level}
                  </Badge>
                )}
                {selectedInfo && selectedInfo.studentCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    담당 학생 {selectedInfo.studentCount}명
                  </span>
                )}
              </div>

              <Tabs value={currentTab} onValueChange={handleTabChange}>
                <TabsList className="grid w-full grid-cols-5 h-10">
                  <TabsTrigger value="overview" className="gap-1.5 text-xs">
                    <CalendarDays className="w-4 h-4" /> 학교/일정
                  </TabsTrigger>
                  <TabsTrigger value="submissions" className="gap-1.5 text-xs">
                    <GraduationCap className="w-4 h-4" /> 학생제출
                  </TabsTrigger>
                  <TabsTrigger value="review" className="gap-1.5 text-xs" disabled={!canViewReview}>
                    <ClipboardCheck className="w-4 h-4" /> 시험지리뷰
                  </TabsTrigger>
                  <TabsTrigger value="cross-check" className="gap-1.5 text-xs">
                    <ListChecks className="w-4 h-4" />
                    크로스체킹
                    <span className="ml-1 rounded-full bg-destructive px-1.5 py-px text-[10px] font-medium text-destructive-foreground">
                      {unconfirmedCount}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="prep" className="gap-1.5 text-xs" disabled={!canViewPrep}>
                    <Compass className="w-4 h-4" /> 내신특강
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-6">
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">시험 일정</h3>
                      <p className="text-sm text-muted-foreground">선택한 학교의 시험 및 학사 일정을 관리합니다.</p>
                    </div>
                    <ScheduleTab
                      schoolName={selectedSchool}
                      schedules={schedules}
                      archives={archives}
                      onRefetch={refetch}
                    />
                  </section>

                  <section className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">교과서 정보</h3>
                      <p className="text-sm text-muted-foreground">학교별 학년·과목 교재 구성을 확인하고 수정합니다.</p>
                    </div>
                    <TextbookTab
                      schoolName={selectedSchool}
                      textbooks={textbooks}
                      onRefetch={refetch}
                    />
                  </section>

                  <section className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">내신 자료</h3>
                      <p className="text-sm text-muted-foreground">시험 범위, 분석, 대비 노트를 학교별로 관리합니다.</p>
                    </div>
                    <ArchiveTab
                      schoolName={selectedSchool}
                      archives={archives}
                      onRefetch={refetch}
                    />
                  </section>

                  <section className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">선생님 가이드</h3>
                      <p className="text-sm text-muted-foreground">선택된 학교 데이터 기반 수업 준비 가이드를 생성합니다.</p>
                    </div>
                    <GuideTab
                      schoolName={selectedSchool}
                      schedules={selectedSchoolSchedules}
                      textbooks={selectedSchoolTextbooks}
                      archives={selectedSchoolArchives}
                    />
                  </section>
                </TabsContent>

                <TabsContent value="submissions" className="mt-4">
                  <StudentSubmissionsTab schoolName={selectedSchool} />
                </TabsContent>

                <TabsContent value="review" className="mt-4">
                  {canViewReview ? <ExamReviewPanel /> : null}
                </TabsContent>

                <TabsContent value="cross-check" className="mt-4">
                  <CrossCheckTab onUnconfirmedCountChange={setUnconfirmedCount} />
                </TabsContent>

                <TabsContent value="prep" className="mt-4">
                  {canViewPrep ? <ExamPrepScheduleManager /> : null}
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <CalendarDays className="w-10 h-10 opacity-30" />
              <p className="text-sm">좌측에서 학교를 선택해주세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
