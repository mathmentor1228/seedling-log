import { useState, useEffect, useMemo } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RotateCcw, Eye, EyeOff, ChevronLeft, ChevronRight, Shuffle, Check, X, BookOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VocabWord {
  english: string;
  meaning: string;
}

interface VocabSetInfo {
  set_id: string;
  set_title: string;
  folder_name: string | null;
  words: VocabWord[];
}

export default function StudentVocab() {
  const { student } = useStudentAuth();
  const [loading, setLoading] = useState(true);
  const [vocabSets, setVocabSets] = useState<VocabSetInfo[]>([]);
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);

  // Flashcard state
  const [cards, setCards] = useState<VocabWord[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<'eng_to_kor' | 'kor_to_eng'>('eng_to_kor');
  const [started, setStarted] = useState(false);
  const [results, setResults] = useState<('correct' | 'wrong' | null)[]>([]);

  useEffect(() => {
    loadVocabSets();
  }, []);

  const loadVocabSets = async () => {
    setLoading(true);
    const { data, error } = await studentApi.getVocabCards();
    if (data?.sets) {
      setVocabSets(data.sets);
    }
    setLoading(false);
  };

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

    // Shuffle
    const shuffled = [...allWords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    setCards(shuffled);
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
    // Auto-advance
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

  const currentCard = cards[currentIdx];
  const correctCount = results.filter(r => r === 'correct').length;
  const wrongCount = results.filter(r => r === 'wrong').length;
  const answeredCount = correctCount + wrongCount;
  const isComplete = answeredCount === cards.length && cards.length > 0;

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
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            단어 암기 카드
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">범위를 선택하고 카드로 단어를 외워보세요</p>
        </div>

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
                      {sets.map(s => (
                        <label key={s.set_id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selectedSetIds.includes(s.set_id)}
                            onChange={() => toggleSetSelection(s.set_id)}
                            className="rounded border-input"
                          />
                          <span>{s.set_title}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">{s.words.length}단어</Badge>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-2">
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

              <Button
                onClick={startFlashcards}
                disabled={selectedSetIds.length === 0}
                className="w-full"
                size="lg"
              >
                <Shuffle className="w-4 h-4 mr-2" />
                카드 시작 ({vocabSets.filter(s => selectedSetIds.includes(s.set_id)).reduce((sum, s) => sum + s.words.length, 0)}단어)
              </Button>
            </div>
          </>
        )}
      </div>
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
            {wrongCount > 0 && (
              <Button variant="outline" onClick={() => {
                // Retry only wrong ones
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
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-4">
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
                  <p className="text-sm text-muted-foreground mt-2">
                    {mode === 'eng_to_kor' ? currentCard.english : currentCard.meaning}
                  </p>
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
