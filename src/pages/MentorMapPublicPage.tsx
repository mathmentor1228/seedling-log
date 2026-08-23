// MENTOR-MAP-V1: 공개 상담 신청 (로그인 불필요). 재원생 데이터와 완전 분리.
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle2, Compass, Loader2 } from 'lucide-react';
import {
  COMM_QUESTIONS,
  buildSections,
  detailedSubjects,
  needsPrioritySelection,
  scoreQuestions,
  subjectQuestions,
} from '@/lib/mentorMap/questions';
import {
  AUTHOR_LABEL,
  EMPTY_ANSWERS,
  LEVEL_LABEL,
  SUBJECTS,
  UNKNOWN_LABEL,
  UNKNOWN_VALUE,
  type AuthorType,
  type MentorMapAnswers,
  type Question,
  type SchoolLevel,
} from '@/lib/mentorMap/types';
import { BRAND_CORE, BRAND_NAME, BRAND_NOTICE, BRAND_SUBTITLE } from '@/lib/mentorMap/proposal';

const METHODS = ['방문 상담', '전화 상담', '온라인 상담'];
const TIMES = ['평일 오전', '평일 오후', '평일 저녁', '주말'];

const idemKey = () => `mm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export default function MentorMapPublicPage() {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<MentorMapAnswers>({ ...EMPTY_ANSWERS });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [key] = useState(idemKey);

  useEffect(() => {
    document.title = 'MENTOR MAP | 멘토맵 학습 상담 신청';
  }, []);

  const level = (a.school_level || 'middle') as SchoolLevel;
  const sections = useMemo(
    () => (a.author_type ? buildSections(a.author_type as AuthorType, level) : []),
    [a.author_type, level]
  );
  const targets = detailedSubjects(a.subjects, a.priority_subjects);

  const steps = useMemo(() => {
    const list: { id: string; title: string }[] = [
      { id: 'intro', title: '시작' },
      { id: 'basic', title: '기본 정보' },
    ];
    sections.forEach((s) => list.push({ id: s.id, title: s.title }));
    if (targets.length) list.push({ id: 'subject', title: '과목별 이야기' });
    list.push({ id: 'score', title: '성적 정보(선택)' });
    list.push({ id: 'comm', title: '소통 선호' });
    list.push({ id: 'final', title: '마지막으로' });
    return list;
  }, [sections, targets.length]);

  const current = steps[Math.min(step, steps.length - 1)];
  const progress = Math.round((step / Math.max(steps.length - 1, 1)) * 100);

  const setAnswer = (bucket: keyof MentorMapAnswers, id: string, value: string | string[]) =>
    setA((prev) => ({ ...prev, [bucket]: { ...(prev[bucket] as Record<string, unknown>), [id]: value } }));

  const toggleMulti = (bucket: keyof MentorMapAnswers, id: string, value: string) => {
    const cur = ((a[bucket] as Record<string, string | string[]>)[id] as string[]) ?? [];
    const next = value === UNKNOWN_VALUE
      ? cur.includes(UNKNOWN_VALUE) ? [] : [UNKNOWN_VALUE]
      : cur.filter((v) => v !== UNKNOWN_VALUE).includes(value)
        ? cur.filter((v) => v !== value && v !== UNKNOWN_VALUE)
        : [...cur.filter((v) => v !== UNKNOWN_VALUE), value];
    setAnswer(bucket, id, next);
  };

  const basicValid =
    a.student_name.trim().length > 0 &&
    !!a.author_type &&
    !!a.school_level &&
    /^01\d{8,9}$/.test(a.contact_phone.replace(/\D/g, '')) &&
    a.subjects.length > 0 &&
    (!needsPrioritySelection(a.subjects) || a.priority_subjects.length > 0);

  const canNext = current?.id === 'basic' ? basicValid : true;

  const submit = async () => {
    if (!a.consent) {
      toast.error('개인정보 수집·이용 동의가 필요합니다.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mentor-map-submit`, {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...a, consent: a.consent, idempotency_key: key }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'submit_failed');
      setDone(true);
    } catch (e) {
      toast.error(
        (e as Error).message === 'rate_limited'
          ? '잠시 후 다시 시도해 주세요.'
          : '제출에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (q: Question, bucket: keyof MentorMapAnswers) => {
    const value = (a[bucket] as Record<string, string | string[]>)[q.id];
    return (
      <div key={q.id} className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-sm font-medium text-foreground">{q.text}</Label>
          {q.optional && <Badge variant="outline" className="text-[10px]">선택</Badge>}
        </div>
        {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
        {q.type === 'text' ? (
          <Textarea
            value={(value as string) ?? ''}
            onChange={(e) => setAnswer(bucket, q.id, e.target.value)}
            placeholder="자유롭게 적어주세요 (선택)"
            className="min-h-[80px]"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(q.options ?? []).map((o) => {
              const selected = q.type === 'multi'
                ? ((value as string[]) ?? []).includes(o.value)
                : value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() =>
                    q.type === 'multi'
                      ? toggleMulti(bucket, q.id, o.value)
                      : setAnswer(bucket, q.id, value === o.value ? '' : o.value)
                  }
                  className={`rounded-full border px-3.5 py-2 text-sm transition-colors min-h-[40px] ${
                    selected
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-card/50 text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {o.value === UNKNOWN_VALUE ? UNKNOWN_LABEL : o.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full border-border/60 bg-card/70 backdrop-blur">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">이야기를 잘 받았습니다</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              보내주신 내용을 먼저 읽어본 뒤 상담 일정 안내를 드립니다.
              <br />짧은 테스트로 학생을 판단하지 않고, 수업 관찰을 통해 방향을 함께 찾아갑니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
            <Compass className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium tracking-wide text-primary">{BRAND_NAME}</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">{BRAND_SUBTITLE}</h1>
          <p className="text-sm text-muted-foreground">{BRAND_CORE}</p>
        </header>

        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground text-right">
            {step + 1} / {steps.length} · {current?.title}
          </p>
        </div>

        <Card className="border-border/60 bg-card/70 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{current?.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {current?.id === 'intro' && (
              <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>{BRAND_NOTICE}</p>
                <p>정답이 없는 질문들입니다. 잘 모르겠는 항목은 ‘잘 모르겠어요’를 골라주세요. 약 3~5분이면 충분합니다.</p>
              </div>
            )}

            {current?.id === 'basic' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>학생 이름</Label>
                  <Input value={a.student_name} onChange={(e) => setA({ ...a, student_name: e.target.value })} placeholder="예: 김민준" />
                </div>
                <div className="space-y-2">
                  <Label>누가 작성하시나요?</Label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(AUTHOR_LABEL) as AuthorType[]).map((t) => (
                      <button key={t} type="button" onClick={() => setA({ ...a, author_type: t })}
                        className={`rounded-full border px-3.5 py-2 text-sm min-h-[40px] ${a.author_type === t ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                        {AUTHOR_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>학교급</Label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(LEVEL_LABEL) as SchoolLevel[]).map((l) => (
                      <button key={l} type="button" onClick={() => setA({ ...a, school_level: l })}
                        className={`rounded-full border px-3.5 py-2 text-sm min-h-[40px] ${a.school_level === l ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                        {LEVEL_LABEL[l]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>학교명 <span className="text-muted-foreground text-xs">(선택)</span></Label>
                    <Input value={a.school_name} onChange={(e) => setA({ ...a, school_name: e.target.value })} placeholder="예: 신길고등학교" />
                  </div>
                  <div className="space-y-2">
                    <Label>학년 <span className="text-muted-foreground text-xs">(선택)</span></Label>
                    <Input value={a.grade} onChange={(e) => setA({ ...a, grade: e.target.value })} placeholder="예: 2학년" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>연락처</Label>
                  <Input value={a.contact_phone} onChange={(e) => setA({ ...a, contact_phone: e.target.value })} placeholder="01012345678" inputMode="numeric" />
                  <div className="flex gap-2 pt-1">
                    {(['parent', 'student'] as const).map((o) => (
                      <button key={o} type="button" onClick={() => setA({ ...a, contact_owner: o })}
                        className={`rounded-full border px-3 py-1.5 text-xs ${a.contact_owner === o ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                        {o === 'parent' ? '보호자 연락처' : '학생 연락처'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>상담 희망 과목</Label>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECTS.map((s) => (
                      <button key={s} type="button"
                        onClick={() => setA((prev) => ({
                          ...prev,
                          subjects: prev.subjects.includes(s) ? prev.subjects.filter((x) => x !== s) : [...prev.subjects, s],
                          priority_subjects: prev.priority_subjects.filter((x) => x !== s || prev.subjects.includes(s)),
                        }))}
                        className={`rounded-full border px-3.5 py-2 text-sm min-h-[40px] ${a.subjects.includes(s) ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {needsPrioritySelection(a.subjects) && (
                  <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <Label className="text-sm">먼저 이야기 나누고 싶은 과목 2개를 골라주세요</Label>
                    <div className="flex flex-wrap gap-2">
                      {a.subjects.map((s) => {
                        const on = a.priority_subjects.includes(s);
                        return (
                          <button key={s} type="button"
                            onClick={() => setA((prev) => ({
                              ...prev,
                              priority_subjects: on
                                ? prev.priority_subjects.filter((x) => x !== s)
                                : [...prev.priority_subjects, s].slice(-2),
                            }))}
                            className={`rounded-full border px-3.5 py-2 text-sm min-h-[40px] ${on ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>상담 희망 방식 <span className="text-muted-foreground text-xs">(선택)</span></Label>
                    <div className="flex flex-wrap gap-2">
                      {METHODS.map((m) => (
                        <button key={m} type="button" onClick={() => setA({ ...a, preferred_method: a.preferred_method === m ? '' : m })}
                          className={`rounded-full border px-3 py-1.5 text-xs ${a.preferred_method === m ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>희망 시간대 <span className="text-muted-foreground text-xs">(선택)</span></Label>
                    <div className="flex flex-wrap gap-2">
                      {TIMES.map((t) => (
                        <button key={t} type="button" onClick={() => setA({ ...a, preferred_time: a.preferred_time === t ? '' : t })}
                          className={`rounded-full border px-3 py-1.5 text-xs ${a.preferred_time === t ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {sections.map((s) =>
              current?.id === s.id ? (
                <div key={s.id} className="space-y-6">
                  {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  {s.questions.map((q) =>
                    renderQuestion(q, s.perspective === 'student' ? 'student_answers' : 'parent_answers')
                  )}
                </div>
              ) : null
            )}

            {current?.id === 'subject' && (
              <div className="space-y-8">
                {targets.map((s) => (
                  <div key={s} className="space-y-5">
                    <Badge variant="outline" className="border-primary/40 text-primary">{s}</Badge>
                    {subjectQuestions(s, level).map((q) => renderQuestion(q, 'subject_answers'))}
                  </div>
                ))}
              </div>
            )}

            {current?.id === 'score' && (
              <div className="space-y-6">
                <p className="text-xs text-muted-foreground">
                  모두 선택 입력입니다. 입력하지 않으셔도 상담과 제안서 작성에 문제가 없습니다.
                </p>
                {scoreQuestions(level).map((q) => renderQuestion(q, 'score_info'))}
              </div>
            )}

            {current?.id === 'comm' && (
              <div className="space-y-6">
                <p className="text-xs text-muted-foreground">소통 방식은 선호일 뿐, 평가 항목이 아닙니다.</p>
                {COMM_QUESTIONS.map((q) => renderQuestion(q, 'comm_pref'))}
              </div>
            )}

            {current?.id === 'final' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>더 하고 싶은 이야기가 있다면 자유롭게 남겨주세요 (선택)</Label>
                  <Textarea value={a.free_note} onChange={(e) => setA({ ...a, free_note: e.target.value })} className="min-h-[110px]" />
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
                  <Checkbox checked={a.consent} onCheckedChange={(v) => setA({ ...a, consent: v === true })} className="mt-0.5" />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    상담 진행을 위해 학생 이름, 연락처, 응답 내용을 수집·이용하는 데 동의합니다.
                    수집한 정보는 상담 목적 외에 사용하지 않으며, 요청 시 삭제해 드립니다.
                  </span>
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3 pb-8">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
            이전
          </Button>
          {current?.id === 'final' ? (
            <Button onClick={submit} disabled={submitting || !a.consent}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}제출하기
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={!canNext}>
              다음
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
