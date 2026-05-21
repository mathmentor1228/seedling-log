import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Question {
  questionNumber: number;
  type: 'eng_to_kor' | 'kor_to_eng';
  prompt: string;
  answer: string;
}

const STRICT_LABEL: Record<string, string> = {
  strict: '🌶️ 매운맛',
  normal: '🍜 보통맛',
  lenient: '🍦 순한맛',
};

export default function VocabTestViewPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [test, setTest] = useState<{ title: string; test_data: Question[]; grading_strictness: string } | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('토큰이 없습니다'); setLoading(false); return; }
    supabase
      .from('vocab_generated_tests')
      .select('title, test_data, grading_strictness')
      .eq('share_token', token)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) setError('시험지를 찾을 수 없습니다');
        else setTest({
          title: data.title,
          test_data: data.test_data as unknown as Question[],
          grading_strictness: (data as any).grading_strictness || 'normal',
        });
        setLoading(false);
      });
  }, [token]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  if (error || !test) return <div className="flex items-center justify-center min-h-screen text-destructive">{error}</div>;

  const questions = test.test_data;
  const submitUrl = `${window.location.origin}/vocab-submit?token=${token}`;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6 print:hidden">
        <Button variant="outline" size="sm" onClick={() => setShowAnswers(false)} className={!showAnswers ? 'bg-primary text-primary-foreground' : ''}>
          시험지
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAnswers(true)} className={showAnswers ? 'bg-primary text-primary-foreground' : ''}>
          답지
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
        </Button>
      </div>

      <div className="print-area">
        <div className="flex items-start justify-between mb-4 border-b pb-3 gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold">{test.title}</h2>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
              <span>이름: ________________</span>
              <span>점수: _______ / {questions.length}</span>
              <span>채점: {STRICT_LABEL[test.grading_strictness] || '🍜 보통맛'}</span>
            </div>
          </div>
          <div className="text-center shrink-0">
            <QRCodeSVG value={submitUrl} size={72} level="M" />
            <div className="text-[9px] text-muted-foreground mt-0.5">QR로 셀프 채점</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {questions.map(q => (
            <div key={q.questionNumber} className="flex items-baseline gap-2 py-1 border-b border-dashed text-sm">
              <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">{q.questionNumber}.</span>
              <span className="font-medium min-w-[100px]">{q.prompt}</span>
              {showAnswers ? (
                <span className="text-primary font-medium ml-auto">{q.answer}</span>
              ) : (
                <span className="ml-auto text-muted-foreground/30 flex-1 border-b border-dotted min-w-[80px]" />
              )}
            </div>
          ))}
        </div>

        {showAnswers && (
          <div className="mt-4 pt-2 border-t text-center text-xs text-muted-foreground">※ 답지</div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
