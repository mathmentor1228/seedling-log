import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, BookOpen, ClipboardCheck, FileText } from 'lucide-react';
import { MathRenderer } from '@/components/math/MathRenderer';
import logoImg from '@/assets/logo-thementor.png';

type PrintMode = 'study' | 'quiz' | 'blank';

interface QuizQuestion {
  question_number: number;
  question_type: 'fill_blank' | 'true_false' | 'short_answer';
  question_text: string;
  answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface PrintData {
  quizId: string;
  conceptTitle: string;
  course: string;
  grade: string;
  subject: string;
  questions: QuizQuestion[];
}

const MODE_CONFIG: Record<PrintMode, { label: string; icon: typeof BookOpen; subtitle: string; footer: string }> = {
  study: {
    label: '셀프 개념 학습지',
    icon: BookOpen,
    subtitle: '개념서를 보며 빈칸을 채워보세요',
    footer: '빈칸을 채운 후 아래 메모칸에 이 단원의 핵심 개념을 내 말로 정리해 보세요! 💡',
  },
  quiz: {
    label: '퀴즈 테스트지',
    icon: ClipboardCheck,
    subtitle: '개념 이해도를 확인하는 퀴즈입니다',
    footer: '정답은 박스 안에 정자로 바르게 적어주세요! 우리 똑부러지는 멘토 학생들은 충분히 할 수 있어요! 화이팅! ✨',
  },
  blank: {
    label: '백지 테스트지',
    icon: FileText,
    subtitle: '키워드를 보고 스스로 정의와 성질을 서술하세요',
    footer: '각 키워드의 정의, 성질, 조건을 빠짐없이 서술해 보세요! 개념을 완벽히 내 것으로! 🔥',
  },
};

export default function QuizPrintPage() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quiz_id');
  const studentId = searchParams.get('student_id');
  const studentName = searchParams.get('student_name') || '';
  const [data, setData] = useState<PrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PrintMode>('quiz');
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  useEffect(() => {
    if (!quizId) { setLoading(false); return; }
    (async () => {
      const { data: quiz, error } = await supabase
        .from('math_concept_quizzes')
        .select('id, questions, math_concepts(title, course, grade, subject)')
        .eq('id', quizId)
        .single();
      if (error || !quiz) { setLoading(false); return; }
      const concept = (quiz as any).math_concepts;
      setData({
        quizId: quiz.id,
        conceptTitle: concept?.title || '',
        course: concept?.course || '',
        grade: concept?.grade || '',
        subject: concept?.subject || '수학',
        questions: (quiz.questions as any) as QuizQuestion[],
      });
      setLoading(false);
    })();
  }, [quizId]);

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const qrPayload = data ? `${window.location.origin}/quiz-submit?quiz_id=${data.quizId}${studentId ? `&student_id=${studentId}` : ''}` : '';
  const config = MODE_CONFIG[mode];

  // Extract keywords from questions for blank test mode
  const keywords = useMemo(() => {
    if (!data) return [];
    const kws = new Set<string>();
    data.questions.forEach(q => {
      // Extract answer as keyword
      if (q.answer) kws.add(q.answer.trim());
    });
    return Array.from(kws);
  }, [data]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-screen text-destructive">퀴즈를 찾을 수 없습니다.</div>;

  const typeLabel = (t: string) => {
    switch (t) {
      case 'fill_blank': return '빈칸';
      case 'true_false': return 'O/X';
      case 'short_answer': return '단답';
      default: return '';
    }
  };

  // ─── Study mode: replace answer keywords with blanks in question text ───
  const studyText = (q: QuizQuestion) => {
    const ans = q.answer.trim();
    if (!ans) return q.question_text;
    // Replace the answer within the question text with a blank
    const text = q.question_text;
    if (text.includes('___BLANK___')) return text; // already has blanks
    // Try to replace answer in text with blank
    if (text.includes(ans)) {
      return text.replace(ans, '___BLANK___');
    }
    return text;
  };

  // ─── Render helpers ───
  const renderHeader = () => (
    <div className="quiz-header flex items-start justify-between border-b-2 border-foreground pb-4 mb-5">
      <div className="flex items-center gap-3">
        <img src={logoImg} alt="더멘토" className="h-11 w-auto object-contain" />
        <div>
          <h1 className="text-lg font-bold leading-tight">{config.label}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{config.subtitle}</p>
          <p className="text-sm mt-1">
            {data.subject} · {data.grade} · {data.course}
          </p>
          <p className="text-sm font-semibold mt-0.5">{data.conceptTitle}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <QRCodeSVG value={qrPayload} size={68} level="M" />
        <span className="text-[9px] text-muted-foreground">QR로 제출하기</span>
      </div>
    </div>
  );

  const renderInfoRow = () => (
    <div className="flex gap-6 mb-5 text-sm">
      <span>이름: <span className="inline-block border-b border-foreground min-w-[120px]">{studentName || '\u00A0'}</span></span>
      <span>날짜: <span className="inline-block border-b border-foreground min-w-[100px]">{today}</span></span>
      <span>점수: _______ / {data.questions.length}</span>
      <span className="ml-auto text-xs text-muted-foreground">대표 황은지</span>
    </div>
  );

  const renderAnswerKeyBanner = () => showAnswerKey && (
    <div className="mb-4 text-center text-xs font-bold text-primary border border-primary/20 bg-primary/5 rounded py-1.5">
      ※ 답지 (정답 포함)
    </div>
  );

  const renderFooter = () => (
    <div className="quiz-footer mt-8 pt-3 border-t border-dashed text-center text-sm text-muted-foreground">
      {config.footer}
    </div>
  );

  // ═══════════════════════════════════════════
  // MODE: QUIZ (current default)
  // ═══════════════════════════════════════════
  const renderQuizMode = () => {
    const mid = Math.ceil(data.questions.length / 2);
    const col1 = data.questions.slice(0, mid);
    const col2 = data.questions.slice(mid);

    const renderQ = (q: QuizQuestion) => (
      <div key={q.question_number} className="quiz-question mb-5">
        <div className="flex items-start gap-2">
          <span className="font-bold text-sm shrink-0 w-6 text-right">{q.question_number}.</span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-muted-foreground mr-1">[{typeLabel(q.question_type)}]</span>
            <span className="text-sm leading-relaxed"><MathRenderer text={q.question_text} /></span>
          </div>
        </div>
        <div className="mt-2 ml-8 border-2 border-foreground/40 rounded-md h-10 flex items-center px-3">
          {showAnswerKey && (
            <span className="text-sm font-semibold text-primary"><MathRenderer text={q.answer} /></span>
          )}
        </div>
      </div>
    );

    return (
      <div className="quiz-columns grid grid-cols-2 gap-x-8 gap-y-0">
        <div className="quiz-col">{col1.map(renderQ)}</div>
        <div className="quiz-col">{col2.map(renderQ)}</div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // MODE: STUDY (self-concept worksheet)
  // ═══════════════════════════════════════════
  const renderStudyMode = () => {
    const mid = Math.ceil(data.questions.length / 2);
    const col1 = data.questions.slice(0, mid);
    const col2 = data.questions.slice(mid);

    const renderQ = (q: QuizQuestion) => (
      <div key={q.question_number} className="quiz-question mb-5">
        <div className="flex items-start gap-2">
          <span className="font-bold text-sm shrink-0 w-6 text-right">{q.question_number}.</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm leading-relaxed"><MathRenderer text={studyText(q)} /></span>
          </div>
        </div>
        <div className="mt-2 ml-8 border-2 border-foreground/40 rounded-md h-10 flex items-center px-3">
          {showAnswerKey && (
            <span className="text-sm font-semibold text-primary"><MathRenderer text={q.answer} /></span>
          )}
        </div>
      </div>
    );

    return (
      <>
        <div className="quiz-columns grid grid-cols-2 gap-x-8 gap-y-0">
          <div className="quiz-col">{col1.map(renderQ)}</div>
          <div className="quiz-col">{col2.map(renderQ)}</div>
        </div>
        {/* Concept summary memo area */}
        <div className="mt-6 border-2 border-foreground/30 rounded-lg p-4">
          <p className="text-sm font-semibold mb-2">📝 개념 정리 메모</p>
          <p className="text-xs text-muted-foreground mb-3">이 단원의 핵심 개념을 내 말로 정리해 보세요.</p>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-foreground/20 h-8 mb-1" />
          ))}
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════
  // MODE: BLANK (keyword-only test)
  // ═══════════════════════════════════════════
  const renderBlankMode = () => (
    <div className="space-y-5">
      <p className="text-sm font-medium mb-2">아래 핵심 키워드의 <strong>정의, 성질, 조건</strong>을 직접 서술하세요.</p>
      {keywords.map((kw, idx) => (
        <div key={idx} className="quiz-question">
          <div className="flex items-start gap-3">
            <span className="font-bold text-sm shrink-0 w-6 text-right">{idx + 1}.</span>
            <span className="text-sm font-semibold border border-foreground/40 rounded px-2 py-0.5 bg-muted/30 shrink-0">
              <MathRenderer text={kw} />
            </span>
          </div>
          <div className="ml-9 mt-2 space-y-1">
            {Array.from({ length: 4 }).map((_, li) => (
              <div key={li} className="border-b border-foreground/20 h-8" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const modeContent = mode === 'quiz' ? renderQuizMode() : mode === 'study' ? renderStudyMode() : renderBlankMode();

  return (
    <div className="quiz-print-wrapper">
      {/* ─── Screen-only toolbar ─── */}
      <div className="print:hidden max-w-4xl mx-auto px-4 pt-4 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> 돌아가기
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Mode selector */}
        {(Object.entries(MODE_CONFIG) as [PrintMode, typeof config][]).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={() => { setMode(key); setShowAnswerKey(false); }}
              className={mode === key ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
            >
              <Icon className="w-3.5 h-3.5 mr-1" /> {cfg.label}
            </Button>
          );
        })}

        <div className="h-5 w-px bg-border mx-1" />

        {mode !== 'blank' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnswerKey(!showAnswerKey)}
            className={showAnswerKey ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {showAnswerKey ? '답지 보기 중' : '답지 보기'}
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
        </Button>
      </div>

      {/* ─── Printable area ─── */}
      <div className="quiz-print-area max-w-4xl mx-auto p-8">
        {renderHeader()}
        {renderInfoRow()}
        {renderAnswerKeyBanner()}
        {modeContent}
        {renderFooter()}
      </div>

      <style>{`
        @media print {
          @page {
            margin: 12mm 10mm;
            size: A4;
          }
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          .quiz-print-area,
          .quiz-print-area * {
            visibility: visible;
          }
          .quiz-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .quiz-answer-box,
          .quiz-question .border-2 {
            border-color: #333 !important;
          }
          /* Prevent question split across pages */
          .quiz-question {
            break-inside: avoid;
          }
        }
        .quiz-print-area {
          font-family: 'Pretendard', sans-serif;
        }
        /* Ensure MathRenderer inline HTML renders correctly */
        .quiz-print-area .math-renderer span {
          all: revert;
        }
      `}</style>
    </div>
  );
}
