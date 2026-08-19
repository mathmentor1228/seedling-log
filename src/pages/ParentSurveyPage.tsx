import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, AlertTriangle, GraduationCap, CheckCircle2, Clock, SlidersHorizontal, Bell, MessageCircle } from 'lucide-react';
import { PublicAnnouncementBar } from '@/components/layout/PublicAnnouncementBar';
import { toast } from '@/hooks/use-toast';

const DELIVERY_OPTIONS = [
  { value: 'next_day_short', label: '수업 다음 날 한 줄로' },
  { value: 'weekly_summary', label: '매주 한 번 요약으로' },
  { value: 'portal_on_demand', label: '필요할 때 웹페이지에서' },
  { value: 'important_only', label: '중요한 일만 알려주세요' },
];
const DAILY_OPTIONS = [
  { value: 'progress', label: '수업 진도' },
  { value: 'homework', label: '숙제·다음 수업 준비' },
  { value: 'test_result', label: '테스트 결과' },
  { value: 'attitude', label: '수업 태도·특이사항' },
  { value: 'difficulty_response', label: '어려워한 부분과 학원 대응' },
];
const WEEKLY_OPTIONS = [
  { value: 'three_lines', label: '핵심 3줄이면 충분해요' },
  { value: 'subject_detail', label: '과목별로 자세히' },
  { value: 'on_consultation', label: '상담이 필요할 때만 자세히' },
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
  const [parentMessage, setParentMessage] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [noticeConfirmed, setNoticeConfirmed] = useState(false);
  const [learningConsent, setLearningConsent] = useState(false);
  const [legalConfirmed, setLegalConfirmed] = useState(false);
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
          setDeliveryPreference(DELIVERY_OPTIONS.some((o) => o.value === f.delivery_preference) ? f.delivery_preference : '');
          setDailyTopics(f.daily_topics || []);
          setWeeklyDetail(WEEKLY_OPTIONS.some((o) => o.value === f.weekly_detail_preference) ? f.weekly_detail_preference : '');
          setParentMessage(f.parent_message || '');
          setGuardianName(f.guardian_name || '');
          setGuardianRelationship(f.guardian_relationship || '');
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

  const submit = async () => {
    if (!deliveryPreference) { toast({ title: '수업내역을 어떻게 받아보실지 하나만 골라주세요.', variant: 'destructive' }); return; }
    if (!guardianName.trim() || !guardianRelationship.trim()) {
      toast({ title: '보호자 성함과 학생과의 관계를 적어주세요.', variant: 'destructive' });
      return;
    }
    if (!noticeConfirmed || !learningConsent || !legalConfirmed) {
      toast({ title: '필수 동의 3가지를 확인해주세요.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_preference: deliveryPreference,
          daily_topics: deliveryPreference === 'next_day_short' ? dailyTopics : [],
          weekly_detail_preference: deliveryPreference === 'weekly_summary' ? (weeklyDetail || null) : null,
          portal_feedback: '',
          learning_interests: [],
          satisfaction_areas: [],
          improvement_feedback: '',
          parent_message: parentMessage,
          guardian_name: guardianName,
          guardian_relationship: guardianRelationship,
          survey_notice_confirmed: noticeConfirmed,
          learning_management_consent: learningConsent,
          legal_representative_confirmed: legalConfirmed,
          notification_preference: null,
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
            <p className="text-[11px] text-muted-foreground">1분 설문</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {done && (
          <Card className="border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30">
            <CardContent className="pt-5 pb-5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-foreground">보내주셔서 고맙습니다!</p>
                <p className="text-xs text-muted-foreground">같은 링크로 언제든 다시 수정하실 수 있어요.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Intro */}
        <Card className="border-primary/30 bg-primary/[0.04]">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">1분 설문</p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground leading-relaxed mb-4">
              <p>
                {student?.name} 학생의 수업 소식, 필요한 만큼 편하게 받아보실 수 있도록 방식을 정하려 합니다.
              </p>
              <p>
                응답해 주신 방식에 맞춰 수업 다음 날 안내·주간 요약·웹페이지 확인 중 전달 방식을 정리합니다.
              </p>
              <p>답변은 약 1분, 긴 의견은 선택입니다.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2.5 rounded-xl bg-background/60 p-3">
                <SlidersHorizontal className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">내가 원하는 만큼만 받기</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">매일·주간·필요할 때만</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-background/60 p-3">
                <Bell className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">중요한 변화는 놓치지 않기</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">필요한 일만 따로 안내</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-background/60 p-3">
                <MessageCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">의견을 안내 방식에 반영하기</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">부담 없이 남겨주세요</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasExisting && !done && (
          <p className="text-xs text-muted-foreground px-1">이전에 남겨주신 응답을 불러왔어요. 바꾸신 뒤 다시 저장해주세요.</p>
        )}

        {/* Q1 */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">수업 소식, 어떻게 받아보시는 게 편하세요? <span className="text-destructive">*</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <RadioGroup value={deliveryPreference} onValueChange={setDeliveryPreference} className="space-y-2">
              {DELIVERY_OPTIONS.map((o) => (
                <Label
                  key={o.value}
                  htmlFor={`d-${o.value}`}
                  className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm font-normal cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <RadioGroupItem value={o.value} id={`d-${o.value}`} />
                  {o.label}
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Conditional: daily topics */}
        {deliveryPreference === 'next_day_short' && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold">다음 날 안내에 담기면 좋은 내용 <span className="text-xs font-normal text-muted-foreground">(선택·복수)</span></CardTitle>
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
        )}

        {/* Conditional: weekly detail */}
        {deliveryPreference === 'weekly_summary' && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold">주간 요약 분량 <span className="text-xs font-normal text-muted-foreground">(선택)</span></CardTitle>
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
        )}

        {/* Guardian */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">보호자 정보 <span className="text-destructive">*</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">성함</Label>
              <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} maxLength={50} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">학생과의 관계</Label>
              <Input value={guardianRelationship} onChange={(e) => setGuardianRelationship(e.target.value)} maxLength={50} placeholder="예: 모" className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Optional extras */}
        <Accordion type="multiple" className="space-y-3">
          <AccordionItem value="more" className="border border-border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">더 남기실 의견이 있나요? (선택)</AccordionTrigger>
            <AccordionContent className="pb-4">
              <Textarea
                value={parentMessage}
                onChange={(e) => setParentMessage(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="편하게 한두 줄만 남겨주셔도 큰 도움이 됩니다."
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="public" className="border border-border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">외부 공개 동의 (완전히 선택)</AccordionTrigger>
            <AccordionContent className="pb-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                홈페이지 등에 <span className="font-medium text-foreground">이름 일부 마스킹, 학년·과목, 학습 과정 요약</span>만 소개하는 데 대한 동의예요.
                전체 이름·연락처·세부 성적·상담 내용·사진은 공개하지 않습니다. 동의하지 않으셔도 수강과 학습관리에 어떤 불이익도 없습니다.
                철회는 더멘토학원 카카오톡 채널로 언제든 요청하실 수 있습니다.
              </p>
              <div className="flex gap-2">
                <Checkbox id="c4" checked={publicWebConsent} onCheckedChange={(v) => setPublicWebConsent(v === true)} className="mt-0.5" />
                <Label htmlFor="c4" className="text-xs font-normal leading-relaxed">외부 공개에 동의합니다 (선택)</Label>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Consents */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">꼭 확인해주세요 <span className="text-destructive">*</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex gap-2">
              <Checkbox id="c1" checked={noticeConfirmed} onCheckedChange={(v) => setNoticeConfirmed(v === true)} className="mt-0.5" />
              <Label htmlFor="c1" className="text-xs font-normal leading-relaxed">
                <span className="font-semibold">[필수] 설문 정보 안내 확인</span><br />
                응답은 서비스 개선과 상담 참고에만 쓰이고, 1년 뒤 파기됩니다.
              </Label>
            </div>
            <div className="flex gap-2">
              <Checkbox id="c2" checked={learningConsent} onCheckedChange={(v) => setLearningConsent(v === true)} className="mt-0.5" />
              <Label htmlFor="c2" className="text-xs font-normal leading-relaxed">
                <span className="font-semibold">[필수] 학습관리 동의</span><br />
                수업·출결·숙제·평가 관리와 학부모 웹페이지 제공을 위해 학습 정보를 처리하는 데 동의합니다. 수강 종료 후 5년 뒤 파기됩니다.
              </Label>
            </div>
            <div className="flex gap-2">
              <Checkbox id="c3" checked={legalConfirmed} onCheckedChange={(v) => setLegalConfirmed(v === true)} className="mt-0.5" />
              <Label htmlFor="c3" className="text-xs font-normal leading-relaxed">
                <span className="font-semibold">[필수] 법정대리인 확인</span><br />
                해당 학생의 보호자임을 확인합니다.
              </Label>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          1분 설문 저장하기
        </Button>
        <div className="h-6" />
      </main>
    </div>
  );
}
