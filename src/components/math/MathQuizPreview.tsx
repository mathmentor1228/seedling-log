import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Eye, Save, RefreshCw, Edit2, Check, Lightbulb, Printer,
  Trash2, Wand2, ChevronDown, History, BookOpen, List,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MathRenderer } from './MathRenderer';
import { MathGraph } from './MathGraph';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { QuizQuestion } from './MathConceptManager';

const GRAPH_KEYWORDS = /함수|그래프|일차|이차|지수|로그|y\s*=|f\s*\(/i;

function extractExpression(text: string): string | null {
  const match = text.match(/(?:y|f\s*\(\s*x\s*\))\s*=\s*([^,.\s가-힣]{3,})/);
  return match ? `y = ${match[1]}` : null;
}

interface Props {
  quiz: { id: string; questions: QuizQuestion[]; status: string; version_number?: number; version_label?: string | null; answer_code?: string | null } | null;
  loading: boolean;
  onSave: (questions: QuizQuestion[]) => void;
  onRegenerate: () => void;
  regenerating: boolean;
  allVersions?: { id: string; version_number: number; version_label: string | null; created_at: string }[];
  onSelectVersion?: (quizId: string) => void;
}

type RewriteMode = 'easier' | 'deeper' | 'example' | 'fix_code';

const REWRITE_LABELS: Record<RewriteMode, { label: string; desc: string }> = {
  fix_code: { label: '⚠️ 코드 오류 수정', desc: 'HTML 태그/코드를 제거하고 순수 수식만 남김' },
  easier: { label: '더 쉽게', desc: '초보자 수준으로 풀어서 다시 출제' },
  deeper: { label: '더 깊게 (심화)', desc: '심화 원리/증명 문제로 변경' },
  example: { label: '예제 추가', desc: '기초 수치 예제 문제를 아래 생성' },
};

type QuickViewMode = 'none' | 'answers' | 'explanations';

export function MathQuizPreview({ quiz, loading, onSave, onRegenerate, regenerating, allVersions, onSelectVersion }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [editedQuestions, setEditedQuestions] = useState<QuizQuestion[]>([]);
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null);
  const [quickView, setQuickView] = useState<QuickViewMode>('none');

  useEffect(() => {
    if (quiz) setEditedQuestions([...quiz.questions]);
  }, [quiz]);

  if (loading) {
    return <Card><CardContent className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>;
  }

  if (!quiz) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">퀴즈가 아직 생성되지 않았습니다. "퀴즈 생성" 버튼을 클릭하세요.</CardContent></Card>;
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
    setEditedQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  const deleteQuestion = (idx: number) => {
    const updated = editedQuestions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, question_number: i + 1 }));
    setEditedQuestions(updated);
    onSave(updated);
    toast({ title: '문항 삭제됨' });
  };

  const handleRewrite = async (idx: number, mode: RewriteMode) => {
    if (!quiz) return;
    setRewritingIdx(idx);
    try {
      const { data, error } = await supabase.functions.invoke('rewrite-quiz-question', {
        body: { quiz_id: quiz.id, question_index: idx, rewrite_mode: mode, question: editedQuestions[idx] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newQ = data.question;
      let updated: QuizQuestion[];
      if (mode === 'example') {
        updated = [...editedQuestions.slice(0, idx + 1), { ...newQ, question_number: 0 }, ...editedQuestions.slice(idx + 1)].map((q, i) => ({ ...q, question_number: i + 1 }));
      } else {
        updated = editedQuestions.map((q, i) => i === idx ? { ...newQ, question_number: q.question_number } : q);
      }
      setEditedQuestions(updated);
      onSave(updated);
      toast({ title: mode === 'example' ? '예제 문항 추가됨' : '문항 재작성 완료' });
    } catch (err: any) {
      toast({ title: 'AI 재작성 실패', description: err.message, variant: 'destructive' });
    } finally {
      setRewritingIdx(null);
    }
  };

  const displayQuestions = editMode ? editedQuestions : (editedQuestions.length > 0 ? editedQuestions : quiz.questions);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              퀴즈 미리보기 ({displayQuestions.length}문항)
            </CardTitle>
            {quiz.version_number && <Badge variant="secondary" className="text-xs">V{quiz.version_number}</Badge>}
            {quiz.answer_code && <Badge variant="outline" className="text-xs font-mono">{quiz.answer_code}</Badge>}
            {quiz.version_label && <span className="text-xs text-muted-foreground">{quiz.version_label}</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Quick answer/explanation toggle */}
            <div className="flex border rounded-md overflow-hidden">
              <Button
                size="sm"
                variant={quickView === 'answers' ? 'default' : 'ghost'}
                className="h-8 text-xs rounded-none px-3"
                onClick={() => setQuickView(quickView === 'answers' ? 'none' : 'answers')}
              >
                <List className="w-3.5 h-3.5 mr-1" /> 빠른정답
              </Button>
              <Button
                size="sm"
                variant={quickView === 'explanations' ? 'default' : 'ghost'}
                className="h-8 text-xs rounded-none px-3 border-l"
                onClick={() => setQuickView(quickView === 'explanations' ? 'none' : 'explanations')}
              >
                <BookOpen className="w-3.5 h-3.5 mr-1" /> 해설보기
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              다시 생성
            </Button>
            {editMode ? (
              <>
                <Button size="sm" onClick={() => { onSave(editedQuestions); setEditMode(false); }}>
                  <Save className="w-4 h-4 mr-1" /> 저장
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditedQuestions([...quiz.questions]); setEditMode(false); }}>취소</Button>
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
        {allVersions && allVersions.length > 1 && onSelectVersion && (
          <div className="flex items-center gap-2 mt-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">이전 버전:</span>
            <div className="flex gap-1 flex-wrap">
              {allVersions.map(v => (
                <Button key={v.id} size="sm" variant={v.id === quiz.id ? 'default' : 'outline'} className="h-6 text-xs px-2" onClick={() => onSelectVersion(v.id)}>
                  V{v.version_number}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Quick answer strip */}
        {quickView === 'answers' && (
          <div className="mt-3 p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">📋 빠른 정답표</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
              {displayQuestions.map(q => (
                <div key={q.question_number} className="flex items-center gap-1.5 text-sm">
                  <span className="font-bold text-blue-600 dark:text-blue-400 w-8 shrink-0">Q{q.question_number}.</span>
                  <span className="text-blue-800 dark:text-blue-200 truncate font-medium"><MathRenderer text={q.answer} /></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explanation strip */}
        {quickView === 'explanations' && (
          <div className="mt-3 p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 max-h-[400px] overflow-y-auto">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">📖 해설 보기</p>
            <div className="space-y-3">
              {displayQuestions.map(q => (
                <div key={q.question_number} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Q{q.question_number}</Badge>
                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">정답: <MathRenderer text={q.answer} /></span>
                  </div>
                  {q.explanation ? (
                    <p className="text-sm text-blue-800 dark:text-blue-200 pl-4 border-l-2 border-blue-200">
                      <MathRenderer text={q.explanation} />
                    </p>
                  ) : (q as any).hint ? (
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 pl-4 border-l-2 border-yellow-200 flex items-center gap-1">
                      <Lightbulb className="w-3.5 h-3.5 shrink-0" /> {(q as any).hint}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground pl-4">해설 없음</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {displayQuestions.map((q, idx) => (
            <div key={`${q.question_number}-${idx}`} className="border rounded-lg p-4 space-y-3 relative group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">Q{q.question_number}.</span>
                  {typeBadge(q.question_type || 'fill_blank')}
                  {diffBadge(q.difficulty)}
                </div>
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={rewritingIdx !== null}>
                        {rewritingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
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
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteQuestion(idx)} disabled={rewritingIdx !== null}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {editMode ? (
                <div className="space-y-2">
                  <Textarea value={editedQuestions[idx]?.question_text || ''} onChange={e => updateQuestion(idx, 'question_text', e.target.value)} rows={2} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">정답</label>
                      <Input value={editedQuestions[idx]?.answer || ''} onChange={e => updateQuestion(idx, 'answer', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">난이도</label>
                      <Select value={editedQuestions[idx]?.difficulty || 'medium'} onValueChange={v => updateQuestion(idx, 'difficulty', v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">쉬움</SelectItem>
                          <SelectItem value="medium">보통</SelectItem>
                          <SelectItem value="hard">어려움</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">해설</label>
                    <Textarea value={editedQuestions[idx]?.explanation || ''} onChange={e => updateQuestion(idx, 'explanation', e.target.value)} rows={2} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">힌트</label>
                    <Input value={(editedQuestions[idx] as any)?.hint || ''} onChange={e => updateQuestion(idx, 'hint' as any, e.target.value)} placeholder="초성 또는 개념 힌트" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-4">
                    <div className="text-base leading-relaxed flex-1">
                      <MathRenderer text={q.question_text} />
                    </div>
                    {GRAPH_KEYWORDS.test(q.question_text) && extractExpression(q.question_text) && (
                      <div className="shrink-0">
                        <MathGraph expression={extractExpression(q.question_text)!} width={180} height={180} />
                      </div>
                    )}
                  </div>
                  {quickView === 'none' && (
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
                  )}
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
