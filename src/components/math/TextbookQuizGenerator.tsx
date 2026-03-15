import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, Shuffle, BookOpen, Printer, Sparkles, Zap, AlertTriangle,
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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  textbook: Textbook | null;
  examples: TextbookExample[];
}

export function TextbookQuizGenerator({ open, onOpenChange, textbook, examples }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);

  // Range selection
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [pageFrom, setPageFrom] = useState('');
  const [pageTo, setPageTo] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(12);

  // Difficulty ratio
  const [easyPct, setEasyPct] = useState(20);
  const [mediumPct, setMediumPct] = useState(60);
  const [hardPct, setHardPct] = useState(20);

  // Killer toggle
  const [includeKiller, setIncludeKiller] = useState(true);

  // Category filter
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Order
  const [randomOrder, setRandomOrder] = useState(true);

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
    }
  }, [open]);

  // Filter examples based on range + category
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
    if (pFrom !== null) {
      filtered = filtered.filter(e => e.page_number === null || e.page_number >= pFrom);
    }
    if (pTo !== null) {
      filtered = filtered.filter(e => e.page_number === null || e.page_number <= pTo);
    }

    if (!includeKiller) {
      filtered = filtered.filter(e => e.difficulty !== 'hard');
    }

    return filtered;
  }, [examples, selectedChapters, selectedCategories, pageFrom, pageTo, includeKiller]);

  // Difficulty counts
  const diffCounts = useMemo(() => {
    const easy = filteredExamples.filter(e => e.difficulty === 'easy');
    const medium = filteredExamples.filter(e => e.difficulty === 'medium');
    const hard = filteredExamples.filter(e => e.difficulty === 'hard');
    return { easy, medium, hard };
  }, [filteredExamples]);

  const handleDifficultyChange = (which: 'easy' | 'medium' | 'hard', value: number) => {
    if (which === 'easy') {
      const remaining = 100 - value;
      const ratio = mediumPct + hardPct > 0 ? mediumPct / (mediumPct + hardPct) : 0.75;
      setEasyPct(value);
      setMediumPct(Math.round(remaining * ratio));
      setHardPct(remaining - Math.round(remaining * ratio));
    } else if (which === 'medium') {
      const remaining = 100 - value;
      const ratio = easyPct + hardPct > 0 ? easyPct / (easyPct + hardPct) : 0.5;
      setMediumPct(value);
      setEasyPct(Math.round(remaining * ratio));
      setHardPct(remaining - Math.round(remaining * ratio));
    } else {
      const remaining = 100 - value;
      const ratio = easyPct + mediumPct > 0 ? easyPct / (easyPct + mediumPct) : 0.25;
      setHardPct(value);
      setEasyPct(Math.round(remaining * ratio));
      setMediumPct(remaining - Math.round(remaining * ratio));
    }
  };

  const toggleChapter = (ch: string) => {
    setSelectedChapters(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleGenerate = async () => {
    if (!textbook) return;
    if (filteredExamples.length === 0) {
      toast({ title: '선택 범위에 문항이 없습니다', variant: 'destructive' });
      return;
    }

    setGenerating(true);
    try {
      // Select questions by difficulty ratio
      const easyCount = Math.round(totalQuestions * easyPct / 100);
      const hardCount = Math.round(totalQuestions * hardPct / 100);
      const mediumCount = totalQuestions - easyCount - hardCount;

      const pick = (pool: TextbookExample[], n: number): TextbookExample[] => {
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, n);
      };

      let selected = [
        ...pick(diffCounts.easy, easyCount),
        ...pick(diffCounts.medium, mediumCount),
        ...pick(diffCounts.hard, hardCount),
      ];

      // Fill remaining from any difficulty if not enough
      if (selected.length < totalQuestions) {
        const usedIds = new Set(selected.map(s => s.id));
        const remaining = filteredExamples.filter(e => !usedIds.has(e.id));
        selected = [...selected, ...pick(remaining, totalQuestions - selected.length)];
      }

      if (randomOrder) {
        selected.sort(() => Math.random() - 0.5);
      } else {
        selected.sort((a, b) => a.sort_order - b.sort_order);
      }

      // Convert to quiz questions format
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
      }));

      // Determine version number
      // We'll create a "virtual concept" for textbook-based quizzes
      // Use textbook_id as a pseudo concept_id reference
      const { data: latestQuiz } = await supabase
        .from('math_concept_quizzes')
        .select('version_number')
        .eq('concept_id', textbook.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle() as any;

      const nextVersion = (latestQuiz?.version_number ?? 0) + 1;
      const today = new Date().toISOString().slice(0, 10);
      const versionLabel = `${today}_${textbook.title}_V${nextVersion}`;

      // We need a concept record for this textbook - check if it exists
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
        // Create a pseudo concept for this textbook
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

      // Navigate to print page
      navigate(`/quiz-print?quiz_id=${newQuiz!.id}`);
    } catch (err: any) {
      toast({ title: '퀴즈 생성 실패', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  if (!textbook) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            교재 예제 퀴즈 생성
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Textbook info */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm font-medium">{textbook.title}</p>
            <p className="text-xs text-muted-foreground">
              {[textbook.publisher, textbook.subject, textbook.grade].filter(Boolean).join(' · ')}
              {' · '}{filteredExamples.length}문항 선택 가능
            </p>
          </div>

          {/* Chapter selection */}
          <div>
            <Label className="text-xs font-medium mb-2 block">단원 선택 (비워두면 전체)</Label>
            <div className="flex flex-wrap gap-1.5">
              {chapters.map(ch => (
                <Badge
                  key={ch}
                  variant={selectedChapters.includes(ch) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleChapter(ch)}
                >
                  {ch}
                </Badge>
              ))}
            </div>
          </div>

          {/* Category filter */}
          {categories.length > 1 && (
            <div>
              <Label className="text-xs font-medium mb-2 block">문항 유형 필터 (비워두면 전체)</Label>
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
              <Input
                type="number" value={pageFrom} onChange={e => setPageFrom(e.target.value)}
                placeholder="처음부터" className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">끝 페이지</Label>
              <Input
                type="number" value={pageTo} onChange={e => setPageTo(e.target.value)}
                placeholder="끝까지" className="h-8 text-sm"
              />
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

          {/* Difficulty ratio sliders */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">난이도 비율 (%)</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs w-12 text-green-600 font-medium">쉬움</span>
                <Slider
                  value={[easyPct]} min={0} max={100} step={5}
                  onValueChange={([v]) => handleDifficultyChange('easy', v)}
                  className="flex-1"
                />
                <span className="text-xs w-10 text-right font-mono">{easyPct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-12 text-yellow-600 font-medium">보통</span>
                <Slider
                  value={[mediumPct]} min={0} max={100} step={5}
                  onValueChange={([v]) => handleDifficultyChange('medium', v)}
                  className="flex-1"
                />
                <span className="text-xs w-10 text-right font-mono">{mediumPct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-12 text-red-600 font-medium">어려움</span>
                <Slider
                  value={[hardPct]} min={0} max={100} step={5}
                  onValueChange={([v]) => handleDifficultyChange('hard', v)}
                  className="flex-1"
                />
                <span className="text-xs w-10 text-right font-mono">{hardPct}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>가용 문항:</span>
              <Badge variant="secondary" className="text-[10px]">쉬움 {diffCounts.easy.length}</Badge>
              <Badge variant="secondary" className="text-[10px]">보통 {diffCounts.medium.length}</Badge>
              <Badge variant="secondary" className="text-[10px]">어려움 {diffCounts.hard.length}</Badge>
            </div>
          </div>

          {/* Killer toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <div>
                <p className="text-sm font-medium">심화(킬러) 문항 포함</p>
                <p className="text-xs text-muted-foreground">OFF 시 '어려움' 난이도 문항 배제</p>
              </div>
            </div>
            <Switch checked={includeKiller} onCheckedChange={setIncludeKiller} />
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

          {/* Generate button */}
          <Button onClick={handleGenerate} disabled={generating || filteredExamples.length === 0} className="w-full gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            퀴즈 생성 ({Math.min(totalQuestions, filteredExamples.length)}문항)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
