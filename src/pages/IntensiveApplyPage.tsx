// INTENSIVE-APPLY-V1: 여름방학 특강 안내 + 신청서 — 로그인 없이 누구나 열람·제출하는 공개 페이지
// 문자에는 이 페이지 링크만 보내고, 안내 내용은 여기(§POSTER CONTENT)에 전부 담는다.
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, GraduationCap, BookOpen, CalendarClock, CreditCard } from 'lucide-react';

const db = supabase as any;

// 2026 멘토수학 여름특강 — 현 고1·고2 대상, 원장 직강 (포스터 기준 2026-07-10)
const GRADES = ['고1', '고2'];

const EXPECTATION_OPTIONS = [
  '2학기 개념 선행 완성',
  '부족한 개념 보완',
  '내신 대비 미리 준비',
  '심화 문제 풀이 연습',
  '꾸준한 학습 습관 잡기',
  '학교 진도보다 앞서가기',
];

export default function IntensiveApplyPage() {
  const [childName, setChildName] = useState('');
  const [grade, setGrade] = useState('');
  const [expectations, setExpectations] = useState<Set<string>>(new Set());
  const [wishes, setWishes] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function toggleExpectation(v: string) {
    setExpectations(prev => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }

  const canSubmit = childName.trim().length > 0 && grade.length > 0 && agreed && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await db.from('intensive_applications').insert({
        child_name: childName.trim(),
        grade,
        expectations: Array.from(expectations),
        wishes: wishes.trim() || null,
        consent_agreed: true,
      });
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      toast.error(`신청 실패 — 다시 시도해주세요 (${e.message || e})`);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="pt-10 pb-10 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">신청이 접수됐습니다</h2>
              <p className="text-sm text-muted-foreground">
                {childName} 학생({grade}) 여름방학 특강 신청이 완료됐습니다.<br />
                자세한 안내는 순차적으로 문자·전화로 드릴게요.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between text-xs">
          <span className="rounded-full bg-primary/10 text-primary font-bold px-3 py-1">멘토수학과학학원 · 원내 안내</span>
          <span className="font-bold text-muted-foreground">2026 여름특강</span>
        </div>

        {/* ══════ POSTER CONTENT (2026-07-10 기획 이미지 반영) ══════ */}
        <div className="space-y-1">
          <p className="text-sm font-bold text-primary">현 고1 · 고2 대상 · 원장 직강 집중 특강</p>
          <h1 className="text-2xl font-extrabold tracking-tight">2026 멘토수학 여름특강 ✏️</h1>
          <p className="text-sm text-muted-foreground">짧은 방학, 2학기 진도를 미리 끝내고 갑니다.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs font-bold px-3 py-1.5">
          <GraduationCap className="w-3.5 h-3.5" />전 과정 원장 직강
        </span>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: '대상', value: '고1 · 고2' },
                { label: '횟수', value: '총 8회', sub: '회당 120분' },
                { label: '수강료', value: '25만원' },
                { label: '일정', value: '개별 공지' },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p className="font-extrabold text-primary">{item.value}</p>
                  {item.sub && <p className="text-[10px] text-muted-foreground">{item.sub}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <BookOpen className="w-4 h-4 text-primary" />수업 안내
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              고1은 <b className="text-primary">공통수학2</b>, 고2는 <b className="text-primary">미적분1</b> 과정을 진행합니다.<br />
              고등 정규수업 3시간×2회에 더해, <b>주 3회 2시간씩 추가</b>됩니다.<br />
              최대 효율로 2학기 학습 개념을 최대한 훑고 가는 것을 목표로 합니다.
            </p>
            <p className="rounded-lg bg-muted text-center text-sm font-bold py-2.5">
              정규수업 2회 + 방학특강 3회 = 주 5회 집중
            </p>
          </CardContent>
        </Card>

        <div className="flex items-start gap-3 rounded-lg border px-4 py-3.5 bg-sky-50 dark:bg-sky-950/30">
          <CalendarClock className="w-5 h-5 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold">방학 중 일정은 최대한 조율해 진행합니다</p>
            <p className="text-xs text-muted-foreground mt-0.5">시수가 부족한 학생은 개학 후 주말 일정으로 보충 예정</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-rose-200 px-4 py-3.5 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900">
          <CreditCard className="w-5 h-5 text-rose-700 dark:text-rose-300 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-rose-800 dark:text-rose-200">특강료는 8월 수강료에 합산되어 결제됩니다</p>
            <p className="text-xs text-rose-700/80 dark:text-rose-300/80 mt-0.5">별도 결제 없이 8월분에 포함 · 참고 부탁드립니다</p>
          </div>
        </div>

        <p className="text-center font-bold text-lg py-2">2학기 수학 농사, 이번 여름에 결정됩니다 💪</p>
        {/* ══════════════════════════════════════════════════════════ */}

        {/* 기대하는 점 설문 */}
        <Card>
          <CardContent className="pt-6 pb-6 space-y-3">
            <Label className="text-sm font-bold">이번 특강에서 기대하는 점 (복수 선택 가능)</Label>
            <div className="flex flex-wrap gap-2">
              {EXPECTATION_OPTIONS.map(opt => {
                const picked = expectations.has(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleExpectation(opt)}
                    className={`rounded-full border-2 px-3 py-1.5 text-sm font-medium transition
                      ${picked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="wishes" className="text-xs text-muted-foreground">바라는 점이 있다면 자유롭게 남겨주세요 (선택)</Label>
              <Textarea
                id="wishes"
                placeholder="예: 서술형 문제를 더 다뤄주셨으면 해요"
                value={wishes}
                onChange={e => setWishes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* 신청서 */}
        <Card>
          <CardContent className="pt-6 pb-6 space-y-4">
            <p className="text-base font-bold">신청서</p>
            <div className="space-y-1.5">
              <Label htmlFor="childName" className="text-xs">아이 이름</Label>
              <Input
                id="childName"
                placeholder="홍길동"
                value={childName}
                onChange={e => setChildName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">학년</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger disabled={submitting}><SelectValue placeholder="학년을 선택해주세요" /></SelectTrigger>
                <SelectContent>
                  {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border px-3 py-3 cursor-pointer select-none">
              <Checkbox checked={agreed} onCheckedChange={v => setAgreed(v === true)} disabled={submitting} className="mt-0.5" />
              <span className="text-xs leading-relaxed text-foreground">
                특강 신청에 동의하며, <b>8월 수강료에 특강비 25만원이 추가</b>됨에 동의합니다.
              </span>
            </label>

            <Button className="w-full" size="lg" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />제출 중...</> : '신청서 제출하기'}
            </Button>
            {!agreed && (childName.trim() || grade) && (
              <p className="text-[11px] text-center text-muted-foreground">동의 체크 후 제출할 수 있어요</p>
            )}
          </CardContent>
        </Card>

        <div className="text-center pb-2">
          <span className="inline-block rounded-full bg-primary text-primary-foreground font-bold px-6 py-2.5">
            멘토수학과학학원
          </span>
        </div>
        <p className="text-center text-[11px] text-muted-foreground pb-4">
          더 멘토 학원 | 대표: 황은지
        </p>
      </div>
    </div>
  );
}
