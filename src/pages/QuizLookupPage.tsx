import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Printer, Eye, EyeOff, Loader2, BookOpen, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MathRenderer } from '@/components/math/MathRenderer';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';

type AnswerMode = 'hidden' | 'quick' | 'detail';

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
  const [answerMode, setAnswerMode] = useState<AnswerMode>('hidden');
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
    setAnswerMode('hidden');
  };

  const diffLabel = (d: string) => d === 'easy' ? '쉬움' : d === 'hard' ? '어려움' : '보통';

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
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">V{result.version_number}</Badge>
                <Badge variant="outline" className="font-mono">{result.answer_code}</Badge>
                <div className="h-5 w-px bg-border" />
                {/* Answer mode buttons */}
                <Button
                  size="sm"
                  variant={answerMode === 'hidden' ? 'default' : 'outline'}
                  onClick={() => setAnswerMode('hidden')}
                >
                  <EyeOff className="w-4 h-4 mr-1" /> 문제만
                </Button>
                <Button
                  size="sm"
                  variant={answerMode === 'quick' ? 'default' : 'outline'}
                  onClick={() => setAnswerMode('quick')}
                >
                  <Eye className="w-4 h-4 mr-1" /> 빠른 정답
                </Button>
                <Button
                  size="sm"
                  variant={answerMode === 'detail' ? 'default' : 'outline'}
                  onClick={() => setAnswerMode('detail')}
                >
                  <BookOpen className="w-4 h-4 mr-1" /> 해설 포함
                </Button>
                <div className="h-5 w-px bg-border" />
                <Button size="sm" variant="outline" onClick={() => navigate(`/quiz-print?quiz_id=${result.id}`)}>
                  <Printer className="w-4 h-4 mr-1" /> 인쇄
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Quick answer grid */}
            {answerMode === 'quick' && (
              <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> 빠른 정답표
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.questions.map((q: any) => (
                    <div key={q.question_number} className="p-2 bg-background rounded border text-sm space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-primary min-w-[24px]">{q.question_number}.</span>
                        <span className="font-medium"><MathRenderer text={q.answer} /></span>
                      </div>
                      {q.explanation && (
                        <p className="text-xs text-muted-foreground pl-7">
                          <MathRenderer text={q.explanation} />
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {result.questions.map((q: any, i: number) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-primary min-w-[28px]">Q{q.question_number}.</span>
                    <div className="flex-1">
                      <MathRenderer text={q.question_text} />
                      {answerMode !== 'hidden' && (
                        <div className="mt-2 p-2 bg-muted/50 rounded-md">
                          <p className="text-sm font-medium">정답: <MathRenderer text={q.answer} /></p>
                          {answerMode === 'detail' && (
                            <div className="text-sm text-muted-foreground mt-2 space-y-1">
                              <span className="font-semibold text-foreground">해설:</span>
                              {(q.explanation || q.hint) ? (
                                <MathRenderer text={q.explanation || q.hint} />
                              ) : (
                                <span className="text-xs italic">해설이 등록되지 않았습니다.</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {diffLabel(q.difficulty)}
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
      <div className="space-y-3">
        <ArchiveNotice to="/materials/math" label="수학 자료실" />
      <QuizLookupContent />
    </div>
    </ProtectedRoute>
  );
}
