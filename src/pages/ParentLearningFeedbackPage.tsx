import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const DELIVERY_LABELS: Record<string, string> = {
  next_day_short: '다음 날 짧은 안내',
  weekly_summary: '주 1회 요약',
  portal_on_demand: '필요할 때 웹페이지',
  important_only: '중요 이슈만',
  academy_recommended: '학원 권장 방식',
};
const NOTIFY_LABELS: Record<string, string> = {
  none: '수신 안 함',
  next_day: '다음 날',
  weekly: '주간',
  important_only: '중요 이슈만',
};

interface Row {
  id: string;
  student_id: string;
  delivery_preference: string | null;
  notification_preference: string | null;
  public_web_consent: boolean;
  learning_management_consent: boolean;
  improvement_feedback: string | null;
  parent_message: string | null;
  submitted_at: string;
  students?: { name: string; school_level: string | null; grade_year: number | null } | null;
}

export default function ParentLearningFeedbackPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('parent_learning_feedback')
        .select('*, students(name, school_level, grade_year)')
        .order('submitted_at', { ascending: false });
      setRows((data as any) || []);
      setLoading(false);
    })();
  }, []);

  if (role !== 'admin') {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">원장 전용 페이지입니다.</p>
      </AppLayout>
    );
  }

  const total = rows.length;
  const publicConsent = rows.filter((r) => r.public_web_consent).length;
  const learningConsent = rows.filter((r) => r.learning_management_consent).length;
  const byDelivery = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      const k = r.delivery_preference || 'unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">학부모 설문 결과</h1>
          <p className="text-sm text-muted-foreground">학습정보 전달 방식 및 만족도 설문 응답</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '총 응답 수', value: total },
                { label: '외부 공개 동의', value: publicConsent },
                { label: '학습관리 동의', value: learningConsent },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-5 pb-4 text-center">
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">선호 전달 방식 집계</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {byDelivery.length === 0 && <p className="text-sm text-muted-foreground">응답이 없습니다.</p>}
                {byDelivery.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span>{DELIVERY_LABELS[k] || '미응답'}</span>
                    <Badge variant="secondary">{v}명</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">학생별 응답</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">학생</th>
                      <th className="py-2 pr-3">선호</th>
                      <th className="py-2 pr-3">알림</th>
                      <th className="py-2 pr-3">공개동의</th>
                      <th className="py-2 pr-3">개선 의견</th>
                      <th className="py-2">응답일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {r.students?.name || '-'}
                          {r.students?.school_level && r.students?.grade_year ? (
                            <span className="text-xs text-muted-foreground"> ({r.students.school_level}{r.students.grade_year})</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{DELIVERY_LABELS[r.delivery_preference || ''] || '-'}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{NOTIFY_LABELS[r.notification_preference || ''] || '-'}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={r.public_web_consent ? 'default' : 'outline'}>{r.public_web_consent ? '동의' : '미동의'}</Badge>
                        </td>
                        <td className="py-2 pr-3 max-w-[280px] whitespace-pre-wrap">{r.improvement_feedback || '-'}</td>
                        <td className="py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleDateString('ko-KR')}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">아직 응답이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
