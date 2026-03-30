import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, ClipboardCheck, Users, FileText, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function TeacherContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '선생님';

  const menuItems = [
    { icon: ClipboardCheck, label: '수업일지', desc: '오늘의 수업 기록', path: '/lessons', color: 'text-violet-600 bg-violet-50' },
    { icon: Users, label: '내 학생', desc: '담당 학생 현황', path: '/classes', color: 'text-blue-600 bg-blue-50' },
    { icon: Calendar, label: '시간표', desc: '수업 시간표', path: '/timetable', color: 'text-emerald-600 bg-emerald-50' },
    { icon: FileText, label: '리포트', desc: '주간 보고서', path: '/reports', color: 'text-amber-600 bg-amber-50' },
    { icon: BookOpen, label: '조교 요청', desc: '테스트/업무 요청', path: '/assistant-requests', color: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">안녕하세요, {displayName} 선생님 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">선생님 대시보드 · 오늘의 수업을 확인하세요</p>
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

export default function TeacherDashboard() {
  return (
    <ProtectedRoute allowedRoles={['teacher']}>
      <TeacherContent />
    </ProtectedRoute>
  );
}
