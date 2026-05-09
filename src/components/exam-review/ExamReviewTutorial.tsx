import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Upload, ScanLine, Send, UserCheck, Sparkles, ShieldCheck, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'exam_review_tutorial_seen_v1';

interface Step {
  icon: React.ElementType;
  title: string;
  who: string;
  body: string;
  tips?: string[];
}

const STEPS: Step[] = [
  {
    icon: Upload,
    title: '1. 학생 시험지 제출 확인',
    who: '학생',
    body: '학생이 본인 앱에서 시험 결과(과목/연도/학기/유형/예상점수)와 시험지 사진을 제출합니다. 좌측 목록의 "대기" 상태가 새 제출 건입니다.',
    tips: ['좌측 상단에서 과목 필터로 본인 담당만 빠르게 추릴 수 있어요.'],
  },
  {
    icon: ScanLine,
    title: '2. 채점 템플릿 확인 / 생성',
    who: '담당교사',
    body: '학생을 선택하면 해당 시험의 채점 템플릿(문항 수, 배점, 객관/서술 구분, 정답)을 자동으로 불러옵니다. 없으면 시험지 PDF를 업로드해 AI 스캔으로 자동 생성하세요.',
    tips: ['AI가 잘못 인식한 배점/유형은 셀을 클릭해 바로 수정할 수 있습니다.'],
  },
  {
    icon: CheckCircle2,
    title: '3. 사진 위 직접 채점',
    who: '담당교사',
    body: '시험지 사진 위에 문항별 정답/오답/부분정답을 클릭으로 표시합니다. 점수가 자동 합산되어 상단에 표시됩니다.',
    tips: ['부분정답은 배점의 절반으로 자동 계산됩니다.', '한 페이지의 모든 문항을 채점하면 다음 페이지로 자동 이동합니다.'],
  },
  {
    icon: Send,
    title: '4. 학생 자가진단 요청',
    who: '담당교사',
    body: '채점 완료 후 "자가진단 요청"을 누르면 학생 앱에서 틀린 문제마다 본인이 왜 틀렸는지(개념 헷갈림, 실수, 더 풀고 싶음 등)를 직접 체크합니다.',
    tips: ['학생이 작성한 사유는 우측 패널에 직관적으로 표시됩니다 — 💬는 직접 작성한 이유, 📌는 도움 요청.'],
  },
  {
    icon: Sparkles,
    title: '5. AI 코멘트 생성 + 교사 검토',
    who: '담당교사',
    body: '학생 자가진단이 완료되면 "AI 종합 코멘트 생성" 버튼이 활성화됩니다. AI가 만든 초안을 읽고 직접 다듬어 저장하세요.',
    tips: ['AI 초안을 그대로 학생에게 노출하지 마세요. 반드시 한 번 검토 후 수정 → 저장.'],
  },
  {
    icon: ShieldCheck,
    title: '6. 원장 최종 공개 승인',
    who: '원장',
    body: '교사가 검토를 마친 리뷰는 "원장 검토중" 상태가 됩니다. 원장만 "공개 승인" 버튼으로 학생 앱에 리뷰를 노출시킬 수 있습니다.',
    tips: ['승인 전까지 학생 앱에서는 점수/오답유형/코멘트가 가려집니다.', '공개 후에도 수정이 가능하며, 변경사항은 즉시 반영됩니다.'],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExamReviewTutorial({ open, onOpenChange }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;

  useEffect(() => { if (open) setStep(0); }, [open]);

  const handleClose = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            시험지 리뷰 사용 가이드
          </DialogTitle>
          <DialogDescription>
            학생 제출부터 원장 공개 승인까지 전체 워크플로우를 단계별로 안내합니다.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-muted',
              )}
              aria-label={`${i + 1}단계로 이동`}
            />
          ))}
        </div>

        <ScrollArea className="max-h-[55vh] pr-2">
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-base font-bold">{current.title}</h3>
                  <Badge variant="outline" className="text-[10px]">{current.who}</Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{current.body}</p>
              </div>
            </div>

            {current.tips && current.tips.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="mb-1.5 text-xs font-semibold text-foreground">💡 팁</div>
                <ul className="space-y-1">
                  {current.tips.map((tip, i) => (
                    <li key={i} className="text-xs leading-relaxed text-muted-foreground">• {tip}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick reference status flow */}
            {step === STEPS.length - 1 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 text-xs font-semibold">상태 흐름 한눈에 보기</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Badge variant="secondary">대기</Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary">채점중</Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary">자가진단 대기</Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary">AI 코멘트</Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary">원장 검토중</Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Badge className="bg-success text-success-foreground">공개 완료</Badge>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="mr-1 h-4 w-4" /> 이전
          </Button>
          <span className="text-xs text-muted-foreground">{step + 1} / {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              다음 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleClose}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> 시작하기
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useExamReviewTutorialAutoOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {}
  }, []);
  return [open, setOpen] as const;
}
