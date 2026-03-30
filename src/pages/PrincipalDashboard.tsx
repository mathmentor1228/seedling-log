import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, BookOpen, ClipboardCheck, Bell, BarChart3, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function PrincipalContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '원장';

  const menuItems = [
    { icon: Users, label: '학생 관리', desc: '전체 학생 현황', path: '/students', color: 'text-blue-600 bg-blue-50' },
    { icon: BookOpen, label: '수업 관리', desc: '반 편성 및 시간표', path: '/classes', color: 'text-emerald-600 bg-emerald-50' },
    { icon: ClipboardCheck, label: '수업일지', desc: '교사 수업 기록', path: '/lessons', color: 'text-violet-600 bg-violet-50' },
    { icon: BarChart3, label: '통계', desc: '출결 및 학습 통계', path: '/stats', color: 'text-amber-600 bg-amber-50' },
    { icon: Bell, label: '알림 관리', desc: '학부모 알림', path: '/reports', color: 'text-rose-600 bg-rose-50' },
    { icon: AlertTriangle, label: '패턴 알림', desc: '주의 학생 관리', path: '/admin/briefing', color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">안녕하세요, {displayName}님 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">원장 대시보드 · 전체 학원 현황을 한눈에 확인하세요</p>
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

export default function PrincipalDashboard() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PrincipalContent />
    </ProtectedRoute>
  );
}
