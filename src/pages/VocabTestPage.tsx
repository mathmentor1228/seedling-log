import { useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VocabSettingsPanel } from '@/components/vocab/VocabSettingsPanel';
import { VocabScheduleGenerator } from '@/components/vocab/VocabScheduleGenerator';
import { StudentVocabAssignment } from '@/components/vocab/StudentVocabAssignment';
import { VocabDashboard } from '@/components/vocab/VocabDashboard';
import { VocabTestGenerator } from '@/components/vocab/VocabTestGenerator';
import { TestScheduleManager } from '@/components/TestScheduleManager';
import { VocabTestResultsPanel } from '@/components/vocab/VocabTestResultsPanel';
import { BarChart3, FileText, Shuffle, Printer, FolderOpen, Settings, BookOpen, Languages, CalendarDays, ClipboardList } from 'lucide-react';

function VocabTestContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const generatorTabs = ['edit', 'generate', 'result', 'saved'];
  const isGeneratorTab = generatorTabs.includes(activeTab);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold">단어시험관리</h1>
        <p className="text-xs text-muted-foreground mt-0.5">단어 시험 설정, 스케줄, 결과를 관리합니다</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full overflow-x-auto flex-nowrap whitespace-nowrap scrollbar-hide h-auto gap-1 justify-start">
          <TabsTrigger value="dashboard" className="text-xs shrink-0 gap-1">
            <BarChart3 className="w-3.5 h-3.5" />
            대시보드
          </TabsTrigger>
          <TabsTrigger value="edit" className="text-xs shrink-0 gap-1">
            <FileText className="w-3.5 h-3.5" />
            단어 입력
          </TabsTrigger>
          <TabsTrigger value="generate" className="text-xs shrink-0 gap-1">
            <Shuffle className="w-3.5 h-3.5" />
            시험 출제
          </TabsTrigger>
          <TabsTrigger value="result" className="text-xs shrink-0 gap-1">
            <Printer className="w-3.5 h-3.5" />
            시험지/답지
          </TabsTrigger>
          <TabsTrigger value="saved" className="text-xs shrink-0 gap-1">
            <FolderOpen className="w-3.5 h-3.5" />
            저장된 시험지
          </TabsTrigger>
          <TabsTrigger value="results" className="text-xs shrink-0 gap-1">
            <ClipboardList className="w-3.5 h-3.5" />
            시험 결과
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs shrink-0 gap-1">
            <Settings className="w-3.5 h-3.5" />
            학생 설정
          </TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs shrink-0 gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            스케줄 관리
          </TabsTrigger>
          <TabsTrigger value="vocab-assign" className="text-xs shrink-0 gap-1">
            <Languages className="w-3.5 h-3.5" />
            단어 배정
          </TabsTrigger>
          <TabsTrigger value="test-schedule" className="text-xs shrink-0 gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            시험 일정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <VocabDashboard onTabChange={setActiveTab} />
        </TabsContent>

        {isGeneratorTab && (
          <div className="mt-2">
            <VocabTestGenerator controlledTab={activeTab} onTabChange={setActiveTab} />
          </div>
        )}

        <TabsContent value="results">
          <VocabTestResultsPanel />
        </TabsContent>

        <TabsContent value="settings">
          <VocabSettingsPanel />
        </TabsContent>

        <TabsContent value="schedule">
          <VocabScheduleGenerator />
        </TabsContent>

        <TabsContent value="vocab-assign">
          <StudentVocabAssignment />
        </TabsContent>

        <TabsContent value="test-schedule">
          <TestScheduleManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function VocabTestPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <VocabTestContent />
    </ProtectedRoute>
  );
}
