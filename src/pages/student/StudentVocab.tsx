import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw, Eye, ChevronLeft, ChevronRight, Shuffle, Check, X, BookOpen, Volume2, Target, PenLine, Headphones, Globe, Zap, Settings2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { speakEnglish } from '@/lib/ttsUtils';
import VocabSelfTest from '@/components/student/VocabSelfTest';
import EnglishEnglishTest from '@/components/student/EnglishEnglishTest';
import { StudentStudyTabs } from '@/components/student/StudentStudyTabs';

interface VocabWord {
  english: string;
  meaning: string;
  english_definition?: string | null;
}

interface VocabSetInfo {
  set_id: string;
  set_title: string;
  folder_name: string | null;
  required_rounds: number;
  words: VocabWord[];
}

interface VocabCompletion {
  id: string;
  word_set_ids: string[];
  correct_count: number;
  wrong_count: number;
  total_count: number;
  mode: string;
  completed_at: string;
}

export default function StudentVocab() {
  const { student } = useStudentAuth();
  const [loading, setLoading] = useState(true);
  const [vocabSets, setVocabSets] = useState<VocabSetInfo[]>([]);
  const [completions, setCompletions] = useState<VocabCompletion[]>([]);
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);
  const [testLevel, setTestLevel] = useState(1);
  const [testTimeLimit, setTestTimeLimit] = useState<number | null>(null);
  const [activeTestAssignment, setActiveTestAssignment] = useState<any | null>(null);

  // Flashcard state
  const [cards, setCards] = useState<VocabWord[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<'eng_to_kor' | 'kor_to_eng'>('eng_to_kor');
  const [studyType, setStudyType] = useState<'flashcard' | 'test' | 'listening' | 'eng_eng_mc' | 'eng_eng_typing' | 'self_test'>('flashcard');
  const [started, setStarted] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [results, setResults] = useState<('correct' | 'wrong' | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Self-test settings
  const [selfTestWordCount, setSelfTestWordCount] = useState(20);
  const [selfTestLevel, setSelfTestLevel] = useState(2);
  const [selfModeEK, setSelfModeEK] = useState(true);   // 영→한
  const [selfModeKE, setSelfModeKE] = useState(true);   // 한→영
  const [selfModeListen, setSelfModeListen] = useState(false); // 듣고 스펠/뜻

  useEffect(() => {
    loadVocabSets();
  }, []);

  const loadVocabSets = async () => {
    setLoading(true);
    const { data, error } = await studentApi.getVocabCards();
    if (data?.sets) {
      setVocabSets(data.sets);
    }
    if (data?.completions) {
      setCompletions(data.completions);
    }
    if (data?.test_level) setTestLevel(data.test_level);
    if (data?.test_time_limit) setTestTimeLimit(data.test_time_limit);
    setActiveTestAssignment(data?.active_test_assignment || null);
    if (data?.active_test_assignment?.word_set_ids?.length) {
      setSelectedSetIds(data.active_test_assignment.word_set_ids);
      setStudyType('test');
      setMode(data.active_test_assignment.test_direction === 'kor_to_eng' ? 'kor_to_eng' : 'eng_to_kor');
    }
    setLoading(false);
  };

  // Count completions per set
  const completionCountBySet = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of completions) {
      for (const setId of c.word_set_ids) {
        map[setId] = (map[setId] || 0) + 1;
      }
    }
    return map;
  }, [completions]);

  const toggleSetSelection = (setId: string) => {
    setSelectedSetIds(prev =>
      prev.includes(setId) ? prev.filter(id => id !== setId) : [...prev, setId]
    );
  };

  const startFlashcards = () => {
    const allWords = vocabSets
      .filter(s => selectedSetIds.includes(s.set_id))
      .flatMap(s => s.words);
    if (allWords.length === 0) return;

    let shuffled = [...allWords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // For self-test, limit to selfTestWordCount
    if (studyType === 'self_test') {
      shuffled = shuffled.slice(0, Math.min(selfTestWordCount, shuffled.length));
    }

    setCards(shuffled);
    
    if (studyType === 'test' || studyType === 'listening' || studyType === 'eng_eng_mc' || studyType === 'eng_eng_typing' || studyType === 'self_test') {
      setTestMode(true);
      setStarted(true);
      return;
    }
    
    setTestMode(false);
    setCurrentIdx(0);
    setFlipped(false);
    setResults(new Array(shuffled.length).fill(null));
    setStarted(true);
  };

  const reshuffle = () => {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setCards(shuffled);
    setCurrentIdx(0);
    setFlipped(false);
    setResults(new Array(shuffled.length).fill(null));
  };

  const markResult = (result: 'correct' | 'wrong') => {
    setResults(prev => {
      const next = [...prev];
      next[currentIdx] = result;
      return next;
    });
    if (currentIdx < cards.length - 1) {
      setTimeout(() => {
        setCurrentIdx(prev => prev + 1);
        setFlipped(false);
      }, 300);
    }
  };

  const goNext = () => {
    if (currentIdx < cards.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setFlipped(false);
    }
  };

  const goPrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(prev => prev - 1);
      setFlipped(false);
    }
  };

  // speakWord replaced by speakEnglish from ttsUtils

  const submitCompletion = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const correct = results.filter(r => r === 'correct').length;
    const wrong = results.filter(r => r === 'wrong').length;
    const { error } = await studentApi.submitVocabCompletion(
      selectedSetIds,
      correct,
      wrong,
      cards.length,
      mode
    );
    if (!error) {
      toast({ title: '학습 기록 저장 완료! ✅' });
      // Update local completions
      setCompletions(prev => [{
        id: crypto.randomUUID(),
        word_set_ids: selectedSetIds,
        correct_count: correct,
        wrong_count: wrong,
        total_count: cards.length,
        mode,
        completed_at: new Date().toISOString(),
      }, ...prev]);
    }
    setSubmitting(false);
  }, [submitting, results, selectedSetIds, cards.length, mode]);

  const currentCard = cards[currentIdx];
  const correctCount = results.filter(r => r === 'correct').length;
  const wrongCount = results.filter(r => r === 'wrong').length;
  const answeredCount = correctCount + wrongCount;
  const isComplete = answeredCount === cards.length && cards.length > 0;

  // Auto-submit when complete
  useEffect(() => {
    if (isComplete && !submitting) {
      submitCompletion();
    }
  }, [isComplete]);

  // Group sets by folder
  const groupedSets = useMemo(() => {
    const groups: Record<string, VocabSetInfo[]> = {};
    for (const s of vocabSets) {
      const key = s.folder_name || '미분류';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return groups;
  }, [vocabSets]);

  // Check if any set has homework (required_rounds > 0)
  const hasHomework = vocabSets.some(s => s.required_rounds > 0);

  // Check if any selected sets have english_definition
  const hasEngDefinitions = useMemo(() => {
    const selected = selectedSetIds.length > 0
      ? vocabSets.filter(s => selectedSetIds.includes(s.set_id))
      : vocabSets;
    return selected.some(s => s.words.some(w => w.english_definition));
  }, [vocabSets, selectedSetIds]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Set selection view
  if (!started) {
    return (
      <div className="space-y-4 p-4 max-w-lg mx-auto">
        <StudentStudyTabs />
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            단어 암기 카드
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">범위를 선택하고 카드로 단어를 외워보세요</p>
        </div>

        {activeTestAssignment && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-primary" />
                  오픈된 단어 테스트
                </p>
                <Badge>{activeTestAssignment.test_mode === 'web' ? '웹 테스트' : '인쇄 테스트'}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                현재 오픈된 범위만 바로 응시할 수 있어요.
              </p>
              <div className="flex flex-wrap gap-1">
                {vocabSets.filter(set => activeTestAssignment.word_set_ids?.includes(set.set_id)).map(set => (
                  <Badge key={set.set_id} variant="outline" className="text-[10px]">{set.set_title}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>Lv.{testLevel}</span>
                {testTimeLimit && <span>제한시간 {testTimeLimit}초</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Homework progress section */}
        {hasHomework && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Target className="w-4 h-4 text-primary" />
                숙제 진행 현황
              </p>
              {vocabSets.filter(s => s.required_rounds > 0).map(s => {
                const done = completionCountBySet[s.set_id] || 0;
                const target = s.required_rounds;
                const percent = Math.min(100, Math.round(done / target * 100));
                const isDone = done >= target;
                return (
                  <div key={s.set_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={isDone ? 'text-green-600 font-medium' : ''}>
                        {isDone ? '✅ ' : ''}{s.set_title}
                      </span>
                      <span className={isDone ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                        {done}/{target}회
                      </span>
                    </div>
                    <Progress value={percent} className="h-1.5" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {vocabSets.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              배정된 단어 목록이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-medium">암기할 범위 선택</p>
                {Object.entries(groupedSets).map(([folderName, sets]) => (
                  <div key={folderName}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      📁 {folderName}
                    </p>
                    <div className="space-y-1 pl-2">
                      {sets.map(s => {
                        const done = completionCountBySet[s.set_id] || 0;
                        const hasTarget = s.required_rounds > 0;
                        const targetMet = hasTarget && done >= s.required_rounds;
                        return (
                          <label key={s.set_id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={selectedSetIds.includes(s.set_id)}
                              onChange={() => toggleSetSelection(s.set_id)}
                              className="rounded border-input"
                            />
                            <span>{s.set_title}</span>
                            <div className="ml-auto flex items-center gap-1">
                              {hasTarget && (
                                <Badge variant={targetMet ? 'default' : 'outline'} className="text-[10px]">
                                  {done}/{s.required_rounds}회
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[10px]">{s.words.length}단어</Badge>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-2">
              {studyType !== 'listening' && studyType !== 'eng_eng_mc' && studyType !== 'eng_eng_typing' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">출제 방식</label>
                  <Select value={mode} onValueChange={v => setMode(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eng_to_kor">영어 → 한글 뜻</SelectItem>
                      <SelectItem value="kor_to_eng">한글 뜻 → 영어</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">학습 방법</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={studyType === 'flashcard' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStudyType('flashcard')}
                    className="w-full"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" /> 카드
                  </Button>
                  <Button
                    variant={studyType === 'test' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStudyType('test')}
                    className="w-full"
                  >
                    <PenLine className="w-3.5 h-3.5 mr-1" /> 테스트
                  </Button>
                  <Button
                    variant={studyType === 'listening' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStudyType('listening')}
                    className="w-full"
                  >
                    <Headphones className="w-3.5 h-3.5 mr-1" /> 듣기
                  </Button>
                  <Button
                    variant={studyType === 'self_test' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStudyType('self_test')}
                    className="w-full"
                  >
                    <Zap className="w-3.5 h-3.5 mr-1" /> 셀프 테스트
                  </Button>
                </div>
                {/* English-English test modes */}
                {hasEngDefinitions && (
                  <div className="mt-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">영영 테스트</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={studyType === 'eng_eng_mc' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStudyType('eng_eng_mc')}
                        className="w-full"
                      >
                        <Globe className="w-3.5 h-3.5 mr-1" /> 영영 객관식
                      </Button>
                      <Button
                        variant={studyType === 'eng_eng_typing' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStudyType('eng_eng_typing')}
                        className="w-full"
                      >
                        <PenLine className="w-3.5 h-3.5 mr-1" /> 영영 주관식
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Self-test settings */}
              {studyType === 'self_test' && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-3 pb-3 space-y-3">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-primary" />
                      셀프 테스트 설정
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">단어 수</Label>
                        <Input
                          type="number"
                          min={5}
                          max={200}
                          value={selfTestWordCount}
                          onChange={e => setSelfTestWordCount(Math.max(5, Math.min(200, Number(e.target.value) || 20)))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">난이도(문항당 시간)</Label>
                        <Select value={String(selfTestLevel)} onValueChange={v => setSelfTestLevel(Number(v))}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Lv.1 · 3지선다 · 4초</SelectItem>
                            <SelectItem value="2">Lv.2 · 5지선다 · 4초</SelectItem>
                            <SelectItem value="3">Lv.3 · 주관식 · 6초</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground block mb-1">출제 방식 (복수 선택 시 랜덤 혼합)</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={selfModeEK ? 'default' : 'outline'}
                          className="h-8 text-[11px]"
                          onClick={() => setSelfModeEK(v => !v)}
                        >영→한</Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={selfModeKE ? 'default' : 'outline'}
                          className="h-8 text-[11px]"
                          onClick={() => setSelfModeKE(v => !v)}
                        >한→영(스펠)</Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={selfModeListen ? 'default' : 'outline'}
                          className="h-8 text-[11px]"
                          onClick={() => setSelfModeListen(v => !v)}
                        >듣기→뜻</Button>
                      </div>
                      {!selfModeEK && !selfModeKE && !selfModeListen && (
                        <p className="text-[10px] text-red-500 mt-1">최소 1개 출제 방식을 선택해주세요</p>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ⚡ 결과(소요 시간 포함)는 담당 선생님에게 자동 보고되며, 무제한 재응시 가능합니다.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Test mode settings (student-overridable) */}
              {(studyType === 'test' || studyType === 'listening') && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-3 pb-3 space-y-3">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-primary" />
                      테스트 설정 {activeTestAssignment ? '(선생님 설정 변경 가능)' : ''}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">난이도(문항당 시간)</Label>
                        <Select value={String(testLevel)} onValueChange={v => setTestLevel(Number(v))}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Lv.1 · 3지선다 · 4초</SelectItem>
                            <SelectItem value="2">Lv.2 · 5지선다 · 4초</SelectItem>
                            <SelectItem value="3">Lv.3 · 주관식 · 6초</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">전체 제한시간</Label>
                        <Select
                          value={testTimeLimit ? String(testTimeLimit) : 'none'}
                          onValueChange={v => setTestTimeLimit(v === 'none' ? null : Number(v))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">제한 없음</SelectItem>
                            <SelectItem value="60">1분</SelectItem>
                            <SelectItem value="120">2분</SelectItem>
                            <SelectItem value="180">3분</SelectItem>
                            <SelectItem value="300">5분</SelectItem>
                            <SelectItem value="600">10분</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ⏱ 완료 후 난이도와 소요 시간이 결과 화면에 함께 표시됩니다.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={startFlashcards}
                disabled={selectedSetIds.length === 0 || (studyType === 'self_test' && !selfModeEK && !selfModeKE && !selfModeListen)}
                className="w-full"
                size="lg"
              >
                <Shuffle className="w-4 h-4 mr-2" />
                {studyType === 'self_test' ? `셀프 테스트 시작 (${Math.min(selfTestWordCount, vocabSets.filter(s => selectedSetIds.includes(s.set_id)).reduce((sum, s) => sum + s.words.length, 0))}단어 · 기준 ${Math.min(selfTestWordCount, vocabSets.filter(s => selectedSetIds.includes(s.set_id)).reduce((sum, s) => sum + s.words.length, 0)) * (selfTestLevel === 3 ? 6 : 4)}초)`
                  : studyType === 'test' ? '테스트 시작'
                  : studyType === 'listening' ? '듣기 테스트 시작'
                  : studyType === 'eng_eng_mc' ? '영영 객관식 시작'
                  : studyType === 'eng_eng_typing' ? '영영 주관식 시작'
                  : '카드 시작'} {studyType !== 'self_test' ? `(${vocabSets.filter(s => selectedSetIds.includes(s.set_id)).reduce((sum, s) => sum + s.words.length, 0)}단어)` : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // English-English test mode
  if (testMode && (studyType === 'eng_eng_mc' || studyType === 'eng_eng_typing')) {
    const engEngWords = cards
      .filter(w => w.english_definition)
      .map(w => ({
        english: w.english,
        meaning: w.meaning,
        english_definition: w.english_definition!,
      }));

    if (engEngWords.length === 0) {
      return (
        <div className="space-y-4 p-4 max-w-lg mx-auto text-center">
          <Card>
            <CardContent className="py-8">
              <p className="text-muted-foreground">영영풀이가 입력된 단어가 없습니다.</p>
              <Button className="mt-4" onClick={() => { setStarted(false); setTestMode(false); }}>
                돌아가기
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <EnglishEnglishTest
        words={engEngWords}
        questionType={studyType === 'eng_eng_mc' ? 'multiple_choice' : 'typing'}
        onFinish={async (correct, wrong, total) => {
          const modeStr = studyType === 'eng_eng_mc' ? 'eng_eng_mc' : 'eng_eng_typing';
          const { error } = await studentApi.submitVocabCompletion(
            selectedSetIds, correct, wrong, total, modeStr, false, 'assigned'
          );
          if (!error) {
            toast({ title: '테스트 기록 저장 완료! ✅' });
            setCompletions(prev => [{
              id: crypto.randomUUID(),
              word_set_ids: selectedSetIds,
              correct_count: correct,
              wrong_count: wrong,
              total_count: total,
              mode: modeStr,
              completed_at: new Date().toISOString(),
            }, ...prev]);
          }
        }}
        onBack={() => { setStarted(false); setTestMode(false); }}
      />
    );
  }

  // Self-test mode (student-initiated random test)
  if (testMode && studyType === 'self_test') {
    const modePool: Array<'eng_to_kor' | 'kor_to_eng' | 'listening'> = [];
    if (selfModeEK) modePool.push('eng_to_kor');
    if (selfModeKE) modePool.push('kor_to_eng');
    if (selfModeListen) modePool.push('listening');
    const safePool = modePool.length > 0 ? modePool : ['eng_to_kor' as const];
    const perQSec = selfTestLevel === 3 ? 6 : 4;
    const expectedSec = cards.length * perQSec;
    const levelDesc = selfTestLevel === 1 ? '3지선다·4초' : selfTestLevel === 2 ? '5지선다·4초' : '주관식·6초';
    const selfLevelLabel = `Lv.${selfTestLevel} (${levelDesc})`;
    const selfScopeLabel = vocabSets
      .filter(s => selectedSetIds.includes(s.set_id))
      .map(s => s.set_title)
      .join(', ');
    return (
      <VocabSelfTest
        words={cards}
        mode={safePool[0]}
        modePool={safePool}
        testLevel={selfTestLevel}
        levelLabel={selfLevelLabel}
        scopeLabel={selfScopeLabel}
        testTimeLimit={null}
        onFinish={async (correct, wrong, total, meta) => {
          const modeStr = (safePool.length > 1 ? 'mixed' : safePool[0]) + '_self_test';
          const { error } = await studentApi.submitVocabCompletion(
            selectedSetIds, correct, wrong, total, modeStr, true, 'self',
            {
              startedAt: meta?.startedAt,
              finishedAt: meta?.finishedAt,
              durationSeconds: meta?.durationSeconds,
              expectedSeconds: expectedSec,
              options: {
                level: selfTestLevel,
                per_question_seconds: perQSec,
                modes: safePool,
                word_count: total,
              },
            }
          );
          if (!error) {
            const overTime = (meta?.durationSeconds ?? 0) > expectedSec;
            toast({
              title: '셀프 테스트 기록 저장 완료! ✅',
              description: `소요 ${meta?.durationSeconds ?? 0}초 / 기준 ${expectedSec}초${overTime ? ' (초과)' : ''} · 담당 선생님에게 결과 전달`,
            });
            setCompletions(prev => [{
              id: crypto.randomUUID(),
              word_set_ids: selectedSetIds,
              correct_count: correct,
              wrong_count: wrong,
              total_count: total,
              mode: modeStr,
              completed_at: new Date().toISOString(),
            }, ...prev]);
          }
        }}
        onBack={() => { setStarted(false); setTestMode(false); }}
      />
    );
  }

  // Test mode view (existing Korean test - teacher assigned)
  if (testMode) {
    return (
      <VocabSelfTest
        words={cards}
        mode={studyType === 'listening' ? 'listening' : mode}
        testLevel={testLevel}
        testTimeLimit={testTimeLimit}
        onFinish={async (correct, wrong, total) => {
          const { error } = await studentApi.submitVocabCompletion(
            selectedSetIds, correct, wrong, total, mode + '_test', false, 'assigned'
          );
          if (!error) {
            toast({ title: '테스트 기록 저장 완료! ✅' });
            setCompletions(prev => [{
              id: crypto.randomUUID(),
              word_set_ids: selectedSetIds,
              correct_count: correct,
              wrong_count: wrong,
              total_count: total,
              mode: mode + '_test',
              completed_at: new Date().toISOString(),
            }, ...prev]);
          }
        }}
        onBack={() => { setStarted(false); setTestMode(false); }}
      />
    );
  }

  // Flashcard view
  return (
    <div className="space-y-4 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> 목록
        </Button>
        <div className="text-sm text-muted-foreground">
          {currentIdx + 1} / {cards.length}
        </div>
        <Button variant="ghost" size="sm" onClick={reshuffle}>
          <Shuffle className="w-3.5 h-3.5 mr-1" /> 섞기
        </Button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-muted">
        {results.map((r, i) => (
          <div
            key={i}
            className={`flex-1 transition-colors ${
              r === 'correct' ? 'bg-green-500' :
              r === 'wrong' ? 'bg-red-400' :
              i === currentIdx ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Score */}
      <div className="flex justify-center gap-4 text-sm">
        <span className="text-green-600 font-medium">✓ {correctCount}</span>
        <span className="text-red-500 font-medium">✗ {wrongCount}</span>
        <span className="text-muted-foreground">{cards.length - answeredCount} 남음</span>
      </div>

      {/* Card */}
      {isComplete ? (
        <Card className="min-h-[280px] flex items-center justify-center">
          <CardContent className="text-center space-y-4 py-8">
            <div className="text-4xl">🎉</div>
            <h2 className="text-xl font-bold">완료!</h2>
            <div className="text-lg">
              <span className="text-green-600 font-bold">{correctCount}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="font-bold">{cards.length}</span>
              <span className="text-muted-foreground ml-2">({Math.round(correctCount / cards.length * 100)}%)</span>
            </div>
            <p className="text-xs text-muted-foreground">학습 기록이 자동 저장되었습니다</p>
            {wrongCount > 0 && (
              <Button variant="outline" onClick={() => {
                const wrongCards = cards.filter((_, i) => results[i] === 'wrong');
                const shuffled = [...wrongCards];
                for (let i = shuffled.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                setCards(shuffled);
                setCurrentIdx(0);
                setFlipped(false);
                setResults(new Array(shuffled.length).fill(null));
              }}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> 틀린 단어만 다시
              </Button>
            )}
            <Button variant="outline" onClick={reshuffle}>
              <Shuffle className="w-3.5 h-3.5 mr-1" /> 전체 다시
            </Button>
          </CardContent>
        </Card>
      ) : currentCard && (
        <div
          className="cursor-pointer select-none"
          onClick={() => setFlipped(!flipped)}
        >
          <Card className={`min-h-[280px] flex items-center justify-center transition-all duration-300 ${flipped ? 'bg-primary/5 border-primary/30' : ''}`}>
            <CardContent className="text-center py-8 space-y-4 w-full">
              {!flipped ? (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {mode === 'eng_to_kor' ? 'English' : '한글 뜻'}
                  </p>
                  <p className="text-2xl font-bold leading-relaxed px-4">
                    {mode === 'eng_to_kor' ? currentCard.english : currentCard.meaning}
                  </p>
                  {mode === 'eng_to_kor' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); speakEnglish(currentCard.english); }}
                    >
                      <Volume2 className="w-4 h-4 mr-1" /> 발음 듣기
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-2">
                    <Eye className="w-3 h-3" /> 탭하여 정답 확인
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {mode === 'eng_to_kor' ? '정답 (뜻)' : '정답 (English)'}
                  </p>
                  <p className="text-2xl font-bold text-primary leading-relaxed px-4">
                    {mode === 'eng_to_kor' ? currentCard.meaning : currentCard.english}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <p className="text-sm text-muted-foreground">
                      {mode === 'eng_to_kor' ? currentCard.english : currentCard.meaning}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); speakEnglish(currentCard.english); }}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls */}
      {!isComplete && currentCard && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="icon" onClick={goPrev} disabled={currentIdx === 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {flipped && results[currentIdx] === null && (
            <div className="flex gap-2 flex-1 justify-center">
              <Button
                variant="outline"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => markResult('wrong')}
              >
                <X className="w-4 h-4 mr-1" /> 몰랐어요
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-green-200 text-green-600 hover:bg-green-50"
                onClick={() => markResult('correct')}
              >
                <Check className="w-4 h-4 mr-1" /> 알았어요
              </Button>
            </div>
          )}

          {(!flipped || results[currentIdx] !== null) && (
            <div className="flex-1 text-center">
              {!flipped && <span className="text-xs text-muted-foreground">카드를 탭하세요</span>}
              {results[currentIdx] !== null && (
                <Badge variant={results[currentIdx] === 'correct' ? 'default' : 'destructive'} className="text-xs">
                  {results[currentIdx] === 'correct' ? '✓ 정답' : '✗ 오답'}
                </Badge>
              )}
            </div>
          )}

          <Button variant="outline" size="icon" onClick={goNext} disabled={currentIdx >= cards.length - 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
