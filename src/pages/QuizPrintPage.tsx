import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { MathRenderer } from '@/components/math/MathRenderer';
import logoImg from '@/assets/logo-thementor.png';

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

export default function QuizPrintPage() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quiz_id');
  const studentId = searchParams.get('student_id');
  const studentName = searchParams.get('student_name') || '';
  const [data, setData] = useState<PrintData | null>(null);
  const [loading, setLoading] = useState(true);
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

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-screen text-destructive">퀴즈를 찾을 수 없습니다.</div>;

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const qrPayload = `${window.location.origin}/quiz-submit?quiz_id=${data.quizId}${studentId ? `&student_id=${studentId}` : ''}`;

  // Split questions into two columns
  const mid = Math.ceil(data.questions.length / 2);
  const col1 = data.questions.slice(0, mid);
  const col2 = data.questions.slice(mid);

  const typeLabel = (t: string) => {
    switch (t) {
      case 'fill_blank': return '빈칸';
      case 'true_false': return 'O/X';
      case 'short_answer': return '단답';
      default: return '';
    }
  };

  const renderQuestion = (q: QuizQuestion) => (
    <div key={q.question_number} className="quiz-question mb-3">
      <div className="flex items-start gap-2">
        <span className="quiz-q-num font-bold text-sm shrink-0 w-6 text-right">{q.question_number}.</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground mr-1">[{typeLabel(q.question_type)}]</span>
          <span className="text-sm"><MathRenderer text={q.question_text} /></span>
        </div>
      </div>
      <div className="quiz-answer-box mt-1 ml-8 border-2 border-foreground/40 rounded-md h-8 flex items-center px-2">
        {showAnswerKey && (
          <span className="text-sm font-semibold text-primary"><MathRenderer text={q.answer} /></span>
        )}
      </div>
    </div>
  );

  return (
    <div className="quiz-print-wrapper">
      {/* Screen-only toolbar */}
      <div className="print:hidden max-w-4xl mx-auto px-4 pt-4 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> 돌아가기
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAnswerKey(false)}
          className={!showAnswerKey ? 'bg-primary text-primary-foreground' : ''}>
          시험지
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAnswerKey(true)}
          className={showAnswerKey ? 'bg-primary text-primary-foreground' : ''}>
          답지
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
        </Button>
      </div>

      {/* Printable area */}
      <div className="quiz-print-area max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="quiz-header flex items-start justify-between border-b-2 border-foreground pb-3 mb-4">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="더멘토" className="h-10 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-bold">개념 확인 퀴즈</h1>
              <p className="text-sm text-muted-foreground">
                {data.subject} · {data.grade} · {data.course}
              </p>
              <p className="text-sm font-medium mt-0.5">{data.conceptTitle}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <QRCodeSVG value={qrPayload} size={72} level="M" />
            <span className="text-[10px] text-muted-foreground">QR로 제출하기</span>
          </div>
        </div>

        {/* Student info row */}
        <div className="flex gap-6 mb-4 text-sm">
          <span>이름: <span className="inline-block border-b border-foreground min-w-[120px]">{studentName || '\u00A0'}</span></span>
          <span>날짜: <span className="inline-block border-b border-foreground min-w-[100px]">{today}</span></span>
          <span>점수: _______ / {data.questions.length}</span>
        </div>

        {showAnswerKey && (
          <div className="mb-3 text-center text-xs font-bold text-primary border border-primary/20 bg-primary/5 rounded py-1">
            ※ 답지 (정답 포함)
          </div>
        )}

        {/* Two-column questions */}
        <div className="quiz-columns grid grid-cols-2 gap-x-6 gap-y-0">
          <div className="quiz-col">{col1.map(renderQuestion)}</div>
          <div className="quiz-col">{col2.map(renderQuestion)}</div>
        </div>

        {/* Friendly footer */}
        <div className="quiz-footer mt-6 pt-3 border-t border-dashed text-center text-sm text-muted-foreground">
          정답은 박스 안에 정자로 바르게 적어주세요! 우리 똑부러지는 멘토 학생들은 충분히 할 수 있어요! 화이팅! ✨
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body * { visibility: hidden; }
          .quiz-print-area, .quiz-print-area * { visibility: visible; }
          .quiz-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          .quiz-answer-box { border-color: #333 !important; }
        }
        .quiz-print-area { font-family: 'Pretendard', sans-serif; }
      `}</style>
    </div>
  );
}
