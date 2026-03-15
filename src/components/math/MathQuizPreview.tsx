import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Eye, Save, RefreshCw, Edit2, Check, Lightbulb, Printer,
  Trash2, Wand2, ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MathRenderer } from './MathRenderer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { QuizQuestion } from './MathConceptManager';

interface Props {
  quiz: { id: string; questions: QuizQuestion[]; status: string } | null;
  loading: boolean;
  onSave: (questions: QuizQuestion[]) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

type RewriteMode = 'easier' | 'deeper' | 'example' | 'fix_code';

const REWRITE_LABELS: Record<RewriteMode, { label: string; desc: string; icon?: string }> = {
  fix_code: { label: '⚠️ 코드 오류 수정', desc: 'HTML 태그/코드를 제거하고 순수 수식만 남김', icon: '⚠️' },
  easier: { label: '더 쉽게', desc: '초보자 수준으로 풀어서 다시 출제' },
  deeper: { label: '더 깊게 (심화)', desc: '심화 원리/증명 문제로 변경' },
  example: { label: '예제 추가', desc: '기초 수치 예제 문제를 아래 생성' },
};

export function MathQuizPreview({ quiz, loading, onSave, onRegenerate, regenerating }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [editedQuestions, setEditedQuestions] = useState<QuizQuestion[]>([]);
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null);

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

  const deleteQuestion = (idx: number) => {
    const updated = editedQuestions
      .filter((_, i) => i !== idx)
      .map((q, i) => ({ ...q, question_number: i + 1 }));
    setEditedQuestions(updated);
    onSave(updated);
    toast({ title: '문항 삭제됨', description: `Q${idx + 1} 문항이 삭제되었습니다.` });
  };

  const handleRewrite = async (idx: number, mode: RewriteMode) => {
    if (!quiz) return;
    setRewritingIdx(idx);

    try {
      const { data, error } = await supabase.functions.invoke('rewrite-quiz-question', {
        body: {
          quiz_id: quiz.id,
          question_index: idx,
          rewrite_mode: mode,
          question: editedQuestions[idx],
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newQ = data.question;
      let updated: QuizQuestion[];

      if (mode === 'example') {
        const exampleQ: QuizQuestion = { ...newQ, question_number: 0 };
        updated = [
          ...editedQuestions.slice(0, idx + 1),
          exampleQ,
          ...editedQuestions.slice(idx + 1),
        ].map((q, i) => ({ ...q, question_number: i + 1 }));
      } else {
        // fix_code, easier, deeper all replace the current question
        updated = editedQuestions.map((q, i) =>
          i === idx ? { ...newQ, question_number: q.question_number } : q
        );
      }

      setEditedQuestions(updated);
      onSave(updated);
      toast({
        title: mode === 'example' ? '예제 문항 추가됨' : '문항 재작성 완료',
        description: REWRITE_LABELS[mode].desc,
      });
    } catch (err: any) {
      toast({ title: 'AI 재작성 실패', description: err.message || '오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setRewritingIdx(null);
    }
  };

  const displayQuestions = editMode ? editedQuestions : (editedQuestions.length > 0 ? editedQuestions : quiz.questions);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            퀴즈 미리보기 ({displayQuestions.length}문항)
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
            <Button size="sm" variant="outline" onClick={() => navigate(`/quiz-print?quiz_id=${quiz.id}`)}>
              <Printer className="w-4 h-4 mr-1" /> 학습지 인쇄
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {displayQuestions.map((q, idx) => (
            <div key={`${q.question_number}-${idx}`} className="border rounded-lg p-4 space-y-3 relative group">
              {/* Header row with badges and action buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">Q{q.question_number}.</span>
                  {typeBadge(q.question_type || 'fill_blank')}
                  {diffBadge(q.difficulty)}
                </div>
                {/* Per-question action buttons */}
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={rewritingIdx !== null}
                      >
                        {rewritingIdx === idx ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                        AI 다시 쓰기
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(Object.entries(REWRITE_LABELS) as [RewriteMode, { label: string; desc: string }][]).map(([mode, meta]) => (
                        <DropdownMenuItem key={mode} onClick={() => handleRewrite(idx, mode)}>
                          <div>
                            <div className="font-medium text-sm">{meta.label}</div>
                            <div className="text-xs text-muted-foreground">{meta.desc}</div>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteQuestion(idx)}
                    disabled={rewritingIdx !== null}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {editMode ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedQuestions[idx]?.question_text || ''}
                    onChange={e => updateQuestion(idx, 'question_text', e.target.value)}
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">정답</label>
                      <Input
                        value={editedQuestions[idx]?.answer || ''}
                        onChange={e => updateQuestion(idx, 'answer', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">난이도</label>
                      <Input
                        value={editedQuestions[idx]?.difficulty || ''}
                        onChange={e => updateQuestion(idx, 'difficulty', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">해설</label>
                    <Textarea
                      value={editedQuestions[idx]?.explanation || ''}
                      onChange={e => updateQuestion(idx, 'explanation', e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">힌트</label>
                    <Input
                      value={(editedQuestions[idx] as any)?.hint || ''}
                      onChange={e => updateQuestion(idx, 'hint' as any, e.target.value)}
                      placeholder="초성 또는 개념 힌트"
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
                  {(q as any).hint && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                      <Lightbulb className="w-4 h-4 text-yellow-500 shrink-0" />
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">{(q as any).hint}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
