import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Save, Shuffle, FileText, Printer, X, Upload, Share2, Copy, FolderOpen, Link } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface WordItem {
  id?: string;
  english: string;
  meaning: string;
  sort_order: number;
}

interface WordSet {
  id: string;
  title: string;
  round_number: number;
  created_at: string;
}

interface GeneratedQuestion {
  questionNumber: number;
  type: 'eng_to_kor' | 'kor_to_eng';
  prompt: string;
  answer: string;
}

interface SavedTest {
  id: string;
  title: string;
  test_data: GeneratedQuestion[];
  question_count: number;
  eng_to_kor_percent: number;
  share_token: string | null;
  created_at: string;
  notes: string | null;
}

export function VocabTestGenerator() {
  const { user } = useAuth();
  const [tab, setTab] = useState('edit');

  // Word set management
  const [sets, setSets] = useState<WordSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [setTitle, setSetTitle] = useState('');
  const [words, setWords] = useState<WordItem[]>([{ english: '', meaning: '', sort_order: 0 }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Test generation
  const [engToKorPercent, setEngToKorPercent] = useState(50);
  const [questionCount, setQuestionCount] = useState(20);
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([]);
  const [showAnswers, setShowAnswers] = useState(false);
  const [testTitle, setTestTitle] = useState('');

  // Saved tests
  const [savedTests, setSavedTests] = useState<SavedTest[]>([]);
  const [savingTest, setSavingTest] = useState(false);
  const [currentTestId, setCurrentTestId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // Bulk paste
  const [bulkText, setBulkText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Load sets & saved tests
  useEffect(() => {
    loadSets();
    loadSavedTests();
  }, []);

  const loadSets = async () => {
    const { data } = await supabase
      .from('vocab_word_sets')
      .select('*')
      .order('round_number', { ascending: false });
    if (data) setSets(data);
  };

  const loadSavedTests = async () => {
    const { data } = await supabase
      .from('vocab_generated_tests')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setSavedTests(data.map(d => ({ ...d, test_data: d.test_data as unknown as GeneratedQuestion[] })));
  };

  // Load words for a set
  const loadSetWords = async (setId: string) => {
    setLoading(true);
    const { data: setData } = await supabase
      .from('vocab_word_sets')
      .select('*')
      .eq('id', setId)
      .single();
    if (setData) {
      setSetTitle(setData.title);
      setSelectedSetId(setData.id);
    }
    const { data: items } = await supabase
      .from('vocab_word_items')
      .select('*')
      .eq('set_id', setId)
      .order('sort_order');
    if (items && items.length > 0) {
      setWords(items.map(i => ({ id: i.id, english: i.english, meaning: i.meaning, sort_order: i.sort_order })));
    } else {
      setWords([{ english: '', meaning: '', sort_order: 0 }]);
    }
    setLoading(false);
  };

  // Save set
  const handleSave = async () => {
    if (!setTitle.trim()) {
      toast({ title: '제목을 입력하세요', variant: 'destructive' });
      return;
    }
    const validWords = words.filter(w => w.english.trim() && w.meaning.trim());
    if (validWords.length === 0) {
      toast({ title: '단어를 최소 1개 이상 입력하세요', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let setId = selectedSetId;
      if (setId) {
        await supabase.from('vocab_word_sets').update({ title: setTitle, updated_at: new Date().toISOString() }).eq('id', setId);
        await supabase.from('vocab_word_items').delete().eq('set_id', setId);
      } else {
        const maxRound = sets.length > 0 ? Math.max(...sets.map(s => s.round_number)) : 0;
        const { data: newSet } = await supabase.from('vocab_word_sets').insert({
          title: setTitle,
          round_number: maxRound + 1,
          created_by: user!.id,
        }).select().single();
        if (!newSet) throw new Error('Failed to create set');
        setId = newSet.id;
        setSelectedSetId(newSet.id);
      }
      const items = validWords.map((w, i) => ({
        set_id: setId!,
        english: w.english.trim(),
        meaning: w.meaning.trim(),
        sort_order: i,
      }));
      await supabase.from('vocab_word_items').insert(items);
      toast({ title: '저장 완료' });
      loadSets();
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  // Delete set
  const handleDeleteSet = async (id: string) => {
    if (!confirm('이 회차를 삭제하시겠습니까?')) return;
    await supabase.from('vocab_word_sets').delete().eq('id', id);
    if (selectedSetId === id) {
      setSelectedSetId(null);
      setSetTitle('');
      setWords([{ english: '', meaning: '', sort_order: 0 }]);
    }
    loadSets();
    toast({ title: '삭제 완료' });
  };

  // Word row management
  const addWord = () => setWords(prev => [...prev, { english: '', meaning: '', sort_order: prev.length }]);
  const removeWord = (idx: number) => setWords(prev => prev.filter((_, i) => i !== idx));
  const updateWord = (idx: number, field: 'english' | 'meaning', value: string) => {
    setWords(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  };

  // Bulk paste handler
  const handleBulkPaste = () => {
    const raw = bulkText;
    let newWords: WordItem[] = [];

    const hasBoxSymbol = raw.includes('□');
    if (hasBoxSymbol) {
      const blocks = raw.split('□').filter(b => b.trim());
      const posPattern = /^(.*?)\b(adv?|v|n|a|prep|conj|int|pron)\.\s*/;
      const phraseKoreanSplit = /^([a-zA-Z~\s''\-]+(?:\s+[a-zA-Z~\s''\-]+)*)\s+([\u3131-\uD79D].*)$/s;

      for (const block of blocks) {
        const text = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text) continue;

        let english = '';
        let meaning = '';

        const posMatch = text.match(posPattern);
        if (posMatch) {
          english = posMatch[1].trim();
          meaning = text.slice(posMatch[0].length).trim();
          if (english) {
            newWords.push({
              english,
              meaning: meaning.replace(/\s+/g, ' ').trim(),
              sort_order: newWords.length,
            });
          }
        } else {
          const korMatch = text.match(phraseKoreanSplit);
          if (korMatch) {
            english = korMatch[1].trim();
            meaning = korMatch[2].replace(/\s+/g, ' ').trim();
            if (english && meaning) {
              newWords.push({ english, meaning, sort_order: newWords.length });
            }
          }
        }
      }
    }

    if (newWords.length === 0) {
      const lines = raw.split('\n').filter(l => l.trim());
      for (const line of lines) {
        let parts = line.split('\t');
        if (parts.length < 2) parts = line.split(/\s{2,}/);
        if (parts.length < 2) parts = line.split(',');
        if (parts.length >= 2) {
          newWords.push({
            english: parts[0].trim(),
            meaning: parts.slice(1).join(', ').trim(),
            sort_order: newWords.length,
          });
        }
      }
    }

    if (newWords.length === 0) {
      toast({ title: '파싱할 수 없습니다', description: '□ 형식, 탭, 쉼표, 또는 공백으로 구분하세요', variant: 'destructive' });
      return;
    }
    newWords = newWords.filter(w => w.english && w.meaning);
    setWords(newWords);
    setShowBulkModal(false);
    setBulkText('');
    toast({ title: `${newWords.length}개 단어 불러옴` });
  };

  // New set
  const handleNewSet = () => {
    setSelectedSetId(null);
    setSetTitle('');
    setWords([{ english: '', meaning: '', sort_order: 0 }]);
  };

  // Generate test
  const handleGenerate = async () => {
    if (selectedSetIds.length === 0) {
      toast({ title: '회차를 선택하세요', variant: 'destructive' });
      return;
    }
    const { data: allItems } = await supabase
      .from('vocab_word_items')
      .select('english, meaning')
      .in('set_id', selectedSetIds);
    if (!allItems || allItems.length === 0) {
      toast({ title: '단어가 없습니다', variant: 'destructive' });
      return;
    }

    const pool = [...allItems];
    const count = Math.min(questionCount, pool.length);
    const engToKorCount = Math.round(count * (engToKorPercent / 100));

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const selected = pool.slice(0, count);
    const questions: GeneratedQuestion[] = [];

    for (let i = 0; i < engToKorCount && i < selected.length; i++) {
      questions.push({
        questionNumber: i + 1,
        type: 'eng_to_kor',
        prompt: selected[i].english,
        answer: selected[i].meaning,
      });
    }
    for (let i = engToKorCount; i < selected.length; i++) {
      questions.push({
        questionNumber: i + 1,
        type: 'kor_to_eng',
        prompt: selected[i].meaning,
        answer: selected[i].english,
      });
    }

    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    questions.forEach((q, i) => (q.questionNumber = i + 1));

    setGenerated(questions);
    setCurrentTestId(null);
    setShowAnswers(false);
    setTab('result');
  };

  const toggleSetSelection = (id: string) => {
    setSelectedSetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePrint = () => {
    window.print();
  };

  // Save generated test
  const handleSaveTest = async () => {
    if (generated.length === 0) return;
    setSavingTest(true);
    try {
      const { data: tokenData } = await supabase.rpc('generate_vocab_test_token');
      const token = tokenData as string;

      const { data, error } = await supabase.from('vocab_generated_tests').insert({
        title: testTitle || '단어 시험',
        test_data: generated as unknown as any,
        eng_to_kor_percent: engToKorPercent,
        question_count: generated.length,
        source_set_ids: selectedSetIds,
        share_token: token,
        created_by: user!.id,
      }).select().single();

      if (error) throw error;
      setCurrentTestId(data.id);
      toast({ title: '시험지 저장 완료' });
      loadSavedTests();
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    }
    setSavingTest(false);
  };

  // Share test
  const handleShare = async (testId: string) => {
    const test = savedTests.find(t => t.id === testId);
    if (!test) return;

    let token = test.share_token;
    if (!token) {
      const { data: tokenData } = await supabase.rpc('generate_vocab_test_token');
      token = tokenData as string;
      await supabase.from('vocab_generated_tests').update({ share_token: token }).eq('id', testId);
      loadSavedTests();
    }

    const url = `${window.location.origin}/vocab-test-view?token=${token}`;
    setShareUrl(url);
    setShowShareModal(true);
  };

  const copyShareUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast({ title: '링크가 복사되었습니다' });
    }
  };

  // Load saved test into result view
  const handleLoadSavedTest = (test: SavedTest) => {
    setGenerated(test.test_data);
    setTestTitle(test.title);
    setCurrentTestId(test.id);
    setShowAnswers(false);
    setTab('result');
  };

  // Delete saved test
  const handleDeleteSavedTest = async (id: string) => {
    if (!confirm('이 시험지를 삭제하시겠습니까?')) return;
    await supabase.from('vocab_generated_tests').delete().eq('id', id);
    if (currentTestId === id) setCurrentTestId(null);
    loadSavedTests();
    toast({ title: '삭제 완료' });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold">단어 시험 출제</h1>
        <p className="text-xs text-muted-foreground mt-0.5">단어 목록을 회차별로 저장하고, 조건에 맞게 시험을 출제합니다</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="edit" className="gap-1.5 text-xs">
            <FileText className="w-3.5 h-3.5" />
            단어 입력
          </TabsTrigger>
          <TabsTrigger value="generate" className="gap-1.5 text-xs">
            <Shuffle className="w-3.5 h-3.5" />
            시험 출제
          </TabsTrigger>
          <TabsTrigger value="result" className="gap-1.5 text-xs" disabled={generated.length === 0}>
            <Printer className="w-3.5 h-3.5" />
            시험지 / 답지
          </TabsTrigger>
          <TabsTrigger value="saved" className="gap-1.5 text-xs">
            <FolderOpen className="w-3.5 h-3.5" />
            저장된 시험지
          </TabsTrigger>
        </TabsList>

        {/* === TAB: Word Input === */}
        <TabsContent value="edit">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            {/* Set list sidebar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span>회차 목록</span>
                  <Button size="sm" variant="outline" onClick={handleNewSet}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> 새 회차
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-[400px] overflow-y-auto">
                {sets.length === 0 && <p className="text-xs text-muted-foreground">저장된 회차가 없습니다</p>}
                {sets.map(s => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-sm transition-colors ${selectedSetId === s.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}
                    onClick={() => loadSetWords(s.id)}
                  >
                    <span className="truncate">
                      <span className="text-xs text-muted-foreground mr-1">#{s.round_number}</span>
                      {s.title}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={e => { e.stopPropagation(); handleDeleteSet(s.id); }}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Word editor */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs mb-1 block">회차 제목</Label>
                    <Input
                      value={setTitle}
                      onChange={e => setSetTitle(e.target.value)}
                      placeholder="예: Day 1~5, Chapter 3 등"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex gap-1.5 items-end pt-4">
                    <Button size="sm" variant="outline" onClick={() => setShowBulkModal(true)}>
                      <Upload className="w-3.5 h-3.5 mr-1" /> 일괄 입력
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="w-3.5 h-3.5 mr-1" /> {saving ? '저장중...' : '저장'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                    <span>#</span>
                    <span>영어</span>
                    <span>뜻</span>
                    <span />
                  </div>
                  {words.map((w, i) => (
                    <div key={i} className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 items-center">
                      <span className="text-xs text-muted-foreground text-center">{i + 1}</span>
                      <Input
                        value={w.english}
                        onChange={e => updateWord(i, 'english', e.target.value)}
                        placeholder="apple"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={w.meaning}
                        onChange={e => updateWord(i, 'meaning', e.target.value)}
                        placeholder="사과"
                        className="h-8 text-sm"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeWord(i)}
                        disabled={words.length <= 1}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={addWord}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> 단어 추가
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === TAB: Generate === */}
        <TabsContent value="generate">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>출제 회차 선택</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                {sets.length === 0 && <p className="text-xs text-muted-foreground">저장된 회차가 없습니다</p>}
                {sets.map(s => (
                  <label key={s.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedSetIds.includes(s.id)}
                      onCheckedChange={() => toggleSetSelection(s.id)}
                    />
                    <span className="text-xs text-muted-foreground">#{s.round_number}</span>
                    <span>{s.title}</span>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>출제 옵션</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label className="text-xs mb-1 block">시험 제목</Label>
                  <Input
                    value={testTitle}
                    onChange={e => setTestTitle(e.target.value)}
                    placeholder="예: 1주차 단어 시험"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">문제 수</Label>
                  <Input
                    type="number"
                    value={questionCount}
                    onChange={e => setQuestionCount(Number(e.target.value))}
                    min={1}
                    max={200}
                    className="h-8 text-sm w-24"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-2 block">
                    영→한 비율: <span className="font-bold text-primary">{engToKorPercent}%</span>
                    &nbsp;/&nbsp;한→영: <span className="font-bold text-primary">{100 - engToKorPercent}%</span>
                  </Label>
                  <Slider
                    value={[engToKorPercent]}
                    onValueChange={v => setEngToKorPercent(v[0])}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>한→영 100%</span>
                    <span>영→한 100%</span>
                  </div>
                </div>
                <Button onClick={handleGenerate} className="w-full" disabled={selectedSetIds.length === 0}>
                  <Shuffle className="w-4 h-4 mr-1.5" />
                  시험 출제하기
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === TAB: Result === */}
        <TabsContent value="result">
          {generated.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap print:hidden">
                <Button variant="outline" size="sm" onClick={() => setShowAnswers(false)} className={!showAnswers ? 'bg-primary text-primary-foreground' : ''}>
                  시험지
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAnswers(true)} className={showAnswers ? 'bg-primary text-primary-foreground' : ''}>
                  답지
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> 인쇄
                </Button>
                <Button variant="outline" size="sm" onClick={handleGenerate}>
                  <Shuffle className="w-3.5 h-3.5 mr-1" /> 다시 섞기
                </Button>
                <div className="flex-1" />
                {!currentTestId ? (
                  <Button size="sm" onClick={handleSaveTest} disabled={savingTest}>
                    <Save className="w-3.5 h-3.5 mr-1" /> {savingTest ? '저장 중...' : '시험지 저장'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleShare(currentTestId)}>
                    <Share2 className="w-3.5 h-3.5 mr-1" /> 공유 링크
                  </Button>
                )}
              </div>

              <div ref={printRef} className="print-area">
                <div className="text-center mb-6 border-b pb-4">
                  <h2 className="text-lg font-bold">{testTitle || '단어 시험'}</h2>
                  <div className="flex justify-center gap-8 mt-2 text-sm text-muted-foreground">
                    <span>이름: ________________</span>
                    <span>날짜: ________________</span>
                    <span>점수: _______ / {generated.length}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {generated.map(q => (
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
                  <div className="mt-4 pt-2 border-t text-center text-xs text-muted-foreground">
                    ※ 답지
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* === TAB: Saved Tests === */}
        <TabsContent value="saved">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>저장된 시험지</CardTitle>
            </CardHeader>
            <CardContent>
              {savedTests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">저장된 시험지가 없습니다. 시험을 출제한 후 저장하세요.</p>
              ) : (
                <div className="space-y-2">
                  {savedTests.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t.question_count}문제 · 영→한 {t.eng_to_kor_percent}% · {new Date(t.created_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <Button size="sm" variant="outline" onClick={() => handleLoadSavedTest(t)}>
                          <FileText className="w-3.5 h-3.5 mr-1" /> 보기
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleShare(t.id)}>
                          <Share2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDeleteSavedTest(t.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk paste modal */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>일괄 입력</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            엑셀이나 메모장에서 복사한 내용을 붙여넣으세요.<br />
            <strong>□ 형식</strong>도 자동 인식합니다 (예: □ ever adv. 지금까지).<br />
            또는 각 줄에 <strong>영어[탭/쉼표/공백]뜻</strong> 형식도 지원합니다.
          </p>
          <Textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder={`□ ever adv. 지금까지, 언젠가\n□ find v. ~을 발견하다\n□ suddenly adv. 갑자기\n\n또는\n\napple\t사과\nbanana\t바나나`}
            rows={12}
            className="text-sm font-mono"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowBulkModal(false)}>취소</Button>
            <Button size="sm" onClick={handleBulkPaste}>
              <Upload className="w-3.5 h-3.5 mr-1" /> 불러오기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-4 h-4" />
              시험지 공유
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            아래 링크를 조교에게 공유하면 시험지와 답지를 확인할 수 있습니다.
          </p>
          <div className="flex items-center gap-2">
            <Input value={shareUrl || ''} readOnly className="text-xs font-mono" />
            <Button size="sm" onClick={copyShareUrl}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print styles */}
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