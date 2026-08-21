import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
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

function ParentLearningFeedbackContent() {
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
  const selectedIds = activeStudents.filter((s) => selected.has(s.id)).map((s) => s.id);
  const selectedNoPhone = activeStudents.filter((s) => selected.has(s.id) && !s.parent_phone).length;
  const selectedResponded = activeStudents.filter((s) => selected.has(s.id) && respondedIds.has(s.id)).length;

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
                <CardTitle className="text-sm">설문 알림톡 발송 대상 ({selectedIds.length}명 선택)</CardTitle>
                <p className="text-xs text-muted-foreground">
                  기본 선택은 미응답 학생입니다. 발송은 설문 참여 요청일 뿐, 홍보 활용 동의와는 무관합니다.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(activeStudents.map((s) => s.id)))}>전체 선택</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(pendingStudents.map((s) => s.id)))}>미응답만</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>선택 해제</Button>
                  <Button size="sm" variant="outline" disabled={busy || selectedIds.length === 0} onClick={() => runPreview(selectedIds)}>
                    <Eye className="w-3.5 h-3.5 mr-1.5" />선택 대상 미리보기
                  </Button>
                  <Button size="sm" disabled={busy || selectedIds.length === 0} onClick={() => setConfirmOpen(true)}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />알림톡 일괄발송
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="테스트 수신 번호 (예: 01012345678)"
                    className="h-8 w-56 text-sm"
                  />
                  <Button size="sm" variant="outline" disabled={busy || selectedIds.length !== 1} onClick={() => runTestSend(selectedIds)}>
                    <FlaskConical className="w-3.5 h-3.5 mr-1.5" />테스트 발송 (학생 1명 선택)
                  </Button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {activeStudents.map((s) => {
                    const responded = respondedIds.has(s.id);
                    const noPhone = !s.parent_phone;
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 last:border-0">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={(v) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(s.id); else next.delete(s.id);
                                return next;
                              });
                            }}
                          />
                          <span>
                            {s.name}
                            {s.school_level && s.grade_year ? (
                              <span className="text-xs text-muted-foreground"> ({s.school_level}{s.grade_year})</span>
                            ) : null}
                          </span>
                          {responded && <Badge variant="secondary" className="text-[10px]">응답완료</Badge>}
                          {noPhone && <Badge variant="destructive" className="text-[10px]">연락처 없음</Badge>}
                        </label>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => fetchParentToken(s.id)
                            .then((t) => navigator.clipboard.writeText(surveyUrl(t)))
                            .then(() => toast({ title: '설문 링크 복사됨' }))
                            .catch((e) => toast({ title: '오류', description: e.message, variant: 'destructive' }))}>

                            링크 복사
                          </Button>
                          <Button size="sm" variant="outline" disabled={copyingId === s.id} onClick={() => copyGuide(s.id)}>
                            {copyingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                            안내문 복사
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {preview && (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-sm font-medium">미리보기 (실제 발송 없음) — 대상 {preview.target_count}명 / 제외 {preview.excluded_count}명</p>
                    {(preview.missing || []).length > 0 && (
                      <p className="text-xs text-destructive">솔라피 템플릿 등록 및 환경변수 설정 필요 — 누락: {preview.missing.join(', ')}</p>
                    )}
                    <div className="max-h-56 overflow-y-auto space-y-1 text-xs">
                      {(preview.previews || []).map((p: any) => (
                        <div key={p.student_id} className="border-b border-border/50 pb-1">
                          <span className="font-medium">{p.student_name}</span> · {p.phone_masked}
                          <div className="text-muted-foreground break-all">{p.link}</div>
                        </div>
                      ))}
                      {(preview.results || []).map((r: any, i: number) => (
                        <div key={i} className="text-destructive">{r.student_name}: {r.reason}</div>
                      ))}
                    </div>
                  </div>
                )}

                {sendResults && (
                  <div className="rounded-md border border-border p-3 space-y-1 text-sm">
                    <p className="font-medium">
                      발송 결과 — 성공 {sendResults.sent} / 실패 {sendResults.failed} / 제외 {sendResults.skipped}
                      {sendResults.test_mode ? ' (테스트 발송, 로그 미기록)' : ''}
                    </p>
                    <div className="max-h-56 overflow-y-auto text-xs space-y-0.5">
                      {sendResults.results.filter((r) => !r.ok).map((r, i) => (
                        <div key={i} className="text-destructive">{r.student_name}: {r.reason}</div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>알림톡 일괄발송 확인</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-1 text-sm">
                      <div>대상 학생: {selectedIds.length}명</div>
                      <div>연락처 없음(제외 예정): {selectedNoPhone}명</div>
                      <div>이미 응답한 학생 포함: {selectedResponded}명</div>
                      <div className="text-destructive">실제 알림톡이 발송되며 발송 비용이 발생합니다.</div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runBulkSend(selectedIds)}>확인하고 발송</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>


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

export default function ParentLearningFeedbackPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']} noLayout>
      <ParentLearningFeedbackContent />
    </ProtectedRoute>
  );
}
