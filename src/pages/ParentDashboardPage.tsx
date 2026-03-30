import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogOut, BookOpen, Bell, BarChart3 } from 'lucide-react';

export default function ParentDashboardPage() {
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.full_name || '학부모';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-foreground">SeedlingLog</h1>
          <p className="text-xs text-muted-foreground">학부모 포털</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>
          <LogOut className="w-4 h-4 mr-1" />
          로그아웃
        </Button>
      </header>

      <main className="p-4 max-w-lg mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold">{displayName}님 안녕하세요 👋</h2>
          <p className="text-sm text-muted-foreground mt-1">자녀의 학습 현황을 확인하세요</p>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">수업 현황</p>
                <p className="text-xs text-muted-foreground">이번 주 수업 기록</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">학습 리포트</p>
                <p className="text-xs text-muted-foreground">주간 학습 보고서</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center">
                <Bell className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">알림</p>
                <p className="text-xs text-muted-foreground">학원 공지 및 알림</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
