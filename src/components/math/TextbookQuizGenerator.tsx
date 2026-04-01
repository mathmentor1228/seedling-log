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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Shuffle, BookOpen, Sparkles, Zap, AlertTriangle, ListChecks, RotateCcw, Video, Languages,
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

type GenMode = 'bank' | 'reprint' | 'english';

// English sub-modes
type EnglishMode = 'vocab' | 'translation' | 'reading';

export function TextbookQuizGenerator({ open, onOpenChange, textbook, examples }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const isEnglish = textbook?.subject === '영어';
  const [mode, setMode] = useState<GenMode>(isEnglish ? 'english' : 'bank');

  // ─── Common ───
  const [quizTitle, setQuizTitle] = useState('');
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

  // ─── English mode ───
  const [englishMode, setEnglishMode] = useState<EnglishMode>('vocab');
  const [vocabDirection, setVocabDirection] = useState<'en_to_kr' | 'kr_to_en' | 'mixed'>('mixed');
  const [engSelectedIds, setEngSelectedIds] = useState<Set<string>>(new Set());
  const [engSelectedChapters, setEngSelectedChapters] = useState<string[]>([]);

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
      setQuizTitle('');
      setSelectedChapters([]);
      setPageFrom('');
      setPageTo('');
      setReprintSelectedIds(new Set());
      setIncludeDifficulties(new Set(['easy', 'medium', 'hard']));
      setEngSelectedIds(new Set());
      setEngSelectedChapters([]);
      setMode(isEnglish ? 'english' : 'bank');
    }
  }, [open, isEnglish]);

  // ─── Bank: filtered examples ───
  const filteredExamples = useMemo(() => {
    let filtered = [...examples];
    if (selectedChapters.length > 0) filtered = filtered.filter(e => selectedChapters.includes(e.chapter));
    if (selectedCategories.length > 0) filtered = filtered.filter(e => selectedCategories.includes(e.category || '일반문항'));
    const pFrom = pageFrom ? parseInt(pageFrom) : null;
    const pTo = pageTo ? parseInt(pageTo) : null;
    if (pFrom !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number >= pFrom);
    if (pTo !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number <= pTo);
    filtered = filtered.filter(e => includeDifficulties.has(e.difficulty || 'medium'));
    return filtered;
  }, [examples, selectedChapters, selectedCategories, pageFrom, pageTo, includeDifficulties]);

  // ─── Difficulty counts per chapter ───
  const chapterDiffCounts = useMemo(() => {
    const map: Record<string, { easy: number; medium: number; hard: number; total: number }> = {};
    let filtered = [...examples];
    if (selectedCategories.length > 0) filtered = filtered.filter(e => selectedCategories.includes(e.category || '일반문항'));
    const pFrom = pageFrom ? parseInt(pageFrom) : null;
    const pTo = pageTo ? parseInt(pageTo) : null;
    if (pFrom !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number >= pFrom);
    if (pTo !== null) filtered = filtered.filter(e => e.page_number === null || e.page_number <= pTo);
    for (const ex of filtered) {
      const ch = ex.chapter;
      if (!map[ch]) map[ch] = { easy: 0, medium: 0, hard: 0, total: 0 };
      const diff = ex.difficulty || 'medium';
      if (diff === 'easy') map[ch].easy++; else if (diff === 'hard') map[ch].hard++; else map[ch].medium++;
      map[ch].total++;
    }
    return map;
  }, [examples, selectedCategories, pageFrom, pageTo]);

  const diffCounts = useMemo(() => {
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

  const reprintChapterGroups = useMemo(() => {
    const map: Record<string, TextbookExample[]> = {};
    for (const ex of examples) { if (!map[ex.chapter]) map[ex.chapter] = []; map[ex.chapter].push(ex); }
    return map;
  }, [examples]);

  // English: group by category
  const engCategoryGroups = useMemo(() => {
    const map: Record<string, TextbookExample[]> = {};
    for (const ex of examples) {
      const cat = ex.category || '일반문항';
      if (!map[cat]) map[cat] = [];
      map[cat].push(ex);
    }
    return map;
  }, [examples]);

  // English: filtered by chapter + category matching english mode
  // Check both category AND chapter fields since extraction may put type info in either
  const engFilteredExamples = useMemo(() => {
    let filtered = [...examples];
    if (engSelectedChapters.length > 0) filtered = filtered.filter(e => engSelectedChapters.includes(e.chapter));

    const matchField = (ex: TextbookExample, keywords: string[]) => {
      const cat = (ex.category || '').toLowerCase();
      const ch = (ex.chapter || '').toLowerCase();
      return keywords.some(k => cat.includes(k) || ch.includes(k));
    };

    if (englishMode === 'vocab') filtered = filtered.filter(e => matchField(e, ['단어', 'vocab', 'word']));
    else if (englishMode === 'translation') filtered = filtered.filter(e => matchField(e, ['해석', 'translation', '문장']));
    else if (englishMode === 'reading') filtered = filtered.filter(e => matchField(e, ['독해', '문법', 'reading', 'grammar']) || (!matchField(e, ['단어', 'vocab', 'word', '해석', 'translation', '문장'])));

    return filtered;
  }, [examples, engSelectedChapters, englishMode]);

  const toggleChapter = (ch: string) => setSelectedChapters(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  const toggleCategory = (cat: string) => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const toggleDifficulty = (diff: string) => {
    setIncludeDifficulties(prev => { const next = new Set(prev); if (next.has(diff)) next.delete(diff); else next.add(diff); return next; });
  };
  const toggleReprintId = (id: string) => {
    setReprintSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleReprintChapter = (ch: string) => {
    const chapterIds = (reprintChapterGroups[ch] || []).map(e => e.id);
    const allSelected = chapterIds.every(id => reprintSelectedIds.has(id));
    setReprintSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) chapterIds.forEach(id => next.delete(id)); else chapterIds.forEach(id => next.add(id));
      return next;
    });
  };
  const toggleEngId = (id: string) => {
    setEngSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleEngChapter = (ch: string) => setEngSelectedChapters(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);

  const handleGenerate = async () => {
    if (!textbook) return;
    let selected: TextbookExample[] = [];
    let quizMeta: Record<string, any> = {};

    if (mode === 'english') {
      // English mode: use selected items or all filtered
      if (engSelectedIds.size > 0) {
        selected = examples.filter(e => engSelectedIds.has(e.id));
      } else {
        selected = engFilteredExamples;
      }
      if (selected.length === 0) { toast({ title: '문항을 선택하세요', variant: 'destructive' }); return; }
      quizMeta = { english_mode: englishMode, vocab_direction: vocabDirection };
    } else if (mode === 'bank') {
      if (filteredExamples.length === 0) { toast({ title: '선택 범위에 문항이 없습니다', variant: 'destructive' }); return; }
      const pick = (pool: TextbookExample[], n: number) => [...pool].sort(() => Math.random() - 0.5).slice(0, n);
      const activeDiffs = Array.from(includeDifficulties);
      const perDiff = Math.floor(totalQuestions / activeDiffs.length);
      const remainder = totalQuestions - perDiff * activeDiffs.length;
      const diffPools: Record<string, TextbookExample[]> = {};
      for (const d of activeDiffs) diffPools[d] = filteredExamples.filter(e => (e.difficulty || 'medium') === d);
      for (let i = 0; i < activeDiffs.length; i++) {
        const count = perDiff + (i < remainder ? 1 : 0);
        selected.push(...pick(diffPools[activeDiffs[i]], count));
      }
      if (selected.length < totalQuestions) {
        const usedIds = new Set(selected.map(s => s.id));
        const remaining = filteredExamples.filter(e => !usedIds.has(e.id));
        selected.push(...pick(remaining, totalQuestions - selected.length));
      }
    } else {
      selected = examples.filter(e => reprintSelectedIds.has(e.id));
      if (selected.length === 0) { toast({ title: '문항을 선택하세요', variant: 'destructive' }); return; }
    }

    if (randomOrder) selected.sort(() => Math.random() - 0.5);
    else selected.sort((a, b) => a.sort_order - b.sort_order);

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
        category: ex.category || null,
        ...(mode === 'english' ? { english_mode: englishMode, vocab_direction: vocabDirection } : {}),
      }));

      let conceptId: string;
      const { data: existingConcept } = await supabase
        .from('math_concepts').select('id').eq('title', `📖 ${textbook.title}`).limit(1).maybeSingle();

      if (existingConcept) {
        conceptId = existingConcept.id;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data: newConcept, error: conceptErr } = await supabase
          .from('math_concepts').insert({
            subject: textbook.subject || '수학', grade: textbook.grade || '기타', course: textbook.course || '기타',
            title: `📖 ${textbook.title}`, pdf_storage_path: `textbook-ref/${textbook.id}`, pdf_original_name: `${textbook.title}.pdf`,
            status: 'quiz_generated', created_by: userData.user?.id ?? null,
          } as any).select('id').single();
        if (conceptErr) throw conceptErr;
        conceptId = newConcept!.id;
      }

      const { data: latestQuiz } = await supabase
        .from('math_concept_quizzes').select('version_number').eq('concept_id', conceptId)
        .order('version_number', { ascending: false }).limit(1).maybeSingle() as any;

      const nextVersion = (latestQuiz?.version_number ?? 0) + 1;
      const today = new Date().toISOString().slice(0, 10);
      const modeLabels: Record<string, string> = { bank: '문제은행', reprint: '재출제', english: englishMode === 'vocab' ? '단어시험' : englishMode === 'translation' ? '해석시험' : '독해시험' };
      const versionLabel = `${today}_${textbook.title}_${modeLabels[mode] || mode}_V${nextVersion}`;

      const { data: newQuiz, error: insertErr } = await supabase
        .from('math_concept_quizzes').insert({
          concept_id: conceptId, questions: questions as any, status: 'draft',
          version_number: nextVersion, version_label: versionLabel,
        } as any).select('id').single();
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
  const diffColor: Record<string, string> = { easy: 'text-green-600', medium: 'text-yellow-600', hard: 'text-red-600' };
  const bankQuestionCount = Math.min(totalQuestions, filteredExamples.length);
  const reprintCount = reprintSelectedIds.size;

  const engCatLabel: Record<string, string> = { '단어': '🔤 단어', '해석': '📝 해석', '독해': '📖 독해', '문법': '📐 문법', '일반문항': '📋 일반' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> 교재 퀴즈 생성
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium">{textbook.title}</p>
          <p className="text-xs text-muted-foreground">
            {[textbook.publisher, textbook.subject, textbook.grade].filter(Boolean).join(' · ')} · {examples.length}문항 보유
          </p>
          {/* Category breakdown */}
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(engCategoryGroups).map(([cat, items]) => (
              <Badge key={cat} variant="outline" className="text-[10px]">{engCatLabel[cat] || cat} {items.length}</Badge>
            ))}
          </div>
        </div>

        <Tabs value={mode} onValueChange={v => setMode(v as GenMode)} className="w-full">
          <TabsList className={`grid w-full ${isEnglish ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="bank" className="gap-1.5 text-xs"><Zap className="w-3.5 h-3.5" /> 문제은행</TabsTrigger>
            <TabsTrigger value="reprint" className="gap-1.5 text-xs"><RotateCcw className="w-3.5 h-3.5" /> 오답클리닉</TabsTrigger>
            {isEnglish && <TabsTrigger value="english" className="gap-1.5 text-xs"><Languages className="w-3.5 h-3.5" /> 영어 출제</TabsTrigger>}
          </TabsList>

          {/* ════ Bank Mode ════ */}
          <TabsContent value="bank" className="space-y-4 mt-4">
            <div>
              <Label className="text-xs font-medium mb-2 block">단원 선택 (비워두면 전체)</Label>
              <div className="space-y-1.5">
                {chapters.map(ch => {
                  const counts = chapterDiffCounts[ch] || { easy: 0, medium: 0, hard: 0, total: 0 };
                  return (
                    <div key={ch} className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors ${selectedChapters.includes(ch) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => toggleChapter(ch)}>
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
            {categories.length > 1 && (
              <div>
                <Label className="text-xs font-medium mb-2 block">문항 유형 필터</Label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => (
                    <Badge key={cat} variant={selectedCategories.includes(cat) ? 'default' : 'outline'} className="cursor-pointer text-xs" onClick={() => toggleCategory(cat)}>{cat}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">시작 페이지</Label><Input type="number" value={pageFrom} onChange={e => setPageFrom(e.target.value)} placeholder="처음부터" className="h-8 text-sm" /></div>
              <div><Label className="text-xs">끝 페이지</Label><Input type="number" value={pageTo} onChange={e => setPageTo(e.target.value)} placeholder="끝까지" className="h-8 text-sm" /></div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">난이도 포함 선택</Label>
              <div className="flex flex-wrap gap-3">
                {(['easy', 'medium', 'hard'] as const).map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeDifficulties.has(d)} onCheckedChange={() => toggleDifficulty(d)} />
                    <span className={`text-sm font-medium ${diffColor[d]}`}>{diffLabel[d]}</span>
                    <Badge variant="secondary" className="text-[10px]">{diffCounts[d]}문항</Badge>
                  </label>
                ))}
              </div>
            </div>
            <div><Label className="text-xs">총 문항 수</Label>
              <Input type="number" min={1} max={filteredExamples.length} value={totalQuestions} onChange={e => setTotalQuestions(parseInt(e.target.value) || 12)} className="h-8 text-sm w-24" />
              <p className="text-xs text-muted-foreground mt-1">선택 가능: 최대 {filteredExamples.length}문항</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2"><Shuffle className="w-4 h-4 text-muted-foreground" /><div><p className="text-sm font-medium">랜덤 섞기</p><p className="text-xs text-muted-foreground">OFF 시 교재 순서대로 출제</p></div></div>
              <Switch checked={randomOrder} onCheckedChange={setRandomOrder} />
            </div>
            {examples.some(e => e.video_url) && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2"><Video className="w-4 h-4 text-muted-foreground" /><div><p className="text-sm font-medium">해설 영상 QR 포함</p><p className="text-xs text-muted-foreground">영상이 등록된 문항에 QR코드 인쇄 ({examples.filter(e => e.video_url).length}개 등록됨)</p></div></div>
                <Switch checked={includeQR} onCheckedChange={setIncludeQR} />
              </div>
            )}
            <Button onClick={handleGenerate} disabled={generating || filteredExamples.length === 0} className="w-full gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} 문제은행 퀴즈 생성 ({bankQuestionCount}문항)
            </Button>
          </TabsContent>

          {/* ════ Reprint Mode ════ */}
          <TabsContent value="reprint" className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-300"><strong>오답클리닉 / 그대로출제:</strong> 원하는 단원과 문항 번호를 직접 선택하여 퀴즈를 구성합니다.</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{reprintCount}문항 선택됨</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReprintSelectedIds(new Set(examples.map(e => e.id)))}>전체 선택</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReprintSelectedIds(new Set())}>전체 해제</Button>
              </div>
            </div>
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
                      <Checkbox checked={allSelected} onCheckedChange={() => toggleReprintChapter(ch)} />
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
                        <label key={ex.id} className={`flex items-center gap-1.5 p-1.5 rounded text-xs cursor-pointer transition-colors ${reprintSelectedIds.has(ex.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                          <Checkbox checked={reprintSelectedIds.has(ex.id)} onCheckedChange={() => toggleReprintId(ex.id)} />
                          <span className="truncate font-medium">{ex.problem_number || `#${ex.sort_order + 1}`}</span>
                          {ex.page_number && <span className="text-muted-foreground">p.{ex.page_number}</span>}
                          <span className={`text-[10px] ${diffColor[ex.difficulty || 'medium']}`}>{diffLabel[ex.difficulty || 'medium']}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2"><Shuffle className="w-4 h-4 text-muted-foreground" /><div><p className="text-sm font-medium">랜덤 섞기</p></div></div>
              <Switch checked={randomOrder} onCheckedChange={setRandomOrder} />
            </div>
            {examples.some(e => e.video_url) && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2"><Video className="w-4 h-4 text-muted-foreground" /><div><p className="text-sm font-medium">해설 영상 QR 포함</p></div></div>
                <Switch checked={includeQR} onCheckedChange={setIncludeQR} />
              </div>
            )}
            <Button onClick={handleGenerate} disabled={generating || reprintCount === 0} className="w-full gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />} 선택 문항 퀴즈 생성 ({reprintCount}문항)
            </Button>
          </TabsContent>

          {/* ════ English Mode ════ */}
          {isEnglish && (
            <TabsContent value="english" className="space-y-4 mt-4">
              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                  <strong>영어 과목 전용 출제:</strong> 자료 유형(단어/해석/독해)에 맞는 시험지를 자동 생성합니다.
                </p>
              </div>

              {/* English sub-mode */}
              <div>
                <Label className="text-xs font-medium mb-2 block">출제 유형</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'vocab' as const, label: '🔤 단어 시험', desc: '영↔한 단어 테스트' },
                    { key: 'translation' as const, label: '📝 해석 시험', desc: '영문장 해석 테스트' },
                    { key: 'reading' as const, label: '📖 독해 문제', desc: '독해·문법 문제은행' },
                  ]).map(m => (
                    <div key={m.key}
                      className={`p-2.5 rounded-lg border cursor-pointer text-center transition-colors ${englishMode === m.key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => setEnglishMode(m.key)}>
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1">
                        {examples.filter(e => {
                          if (m.key === 'vocab') return e.category === '단어';
                          if (m.key === 'translation') return e.category === '해석';
                          return ['독해', '문법', '일반문항'].includes(e.category || '일반문항');
                        }).length}문항
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vocab direction */}
              {englishMode === 'vocab' && (
                <div>
                  <Label className="text-xs font-medium mb-2 block">출제 방향</Label>
                  <Select value={vocabDirection} onValueChange={v => setVocabDirection(v as any)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en_to_kr">영어 → 한국어</SelectItem>
                      <SelectItem value="kr_to_en">한국어 → 영어</SelectItem>
                      <SelectItem value="mixed">섞어서 출제</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Chapter filter for English */}
              <div>
                <Label className="text-xs font-medium mb-2 block">단원 선택</Label>
                <div className="flex flex-wrap gap-1.5">
                  {chapters.map(ch => (
                    <Badge key={ch} variant={engSelectedChapters.includes(ch) ? 'default' : 'outline'} className="cursor-pointer text-xs"
                      onClick={() => toggleEngChapter(ch)}>
                      {ch} ({examples.filter(e => e.chapter === ch).length})
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Item selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">문항 선택 ({engSelectedIds.size > 0 ? `${engSelectedIds.size}개 선택` : `전체 ${engFilteredExamples.length}개`})</Label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEngSelectedIds(new Set(engFilteredExamples.map(e => e.id)))}>전체 선택</Button>
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEngSelectedIds(new Set())}>전체 해제</Button>
                  </div>
                </div>
                <div className="max-h-[30vh] overflow-y-auto space-y-1 border rounded-lg p-2">
                  {engFilteredExamples.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">선택한 유형에 해당하는 문항이 없습니다</p>
                  ) : engFilteredExamples.map(ex => (
                    <label key={ex.id} className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer ${engSelectedIds.has(ex.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                      <Checkbox checked={engSelectedIds.has(ex.id)} onCheckedChange={() => toggleEngId(ex.id)} />
                      <span className="font-medium shrink-0">{ex.problem_number || `#${ex.sort_order + 1}`}</span>
                      <span className="truncate text-muted-foreground">{ex.question_text.slice(0, 50)}</span>
                      {ex.answer && <span className="text-[10px] text-muted-foreground ml-auto shrink-0">→ {ex.answer.slice(0, 20)}</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2"><Shuffle className="w-4 h-4 text-muted-foreground" /><div><p className="text-sm font-medium">랜덤 섞기</p></div></div>
                <Switch checked={randomOrder} onCheckedChange={setRandomOrder} />
              </div>

              <Button onClick={handleGenerate} disabled={generating || (engSelectedIds.size === 0 && engFilteredExamples.length === 0)} className="w-full gap-2">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                {englishMode === 'vocab' ? '단어 시험지' : englishMode === 'translation' ? '해석 시험지' : '독해 시험지'} 생성
                ({engSelectedIds.size > 0 ? engSelectedIds.size : engFilteredExamples.length}문항)
              </Button>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
