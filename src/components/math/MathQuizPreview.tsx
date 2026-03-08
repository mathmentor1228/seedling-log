import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, Save, RefreshCw, Edit2, Check } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import type { QuizQuestion } from './MathConceptManager';

interface Props {
  quiz: { id: string; questions: QuizQuestion[]; status: string } | null;
  loading: boolean;
  onSave: (questions: QuizQuestion[]) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

export function MathQuizPreview({ quiz, loading, onSave, onRegenerate, regenerating }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editedQuestions, setEditedQuestions] = useState<QuizQuestion[]>([]);

  useEffect(() => {
    if (quiz) setEditedQuestions([...quiz.questions]);
  }, [quiz]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!quiz) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          퀴즈가 아직 생성되지 않았습니다. "퀴즈 생성" 버튼을 클릭하세요.
        </CardContent>
      </Card>
    );
  }

  const diffBadge = (d: string) => {
    switch (d) {
      case 'easy': return <Badge variant="secondary" className="text-xs">쉬움</Badge>;
      case 'medium': return <Badge className="bg-yellow-500 text-white text-xs">보통</Badge>;
      case 'hard': return <Badge variant="destructive" className="text-xs">어려움</Badge>;
      default: return null;
    }
  };

  const typeBadge = (t: string) => {
    switch (t) {
      case 'fill_blank': return <Badge variant="outline" className="text-xs">빈칸 채우기</Badge>;
      case 'true_false': return <Badge variant="outline" className="text-xs border-blue-400 text-blue-600">참/거짓</Badge>;
      case 'short_answer': return <Badge variant="outline" className="text-xs border-green-500 text-green-600">단답형</Badge>;
      default: return <Badge variant="outline" className="text-xs">{t}</Badge>;
    }
  };

  const updateQuestion = (idx: number, field: keyof QuizQuestion, value: string) => {
    setEditedQuestions(prev => prev.map((q, i) =>
      i === idx ? { ...q, [field]: value } : q
    ));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            퀴즈 미리보기 ({quiz.questions.length}문항)
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              다시 생성
            </Button>
            {editMode ? (
              <>
                <Button size="sm" onClick={() => { onSave(editedQuestions); setEditMode(false); }}>
                  <Save className="w-4 h-4 mr-1" /> 저장
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditedQuestions([...quiz.questions]); setEditMode(false); }}>
                  취소
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                <Edit2 className="w-4 h-4 mr-1" /> 수정
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {(editMode ? editedQuestions : quiz.questions).map((q, idx) => (
            <div key={idx} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">Q{q.question_number}.</span>
                {diffBadge(q.difficulty)}
              </div>

              {editMode ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedQuestions[idx].question_text}
                    onChange={e => updateQuestion(idx, 'question_text', e.target.value)}
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">정답</label>
                      <Input
                        value={editedQuestions[idx].answer}
                        onChange={e => updateQuestion(idx, 'answer', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">난이도</label>
                      <Input
                        value={editedQuestions[idx].difficulty}
                        onChange={e => updateQuestion(idx, 'difficulty', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">해설</label>
                    <Textarea
                      value={editedQuestions[idx].explanation}
                      onChange={e => updateQuestion(idx, 'explanation', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-base leading-relaxed">
                    <MathRenderer text={q.question_text} />
                  </div>
                  <div className="bg-muted/50 rounded-md p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-sm">정답:</span>
                      <MathRenderer text={q.answer} />
                    </div>
                    <p className="text-sm text-muted-foreground ml-6">
                      <MathRenderer text={q.explanation} />
                    </p>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
