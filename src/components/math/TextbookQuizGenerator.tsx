import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, Shuffle, BookOpen, Sparkles, Zap, AlertTriangle, ListChecks, RotateCcw, Video,
} from 'lucide-react';

interface Textbook {
  id: string;
  title: string;
  publisher: string | null;
  subject: string;
  grade: string | null;
  course: string | null;
}

interface TextbookExample {
  id: string;
  textbook_id: string;
  chapter: string;
  page_number: number | null;
  problem_number: string | null;
  question_text: string;
  answer: string | null;
  explanation: string | null;
  difficulty: string | null;
  category: string | null;
  graph_data: any;
  sort_order: number;
  video_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  textbook: Textbook | null;
  examples: TextbookExample[];
}

type GenMode = 'bank' | 'reprint';

export function TextbookQuizGenerator({ open, onOpenChange, textbook, examples }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<GenMode>('bank');

  // ─── Common ───
  const [randomOrder, setRandomOrder] = useState(true);
  const [includeQR, setIncludeQR] = useState(false);

  // ─── Bank mode ───
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [pageFrom, setPageFrom] = useState('');
  const [pageTo, setPageTo] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(12);
  const [includeDifficulties, setIncludeDifficulties] = useState<Set<string>>(new Set(['easy', 'medium', 'hard']));
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // ─── Reprint mode ───
  const [reprintSelectedIds, setReprintSelectedIds] = useState<Set<string>>(new Set());

  const chapters = useMemo(() => {
    const set = new Set(examples.map(e => e.chapter));
    return Array.from(set).sort();
  }, [examples]);

  const categories = useMemo(() => {
    const set = new Set(examples.map(e => e.category || '일반문항'));
    return Array.from(set).sort();
  }, [examples]);

  useEffect(() => {
    if (open) {
      setSelectedChapters([]);
      setPageFrom('');
      setPageTo('');
      setReprintSelectedIds(new Set());
      setIncludeDifficulties(new Set(['easy', 'medium', 'hard']));
    }
  }, [open]);

  // ─── Bank: filtered examples ───
  const filteredExamples = useMemo(() => {
    let filtered = [...examples];
    if (selectedChapters.length > 0) {
      filtered = filtered.filter(e => selectedChapters.includes(e.chapter));
    }
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(e => selectedCategories.includes(e.category || '일반문항'));
    }
    const pFrom = pageFrom ? parseInt(pageFrom) : null;
    const pTo = pageTo ? parseInt(pageTo) : null;
    if (pFrom !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number >= pFrom);
    if (pTo !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number <= pTo);
    // Filter by selected difficulties
    filtered = filtered.filter(e => includeDifficulties.has(e.difficulty || 'medium'));
    return filtered;
  }, [examples, selectedChapters, selectedCategories, pageFrom, pageTo, includeDifficulties]);

  // ─── Difficulty counts per chapter ───
  const chapterDiffCounts = useMemo(() => {
    const map: Record<string, { easy: number; medium: number; hard: number; total: number }> = {};
    const relevantExamples = (() => {
      let filtered = [...examples];
      if (selectedCategories.length > 0) {
        filtered = filtered.filter(e => selectedCategories.includes(e.category || '일반문항'));
      }
      const pFrom = pageFrom ? parseInt(pageFrom) : null;
      const pTo = pageTo ? parseInt(pageTo) : null;
      if (pFrom !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number >= pFrom);
      if (pTo !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number <= pTo);
      return filtered;
    })();

    for (const ex of relevantExamples) {
      const ch = ex.chapter;
      if (!map[ch]) map[ch] = { easy: 0, medium: 0, hard: 0, total: 0 };
      const diff = ex.difficulty || 'medium';
      if (diff === 'easy') map[ch].easy++;
      else if (diff === 'hard') map[ch].hard++;
      else map[ch].medium++;
      map[ch].total++;
    }
    return map;
  }, [examples, selectedCategories, pageFrom, pageTo]);

  // Total difficulty counts for filtered pool
  const diffCounts = useMemo(() => {
    // Count from examples matching chapters+categories+pages (before difficulty filter)
    let pool = [...examples];
    if (selectedChapters.length > 0) pool = pool.filter(e => selectedChapters.includes(e.chapter));
    if (selectedCategories.length > 0) pool = pool.filter(e => selectedCategories.includes(e.category || '일반문항'));
    const pFrom = pageFrom ? parseInt(pageFrom) : null;
    const pTo = pageTo ? parseInt(pageTo) : null;
    if (pFrom !== null) pool = pool.filter(e => e.page_number === null || e.page_number >= pFrom);
    if (pTo !== null) pool = pool.filter(e => e.page_number === null || e.page_number <= pTo);
    return {
      easy: pool.filter(e => (e.difficulty || 'medium') === 'easy').length,
      medium: pool.filter(e => (e.difficulty || 'medium') === 'medium').length,
      hard: pool.filter(e => (e.difficulty || 'medium') === 'hard').length,
    };
  }, [examples, selectedChapters, selectedCategories, pageFrom, pageTo]);

  // ─── Reprint: chapter-grouped examples ───
  const reprintChapterGroups = useMemo(() => {
    const map: Record<string, TextbookExample[]> = {};
    for (const ex of examples) {
      if (!map[ex.chapter]) map[ex.chapter] = [];
      map[ex.chapter].push(ex);
    }
    return map;
  }, [examples]);

  const toggleChapter = (ch: string) => {
    setSelectedChapters(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const toggleDifficulty = (diff: string) => {
    setIncludeDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(diff)) next.delete(diff);
      else next.add(diff);
      return next;
    });
  };

  const toggleReprintId = (id: string) => {
    setReprintSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleReprintChapter = (ch: string) => {
    const chapterIds = (reprintChapterGroups[ch] || []).map(e => e.id);
    const allSelected = chapterIds.every(id => reprintSelectedIds.has(id));
    setReprintSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        chapterIds.forEach(id => next.delete(id));
      } else {
        chapterIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!textbook) return;

    let selected: TextbookExample[] = [];

    if (mode === 'bank') {
      if (filteredExamples.length === 0) {
        toast({ title: '선택 범위에 문항이 없습니다', variant: 'destructive' });
        return;
      }
      const pick = (pool: TextbookExample[], n: number): TextbookExample[] => {
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, n);
      };
      // Distribute evenly among selected difficulties
      const activeDiffs = Array.from(includeDifficulties);
      const perDiff = Math.floor(totalQuestions / activeDiffs.length);
      const remainder = totalQuestions - perDiff * activeDiffs.length;

      const diffPools: Record<string, TextbookExample[]> = {};
      for (const d of activeDiffs) {
        diffPools[d] = filteredExamples.filter(e => (e.difficulty || 'medium') === d);
      }

      for (let i = 0; i < activeDiffs.length; i++) {
        const count = perDiff + (i < remainder ? 1 : 0);
        selected.push(...pick(diffPools[activeDiffs[i]], count));
      }

      // Fill remaining
      if (selected.length < totalQuestions) {
        const usedIds = new Set(selected.map(s => s.id));
        const remaining = filteredExamples.filter(e => !usedIds.has(e.id));
        selected.push(...pick(remaining, totalQuestions - selected.length));
      }
    } else {
      // Reprint mode
      selected = examples.filter(e => reprintSelectedIds.has(e.id));
      if (selected.length === 0) {
        toast({ title: '문항을 선택하세요', variant: 'destructive' });
        return;
      }
    }

    if (randomOrder) {
      selected.sort(() => Math.random() - 0.5);
    } else {
      selected.sort((a, b) => a.sort_order - b.sort_order);
    }

    setGenerating(true);
    try {
      const questions = selected.map((ex, idx) => ({
        question_number: idx + 1,
        question_type: 'short_answer' as const,
        question_text: ex.question_text,
        answer: ex.answer || '',
        explanation: ex.explanation || '',
        difficulty: (ex.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
        hint: '',
        source_textbook: textbook.title,
        source_page: ex.page_number,
        source_chapter: ex.chapter,
        source_problem: ex.problem_number,
        video_url: includeQR ? (ex.video_url || null) : null,
      }));

      let conceptId: string;
      const { data: existingConcept } = await supabase
        .from('math_concepts')
        .select('id')
        .eq('title', `📖 ${textbook.title}`)
        .limit(1)
        .maybeSingle();

      if (existingConcept) {
        conceptId = existingConcept.id;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data: newConcept, error: conceptErr } = await supabase
          .from('math_concepts')
          .insert({
            subject: textbook.subject || '수학',
            grade: textbook.grade || '기타',
            course: textbook.course || '기타',
            title: `📖 ${textbook.title}`,
            pdf_storage_path: `textbook-ref/${textbook.id}`,
            pdf_original_name: `${textbook.title}.pdf`,
            status: 'quiz_generated',
            created_by: userData.user?.id ?? null,
          } as any)
          .select('id')
          .single();
        if (conceptErr) throw conceptErr;
        conceptId = newConcept!.id;
      }

      const { data: latestQuiz } = await supabase
        .from('math_concept_quizzes')
        .select('version_number')
        .eq('concept_id', conceptId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle() as any;

      const nextVersion = (latestQuiz?.version_number ?? 0) + 1;
      const today = new Date().toISOString().slice(0, 10);
      const modeLabel = mode === 'reprint' ? '재출제' : '문제은행';
      const versionLabel = `${today}_${textbook.title}_${modeLabel}_V${nextVersion}`;

      const { data: newQuiz, error: insertErr } = await supabase
        .from('math_concept_quizzes')
        .insert({
          concept_id: conceptId,
          questions: questions as any,
          status: 'draft',
          version_number: nextVersion,
          version_label: versionLabel,
        } as any)
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      toast({ title: `퀴즈 생성 완료`, description: `${questions.length}문항 (V${nextVersion})` });
      onOpenChange(false);
      navigate(`/quiz-print?quiz_id=${newQuiz!.id}`);
    } catch (err: any) {
      toast({ title: '퀴즈 생성 실패', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  if (!textbook) return null;

  const diffLabel: Record<string, string> = { easy: '기본', medium: '중간', hard: '어려움' };
  const diffColor: Record<string, string> = {
    easy: 'text-green-600',
    medium: 'text-yellow-600',
    hard: 'text-red-600',
  };

  const bankQuestionCount = Math.min(totalQuestions, filteredExamples.length);
  const reprintCount = reprintSelectedIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            교재 퀴즈 생성
          </DialogTitle>
        </DialogHeader>

        {/* Textbook info */}
        <div className="p-3 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium">{textbook.title}</p>
          <p className="text-xs text-muted-foreground">
            {[textbook.publisher, textbook.subject, textbook.grade].filter(Boolean).join(' · ')}
            {' · '}{examples.length}문항 보유
          </p>
        </div>

        <Tabs value={mode} onValueChange={v => setMode(v as GenMode)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bank" className="gap-1.5 text-xs">
              <Zap className="w-3.5 h-3.5" /> 문제은행
            </TabsTrigger>
            <TabsTrigger value="reprint" className="gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5" /> 오답클리닉 / 그대로출제
            </TabsTrigger>
          </TabsList>

          {/* ════ Bank Mode ════ */}
          <TabsContent value="bank" className="space-y-4 mt-4">
            {/* Chapter selection with difficulty counts */}
            <div>
              <Label className="text-xs font-medium mb-2 block">단원 선택 (비워두면 전체)</Label>
              <div className="space-y-1.5">
                {chapters.map(ch => {
                  const counts = chapterDiffCounts[ch] || { easy: 0, medium: 0, hard: 0, total: 0 };
                  return (
                    <div
                      key={ch}
                      className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors ${
                        selectedChapters.includes(ch) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => toggleChapter(ch)}
                    >
                      <span className="text-xs font-medium">{ch}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-green-600">기본 {counts.easy}</span>
                        <span className="text-[10px] text-yellow-600">중간 {counts.medium}</span>
                        <span className="text-[10px] text-red-600">어려움 {counts.hard}</span>
                        <Badge variant="secondary" className="text-[10px] ml-1">{counts.total}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category filter */}
            {categories.length > 1 && (
              <div>
                <Label className="text-xs font-medium mb-2 block">문항 유형 필터</Label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => (
                    <Badge
                      key={cat}
                      variant={selectedCategories.includes(cat) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => toggleCategory(cat)}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Page range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시작 페이지</Label>
                <Input type="number" value={pageFrom} onChange={e => setPageFrom(e.target.value)} placeholder="처음부터" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">끝 페이지</Label>
                <Input type="number" value={pageTo} onChange={e => setPageTo(e.target.value)} placeholder="끝까지" className="h-8 text-sm" />
              </div>
            </div>

            {/* Difficulty checkbox selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">난이도 포함 선택</Label>
              <div className="flex flex-wrap gap-3">
                {(['easy', 'medium', 'hard'] as const).map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={includeDifficulties.has(d)}
                      onCheckedChange={() => toggleDifficulty(d)}
                    />
                    <span className={`text-sm font-medium ${diffColor[d]}`}>
                      {diffLabel[d]}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{diffCounts[d]}문항</Badge>
                  </label>
                ))}
              </div>
            </div>

            {/* Total questions */}
            <div>
              <Label className="text-xs">총 문항 수</Label>
              <Input
                type="number" min={1} max={filteredExamples.length}
                value={totalQuestions} onChange={e => setTotalQuestions(parseInt(e.target.value) || 12)}
                className="h-8 text-sm w-24"
              />
              <p className="text-xs text-muted-foreground mt-1">선택 가능: 최대 {filteredExamples.length}문항</p>
            </div>

            {/* Random order toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">랜덤 섞기</p>
                  <p className="text-xs text-muted-foreground">OFF 시 교재 순서대로 출제</p>
                </div>
              </div>
              <Switch checked={randomOrder} onCheckedChange={setRandomOrder} />
            </div>

            {/* QR code toggle */}
            {examples.some(e => e.video_url) && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">해설 영상 QR 포함</p>
                    <p className="text-xs text-muted-foreground">
                      영상이 등록된 문항에 QR코드 인쇄 ({examples.filter(e => e.video_url).length}개 등록됨)
                    </p>
                  </div>
                </div>
                <Switch checked={includeQR} onCheckedChange={setIncludeQR} />
              </div>
            )}

            <Button onClick={handleGenerate} disabled={generating || filteredExamples.length === 0} className="w-full gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              문제은행 퀴즈 생성 ({bankQuestionCount}문항)
            </Button>
          </TabsContent>

          {/* ════ Reprint / 오답클리닉 Mode ════ */}
          <TabsContent value="reprint" className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>오답클리닉 / 그대로출제:</strong> 원하는 단원과 문항 번호를 직접 선택하여 퀴즈를 구성합니다.
                선택한 문항들이 랜덤으로 섞여 새 시험지로 출력됩니다.
              </p>
            </div>

            {/* Select all / deselect all */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{reprintCount}문항 선택됨</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReprintSelectedIds(new Set(examples.map(e => e.id)))}>
                  전체 선택
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReprintSelectedIds(new Set())}>
                  전체 해제
                </Button>
              </div>
            </div>

            {/* Chapter groups with individual question checkboxes */}
            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
              {Object.entries(reprintChapterGroups).map(([ch, items]) => {
                const allSelected = items.every(e => reprintSelectedIds.has(e.id));
                const someSelected = items.some(e => reprintSelectedIds.has(e.id));
                const chEasy = items.filter(e => (e.difficulty || 'medium') === 'easy').length;
                const chMed = items.filter(e => (e.difficulty || 'medium') === 'medium').length;
                const chHard = items.filter(e => (e.difficulty || 'medium') === 'hard').length;

                return (
                  <div key={ch} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        checked={allSelected}
                        // @ts-ignore
                        indeterminate={someSelected && !allSelected}
                        onCheckedChange={() => toggleReprintChapter(ch)}
                      />
                      <span className="text-sm font-semibold flex-1">{ch}</span>
                      <div className="flex gap-1.5 text-[10px]">
                        <span className="text-green-600">기본 {chEasy}</span>
                        <span className="text-yellow-600">중간 {chMed}</span>
                        <span className="text-red-600">어려움 {chHard}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-6">
                      {items.map(ex => (
                        <label
                          key={ex.id}
                          className={`flex items-center gap-1.5 p-1.5 rounded text-xs cursor-pointer transition-colors ${
                            reprintSelectedIds.has(ex.id) ? 'bg-primary/10' : 'hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox
                            checked={reprintSelectedIds.has(ex.id)}
                            onCheckedChange={() => toggleReprintId(ex.id)}
                          />
                          <span className="truncate font-medium">
                            {ex.problem_number || `#${ex.sort_order + 1}`}
                          </span>
                          {ex.page_number && <span className="text-muted-foreground">p.{ex.page_number}</span>}
                          <span className={`text-[10px] ${diffColor[ex.difficulty || 'medium']}`}>
                            {diffLabel[ex.difficulty || 'medium']}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Random order toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">랜덤 섞기</p>
                  <p className="text-xs text-muted-foreground">OFF 시 원본 순서대로 출제</p>
                </div>
              </div>
              <Switch checked={randomOrder} onCheckedChange={setRandomOrder} />
            </div>

            {/* QR code toggle (reprint) */}
            {examples.some(e => e.video_url) && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">해설 영상 QR 포함</p>
                    <p className="text-xs text-muted-foreground">
                      영상 등록 문항에 QR코드 인쇄
                    </p>
                  </div>
                </div>
                <Switch checked={includeQR} onCheckedChange={setIncludeQR} />
              </div>
            )}

            <Button onClick={handleGenerate} disabled={generating || reprintCount === 0} className="w-full gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
              선택 문항 퀴즈 생성 ({reprintCount}문항)
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
