import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Printer, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MathRenderer } from '@/components/math/MathRenderer';

interface QuizResult {
  id: string;
  answer_code: string;
  title: string | null;
  version_number: number;
  version_label: string | null;
  questions: any[];
  created_at: string;
  concept_title: string;
  course: string;
  grade: string;
}

function QuizLookupContent() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSearch = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);

    const { data, error } = await supabase
      .from('math_concept_quizzes')
      .select('id, answer_code, title, version_number, version_label, questions, created_at, math_concepts(title, course, grade)')
      .eq('answer_code', trimmed)
      .single();

    setLoading(false);
    if (error || !data) {
      toast({ title: '퀴즈를 찾을 수 없습니다', description: `코드 "${trimmed}"에 해당하는 퀴즈가 없습니다.`, variant: 'destructive' });
      return;
    }

    const concept = (data as any).math_concepts;
    setResult({
      id: data.id,
      answer_code: (data as any).answer_code || '',
      title: (data as any).title,
      version_number: (data as any).version_number || 1,
      version_label: (data as any).version_label,
      questions: (data.questions as any) || [],
      created_at: data.created_at,
      concept_title: concept?.title || '',
      course: concept?.course || '',
      grade: concept?.grade || '',
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            정답 확인 코드 조회
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="코드 입력 (예: MT-2026-001)"
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="max-w-xs"
            />
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
              조회
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg">
                  {result.title || result.concept_title}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.course} · {result.grade} · {result.questions.length}문항
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">V{result.version_number}</Badge>
                <Badge variant="outline">{result.answer_code}</Badge>
                <Button size="sm" variant="outline" onClick={() => setShowAnswers(!showAnswers)}>
                  <Eye className="w-4 h-4 mr-1" /> {showAnswers ? '정답 숨기기' : '정답 보기'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/quiz-print?quiz_id=${result.id}`)}>
                  <Printer className="w-4 h-4 mr-1" /> 인쇄
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.questions.map((q: any, i: number) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-primary min-w-[28px]">Q{q.question_number}.</span>
                    <div className="flex-1">
                      <MathRenderer text={q.question_text} />
                      {showAnswers && (
                        <div className="mt-2 p-2 bg-muted/50 rounded-md">
                          <p className="text-sm font-medium">정답: <MathRenderer text={q.answer} /></p>
                          {q.explanation && (
                            <p className="text-xs text-muted-foreground mt-1"><MathRenderer text={q.explanation} /></p>
                          )}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {q.difficulty === 'easy' ? '쉬움' : q.difficulty === 'hard' ? '어려움' : '보통'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function QuizLookupPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <QuizLookupContent />
    </ProtectedRoute>
  );
}
