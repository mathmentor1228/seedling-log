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
import { Loader2, AlertTriangle, GraduationCap, CheckCircle2, Clock, MessageCircle, Calendar, Monitor } from 'lucide-react';
import { PublicAnnouncementBar } from '@/components/layout/PublicAnnouncementBar';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const TOPIC_CHIPS = [
  { value: 'homework', label: '숙제' },
  { value: 'progress', label: '수업 진도' },
  { value: 'test_result', label: '테스트/이해도' },
  { value: 'attitude', label: '학습 태도' },
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
  const [promoConsent, setPromoConsent] = useState<'agree' | 'disagree' | null>(null);

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parent-portal?action=survey&token=${encodeURIComponent(token || '')}`;

  const DELIVERY_CARDS = [
    {
      value: 'next_day_short',
      title: '매 수업 뒤 카카오톡으로 핵심만',
      fit: '자주 확인하고 싶은 분',
      Icon: MessageCircle,
      preview: (
        <div className="rounded-2xl rounded-tl-sm bg-[#F7E600] text-[#3A1D1D] p-3 text-xs shadow-sm">
          <p className="font-semibold mb-1">더멘토학원 / 오늘 수업 기록</p>
          <div className="space-y-0.5 leading-relaxed">
            <p>수업: 중2 수학 2-2 일차함수</p>
            <p>오늘 한 일: 그래프 해석 연습</p>
            <p>숙제: 유형 3쪽</p>
            <p>다음 수업: 오답 확인</p>
          </div>
        </div>
      ),
    },
    {
      value: 'weekly_summary',
      title: '매주 한 번, 이번 주를 모아서',
      fit: '한꺼번에 보고 싶은 분',
      Icon: Calendar,
      preview: (
        <div className="rounded-2xl rounded-tl-sm bg-[#F7E600] text-[#3A1D1D] p-3 text-xs shadow-sm">
          <p className="font-semibold mb-1">더멘토학원 / 이번 주 수업 요약</p>
          <div className="space-y-0.5 leading-relaxed">
            <p>이번 주 수업 2회</p>
            <p>진도·이해도 한 줄</p>
            <p>숙제·다음 주 준비 한 줄</p>
          </div>
        </div>
      ),
    },
    {
      value: 'portal_on_demand',
      title: '필요할 때 웹페이지에서 자세히',
      fit: '필요할 때 자세히 보고 싶은 분',
      Icon: Monitor,
      preview: (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted px-3 py-1.5 text-[10px] font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="ml-1 truncate">더멘토학원 - 수업 일지</span>
          </div>
          <div className="p-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">9월 15일</span>
              <span className="text-muted-foreground truncate">수업 내용 · 숙제</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">9월 13일</span>
              <span className="text-muted-foreground truncate">수업 내용 · 숙제</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">9월 10일</span>
              <span className="text-muted-foreground truncate">수업 내용 · 숙제</span>
            </div>
          </div>
        </div>
      ),
    },
  ];

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
          setDeliveryPreference(DELIVERY_CARDS.some((o) => o.value === f.delivery_preference) ? f.delivery_preference : '');
          setDailyTopics(f.daily_topics || []);
          setWeeklyDetail(f.weekly_detail_preference || '');
          setParentMessage(f.parent_message || '');
          setGuardianName(f.guardian_name || '');
          setGuardianRelationship(f.guardian_relationship || '');
          setPromoConsent(f.public_web_consent ? 'agree' : null);
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
    if (!deliveryPreference) { toast({ title: '수업기록을 받아보실 방식을 하나 선택해주세요.', variant: 'destructive' }); return; }
    if (!guardianName.trim() || !guardianRelationship.trim()) {
      toast({ title: '보호자 성함과 학생과의 관계를 적어주세요.', variant: 'destructive' });
      return;
    }
    if (!noticeConfirmed || !learningConsent || !legalConfirmed) {
      toast({ title: '기록 이용 동의 3가지를 확인해주세요.', variant: 'destructive' });
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
          public_web_consent: promoConsent === 'agree',
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
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">우리 아이 수업기록 받는 방식 선택하기</p>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                약 1분 · 한 번만 선택하면 됩니다
              </span>
            </div>
            <div className="space-y-3 text-sm leading-relaxed">
              <p className="text-foreground">
                더멘토학원에서는 선생님이 매 수업 뒤 아이의 수업 내용, 숙제, 학습 흐름을 기록하고 있습니다. 이 기록을 부모님께서 가장 편한 방식으로 받아보실 수 있도록 전달 방법을 정하려 합니다.
              </p>
              <div className="rounded-xl bg-background/60 p-3 text-xs text-muted-foreground">
                학원 공지와 꼭 필요한 안내는 기존처럼 카카오톡으로 보내드립니다. 아래 선택은 우리 아이의 개별 수업기록을 받아보는 방식입니다.
              </div>
              <div className="rounded-xl border border-primary/25 bg-card/70 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">응답하지 않으시면 이렇게 유지돼요</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  학원 공지와 꼭 필요한 안내는 응답 여부와 관계없이 기존처럼 카카오톡으로 보내드립니다. 다만 아이의 개별 수업기록은 카카오톡으로 정기 전송되지 않고, 지금처럼 학부모 웹페이지에서 직접 확인하시는 방식으로 유지됩니다.
                </p>
                <p className="text-xs text-primary font-medium">
                  아래에서 한 번만 선택해 주시면, 원하시는 방식으로 언제든 바꿔드릴 수 있어요.
                </p>
              </div>
              <p className="text-muted-foreground">답변은 약 1분, 긴 의견은 선택입니다. 아래 카드에서 실제로 어떤 메시지를 받게 되는지 미리 보실 수 있어요.</p>
            </div>
          </CardContent>
        </Card>

        {hasExisting && !done && (
          <p className="text-xs text-muted-foreground px-1">이전에 남겨주신 응답을 불러왔어요. 바꾸신 뒤 다시 저장해주세요.</p>
        )}


        {/* Main choice */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">우리 아이의 수업기록, 어떻게 받아보고 싶으세요? <span className="text-destructive">*</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <RadioGroup value={deliveryPreference} onValueChange={setDeliveryPreference} className="space-y-3">
              {DELIVERY_CARDS.map((o) => (
                <Label
                  key={o.value}
                  htmlFor={`d-${o.value}`}
                  className={cn(
                    'relative flex flex-col gap-3 rounded-2xl border p-4 cursor-pointer transition-all',
                    deliveryPreference === o.value
                      ? 'border-primary bg-primary/[0.04] ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={o.value} id={`d-${o.value}`} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <o.Icon className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm font-bold text-foreground truncate">{o.title}</span>
                        </div>
                        {deliveryPreference === o.value && (
                          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">이런 분께 맞아요: {o.fit}</p>
                    </div>
                  </div>
                  <div className="pl-7">{o.preview}</div>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Topic chips */}
        {deliveryPreference && (
          <Card className="bg-muted/30 border-dashed">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">특히 알고 싶은 내용이 있으세요? <span className="font-normal">(선택)</span></CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {TOPIC_CHIPS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleDaily(t.value)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-full border transition-colors',
                      dailyTopics.includes(t.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-foreground hover:bg-muted/50'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Optional short message */}
        <Accordion type="multiple" className="space-y-3">
          <AccordionItem value="more" className="border border-border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">더 남기실 의견이 있나요? (선택)</AccordionTrigger>
            <AccordionContent className="pb-4">
              <Textarea
                value={parentMessage}
                onChange={(e) => setParentMessage(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="편하게 한두 줄만 남겨주셔도 큰 도움이 됩니다."
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

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

        {/* Consents */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">기록 이용 동의 <span className="text-destructive">*</span></CardTitle>
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

        {/* Promo consent — visible, independent card */}
        <Card className="border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold">아이의 학습 성과 홍보 활용 동의 (선택)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              더멘토학원의 실제 개별관리 과정과 학생들의 성장을 소개하기 위해, 학습 과정과 성과를 홈페이지·블로그·인스타그램·온라인/인쇄 홍보물에 활용할 수 있도록 동의를 요청드립니다.
            </p>

            <div className="rounded-xl border border-border bg-background/70 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">공개 가능 범위</p>
              <ul className="text-xs text-muted-foreground space-y-1 leading-relaxed list-disc pl-4">
                <li>이름 일부만 공개 (최대 2글자 기준, 전체 이름 비공개)</li>
                <li>학교·학년·과목</li>
                <li>점수 변화, 성취 결과, 학습 과정의 요약</li>
              </ul>
              <p className="text-xs text-muted-foreground leading-relaxed">
                전체 이름·연락처·상담 내용·상세 성적표·사진은 이 동의로 공개하지 않습니다. 사진은 별도 동의 없이는 사용하지 않습니다.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">홍보 활용 예시</p>
              <p className="text-sm text-foreground leading-relaxed">
                중2 김○ 학생 / 수학 62점 → 88점 / 오답 점검과 주간 테스트를 꾸준히 진행했습니다.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={promoConsent === 'agree' ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setPromoConsent('agree')}
              >
                동의함
              </Button>
              <Button
                type="button"
                variant={promoConsent === 'disagree' ? 'secondary' : 'outline'}
                className="w-full"
                onClick={() => setPromoConsent('disagree')}
              >
                동의하지 않음
              </Button>
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
              <p>동의하지 않으셔도 수강과 학습관리에 어떤 불이익도 없습니다.</p>
              <p>공개 기간은 게시 후 1년 또는 철회 시까지이며, 철회는 더멘토학원 카카오톡 채널로 언제든 요청하실 수 있습니다.</p>
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
