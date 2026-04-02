import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, BookOpen, FileText, Compass } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { SCHOOL_LEVEL_LABELS } from './types';
import { useExamArchiveData } from './useExamArchiveData';
import { SchoolSidebar } from './SchoolSidebar';
import { ScheduleTab } from './ScheduleTab';
import { TextbookTab } from './TextbookTab';
import { ArchiveTab } from './ArchiveTab';
import { GuideTab } from './GuideTab';

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
    <div className="flex h-[calc(100vh-120px)] bg-background rounded-lg border overflow-hidden">
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
          <div className="p-5 space-y-4">
            {/* Header */}
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
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="schedule" className="gap-1 text-xs">
                  <CalendarDays className="w-3.5 h-3.5" /> 시험/일정
                </TabsTrigger>
                <TabsTrigger value="textbooks" className="gap-1 text-xs">
                  <BookOpen className="w-3.5 h-3.5" /> 교과서 정보
                </TabsTrigger>
                <TabsTrigger value="archives" className="gap-1 text-xs">
                  <FileText className="w-3.5 h-3.5" /> 내신 자료
                </TabsTrigger>
                <TabsTrigger value="guide" className="gap-1 text-xs">
                  <Compass className="w-3.5 h-3.5" /> 선생님 가이드
                </TabsTrigger>
              </TabsList>

              <TabsContent value="schedule" className="mt-4">
                <ScheduleTab
                  schoolName={selectedSchool}
                  schedules={schedules}
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
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">좌측에서 학교를 선택해주세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
