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
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';

const db = supabase as any;

// TODO(POSTER CONTENT): 원장님이 주시는 실제 포스터 문구로 교체
const GRADES = ['초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'];

const EXPECTATION_OPTIONS = [
  '부족한 개념 완전정복',
  '2학기 선행 진도',
  '취약 유형 집중 훈련',
  '내신 대비 심화',
  '꾸준한 공부 습관',
  '기초 체력(연산·독해) 다지기',
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
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col items-center text-center">
          <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-3">
            <span className="text-primary-foreground font-bold text-lg">M</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">더멘토학원</h1>
          <p className="text-xs text-muted-foreground mt-0.5">2026 여름방학 특강 안내</p>
        </div>

        {/* ══════ POSTER CONTENT — 여기를 실제 포스터 문구로 교체 ══════ */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 pb-6 space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
              <Sparkles className="w-4 h-4" />2026 여름방학 특강
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              (안내 문구 준비 중 — 기간·과목·시간표·특강비 등 상세 내용이 이 자리에 들어갑니다)
            </p>
          </CardContent>
        </Card>
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

        <p className="text-center text-[11px] text-muted-foreground pb-4">
          더 멘토 학원 | 대표: 황은지
        </p>
      </div>
    </div>
  );
}
