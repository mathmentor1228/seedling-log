import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VocabSettingsPanel } from '@/components/vocab/VocabSettingsPanel';
import { VocabTestResultsPanel } from '@/components/vocab/VocabTestResultsPanel';
import { VocabScheduleGenerator } from '@/components/vocab/VocabScheduleGenerator';
import { BookOpen, ClipboardList, Settings } from 'lucide-react';

function VocabTestContent() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold">영어 단어 테스트</h1>
        <p className="text-xs text-muted-foreground mt-0.5">학생별 단어 시험 설정, 스케줄 관리, 결과 입력</p>
      </div>

      <Tabs defaultValue="results" className="space-y-4">
        <TabsList>
          <TabsTrigger value="results" className="gap-1.5 text-xs">
            <ClipboardList className="w-3.5 h-3.5" />
            시험 결과
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs">
            <Settings className="w-3.5 h-3.5" />
            학생 설정
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5 text-xs">
            <BookOpen className="w-3.5 h-3.5" />
            스케줄 생성
          </TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <VocabTestResultsPanel />
        </TabsContent>

        <TabsContent value="settings">
          <VocabSettingsPanel />
        </TabsContent>

        <TabsContent value="schedule">
          <VocabScheduleGenerator />
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
