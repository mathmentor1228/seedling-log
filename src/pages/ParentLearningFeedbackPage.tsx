import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Copy, Send, Eye, FlaskConical } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';
import { buildSurveyKakaoMessage, fetchParentToken, surveyUrl } from '@/lib/parentSurveyMessage';


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

interface ActiveStudent { id: string; name: string; school_level: string | null; grade_year: number | null; parent_phone: string | null; }

interface SendResult { student_id: string; student_name: string; ok?: boolean; reason?: string; }

export default function ParentLearningFeedbackPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [activeStudents, setActiveStudents] = useState<ActiveStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [sendResults, setSendResults] = useState<{ sent: number; failed: number; skipped: number; results: SendResult[]; test_mode?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: studentData }] = await Promise.all([
        supabase
          .from('parent_learning_feedback')
          .select('*, students(name, school_level, grade_year)')
          .order('submitted_at', { ascending: false }),
        supabase
          .from('students')
          .select('id, name, school_level, grade_year, parent_phone')
          .in('enrollment_status', ['재학', '재등원'])
          .order('name'),
      ]);
      setRows((data as any) || []);
      setActiveStudents((studentData as any) || []);
      const responded = new Set(((data as any) || []).map((r: any) => r.student_id));
      setSelected(new Set(((studentData as any) || []).filter((s: any) => !responded.has(s.id)).map((s: any) => s.id as string)));
      setInitialized(true);
      setLoading(false);

    })();
  }, []);

  const copyGuide = async (studentId: string) => {
    setCopyingId(studentId);
    try {
      const token = await fetchParentToken(studentId);
      await navigator.clipboard.writeText(buildSurveyKakaoMessage(surveyUrl(token)));
      toast({ title: '카카오톡 안내문 복사됨', description: '카카오톡에 붙여넣기하세요!' });
    } catch (e: any) {
      toast({ title: '오류', description: e.message, variant: 'destructive' });
    } finally {
      setCopyingId(null);
    }
  };

  const invokeSend = async (payload: { student_ids: string[]; dry_run?: boolean; test_phone?: string }) => {
    const { data, error } = await supabase.functions.invoke('send-parent-survey', { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error === 'not_configured') {
      throw new Error(`솔라피 템플릿 등록 및 환경변수 설정 필요 — 누락: ${(data.missing || []).join(', ')}`);
    }
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const runPreview = async (ids: string[]) => {
    setBusy(true); setSendResults(null);
    try {
      const data = await invokeSend({ student_ids: ids, dry_run: true });
      setPreview(data);
      if ((data.missing || []).length > 0) {
        toast({ title: '설정 미완료', description: `솔라피 템플릿 등록 및 환경변수 설정 필요 — 누락: ${data.missing.join(', ')}`, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: '미리보기 실패', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const runTestSend = async (ids: string[]) => {
    if (!testPhone.trim()) { toast({ title: '테스트 번호를 입력하세요', variant: 'destructive' }); return; }
    if (ids.length !== 1) { toast({ title: '테스트 발송은 학생 1명만 선택하세요', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const data = await invokeSend({ student_ids: ids, test_phone: testPhone.trim() });
      setSendResults(data);
      toast({ title: '테스트 발송 완료', description: '운영 발송 로그에는 기록되지 않았습니다.' });
    } catch (e: any) {
      toast({ title: '테스트 발송 실패', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const runBulkSend = async (ids: string[]) => {
    setBusy(true); setConfirmOpen(false);
    try {
      const data = await invokeSend({ student_ids: ids });
      setSendResults(data);
      toast({ title: '알림톡 발송 완료', description: `성공 ${data.sent}건 / 실패 ${data.failed}건` });
    } catch (e: any) {
      toast({ title: '발송 실패', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };


  if (role !== 'admin') {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">원장 전용 페이지입니다.</p>
      </AppLayout>
    );
  }

  const respondedIds = new Set(rows.map((r) => r.student_id));
  const activeTotal = activeStudents.length;
  const respondedCount = activeStudents.filter((s) => respondedIds.has(s.id)).length;
  const pendingStudents = activeStudents.filter((s) => !respondedIds.has(s.id));
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
                { label: '활성 학생 수', value: activeTotal },
                { label: '응답 완료', value: respondedCount },
                { label: '미응답', value: pendingStudents.length },
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
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">미응답 학생 ({pendingStudents.length}명)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingStudents.length === 0 && (
                  <p className="text-sm text-muted-foreground">모든 활성 학생이 응답했습니다.</p>
                )}
                {pendingStudents.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                    <span className="text-sm">
                      {s.name}
                      {s.school_level && s.grade_year ? (
                        <span className="text-xs text-muted-foreground"> ({s.school_level}{s.grade_year})</span>
                      ) : null}
                    </span>
                    <Button size="sm" variant="outline" disabled={copyingId === s.id} onClick={() => copyGuide(s.id)}>
                      {copyingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                      안내문 복사
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

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
