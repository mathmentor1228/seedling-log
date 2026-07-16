// INTENSIVE-APPLY-V1: 여름방학 특강 신청 현황 (admin 전용)
import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ClipboardList, RefreshCw, Copy, MessageSquareText, Trash2 } from 'lucide-react';

const db = supabase as any;

type Application = {
  id: string; child_name: string; grade: string;
  expectations: string[]; wishes: string | null; created_at: string;
};

function IntensiveApplications() {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<Application[]>([]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await db.from('intensive_applications')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setApps((data || []) as Application[]);
    } catch (e: any) {
      toast.error(`불러오기 실패: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function getLink() {
    return `${window.location.origin}/summer-intensive`;
  }

  function copyLink() {
    navigator.clipboard.writeText(getLink());
    toast.success('신청서 링크를 복사했어요');
  }

  function copyMessage() {
    const msg = `[더멘토학원] 2026 여름특강 안내
현 고1·고2 대상 원장님 직강 여름특강입니다. 2학기 진도를 방학 중에 미리 끝내고 갑니다.

• 대상: 고1·고2
• 횟수: 총 8회 (회당 120분)
• 특강료: 25만원 (8월 수강료에 합산 결제, 별도 결제 없음)
• 일정: 학생별 개별 안내 예정

자세한 안내 확인과 신청서 제출은 아래 링크에서 해주세요.
${getLink()}

- 더멘토학원 -`;
    navigator.clipboard.writeText(msg);
    toast.success('학부모 문자 양식을 복사했어요 — 문자메시지에 붙여넣으세요');
  }

  async function remove(a: Application) {
    if (!window.confirm(`${a.child_name} 학생 신청을 삭제할까요?`)) return;
    try {
      const { error } = await db.from('intensive_applications').delete().eq('id', a.id);
      if (error) throw error;
      setApps(prev => prev.filter(x => x.id !== a.id));
      toast.success('삭제했어요');
    } catch (e: any) {
      toast.error(`삭제 실패: ${e.message || e}`);
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-56 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />여름방학 특강 신청 현황
        </h1>
        <Badge className="text-[11px]">{apps.length}건</Badge>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={copyMessage}><MessageSquareText className="w-3.5 h-3.5 mr-1" />학부모 문자 양식 복사</Button>
          <Button variant="outline" size="sm" onClick={copyLink}><Copy className="w-3.5 h-3.5 mr-1" />링크만 복사</Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1" />새로고침</Button>
        </div>
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg px-4 py-8 text-center">
          아직 접수된 신청이 없습니다. 위 "학부모 문자 양식 복사"로 안내문 전체를 문자에 그대로 붙여넣으세요.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {apps.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{a.child_name}</span>
                  <Badge variant="secondary" className="text-[11px]">{a.grade}</Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    className="text-muted-foreground hover:text-destructive transition"
                    title="삭제"
                    onClick={() => remove(a)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {a.expectations.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.expectations.map(e => (
                      <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                    ))}
                  </div>
                )}
                {a.wishes && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
                    "{a.wishes}"
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IntensiveApplicationsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
        <IntensiveApplications />
    </ProtectedRoute>
  );
}
