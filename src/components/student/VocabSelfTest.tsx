import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, RotateCcw, Volume2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { speakEnglish } from '@/lib/ttsUtils';

interface VocabWord {
  english: string;
  meaning: string;
}

interface TestResult {
  word: VocabWord;
  userAnswer: string;
  correct: boolean;
}

interface VocabSelfTestProps {
  words: VocabWord[];
  mode: 'eng_to_kor' | 'kor_to_eng';
  onFinish: (correct: number, wrong: number, total: number) => void;
  onBack: () => void;
}

export default function VocabSelfTest({ words, mode, onFinish, onBack }: VocabSelfTestProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [currentCorrect, setCurrentCorrect] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [reviewWrong, setReviewWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = words[currentIdx];
  const question = mode === 'eng_to_kor' ? currentWord?.english : currentWord?.meaning;
  const answer = mode === 'eng_to_kor' ? currentWord?.meaning : currentWord?.english;

  useEffect(() => {
    if (!showResult && !finished && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [currentIdx, showResult, finished]);

  const normalize = (s: string) => {
    return s
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, ' ')
      .replace(/[.,;:!?'"()[\]{}]/g, '');
  };

  const checkAnswer = useCallback(() => {
    if (!currentWord || userAnswer.trim() === '') return;

    const normalizedUser = normalize(userAnswer);
    const normalizedAnswer = normalize(answer);

    // Check against possible multiple meanings separated by , or /
    const possibleAnswers = normalizedAnswer
      .split(/[,/]/)
      .map(a => normalize(a))
      .filter(a => a.length > 0);

    const isCorrect = possibleAnswers.some(a => a === normalizedUser) ||
      normalizedAnswer === normalizedUser;

    setCurrentCorrect(isCorrect);
    setShowResult(true);
    setResults(prev => [...prev, { word: currentWord, userAnswer: userAnswer.trim(), correct: isCorrect }]);
  }, [currentWord, userAnswer, answer]);

  const goNext = () => {
    if (currentIdx < words.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setUserAnswer('');
      setShowResult(false);
      setCurrentCorrect(null);
    } else {
      // Finished
      const allResults = [...results];
      if (showResult) {
        // last result already pushed
      }
      const correct = allResults.filter(r => r.correct).length;
      const wrong = allResults.filter(r => !r.correct).length;
      setFinished(true);
      onFinish(correct, wrong, words.length);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showResult) {
        goNext();
      } else {
        checkAnswer();
      }
    }
  };

  const correctCount = results.filter(r => r.correct).length;
  const wrongCount = results.filter(r => !r.correct).length;
  const progressPercent = Math.round(((currentIdx + (showResult ? 1 : 0)) / words.length) * 100);

  const wrongWords = results.filter(r => !r.correct);

  if (finished) {
    const score = Math.round((correctCount / words.length) * 100);
    return (
      <div className="space-y-4 p-4 max-w-lg mx-auto">
        <Card>
          <CardContent className="text-center space-y-4 py-8">
            <div className="text-4xl">{score >= 80 ? '🎉' : score >= 50 ? '💪' : '📖'}</div>
            <h2 className="text-xl font-bold">테스트 완료!</h2>
            <div className="text-3xl font-bold">
              <span className="text-green-600">{correctCount}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span>{words.length}</span>
            </div>
            <p className="text-lg text-muted-foreground">정답률 {score}%</p>
            <Progress value={score} className="h-2" />

            {wrongWords.length > 0 && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setReviewWrong(!reviewWrong)}
                  className="mb-2"
                >
                  {reviewWrong ? '접기' : `❌ 틀린 단어 보기 (${wrongWords.length}개)`}
                </Button>
                {reviewWrong && (
                  <div className="space-y-2 text-left mt-2">
                    {wrongWords.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-red-50 border border-red-100 text-sm">
                        <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{mode === 'eng_to_kor' ? r.word.english : r.word.meaning}</div>
                          <div className="text-red-500 line-through text-xs">{r.userAnswer}</div>
                          <div className="text-green-600 text-xs">→ {mode === 'eng_to_kor' ? r.word.meaning : r.word.english}</div>
                        </div>
                        {mode === 'kor_to_eng' && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => speakEnglish(r.word.english)}>
                            <Volume2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-center mt-4">
              <Button variant="outline" onClick={onBack}>
                <ChevronLeft className="w-4 h-4 mr-1" /> 목록으로
              </Button>
              <Button variant="outline" onClick={() => {
                setCurrentIdx(0);
                setUserAnswer('');
                setResults([]);
                setShowResult(false);
                setCurrentCorrect(null);
                setFinished(false);
                setReviewWrong(false);
              }}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> 다시 풀기
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" /> 목록
        </Button>
        <div className="text-sm text-muted-foreground">
          {currentIdx + 1} / {words.length}
        </div>
        <div className="flex gap-2 text-sm">
          <span className="text-green-600 font-medium">✓{correctCount}</span>
          <span className="text-red-500 font-medium">✗{wrongCount}</span>
        </div>
      </div>

      {/* Progress */}
      <Progress value={progressPercent} className="h-1.5" />

      {/* Question card */}
      <Card className="min-h-[220px] flex items-center justify-center">
        <CardContent className="text-center py-8 space-y-4 w-full">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {mode === 'eng_to_kor' ? '뜻을 입력하세요' : '영어 단어를 입력하세요'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <p className="text-2xl font-bold">{question}</p>
            {mode === 'eng_to_kor' && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => speakEnglish(currentWord.english)}>
                <Volume2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          {!showResult ? (
            <div className="px-4 space-y-3">
              <Input
                ref={inputRef}
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'eng_to_kor' ? '한글 뜻 입력...' : 'Type in English...'}
                className="text-center text-lg"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <Button onClick={checkAnswer} disabled={userAnswer.trim() === ''} className="w-full">
                확인
              </Button>
            </div>
          ) : (
            <div className="px-4 space-y-3">
              {currentCorrect ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="text-lg font-bold">정답!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-red-500">
                    <XCircle className="w-6 h-6" />
                    <span className="text-lg font-bold">오답</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    내 답: <span className="line-through text-red-400">{userAnswer}</span>
                  </p>
                  <p className="text-base font-medium text-green-600">
                    정답: {answer}
                  </p>
                </div>
              )}
              <Button onClick={goNext} className="w-full">
                {currentIdx < words.length - 1 ? (
                  <>다음 <ArrowRight className="w-4 h-4 ml-1" /></>
                ) : '결과 보기'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
