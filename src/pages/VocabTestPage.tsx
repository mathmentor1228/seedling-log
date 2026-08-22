import { useState, useMemo } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VocabSettingsPanel } from '@/components/vocab/VocabSettingsPanel';
import { VocabScheduleGenerator } from '@/components/vocab/VocabScheduleGenerator';
import { StudentVocabAssignment } from '@/components/vocab/StudentVocabAssignment';
import { VocabDashboard } from '@/components/vocab/VocabDashboard';
import { VocabTestGenerator } from '@/components/vocab/VocabTestGenerator';
import { TestScheduleManager } from '@/components/TestScheduleManager';
import { VocabTestResultsPanel } from '@/components/vocab/VocabTestResultsPanel';
import { VocabTestAssignManager } from '@/components/vocab/VocabTestAssignManager';
import { VocabSelfTestResults } from '@/components/vocab/VocabSelfTestResults';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';
import {
  BarChart3, FileText, Shuffle, Printer, FolderOpen, Settings,
  BookOpen, Languages, CalendarDays, ClipboardList, Send, Zap,
  LayoutDashboard, FilePlus2, Users2, LineChart, Cog,
} from 'lucide-react';

type SubTab = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
};

type Section = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  subs: SubTab[];
};

const SECTIONS: Section[] = [
  {
    value: 'overview',
    label: '대시보드',
    icon: LayoutDashboard,
    description: '단어 학습 현황을 한눈에 확인합니다',
    subs: [
      { value: 'dashboard', label: '학습 현황', icon: BarChart3 },
    ],
  },
  {
    value: 'create',
    label: '시험지 제작',
    icon: FilePlus2,
    description: '단어를 입력하고 시험지를 출제·인쇄합니다',
    subs: [
      { value: 'edit', label: '단어 입력', icon: FileText },
      { value: 'generate', label: '시험 출제', icon: Shuffle },
      { value: 'result', label: '시험지/답지', icon: Printer },
      { value: 'saved', label: '저장된 시험지', icon: FolderOpen },
    ],
  },
  {
    value: 'assign',
    label: '배정 & 일정',
    icon: Users2,
    description: '학생별 단어/테스트 배정과 시험 일정을 관리합니다',
    subs: [
      { value: 'vocab-assign', label: '단어 배정', icon: Languages },
      { value: 'test-assign', label: '테스트 배정', icon: Send },
      { value: 'schedule', label: '스케줄 관리', icon: BookOpen },
      { value: 'test-schedule', label: '시험 일정', icon: CalendarDays },
    ],
  },
  {
    value: 'results',
    label: '결과 분석',
    icon: LineChart,
    description: '오프라인 시험과 셀프 테스트 결과를 확인합니다',
    subs: [
      { value: 'results', label: '시험 결과', icon: ClipboardList },
      { value: 'self-test', label: '셀프 테스트', icon: Zap },
    ],
  },
  {
    value: 'config',
    label: '설정',
    icon: Cog,
    description: '학생별 단어 학습 설정을 관리합니다',
    subs: [
      { value: 'settings', label: '학생 설정', icon: Settings },
    ],
  },
];

const GENERATOR_TABS = ['edit', 'generate', 'result', 'saved'];

function VocabTestContent() {
  const [section, setSection] = useState('overview');
  const [activeTab, setActiveTab] = useState('dashboard');

  const currentSection = useMemo(
    () => SECTIONS.find(s => s.value === section) ?? SECTIONS[0],
    [section]
  );

  const handleSectionChange = (val: string) => {
    setSection(val);
    const next = SECTIONS.find(s => s.value === val);
    if (next && !next.subs.some(t => t.value === activeTab)) {
      setActiveTab(next.subs[0].value);
    }
  };

  // Allow inner components (e.g., dashboard cards) to jump anywhere
  const jumpToTab = (val: string) => {
    const owner = SECTIONS.find(s => s.subs.some(t => t.value === val));
    if (owner) setSection(owner.value);
    setActiveTab(val);
  };

  const isGeneratorTab = GENERATOR_TABS.includes(activeTab);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold">단어시험관리</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          단어 학습부터 출제·배정·결과까지 한 곳에서 관리합니다
        </p>
      </div>

      {/* 1차: 섹션 */}
      <Tabs value={section} onValueChange={handleSectionChange}>
        <TabsList className="w-full overflow-x-auto flex-nowrap whitespace-nowrap scrollbar-hide h-auto gap-1 justify-start p-1">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <TabsTrigger
                key={s.value}
                value={s.value}
                className="text-sm shrink-0 gap-1.5 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Icon className="w-4 h-4" />
                {s.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* 섹션 설명 */}
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{currentSection.label}</span>
          <span className="mx-2 text-muted-foreground/50">·</span>
          {currentSection.description}
        </p>
      </div>

      {/* 2차: 하위 탭 */}
      <Tabs value={activeTab} onValueChange={jumpToTab} className="space-y-4">
        {currentSection.subs.length > 1 && (
          <TabsList className="w-full overflow-x-auto flex-nowrap whitespace-nowrap scrollbar-hide h-auto gap-1 justify-start bg-muted/40">
            {currentSection.subs.map(t => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} className="text-xs shrink-0 gap-1">
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        )}

        <TabsContent value="dashboard">
          <VocabDashboard onTabChange={jumpToTab} />
        </TabsContent>

        {isGeneratorTab && (
          <div className="mt-2">
            <VocabTestGenerator controlledTab={activeTab} onTabChange={jumpToTab} />
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

        <TabsContent value="test-assign">
          <VocabTestAssignManager />
        </TabsContent>

        <TabsContent value="self-test">
          <VocabSelfTestResults />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function VocabTestPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <ArchiveNotice to="/lessons/close" label="수업 마감" />
      <VocabTestContent />
    </div>
    </ProtectedRoute>
  );
}
