import { useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, Users, Calendar, BookCheck, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AssistantDashboard from '@/components/AssistantDashboard';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'dashboard', label: '📋 대시보드' },
  { key: 'menu', label: '🗂️ 바로가기' },
] as const;

function QuickMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '조교';

  const menuItems = [
    { icon: ClipboardList, label: '조교 요청·업무', desc: '받은 업무·요청 처리', path: '/assistant-requests', color: 'text-emerald-600 bg-emerald-50' },
    
    { icon: Users, label: '출결 관리', desc: '입퇴실 체크', path: '/timetable?tab=attendance', color: 'text-blue-600 bg-blue-50' },
    { icon: Calendar, label: '시간표', desc: '오늘의 시간표', path: '/timetable', color: 'text-amber-600 bg-amber-50' },
    { icon: BookCheck, label: '숙제 확인', desc: '숙제 검사', path: '/lessons', color: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">안녕하세요, {displayName}님 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">바로가기 메뉴 · 자주 사용하는 기능에 빠르게 접근하세요</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {menuItems.map((item) => (
          <Card
            key={item.path}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(item.path)}
          >
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AssistantContent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu'>('dashboard');

  return (
    <div className="space-y-3">
      {/* Tab switcher */}
      <div className="flex gap-2 justify-center">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' ? <AssistantDashboard /> : <QuickMenu />}
    </div>
  );
}

export default function AssistantDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['assistant']}>
      <AssistantContent />
    </ProtectedRoute>
  );
}
