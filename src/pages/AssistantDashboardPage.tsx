import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, Users, Calendar, BookCheck, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function AssistantContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '조교';

  const menuItems = [
    { icon: ClipboardList, label: '업무 목록', desc: '오늘의 할 일', path: '/assistant', color: 'text-emerald-600 bg-emerald-50' },
    { icon: Bell, label: '요청 사항', desc: '선생님 요청', path: '/assistant-requests', color: 'text-violet-600 bg-violet-50' },
    { icon: Users, label: '출결 관리', desc: '입퇴실 체크', path: '/timetable?tab=attendance', color: 'text-blue-600 bg-blue-50' },
    { icon: Calendar, label: '시간표', desc: '오늘의 시간표', path: '/timetable', color: 'text-amber-600 bg-amber-50' },
    { icon: BookCheck, label: '숙제 확인', desc: '숙제 검사', path: '/lessons', color: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">안녕하세요, {displayName}님 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">조교 대시보드 · 오늘의 업무를 확인하세요</p>
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

export default function AssistantDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['assistant']}>
      <AssistantContent />
    </ProtectedRoute>
  );
}
