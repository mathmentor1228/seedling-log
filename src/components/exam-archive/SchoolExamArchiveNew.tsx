import { Component, type ErrorInfo, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, BookOpen, FileText, Compass, AlertTriangle } from 'lucide-react';
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
import { Button } from '@/components/ui/button';

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
  const { user } = useAuth();
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

              {/* Tabs */}
              <Tabs defaultValue="schedule">
                <TabsList className="grid w-full grid-cols-4 h-10">
                  <TabsTrigger value="schedule" className="gap-1.5 text-xs">
                    <CalendarDays className="w-4 h-4" /> 시험/일정
                  </TabsTrigger>
                  <TabsTrigger value="textbooks" className="gap-1.5 text-xs">
                    <BookOpen className="w-4 h-4" /> 교과서 정보
                  </TabsTrigger>
                  <TabsTrigger value="archives" className="gap-1.5 text-xs">
                    <FileText className="w-4 h-4" /> 내신 자료
                  </TabsTrigger>
                  <TabsTrigger value="guide" className="gap-1.5 text-xs">
                    <Compass className="w-4 h-4" /> 선생님 가이드
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="schedule" className="mt-4">
                  <ScheduleTab
                    schoolName={selectedSchool}
                    schedules={schedules}
                    archives={archives}
                    onRefetch={refetch}
                  />
                </TabsContent>

                <TabsContent value="textbooks" className="mt-4">
                  <TextbookTab
                    schoolName={selectedSchool}
                    textbooks={textbooks}
                    onRefetch={refetch}
                  />
                </TabsContent>

                <TabsContent value="archives" className="mt-4">
                  <ArchiveTab
                    schoolName={selectedSchool}
                    archives={archives}
                    onRefetch={refetch}
                  />
                </TabsContent>

                <TabsContent value="guide" className="mt-4">
                  <GuideTab
                    schoolName={selectedSchool}
                    schedules={schedules}
                    textbooks={textbooks}
                    archives={archives}
                  />
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
