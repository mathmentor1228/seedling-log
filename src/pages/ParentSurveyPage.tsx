import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, GraduationCap, CheckCircle2 } from 'lucide-react';
import { PublicAnnouncementBar } from '@/components/layout/PublicAnnouncementBar';
import { toast } from '@/hooks/use-toast';

const DELIVERY_OPTIONS = [
  { value: 'next_day_short', label: '수업 다음 날 짧은 안내' },
  { value: 'weekly_summary', label: '매주 1회 요약' },
  { value: 'portal_on_demand', label: '필요할 때 웹페이지에서 확인' },
  { value: 'important_only', label: '중요한 이슈만' },
  { value: 'academy_recommended', label: '학원 권장 방식' },
];
const DAILY_OPTIONS = [
  { value: 'progress', label: '수업 진도' },
  { value: 'homework', label: '숙제·다음 수업 준비' },
  { value: 'test_result', label: '테스트·평가 결과' },
  { value: 'attitude', label: '수업 태도·특이사항' },
  { value: 'difficulty_response', label: '학습 어려움과 학원 대응' },
];
const WEEKLY_OPTIONS = [
  { value: 'three_lines', label: '핵심 3줄' },
  { value: 'subject_detail', label: '과목별 상세' },
  { value: 'on_consultation', label: '상담 필요 시 상세' },
  { value: 'not_needed', label: '원하지 않음' },
];
const NOTIFY_OPTIONS = [
  { value: 'none', label: '수신 안 함' },
  { value: 'next_day', label: '다음 날 안내' },
  { value: 'weekly', label: '주간 요약' },
  { value: 'important_only', label: '중요 이슈만' },
];

interface StudentLite { name: string; school: string | null; school_level: string | null; grade_year: number | null; }

export default function ParentSurveyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentLite | null>(null);
  const [done, setDone] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  const [deliveryPreference, setDeliveryPreference] = useState('');
  const [dailyTopics, setDailyTopics] = useState<string[]>([]);
  const [weeklyDetail, setWeeklyDetail] = useState('');
  const [portalFeedback, setPortalFeedback] = useState('');
  const [learningInterests, setLearningInterests] = useState('');
  const [satisfactionAreas, setSatisfactionAreas] = useState('');
  const [improvementFeedback, setImprovementFeedback] = useState('');
  const [parentMessage, setParentMessage] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [noticeConfirmed, setNoticeConfirmed] = useState(false);
  const [learningConsent, setLearningConsent] = useState(false);
  const [legalConfirmed, setLegalConfirmed] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState('');
  const [publicWebConsent, setPublicWebConsent] = useState(false);

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parent-portal?action=survey&token=${encodeURIComponent(token || '')}`;

  useEffect(() => {
    if (!token) { setError('유효하지 않은 링크입니다.'); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(endpoint, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        const result = await res.json();
        if (!res.ok || result.error) { setError(result.error || '설문을 불러올 수 없습니다.'); return; }
        setStudent(result.student);
        const f = result.feedback;
        if (f) {
          setHasExisting(true);
          setDeliveryPreference(f.delivery_preference || '');
          setDailyTopics(f.daily_topics || []);
          setWeeklyDetail(f.weekly_detail_preference || '');
          setPortalFeedback(f.portal_feedback || '');
          setLearningInterests((f.learning_interests || []).join(', '));
          setSatisfactionAreas((f.satisfaction_areas || []).join(', '));
          setImprovementFeedback(f.improvement_feedback || '');
          setParentMessage(f.parent_message || '');
          setGuardianName(f.guardian_name || '');
          setGuardianRelationship(f.guardian_relationship || '');
          setNotificationPreference(f.notification_preference || '');
          setPublicWebConsent(!!f.public_web_consent);
        }
      } catch {
        setError('설문을 불러오는 중 오류가 발생했습니다.');
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const toggleDaily = (v: string) =>
    setDailyTopics((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);

  const submit = async () => {
    if (!deliveryPreference) { toast({ title: '수업내역 전달 방식을 선택해주세요.', variant: 'destructive' }); return; }
    if (!noticeConfirmed || !learningConsent || !legalConfirmed) {
      toast({ title: '필수 확인·동의 항목을 모두 체크해주세요.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_preference: deliveryPreference,
          daily_topics: dailyTopics,
          weekly_detail_preference: weeklyDetail || null,
          portal_feedback: portalFeedback,
          learning_interests: splitList(learningInterests),
          satisfaction_areas: splitList(satisfactionAreas),
          improvement_feedback: improvementFeedback,
          parent_message: parentMessage,
          guardian_name: guardianName,
          guardian_relationship: guardianRelationship,
          survey_notice_confirmed: noticeConfirmed,
          learning_management_consent: learningConsent,
          legal_representative_confirmed: legalConfirmed,
          notification_preference: notificationPreference || null,
          public_web_consent: publicWebConsent,
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || '제출에 실패했습니다.');
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      toast({ title: '오류', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-destructive/5 to-background p-4">
      <Card className="max-w-sm w-full">
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <h2 className="font-bold text-lg mb-2 text-foreground">접속할 수 없습니다</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/[0.03] to-background">
      <PublicAnnouncementBar />
      <header className="bg-card/80 backdrop-blur-xl border-b border-border px-4 py-3.5 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight text-foreground">
              {student?.name}
              {student?.school_level && student?.grade_year ? ` (${student.school_level}${student.grade_year})` : ''}
            </p>
            <p className="text-[11px] text-muted-foreground">학습정보 전달 설문</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-5">
        {done && (
          <Card className="border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30">
            <CardContent className="pt-5 pb-5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-foreground">설문이 저장되었습니다. 감사합니다!</p>
                <p className="text-xs text-muted-foreground">같은 링크로 다시 들어오시면 언제든 수정하실 수 있습니다.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {hasExisting && !done && (
          <p className="text-xs text-muted-foreground px-1">이전에 제출하신 응답을 불러왔습니다. 수정 후 다시 제출해주세요.</p>
        )}

        {/* Q1 */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">1. 수업내역은 어떻게 받아보시는 게 좋으신가요? <span className="text-destructive">*</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <RadioGroup value={deliveryPreference} onValueChange={setDeliveryPreference} className="space-y-2">
              {DELIVERY_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`d-${o.value}`} />
                  <Label htmlFor={`d-${o.value}`} className="text-sm font-normal">{o.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Q2 */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">2. 다음 날 안내에 담기면 좋은 내용 (복수 선택)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {DAILY_OPTIONS.map((o) => (
              <div key={o.value} className="flex items-center gap-2">
                <Checkbox id={`t-${o.value}`} checked={dailyTopics.includes(o.value)} onCheckedChange={() => toggleDaily(o.value)} />
                <Label htmlFor={`t-${o.value}`} className="text-sm font-normal">{o.label}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Q3 */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">3. 주간 요약 분량</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <RadioGroup value={weeklyDetail} onValueChange={setWeeklyDetail} className="space-y-2">
              {WEEKLY_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`w-${o.value}`} />
                  <Label htmlFor={`w-${o.value}`} className="text-sm font-normal">{o.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Q4 */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">4. 자유 의견</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">학부모 웹페이지 이용 시 불편했던 점</Label>
              <Textarea value={portalFeedback} onChange={(e) => setPortalFeedback(e.target.value)} maxLength={2000} rows={3} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">학습에서 관심 있는 부분 (쉼표로 구분)</Label>
              <Input value={learningInterests} onChange={(e) => setLearningInterests(e.target.value)} placeholder="예: 내신 대비, 학습 습관" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">현재 만족하시는 점 (쉼표로 구분)</Label>
              <Input value={satisfactionAreas} onChange={(e) => setSatisfactionAreas(e.target.value)} placeholder="예: 꼼꼼한 피드백" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">개선되었으면 하는 점</Label>
              <Textarea value={improvementFeedback} onChange={(e) => setImprovementFeedback(e.target.value)} maxLength={2000} rows={3} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">원장·담당 선생님께 하고 싶은 말씀</Label>
              <Textarea value={parentMessage} onChange={(e) => setParentMessage(e.target.value)} maxLength={2000} rows={3} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Guardian */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">보호자 정보</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">보호자 성함</Label>
              <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} maxLength={50} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">학생과의 관계</Label>
              <Input value={guardianRelationship} onChange={(e) => setGuardianRelationship(e.target.value)} maxLength={50} placeholder="예: 모" className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Consents */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">동의 및 확인</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="flex gap-2">
              <Checkbox id="c1" checked={noticeConfirmed} onCheckedChange={(v) => setNoticeConfirmed(v === true)} className="mt-0.5" />
              <Label htmlFor="c1" className="text-xs font-normal leading-relaxed">
                <span className="font-semibold">[필수] 설문 정보 안내 확인</span><br />
                본 설문 응답은 서비스 개선 및 상담 참고 목적으로만 사용되며, 수집일로부터 1년간 보관 후 파기됩니다.
              </Label>
            </div>
            <div className="flex gap-2">
              <Checkbox id="c2" checked={learningConsent} onCheckedChange={(v) => setLearningConsent(v === true)} className="mt-0.5" />
              <Label htmlFor="c2" className="text-xs font-normal leading-relaxed">
                <span className="font-semibold">[필수] 학습관리 동의</span><br />
                수업·출결·숙제·평가 관리 및 학부모 웹페이지·선택하신 알림 제공을 위해 학습 정보를 처리하는 데 동의합니다. 수강 종료 후 5년간 보관 후 파기됩니다.
              </Label>
            </div>
            <div className="flex gap-2">
              <Checkbox id="c3" checked={legalConfirmed} onCheckedChange={(v) => setLegalConfirmed(v === true)} className="mt-0.5" />
              <Label htmlFor="c3" className="text-xs font-normal leading-relaxed">
                <span className="font-semibold">[필수] 법정대리인 확인</span><br />
                본인은 해당 학생의 법정대리인 또는 동의 권한이 있는 보호자임을 확인합니다.
              </Label>
            </div>

            <div className="pt-1">
              <Label className="text-xs font-semibold">[선택] 알림 수신 방식</Label>
              <RadioGroup value={notificationPreference} onValueChange={setNotificationPreference} className="mt-2 space-y-2">
                {NOTIFY_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <RadioGroupItem value={o.value} id={`n-${o.value}`} />
                    <Label htmlFor={`n-${o.value}`} className="text-sm font-normal">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="flex gap-2 pt-1 border-t border-border pt-3">
              <Checkbox id="c4" checked={publicWebConsent} onCheckedChange={(v) => setPublicWebConsent(v === true)} className="mt-0.5" />
              <Label htmlFor="c4" className="text-xs font-normal leading-relaxed">
                <span className="font-semibold">[선택] 외부 공개 동의</span><br />
                홈페이지 등 공개 웹에 이름 일부 마스킹 표기, 학년·과목, 학습 과정·성과 요약만 공개하는 데 동의합니다.
                전체 이름, 연락처, 세부 성적표, 상담 내용, 사진은 공개하지 않습니다. 게시 후 1년 또는 동의 철회 시까지 유지되며,
                철회는 더멘토학원 카카오톡 채널로 요청하실 수 있습니다. 본 동의를 거부하셔도 수강 및 학습관리에는 어떠한 불이익도 없습니다.
              </Label>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {hasExisting ? '응답 수정하기' : '설문 제출하기'}
        </Button>
        <div className="h-6" />
      </main>
    </div>
  );
}
