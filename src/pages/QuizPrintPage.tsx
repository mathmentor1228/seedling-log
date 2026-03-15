import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, BookOpen, ClipboardCheck, FileText, Calculator } from 'lucide-react';
import { MathRenderer } from '@/components/math/MathRenderer';
import logoImg from '@/assets/logo-thementor.png';

type PrintMode = 'study' | 'quiz' | 'blank' | 'example';

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

function stripHtml(str: string): string {
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/___BLANK___/g, '')
    .trim();
}

const KEYWORD_BLACKLIST = new Set([
  '참', '거짓', 'O', 'X', 'o', 'x', 'O/X', '단답', '빈칸',
  '맞다', '틀리다', '예', '아니오', '네', '아니요',
  'true', 'false', 'TRUE', 'FALSE', 'True', 'False',
]);

function isValidKeyword(kw: string): boolean {
  if (!kw || kw.length < 2) return false;
  if (KEYWORD_BLACKLIST.has(kw)) return false;
  if (/^[.,;:!?~\-=+*\/\\]+$/.test(kw)) return false;
  return true;
}

const MODE_META: Record<PrintMode, { label: string; icon: typeof BookOpen; subtitle: string; footer: string }> = {
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
  example: {
    label: '기초 예제 학습지',
    icon: Calculator,
    subtitle: '개념을 숫자와 식에 대입하여 연습하세요',
    footer: '풀이 과정을 빠짐없이 적어주세요! 기초가 탄탄해야 실력이 쑥쑥! 💪',
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

  const keywords = useMemo(() => {
    if (!data) return [] as string[];
    const seen = new Set<string>();
    const result: string[] = [];
    data.questions.forEach(q => {
      if (q.question_type === 'true_false') return;
      const clean = stripHtml(q.answer);
      if (isValidKeyword(clean) && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    });
    return result;
  }, [data]);

  // Example mode: filter to short_answer/fill_blank questions that look like computation
  const exampleQuestions = useMemo(() => {
    if (!data) return [];
    return data.questions.filter(q =>
      q.question_type !== 'true_false' &&
      (q.difficulty === 'easy' || q.difficulty === 'medium')
    );
  }, [data]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-screen text-destructive">퀴즈를 찾을 수 없습니다.</div>;

  const cfg = MODE_META[mode];

  const typeLabel = (t: string) => {
    switch (t) {
      case 'fill_blank': return '빈칸';
      case 'true_false': return 'O/X';
      case 'short_answer': return '단답';
      default: return '';
    }
  };

  const toStudyText = (q: QuizQuestion): string => {
    const ans = stripHtml(q.answer);
    if (!ans) return q.question_text;
    if (q.question_text.includes('___BLANK___')) return q.question_text;
    const plainText = stripHtml(q.question_text);
    if (plainText.includes(ans)) {
      return plainText.replace(ans, '___BLANK___');
    }
    return plainText + ' ___BLANK___';
  };

  const Header = () => (
    <div className="flex items-start justify-between border-b-2 border-foreground/80 pb-4 mb-5">
      <div className="flex items-center gap-3">
        <img src={logoImg} alt="더멘토" className="h-11 w-auto object-contain print-logo" />
        <div>
          <h1 className="text-lg font-bold leading-tight">{cfg.label}</h1>
          <p className="text-[11px] text-muted-foreground">{cfg.subtitle}</p>
          <p className="text-sm mt-1">{data.subject} · {data.grade} · {data.course}</p>
          <p className="text-sm font-semibold mt-0.5">{data.conceptTitle}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <QRCodeSVG value={qrPayload} size={68} level="M" />
        <span className="text-[9px] text-muted-foreground">QR로 제출하기</span>
      </div>
    </div>
  );

  const InfoRow = () => (
    <div className="flex flex-wrap gap-x-6 gap-y-1 mb-5 text-sm">
      <span>이름: <span className="inline-block border-b border-foreground min-w-[120px]">{studentName || '\u00A0'}</span></span>
      <span>날짜: <span className="inline-block border-b border-foreground min-w-[100px]">{today}</span></span>
      <span>점수: _______ / {mode === 'blank' ? keywords.length : mode === 'example' ? exampleQuestions.length : data.questions.length}</span>
      <span className="ml-auto text-xs text-muted-foreground">대표 황은지</span>
    </div>
  );

  const Footer = () => (
    <div className="mt-10 pt-4 border-t-2 border-foreground/20 break-inside-avoid">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="더멘토" className="h-7 w-auto object-contain print-logo opacity-70" />
          <span className="text-xs text-muted-foreground">대표 황은지</span>
        </div>
        <p className="text-sm text-muted-foreground italic">{cfg.footer}</p>
      </div>
    </div>
  );

  const QuestionItem = ({ q, textOverride }: { q: QuizQuestion; textOverride?: string }) => (
    <div className="qp-item mb-6 break-inside-avoid">
      <div className="flex items-start gap-2">
        <span className="font-bold text-sm shrink-0 w-6 text-right">{q.question_number}.</span>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-muted-foreground mr-1">[{typeLabel(q.question_type)}]</span>
          <span className="text-sm leading-relaxed">
            <MathRenderer text={textOverride ?? q.question_text} />
          </span>
        </div>
      </div>
      <div className="mt-2.5 ml-8 border-2 border-foreground/40 rounded-md h-11 flex items-center px-3">
        {showAnswerKey && (
          <span className="text-sm font-semibold" style={{ color: 'hsl(217,91%,60%)' }}>
            <MathRenderer text={q.answer} />
          </span>
        )}
      </div>
    </div>
  );

  // Example mode question with larger workspace
  const ExampleQuestionItem = ({ q, num }: { q: QuizQuestion; num: number }) => (
    <div className="qp-item mb-8 break-inside-avoid">
      <div className="flex items-start gap-2">
        <span className="font-bold text-sm shrink-0 w-6 text-right">{num}.</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm leading-relaxed">
            <MathRenderer text={q.question_text} />
          </span>
        </div>
      </div>
      {/* Larger workspace for computation */}
      <div className="mt-3 ml-8 border-2 border-foreground/30 rounded-md p-3 min-h-[100px]">
        {showAnswerKey ? (
          <span className="text-sm font-semibold" style={{ color: 'hsl(217,91%,60%)' }}>
            <MathRenderer text={q.answer} />
          </span>
        ) : (
          <p className="text-xs text-muted-foreground">풀이:</p>
        )}
      </div>
    </div>
  );

  const QuizMode = () => {
    const mid = Math.ceil(data.questions.length / 2);
    return (
      <div className="grid grid-cols-2 gap-x-8">
        <div>{data.questions.slice(0, mid).map(q => <QuestionItem key={q.question_number} q={q} />)}</div>
        <div>{data.questions.slice(mid).map(q => <QuestionItem key={q.question_number} q={q} />)}</div>
      </div>
    );
  };

  const StudyMode = () => {
    const mid = Math.ceil(data.questions.length / 2);
    return (
      <>
        <div className="grid grid-cols-2 gap-x-8">
          <div>{data.questions.slice(0, mid).map(q => <QuestionItem key={q.question_number} q={q} textOverride={toStudyText(q)} />)}</div>
          <div>{data.questions.slice(mid).map(q => <QuestionItem key={q.question_number} q={q} textOverride={toStudyText(q)} />)}</div>
        </div>
        <div className="mt-6 border-2 border-foreground/30 rounded-lg p-4 break-inside-avoid">
          <p className="text-sm font-semibold mb-1">📝 개념 정리 메모</p>
          <p className="text-xs text-muted-foreground mb-3">이 단원의 핵심 개념을 내 말로 정리해 보세요.</p>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-foreground/20 h-9" />
          ))}
        </div>
      </>
    );
  };

  const BlankMode = () => (
    <div className="space-y-8">
      <p className="text-sm font-medium">아래 핵심 키워드의 <strong>정의, 성질, 조건</strong>을 직접 서술하세요.</p>
      {keywords.map((kw, idx) => (
        <div key={idx} className="break-inside-avoid">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm shrink-0 w-6 text-right">{idx + 1}.</span>
            <span className="text-sm font-semibold border border-foreground/40 rounded px-3 py-1.5 bg-muted/30 inline-block min-w-[100px] text-center">
              <MathRenderer text={kw} />
            </span>
          </div>
          <div className="ml-9 mt-3 space-y-1">
            {Array.from({ length: 5 }).map((_, li) => (
              <div key={li} className="border-b border-foreground/20 h-10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const ExampleMode = () => {
    const qs = exampleQuestions;
    const mid = Math.ceil(qs.length / 2);
    return (
      <>
        <p className="text-sm font-medium mb-4">아래 문제의 풀이 과정을 자세히 작성하세요.</p>
        <div className="grid grid-cols-2 gap-x-8">
          <div>{qs.slice(0, mid).map((q, i) => <ExampleQuestionItem key={i} q={q} num={i + 1} />)}</div>
          <div>{qs.slice(mid).map((q, i) => <ExampleQuestionItem key={i} q={q} num={mid + i + 1} />)}</div>
        </div>
      </>
    );
  };

  return (
    <div className="quiz-print-wrapper">
      {/* Toolbar (screen only) */}
      <div className="print:hidden max-w-4xl mx-auto px-4 pt-4 pb-2 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> 돌아가기
        </Button>
        <div className="h-5 w-px bg-border mx-1" />
        {(Object.entries(MODE_META) as [PrintMode, typeof cfg][]).map(([key, m]) => {
          const Icon = m.icon;
          return (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={() => { setMode(key); setShowAnswerKey(false); }}
              className={mode === key ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
            >
              <Icon className="w-3.5 h-3.5 mr-1" /> {m.label}
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

      {/* Printable area */}
      <div className="quiz-print-area max-w-4xl mx-auto p-8">
        <Header />
        <InfoRow />
        {showAnswerKey && mode !== 'blank' && (
          <div className="mb-4 text-center text-xs font-bold border rounded py-1.5" style={{ color: 'hsl(217,91%,60%)', borderColor: 'hsl(217,91%,60%,0.2)', backgroundColor: 'hsl(217,91%,60%,0.05)' }}>
            ※ 답지 (정답 포함)
          </div>
        )}
        {mode === 'quiz' && <QuizMode />}
        {mode === 'study' && <StudyMode />}
        {mode === 'blank' && <BlankMode />}
        {mode === 'example' && <ExampleMode />}
        <Footer />
      </div>

      <style>{`
        @media print {
          @page { margin: 14mm 12mm; size: A4; }
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .quiz-print-area, .quiz-print-area * { visibility: visible; }
          .quiz-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .print\\:hidden { display: none !important; }
          .qp-item { break-inside: avoid; margin-bottom: 1.5rem; }
          .break-inside-avoid { break-inside: avoid; }
          .math-graph-svg { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        .quiz-print-area { font-family: 'Pretendard', sans-serif; }
      `}</style>
    </div>
  );
}
